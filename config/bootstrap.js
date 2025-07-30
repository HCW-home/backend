
const fs = require('fs');
const { promisify } = require('util');
const { syncTemplates } = require('../api/services/SyncTwilioTemplates');
const { parseTime, recreateTTLIndex } = require('../api/utils/helpers');

const readdirP = promisify(fs.readdir);

module.exports.bootstrap = async function() {

  // set ttl index
  const db = Consultation.getDatastore().manager;

  const consultationCollection = db.collection('consultation');
  const messageCollection = db.collection('message');
  const userCollection = db.collection('user');
  const tokenCollection = db.collection('token');

  const ttlMilliseconds = parseTime(process.env.DELETE_CLOSED_CONSULTATION_AFTER, 86400000);
  const expireAfterSeconds = Math.floor(ttlMilliseconds / 1000);

  sails.config.customLogger.log('verbose',`TTL set to ${expireAfterSeconds} seconds based on DELETE_CLOSED_CONSULTATION_AFTER`, null, 'message', null);

  await recreateTTLIndex(consultationCollection, 'closedAtISO', expireAfterSeconds);
  await recreateTTLIndex(messageCollection, 'consultationClosedAtISO', expireAfterSeconds);

  await consultationCollection.createIndex(
    { closedAtISO: 1 },
    { expireAfterSeconds }
  );

  await messageCollection.createIndex(
    { consultationClosedAtISO: 1 },
    { expireAfterSeconds }
  );

  await userCollection.createIndex({ closedAtISO: 1 }, { expireAfterSeconds: 86400 }); // expires after a day
  // await userCollection.createIndex({ email: 1, role: 1 }, { unique: true });
  await tokenCollection.createIndex({ closedAtISO: 1 }, { expireAfterSeconds: 60 * 60 }); // expires after an hour

  function checkEnvVariables(vars) {
    return vars.every(variable => process.env[variable] && process.env[variable].trim() !== '');
  }

  const providers = [
    {
      name: 'TWILIO',
      prefix: 'SMS_TWILLO_WL_PREFIX',
      requiredVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER']
    },
    { name: 'CLICKATEL_API', prefix: 'SMS_CLICKATEL_API_WL_PREFIX', requiredVars: ['SMS_CLICKATEL_API'] },
    {
      name: 'OVH',
      prefix: 'SMS_OVH_WL_PREFIX',
      requiredVars: ['SMS_OVH_SENDER', 'SMS_OVH_ENDPOINT', 'SMS_OVH_APP_KEY', 'SMS_OVH_APP_SECRET', 'SMS_OVH_APP_CONSUMER_KEY']
    },
    {
      name: 'SWISSCOM',
      prefix: 'SMS_SWISSCOM_WL_PREFIX',
      requiredVars: ['SMS_SWISSCOM_ACCOUNT', 'SMS_SWISSCOM_PASSWORD', 'SMS_SWISSCOM_SENDER']
    },
    {
      name: 'TWILIO_WHATSAPP',
      prefix: 'TWILIO_WHATSAPP_WL_PREFIX',
      requiredVars: ['TWILIO_WHATSAPP_PHONE_NUMBER', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']
    },
    { name: 'ODOO_SMS', prefix: 'SMS_ODOO_WL_PREFIX', requiredVars: ['ODOO_SMS_KEY', 'ODOO_SMS_URL', 'ODOO_SMS_HOST'] },
    { name: 'CLICKATEL', prefix: 'SMS_CLICKATEL_WL_PREFIX', requiredVars: ['SMS_CLICKATEL'] },

  ];

  for (const [index, provider] of providers.entries()) {
    const isDisabled = !checkEnvVariables(provider.requiredVars);
    const existingProvider = await SmsProvider.findOne({ provider: provider.name });
    if (existingProvider) {
      await SmsProvider.updateOne({ id: existingProvider.id })
        .set({
          isDisabled: isDisabled,
        });
    } else {
      await SmsProvider.create({
        provider: provider.name,
        order: index,
        prefix: provider.name === 'TWILIO_WHATSAPP' ? process.env[provider.prefix] : process.env[provider.prefix] || '*',
        isWhatsapp: provider.name === 'TWILIO_WHATSAPP',
        isDisabled: isDisabled,
      });
    }
  }

  sails.config.customLogger.log('verbose',"Starting template synchronization...", null, 'message', null);
  await syncTemplates();
  sails.config.customLogger.log('verbose', "Template synchronization completed.", null, 'message', null);


  // check and delete expired files
  setInterval(async () => {

    try {
      const files = await readdirP(sails.config.globals.attachmentsDir);

      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const found = await messageCollection.count({ filePath });

        // if the file message is not found (a message was deleted) delete the file
        if (!found) {
          fs.unlink(`${sails.config.globals.attachmentsDir}/${filePath}`, err => {

            if (err) {
              sails.config.customLogger.log('error',`Error deleting file ${err}`, null, 'server-action', null);
            }

          });
        }
      }
    } catch (err) {
      sails.log(err);
    }


    // every 5 min
  }, 300000);

};

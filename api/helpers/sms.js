
/**
 * Sends an SMS through the OVH SMS API.
 *
 * @param {string} phoneNumber
 * @param {string} message
 * @returns {void}
 */
function sendSmsWithOvh (phoneNumber, message) {

  phoneNumber = phoneNumber.replace(/^00/, '+');
  const ovhConfig = {
    endpoint: process.env.SMS_OVH_ENDPOINT,
    appKey: process.env.SMS_OVH_APP_KEY,
    appSecret: process.env.SMS_OVH_APP_SECRET,
    consumerKey: process.env.SMS_OVH_APP_CONSUMER_KEY
  };
  console.log(ovhConfig);
  const ovh = require('ovh')(ovhConfig);

  console.log('Sending SMS...');

  return new Promise((resolve, reject) => {
    ovh.request('GET', '/sms', (err, serviceName) => {
      if (err) {
        console.log(err, serviceName);
        return reject(err);
      }

      // Send a simple SMS with a short number using your serviceName
      ovh.request('POST', `/sms/${serviceName}/jobs/`, {
        sender: process.env.SMS_OVH_SENDER,
        message,
        senderForResponse: false,
        receivers: [phoneNumber]
      }, (errsend, result) => {
        console.error(errsend, result);
        if (errsend) {
          return reject(errsend);
        }
        return resolve();
      });
    });

  });

}

/**
 * Sends an SMS through the Swisscom REST plateform.
 *
 * @param {string} phoneNumber - The phone number to send the SMS to.
 * @param {string} message - The short message to send.
 * @returns {void}
 */
function sendSmsWithSwisscom (phoneNumber, message) {
  const https = require('https');

  const payload = {
    destination_addr: phoneNumber.replace(/[^0-9\+]/g, ''),
    dest_addr_ton: 1,
    dest_addr_npi: 1,
    source_addr: process.env.SMS_SWISSCOM_SENDER.replace(/[^0-9]/g, ''),
    source_addr_ton: 1,
    source_addr_npi: 1,
    short_message: message
  };

  return new Promise((resolve, reject) => {
    const request = https.request(
      `https://messagingproxy.swisscom.ch:4300/rest/1.0.0/submit_sm/${process.env.SMS_SWISSCOM_ACCOUNT}`,
      {
        method: 'POST',
        auth: `${process.env.SMS_SWISSCOM_ACCOUNT}:${process.env.SMS_SWISSCOM_PASSWORD}`,
        headers: {
          'Content-Type': 'application/json'
        }
      },
      (res) => {
        let rawData = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          console.log('Will get raw data');
          console.log('raw data', rawData);
          try {
            const parsedData = JSON.parse(rawData);
            console.log('GOT SWISSCOM DATA', parsedData);
            if ('message_ids' in parsedData || 'message_id' in parsedData) {
              return resolve();
            }
            console.error(parsedData);
            return reject(parsedData);
          } catch (e) {
            console.error(e.message);
            return reject(e);
          }
        });
      }
    );

    try {
      request.on('error', (e) => {
        console.error('ERROR', e.message);
        return reject(e);
      });
      console.log('Siss come auth header  ', `${process.env.SMS_SWISSCOM_ACCOUNT}:${process.env.SMS_SWISSCOM_PASSWORD}`);
      console.log('SISSCOME URI', `https://messagingproxy.swisscom.ch:4300/rest/1.0.0/submit_sm/${process.env.SMS_SWISSCOM_ACCOUNT}`);
      console.log('SWISSCOM JSON PAYLOAD..............');
      console.log(JSON.stringify(payload));
      request.write(JSON.stringify(payload));
      request.end();
    } catch (error) {

      console.log('error write to request ', error);
      return reject(error);
    }
  });

}


module.exports = {


  friendlyName: 'SMS',


  description: 'Send SMS.',


  inputs: {
    phoneNumber: {
      type: 'string',
      required: true
    },
    message: {
      type: 'string',
      required: true
    }

  },


  exits: {

    success: {
      description: 'All done.'
    }

  },


  async fn (inputs, exits) {

    try {
      const { message, phoneNumber } = inputs;

      if ('SMS_OVH_ENDPOINT' in process.env
        && 'SMS_OVH_APP_KEY' in process.env
        && 'SMS_OVH_APP_SECRET' in process.env
        && 'SMS_OVH_APP_CONSUMER_KEY' in process.env) {
        console.log(`Sending an SMS to ${phoneNumber} through OVH`);
        await sendSmsWithOvh(phoneNumber, message);

        return exits.success();
      } else if ('SMS_SWISSCOM_ACCOUNT' in process.env
        && 'SMS_SWISSCOM_PASSWORD' in process.env
        && 'SMS_SWISSCOM_SENDER' in process.env) {
        console.log(`Sending an SMS to ${phoneNumber} through Swisscom`);
        await sendSmsWithSwisscom(phoneNumber, message);

        return exits.success();
      } else {
        console.error('No SMS gateway configured');
        if (process.env.NODE_ENV === 'development') {
          console.log('SENDING SMS ', message, ' to ', phoneNumber);

          exits.success();
        }
      }
    } catch (error) {
      exits.error(error);
    }

  }
};


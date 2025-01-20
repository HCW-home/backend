const {importFileIfExists} = require('../utils/helpers');
const validator = require('validator');
const sanitize = require('mongo-sanitize');
const TwilioWhatsappConfig = importFileIfExists(`${process.env.CONFIG_FILES}/twilio-whatsapp-config.json`, {});
/**
 * PublicInviteController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */
function determineStatus(phoneNumber, smsProviders, whatsappConfig) {
  let canSendSMS = false;
  let canSendWhatsApp = false;

  smsProviders.forEach(provider => {
    if (!provider.isDisabled && provider.prefix) {
      const prefixList = provider.prefix.split(',');
      if (prefixList.includes('*') || prefixList.some(prefix => prefix && phoneNumber.startsWith(prefix))) {
        const TwilioWhatsappConfigLanguage = TwilioWhatsappConfig?.[whatsappConfig?.language] || TwilioWhatsappConfig?.['en'];
        if (provider.provider.includes('WHATSAPP') && TwilioWhatsappConfigLanguage?.[whatsappConfig?.type]) {
          canSendWhatsApp = true;
        } else {
          canSendSMS = true;
        }
      }
    }
  });

  if (canSendSMS && canSendWhatsApp) {
    return { code: 1, message: "You have to choose Whatsapp or SMS for sending this invite." };
  } else if (!canSendSMS && canSendWhatsApp) {
    return { code: 2, message: "Invite will be send by WhatsApp." };
  } else if (canSendSMS && !canSendWhatsApp) {
    return { code: 3, message: "Invite will be send by SMS." };
  } else {
    return { code: 0, message: "This phone number is not permitted to be used on this platform." };
  }
}


module.exports = {

  async createFhirAppointment(req, res) {
    try {
      const appointmentData = req.body;

      FhirService.validateAppointmentData(appointmentData);

      const inviteData = FhirService.serializeAppointmentToInvite(appointmentData);


      const newInvite = await PublicInvite.create(inviteData).fetch();

      console.log(newInvite, 'newInvite');
      return res.status(201).json(newInvite);
    } catch (error) {
      if (error.message === 'Invalid FHIR data') {
        return res.status(400).json({ error: error.message, details: error.details });
      }
      return res.status(500).json({ error: 'An error occurred', details: error.message });

    }
  },

  async getAllFhirAppointments(req, res) {
    try {
      const invites = await PublicInvite.find();
      return res.status(200).json(invites);
    } catch (error) {
      return res.status(500).json({ error: 'An error occurred', details: error.message });
    }
  },

  async getFhirAppointmentByField(req, res) {
    try {
      const { inviteToken } = req.query;

      const publicInvite = await PublicInvite.findOne({
        inviteToken: inviteToken,
      });


      if (!publicInvite) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      return res.status(200).json(publicInvite);
    } catch (error) {
      return res.status(500).json({ error: 'An error occurred', details: error.message });
    }
  },

  async updateFhirAppointmentByField(req, res) {
    try {
      const field = req.query.field;
      const value = req.query.value;
      const appointmentData = req.body;

      if (!field || !value) {
        return res.status(400).json({ error: 'Field and value are required' });
      }

      FhirService.validateAppointmentData(appointmentData);

      const inviteData = FhirService.serializeAppointmentToInvite(appointmentData);

      const updatedInvite = await PublicInvite.updateOne({
        [`fhirData.${field}`]: value,
      }).set(inviteData);

      if (!updatedInvite) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      return res.status(200).json(updatedInvite);
    } catch (error) {
      if (error.message === 'Invalid FHIR data') {
        return res.status(400).json({ error: error.message, details: error.details });
      }
      return res.status(500).json({ error: 'An error occurred', details: error.message });
    }
  },

  async deleteFhirAppointmentByField (req, res) {
    try {

      const { inviteToken } = req.query;

      const deletedInvite = await PublicInvite.destroyOne({
        inviteToken: inviteToken,
      });

      if (!deletedInvite) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      return res.status(200).json({ message: 'Appointment deleted successfully' });
    } catch (error) {
      return res.status(500).json({ error: 'An error occurred', details: error.message });
    }
  },


  async update(req, res) {
    const inviteId = sanitize(req.params.id);

    const invite = await PublicInvite.findOne({id:inviteId});

    if(!invite) {
      return res.notFound();
    }

    try {
      const sanitizedBody  = sanitize(req.body);
      const updatedInvite = await PublicInvite.updateOne({id:inviteId}).set(sanitizedBody);


      // TODO: update respective guest and translator invites
      if(invite.type === 'PATIENT'){
        await PublicInvite.sendPatientInvite(invite)
        if(invite.scheduledFor){
          await PublicInvite.setPatientOrGuestInviteReminders(invite)
        }
      }
      res.json(updatedInvite)

    } catch (error) {
      res.serverError(error.message);
    }

  },

  checkPrefix: async function (req, res) {
    const type = req.param('type');
    const language = req.param('language');
    const phoneNumber = validator.escape(req.param('phoneNumber')).trim();
    if (!phoneNumber) {
      return res.badRequest({ message: 'Phone number is required.' });
    }

    const providers = await SmsProvider.find({});
    const status = determineStatus(phoneNumber, providers, {type, language});

    return res.ok({
      phoneNumber: phoneNumber,
      status: status.code,
      message: status.message
    });
  }


// async find (req, res) {
  //   console.log('getting public invites');
  //   const publicInviteCollection = db.collection('publicInvite');



  //   const parseBlueprintOptions = req.options.parseBlueprintOptions
  //   || req._sails.config.blueprints.parseBlueprintOptions
  //   || req._sails.hooks.blueprints.parseBlueprintOptions;
  //   const queryOptions = parseBlueprintOptions(req);
  //   console.log('query opetions ', queryOptions);
  //   let queues = [];
  //   if (req.user.allowedQueues && req.user.allowedQueues.length > 0) {
  //     queues = req.user.allowedQueues.map(q => q.id);
  //   } else if (req.user.viewAllQueues) {
  //     queues = await Queue.find({});
  //     queues = queues.map(q => q.id);
  //   }


  //   const publicInvites = await PublicInvite.find({
  //     where: {
  //       or: [
  //         {
  //           doctor: req.user.id
  //         }, {
  //           queue: queues
  //         }
  //       ]
  //     }
  //   });


  //   return res.json(publicInvites);
  // }


};

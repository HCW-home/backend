const validator = require('validator');
const InviteController = require('./InviteController');

async function determineStatus(phoneNumber, smsProviders, whatsappConfig) {
  let canSendSMS = false;
  let canSendWhatsApp = false;

  for (const provider of smsProviders) {
    if (!provider.isDisabled && provider.prefix) {
      const prefixList = provider.prefix.split(',');
      const excludedPrefixes = prefixList.filter(prefix => prefix.startsWith("!"));
      const isExcluded = excludedPrefixes.some(excludedPrefix =>
        phoneNumber.startsWith(excludedPrefix.substring(1))
      );

      if (isExcluded) {
        sails.config.customLogger.log('info',`Skipping provider ${provider.provider} - phone number matches excluded prefix.`, null, 'message', null);
        continue;
      }

      const prefixMatches = prefixList.includes('*') || prefixList.some(prefix => prefix && phoneNumber.startsWith(prefix));
      if (prefixMatches) {
        const whatsappTemplate = await WhatsappTemplate.findOne({
          language: whatsappConfig?.language,
          approvalStatus: 'approved',
          key: whatsappConfig?.type,
          sid: { '!=': null },
        });

        if (provider.provider.includes('WHATSAPP') && whatsappTemplate) {
          canSendWhatsApp = true;
        } else {
          canSendSMS = true;
        }
      }
    }
  }

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
      const {
        firstName,
        lastName,
        doctor,
        emailAddress,
        phoneNumber,
        gender
      } = await FhirService.validateAppointmentData(appointmentData);

      const metadata = FhirService.createAppointmentMetadata(appointmentData)
      const inviteData = FhirService.serializeAppointmentToInvite({
        firstName,
        lastName,
        appointmentData,
        metadata,
        doctor,
        emailAddress,
        phoneNumber,
        gender
      });

      const mockReq = {
        body: inviteData,
        headers: req.headers,
        user: req.user,
      };

      const mockRes = {
        _data: null,
        _status: 200,
        status(code) {
          this._status = code;
          return this;
        },
        json(data) {
          this._data = data;
          return data;
        },
        serverError(err) {
          throw err;
        }
      };

      const newInvite = await InviteController.invite(mockReq, mockRes)

      /** Patient **/
      const userData = await FhirService.serializeAppointmentPatientToUser({
        firstName: firstName,
        lastName: lastName,
        email: emailAddress,
        phoneNumber: phoneNumber,
        username: newInvite.invite?.id,
        inviteToken: newInvite.invite?.id,
      })

      await User.create(userData);

      return res.status(201).json(newInvite);
    } catch (error) {
      if (error.message === 'Invalid FHIR data') {
        return res.status(400).json({error: error.message, details: error.details});
      }
      return res.status(500).json({error: 'An error occurred', details: error.message});

    }
  },

  async getAllFhirAppointments(req, res) {
    try {
      const invites = await PublicInvite.find();
      return res.status(200).json(invites);
    } catch (error) {
      return res.status(500).json({error: 'An error occurred', details: error.message});
    }
  },

  async getFhirAppointmentByField(req, res) {
    try {
      const {inviteToken} = req.query;

      const publicInvite = await PublicInvite.findOne({
        inviteToken: inviteToken,
      });

      const patient = await User.findOne({
        inviteToken: publicInvite.id,
      });

      const doctor = await User.findOne({
        id: publicInvite.doctor,
        role: {in: [sails.config.globals.ROLE_DOCTOR, sails.config.globals.ROLE_ADMIN]}
      });

      if (!publicInvite) {
        return res.status(404).json({error: 'Appointment not found'});
      }

      const appointmentPatient = {
        id: patient.id,
        resourceType: "Patient",
        telecom: [
          {
            "rank": 1,
            "system": "email",
            "value": patient.email,
          },
          {
            "rank": 2,
            "system": "sms",
            "value": patient.phoneNumber,
          }
        ],
        name: [
          {
            use: "usual",
            family: patient.lastName,
            given: [
              patient.firstName
            ]
          },
        ],
      }

      const appointmentDoctor = {
        id: doctor.id,
        resourceType: "Practitioner",
        telecom: [
          {
            rank: 1,
            system: "email",
            value: doctor.email,
          }
        ],
      }

      const appointment = {
        resourceType: "Appointment",
        status: publicInvite.status,
        description: "15-minute consultation",
        participant: [
          {
            status: publicInvite.status,
            actor: {
              reference: appointmentPatient,
              display: `${publicInvite.firstName} ${publicInvite.lastName}`
            }
          },
          {
            status: "ACCEPTED",
            actor: {
              reference: appointmentDoctor,
              display: `${doctor.firstName} ${doctor.lastName}`
            }
          }
        ]
      }

      if (publicInvite.scheduledFor) {
        appointment.start = new Date(publicInvite.scheduledFor).toISOString()
      }

      if (publicInvite?.metadata?.note) {
        appointment.note = [{text: publicInvite?.metadata?.note}]
      }

      if (publicInvite?.metadata?.minutesDuration) {
        appointment.minutesDuration = publicInvite?.metadata?.minutesDuration
      }

      if (publicInvite?.metadata?.end) {
        appointment.end = publicInvite?.metadata?.end;
      }

      if (publicInvite?.metadata?.description) {
        appointment.description = publicInvite?.metadata?.description;
      }

      if (publicInvite?.metadata?.reason) {
        appointment.reason = [{
          reference: {
            display: publicInvite?.metadata?.reason
          }
        }]
      }

      if (publicInvite?.metadata?.identifier) {
        appointment.identifier = [{
          value: publicInvite?.metadata?.identifier
        }]
      }

      return res.status(200).json(appointment);
    } catch (error) {
      return res.status(500).json({error: 'An error occurred', details: error.message});
    }
  },

  async updateFhirAppointmentByField(req, res) {
    try {
      const field = req.query.field;
      const value = req.query.value;
      const appointmentData = req.body;

      if (!field || !value) {
        return res.status(400).json({error: 'Field and value are required'});
      }

      FhirService.validateAppointmentData(appointmentData);

      const inviteData = FhirService.serializeAppointmentToInvite(appointmentData);

      const updatedInvite = await PublicInvite.updateOne({
        [`fhirData.${field}`]: value,
      }).set(inviteData);

      if (!updatedInvite) {
        return res.status(404).json({error: 'Appointment not found'});
      }

      return res.status(200).json(updatedInvite);
    } catch (error) {
      if (error.message === 'Invalid FHIR data') {
        return res.status(400).json({error: error.message, details: error.details});
      }
      return res.status(500).json({error: 'An error occurred', details: error.message});
    }
  },

  async deleteFhirAppointmentByField(req, res) {
    try {

      const {inviteToken} = req.query;

      const deletedInvite = await PublicInvite.destroyOne({
        inviteToken: inviteToken,
      });

      if (!deletedInvite) {
        return res.status(404).json({error: 'Appointment not found'});
      }

      return res.status(200).json({message: 'Appointment deleted successfully'});
    } catch (error) {
      return res.status(500).json({error: 'An error occurred', details: error.message});
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
    const status = await determineStatus(phoneNumber, providers, {type, language});

    return res.ok({
      phoneNumber: phoneNumber,
      status: status.code,
      message: status.message
    });
  }

};

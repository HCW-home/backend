const validator = require('validator');
const InviteController = require('./InviteController');
const { statusMap } = require('../services/FhirService');
const { escapeHtml, sanitizeMetadata } = require('../utils/helpers');

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
        gender,
        doctorEmail,
        note
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
        gender,
        doctorEmail,
        note
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
      const safeMockReq = sanitizeMetadata(mockReq);
      const newInvite = await InviteController.invite(safeMockReq, mockRes)

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

      const resJson = {
        id: newInvite.invite?.id,
        ...appointmentData,
      }

      await PublicInvite.updateOne({
        id: newInvite.invite?.id,
      }).set({ fhirData: appointmentData });

      const safeJson = sanitizeMetadata(resJson);
      return res.status(201).json(safeJson);
    } catch (error) {
      if (error.message === 'Invalid FHIR data') {
        return res.status(400).json({error: error.message, details: error.details});
      }
      return res.status(500).json({error: 'An error occurred', details: error.message});

    }
  },

  async getAllFhirAppointments(req, res) {
    try {

      let where = {
        fhirData: { '!=': null }
      };

      try {
        if (req.query.where) {
          const extraWhere = typeof req.query.where === 'string'
            ? JSON.parse(req.query.where)
            : req.query.where;

          where = { ...where, ...extraWhere };
        }
      } catch (err) {
        return res.badRequest({ error: 'Invalid JSON in `where` param' });
      }

      const invites = await PublicInvite.find({
        where
      }).meta({ enableExperimentalDeepTargets: true });

      const results = [];

      for (const invite of invites) {
        const appointment = JSON.parse(JSON.stringify(invite.fhirData));

        const patient = await User.findOne({ inviteToken: invite.id });
        const doctor = await User.findOne({
          id: invite.doctor,
          role: { in: [sails.config.globals.ROLE_DOCTOR, sails.config.globals.ROLE_ADMIN] }
        });

        appointment.status = invite.status || appointment.status;

        if (invite.scheduledFor) {
          appointment.start = new Date(invite.scheduledFor).toISOString();
        }

        if (invite?.metadata?.end) {
          appointment.end = new Date(invite.metadata.end).toISOString();
        }

        if (invite?.note) {
          appointment.note = [{ text: invite.note }];
        }

        if (invite?.metadata?.minutesDuration) {
          appointment.minutesDuration = invite.metadata.minutesDuration;
        }

        if (invite?.metadata?.reason) {
          appointment.reason = [{ text: invite.metadata.reason }];
        }

        if (invite?.metadata?.identifier) {
          appointment.identifier = [{ value: invite.metadata.identifier }];
        }
        appointment.status = statusMap[invite.status] || "";

        if (appointment.contained && Array.isArray(appointment.contained)) {
          appointment.contained = appointment.contained.map(resource => {
            if (resource.resourceType === "Patient" && patient) {
              return {
                ...resource,
                name: [{
                  use: "usual",
                  family: patient.lastName,
                  given: [patient.firstName]
                }],
                telecom: [
                  { system: "email", value: patient.email, use: "work" },
                  { system: "sms", value: patient.phoneNumber, use: "mobile" }
                ],
                gender: patient.gender || "unknown"
              };
            }

            if (resource.resourceType === "Practitioner" && doctor) {
              return {
                ...resource,
                telecom: [
                  { system: "email", value: doctor.email, use: "work" }
                ]
              };
            }

            return resource;
          });
        }

        results.push(appointment);
      }

      return res.status(200).json(results);
    } catch (error) {
      return res.status(500).json({
        error: 'An error occurred while retrieving appointments.',
        details: error.message
      });
    }
  },

  async getFhirAppointmentByField(req, res) {
    try {
      let { id } = req.query;
      id = escapeHtml(id);

      if (!id) {
        return res.status(400).json({ error: 'Id is required' });
      }

      const publicInvite = await PublicInvite.findOne({ id });
      if (!publicInvite || !publicInvite.fhirData) {
        return res.status(404).json({ error: 'Appointment not found or FHIR data missing' });
      }

      const patient = await User.findOne({ inviteToken: publicInvite.id });
      const doctor = await User.findOne({
        id: publicInvite.doctor,
        role: { in: [sails.config.globals.ROLE_DOCTOR, sails.config.globals.ROLE_ADMIN] }
      });

      const appointment = JSON.parse(JSON.stringify(publicInvite.fhirData));

      appointment.status = publicInvite.status || appointment.status;

      if (publicInvite.scheduledFor) {
        appointment.start = new Date(publicInvite.scheduledFor).toISOString();
      }

      if (publicInvite?.metadata?.end) {
        appointment.end = new Date(publicInvite.metadata.end).toISOString();
      }

      if (publicInvite?.note) {
        appointment.note = [{ text: publicInvite.note }];
      }

      if (publicInvite?.metadata?.minutesDuration) {
        appointment.minutesDuration = publicInvite.metadata.minutesDuration;
      }

      if (publicInvite?.metadata?.reason) {
        appointment.reason = [{ text: publicInvite.metadata.reason }];
      }

      if (publicInvite?.metadata?.identifier) {
        appointment.identifier = [{ value: publicInvite.metadata.identifier }];
      }
      const fhirStatus = statusMap[publicInvite.status];

      if (appointment.contained && Array.isArray(appointment.contained)) {
        appointment.contained = appointment.contained.map(resource => {
          if (resource.resourceType === "Patient" && patient) {
            return {
              ...resource,
              status: fhirStatus,
              name: [{
                use: "usual",
                family: patient.lastName,
                given: [patient.firstName]
              }],
              telecom: [
                { system: "email", value: patient.email, use: "work" },
                { system: "sms", value: patient.phoneNumber, use: "mobile" }
              ],
              gender: patient.gender || "unknown"
            };
          }

          if (resource.resourceType === "Practitioner" && doctor) {
            return {
              ...resource,
              telecom: [
                { system: "email", value: doctor.email, use: "work" }
              ]
            };
          }

          return resource;
        });
      }

      return res.status(200).json(appointment);

    } catch (error) {
      return res.status(500).json({
        error: 'An error occurred while retrieving the appointment.',
        details: error.message
      });
    }
  },

  async updateFhirAppointmentByField(req, res) {
    try {
      const field = req.query.field;
      let { value } = req.query;
      value = escapeHtml(value);
      const appointmentData = req.body;

      if (!field || !value) {
        return res.status(400).json({error: 'Field and value are required'});
      }

      FhirService.validateAppointmentData(appointmentData);

      const inviteData = FhirService.serializeAppointmentToInvite(appointmentData);

      const safeInviteData = sanitizeMetadata(inviteData);

      const updatedInvite = await PublicInvite.updateOne({
        [`fhirData.${field}`]: value,
      }).set(safeInviteData);

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
      const {id} = req.query;

      if (!id) {
        return res.status(404).json({ error: 'Id is required' });
      }

      const deletedInvite = await PublicInvite.destroyOne({
        id: id,
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

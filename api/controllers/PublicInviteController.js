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
      const excludedPrefixes = prefixList.filter(prefix => prefix.startsWith('!'));
      const isExcluded = excludedPrefixes.some(excludedPrefix =>
        phoneNumber.startsWith(excludedPrefix.substring(1))
      );

      if (isExcluded) {
        sails.config.customLogger.log('info', `Skipping provider ${provider.provider} - phone number matches excluded prefix.`, null, 'message', null);
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
    return { code: 1, message: 'You have to choose Whatsapp or SMS for sending this invite.' };
  } else if (!canSendSMS && canSendWhatsApp) {
    return { code: 2, message: 'Invite will be send by WhatsApp.' };
  } else if (canSendSMS && !canSendWhatsApp) {
    return { code: 3, message: 'Invite will be send by SMS.' };
  } else {
    return { code: 0, message: 'This phone number is not permitted to be used on this platform.' };
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

      const metadata = FhirService.createAppointmentMetadata(appointmentData);
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
      const newInvite = await InviteController.invite(safeMockReq, mockRes);

      /** Patient **/
      const userData = await FhirService.serializeAppointmentPatientToUser({
        firstName: firstName,
        lastName: lastName,
        email: emailAddress,
        phoneNumber: phoneNumber,
        username: newInvite.invite?.id,
        inviteToken: newInvite.invite?.id,
        gender: gender,
      });

      await User.create(userData);

      await PublicInvite.updateOne({
        id: newInvite.invite?.id,
      }).set({ fhirData: appointmentData });

      const resJson = {
        ...appointmentData,
        id: newInvite.invite?.id,
      };

      const safeJson = sanitizeMetadata(resJson);
      return res.status(201).json(safeJson);
    } catch (error) {
      if (error.message === 'Invalid FHIR data') {
        return res.status(400).json({ error: error.message, details: error.details });
      }
      return res.status(500).json({ error: 'An error occurred', details: error.message });

    }
  },

  async updateFhirAppointment(req, res) {
    try {
      const appointmentData = req.body;
      const appointmentId = req.params.id;

      if (!appointmentId) {
        return res.status(400).json({ error: 'Appointment ID is required' });
      }

      const existingInvite = await PublicInvite.findOne({ id: appointmentId });
      if (!existingInvite) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const existingConsultation = await Consultation.findOne({ publicInvite: appointmentId });
      if (existingConsultation) {
        return res.status(409).json({
          error: 'Appointment cannot be updated because a consultation already exists.'
        });
      }

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

      const metadata = FhirService.createAppointmentMetadata(appointmentData);
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

      if (existingInvite.scheduledFor && !inviteData.scheduledFor) {
        inviteData.cancelScheduledFor = true;
      }

      const mockReq = {
        body: inviteData,
        headers: req.headers,
        user: req.user,
        params: {
          id: appointmentId
        }
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
      await InviteController.update(safeMockReq, mockRes);

      const userToUpdate = await User.findOne({ inviteToken: appointmentId });
      if (userToUpdate) {
        await User.updateOne({ inviteToken: appointmentId }).set({
          id: userToUpdate.id,
          firstName,
          lastName,
          email: emailAddress,
          phoneNumber,
          gender,
        });
      }

      await PublicInvite.updateOne({
        id: appointmentId,
      }).set({ fhirData: appointmentData });

      const resJson = {
        ...appointmentData,
        id: appointmentId,
      };

      const safeJson = sanitizeMetadata(resJson);
      return res.status(200).json(safeJson);
    } catch (error) {
      if (error.message === 'Invalid FHIR data') {
        return res.status(400).json({ error: error.message, details: error.details });
      }
      return res.status(500).json({ error: 'An error occurred', details: error.message });
    }
  },

  async getAllFhirAppointments(req, res) {
    try {
      const fhirParams = req.query;

      let invites;

      if (fhirParams.identifier) {
        const db = PublicInvite.getDatastore().manager;
        const collection = db.collection('publicinvite');

        invites = await collection.find({
          fhirData: { $ne: null },
          $or: [
            { 'metadata.identifier': fhirParams.identifier },
            { 'fhirData.identifier': { $elemMatch: { value: fhirParams.identifier } } }
          ]
        }).toArray();
      } else {
        invites = await PublicInvite.find({
          where: { fhirData: { '!=': null } }
        }).meta({ enableExperimentalDeepTargets: true });
      }

      const results = [];

      for (const invite of invites) {
        const appointment = JSON.parse(JSON.stringify(invite.fhirData));

        const inviteId = invite.id || (invite._id ? invite._id.toString() : null);
        const doctorId = invite.doctor ? (invite.doctor.toString ? invite.doctor.toString() : invite.doctor) : null;

        sails.config.customLogger.log('info', `getAllFhirAppointments: Processing invite with id: ${inviteId}, has _id: ${!!invite._id}, has id: ${!!invite.id}`, null, 'message', req.user?.id);

        const patient = inviteId ? await User.findOne({ inviteToken: inviteId }) : null;
        const doctor = doctorId ? await User.findOne({
          id: doctorId,
          role: { in: [sails.config.globals.ROLE_DOCTOR, sails.config.globals.ROLE_ADMIN] }
        }) : null;

        appointment.id = inviteId;

        appointment.status = statusMap[invite.status] || 'pending';

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
          const identifier = { value: invite.metadata.identifier };
          if (invite?.metadata?.identifierSystem) {
            identifier.system = invite.metadata.identifierSystem;
          }
          appointment.identifier = [identifier];
        }

        if (appointment.contained && Array.isArray(appointment.contained)) {
          appointment.contained = appointment.contained.map(resource => {
            if (resource.resourceType === 'Patient' && patient) {
              const telecom = [];
              if (patient.email) {
                telecom.push({ system: 'email', value: patient.email, use: 'work' });
              }
              if (patient.phoneNumber) {
                telecom.push({ system: 'sms', value: patient.phoneNumber, use: 'mobile' });
              }

              const updatedResource = {
                ...resource,
                name: [{
                  use: 'usual',
                  family: patient.lastName,
                  given: [patient.firstName]
                }],
                gender: patient.gender || 'unknown'
              };

              if (telecom.length > 0) {
                updatedResource.telecom = telecom;
              }

              delete updatedResource.status;

              return updatedResource;
            }

            if (resource.resourceType === 'Practitioner' && doctor) {
              const telecom = [];
              if (doctor.email) {
                telecom.push({ system: 'email', value: doctor.email, use: 'work' });
              }

              const updatedResource = { ...resource };

              if (telecom.length > 0) {
                updatedResource.telecom = telecom;
              }

              delete updatedResource.status;

              return updatedResource;
            }

            return resource;
          });
        }

        if (appointment.participant && Array.isArray(appointment.participant)) {
          appointment.participant = appointment.participant.map(p => {
            const { status, ...rest } = p;
            return rest;
          });
        }

        results.push(appointment);
      }

      const bundle = {
        resourceType: 'Bundle',
        id: require('crypto').randomUUID(),
        type: 'searchset',
        timestamp: new Date().toISOString(),
        total: results.length,
        entry: results.map(resource => ({
          resource,
          search: {
            mode: 'match'
          }
        }))
      };

      return res.status(200).json(bundle);
    } catch (error) {
      return res.status(500).json({
        error: 'An error occurred while retrieving appointments.',
        details: error.message
      });
    }
  },

  async getFhirAppointment(req, res) {
    try {
      let { id } = req.params;
      const { identifier } = req.query;

      if (id || identifier) {
        id = escapeHtml(id || identifier);
      }

      sails.config.customLogger.log('info', `getFhirAppointment: Looking up appointment with id: ${id}`, null, 'message', req.user?.id);

      let publicInvite;

      if (id) {
        publicInvite = await PublicInvite.findOne({ id });

        if (!publicInvite) {
          sails.config.customLogger.log('warn', `getFhirAppointment: Appointment not found with id: ${id}`, null, 'message', req.user?.id);
        }
      } else {
        return res.status(400).json({ error: 'Id is required' });
      }

      if (!publicInvite || !publicInvite.fhirData) {
        return res.status(404).json({ error: 'Appointment not found or FHIR data missing', requestedId: id });
      }

      const patient = await User.findOne({ inviteToken: publicInvite.id });
      const doctor = await User.findOne({
        id: publicInvite.doctor,
        role: { in: [sails.config.globals.ROLE_DOCTOR, sails.config.globals.ROLE_ADMIN] }
      });

      const appointment = JSON.parse(JSON.stringify(publicInvite.fhirData));

      appointment.id = publicInvite.id;

      appointment.status = statusMap[publicInvite.status] || 'pending';

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
        const identifier = { value: publicInvite.metadata.identifier };
        if (publicInvite?.metadata?.identifierSystem) {
          identifier.system = publicInvite.metadata.identifierSystem;
        }
        appointment.identifier = [identifier];
      }

      if (appointment.contained && Array.isArray(appointment.contained)) {
        appointment.contained = appointment.contained.map(resource => {
          if (resource.resourceType === 'Patient' && patient) {
            const telecom = [];
            if (patient.email) {
              telecom.push({ system: 'email', value: patient.email, use: 'work' });
            }
            if (patient.phoneNumber) {
              telecom.push({ system: 'sms', value: patient.phoneNumber, use: 'mobile' });
            }

            const updatedResource = {
              ...resource,
              name: [{
                use: 'usual',
                family: patient.lastName,
                given: [patient.firstName]
              }],
              gender: patient.gender || 'unknown'
            };

            if (telecom.length > 0) {
              updatedResource.telecom = telecom;
            }

            delete updatedResource.status;

            return updatedResource;
          }

          if (resource.resourceType === 'Practitioner' && doctor) {
            const telecom = [];
            if (doctor.email) {
              telecom.push({ system: 'email', value: doctor.email, use: 'work' });
            }

            const updatedResource = { ...resource };

            if (telecom.length > 0) {
              updatedResource.telecom = telecom;
            }

            delete updatedResource.status;

            return updatedResource;
          }

          return resource;
        });
      }

      if (appointment.participant && Array.isArray(appointment.participant)) {
        appointment.participant = appointment.participant.map(p => {
          const { status, ...rest } = p;
          return rest;
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

  async deleteFhirAppointment(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(404).json({ error: 'Id is required' });
      }

      const deletedInvite = await PublicInvite.destroyOne({
        id: id,
      });

      if (!deletedInvite) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      return res.status(200).json({ message: 'Appointment deleted successfully' });
    } catch (error) {
      return res.status(500).json({ error: 'An error occurred', details: error.message });
    }
  },

  checkPrefix: async function(req, res) {
    const type = req.param('type');
    const language = req.param('language') || 'en';
    const phoneNumber = validator.escape(req.param('phoneNumber')).trim();
    if (!phoneNumber) {
      return res.badRequest({ message: 'Phone number is required.' });
    }

    const providers = await SmsProvider.find({});
    const status = await determineStatus(phoneNumber, providers, { type, language });

    return res.ok({
      phoneNumber: phoneNumber,
      status: status.code,
      message: status.message
    });
  }

};

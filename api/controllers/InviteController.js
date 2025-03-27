const db = PublicInvite.getDatastore().manager;
const { ObjectId } = require('mongodb');

const moment = require('moment-timezone');
const { i18n } = require('../../config/i18n');
const { escapeHtml, sanitizeMetadata } = require('../utils/helpers');

const DEFAULT_REQUIRED_FIELDS = ['firstName', 'lastName', 'gender'];

function validateInviteRequest(invite) {
  const errors = [];

  const enableFieldsFormDoctor = sails.config.globals.enableFieldsFormDoctor
    ? sails.config.globals.enableFieldsFormDoctor.split(',').map(f => f.trim())
    : [];

  const enabledFields = enableFieldsFormDoctor.length
    ? enableFieldsFormDoctor
    : DEFAULT_REQUIRED_FIELDS;

  if (!invite.phoneNumber && !invite.emailAddress) {
    errors.push({ message: 'emailAddress or phoneNumber are required' });
  }

  if (enabledFields.includes('gender')) {
    if (!invite.gender) {
      errors.push({ message: 'gender is required' });
    } else if (!['male', 'female'].includes(invite.gender)) {
      errors.push({ message: 'gender must be either male or female' });
    }
  }

  if (enabledFields.includes('firstName') && !invite.firstName) {
    errors.push({ message: 'firstName is required' });
  }

  if (enabledFields.includes('lastName') && !invite.lastName) {
    errors.push({ message: 'lastName is required' });
  }

  return errors;
}

async function createTranslationRequest(translationInvite, organization) {
  // if organization has main email sent to that email
  if (organization.mainEmail) {
    await PublicInvite.sendTranslationRequestInvite(
      translationInvite,
      organization.mainEmail
    );
    return PublicInvite.setTranslatorRequestTimer(translationInvite);
  }
  // if not
  // get all translators under organization
  const translatorCollection = db.collection('translator');
  const translatorsCursor = await translatorCollection.find({
    organization: new ObjectId(organization.id),
    languages: {
      $all: [
        translationInvite.doctorLanguage,
        translationInvite.patientLanguage,
      ],
    },
  });

  const translators = await translatorsCursor.toArray();
  if (!translators.length) {
    return Promise.reject(
      `There are no translators for ${translationInvite.patientLanguage} ${translationInvite.doctorLanguage}`
    );
  }

  await Promise.all(
    translators.map((translator) =>
      PublicInvite.sendTranslationRequestInvite(
        translationInvite,
        translator.email
      )
    )
  );
  return PublicInvite.setTranslatorRequestTimer(translationInvite);
}


module.exports = {
  async invite(req, res) {
    let invite = null;
    sails.config.customLogger.log('info', `Create invite started by ${req.user.id}`, null, 'user-action', req.user.id);

    const value = req.body;
    const headers = req.headers;

    sails.config.customLogger.log('silly', 'Create invite payload', { body: value }, 'message', req.user.id);

    const currentUserPublic = {
      id: req.user.id,
      firstName: req.user.firstName,
      email: req.user.email,
      lastName: req.user.lastName,
      role: req.user.role,
    };

    const locale = escapeHtml(headers.locale) || i18n.defaultLocale;
    if (value.isPatientInvite && !value.sendLinkManually) {
      const errors = validateInviteRequest(value);
      if (errors.length) {
        sails.config.customLogger.log('warn', 'Patient invite validation errors', null, 'message', req.user.id);
        return res.status(400).json(errors);
      }

      if (
        req.user.role !== 'scheduler' &&
        (value.IMADTeam || value.birthDate)
      ) {
        sails.config.customLogger.log('warn', 'Disallowed fields in invite for non-scheduler', null, 'message', req.user.id);
        return res.status(400).json({
          success: false,
          error: 'IMADTeam and birthDate are not allowed',
        });
      }
    } else {
      if (
        !value.translationOrganization &&
        !value.guestPhoneNumber &&
        !value.guestEmailAddress &&
        !value.sendLinkManually
      ) {
        sails.config.customLogger.log('warn', 'Missing required invite recipient info', null, 'message', req.user.id);
        return res.status(400).json({
          success: false,
          error: 'You must invite at least a patient translator or a guest!',
        });
      }
    }

    if (value.scheduledFor && !moment(value.scheduledFor).isValid()) {
      sails.config.customLogger.log('warn', 'Invalid scheduledFor date', null, 'message', req.user.id);
      return res.status(400).json({
        success: false,
        error: 'ScheduledFor is not a valid date',
      });
    }

    if (value.birthDate && !moment(value.birthDate).isValid()) {
      sails.config.customLogger.log('warn', 'Invalid birthDate', null, 'message', req.user.id);
      return res.status(400).json({
        success: false,
        error: 'birthDate is not a valid date',
      });
    }

    if (value.scheduledFor && value.patientTZ) {
      const scheduledTimeUTC = moment.tz(value.scheduledFor, 'UTC').valueOf();
      const currentTimeUTC = moment().utc().valueOf();
      if (scheduledTimeUTC < currentTimeUTC) {
        sails.config.customLogger.log('warn', 'Consultation scheduled in the past', null, 'message', req.user.id);
        return res.status(400).json({
          success: false,
          error: sails._t(locale, 'consultation past time'),
        });
      }
    } else if (value.scheduledFor && new Date(value.scheduledFor) < new Date()) {
      sails.config.customLogger.log('warn', 'Consultation scheduled in the past (fallback)', null, 'message', req.user.id);
      return res.status(400).json({
        success: false,
        error: sails._t(locale, 'consultation past time'),
      });
    }

    if (req.user.role === 'scheduler') {
      if (!value.doctorEmail && !value.queue) {
        sails.config.customLogger.log('warn', 'Missing doctorEmail or queue for scheduler', null, null, 'message', req.user.id);
        return res.status(400).json({
          success: false,
          error: 'doctorEmail or queue is required.',
        });
      }
    }

    const tz = escapeHtml(value.patientTZ) || sails.config.globals.DEFAULT_PATIENT_TIMEZONE
    if (tz) {
      const isTZValid = moment.tz.names().includes(tz);
      if (!isTZValid) {
        sails.config.customLogger.log('warn', `Unknown timezone identifier ${tz}`, null, 'message', req.user.id);
        return res.status(400).json({
          success: false,
          error: `Unknown timezone identifier ${tz}`,
        });
      }
    }

    let doctor;
    if (value.doctorEmail) {
      const results = await User.find({
        or: [
          { role: sails.config.globals.ROLE_DOCTOR, email: escapeHtml(value.doctorEmail) },
          { role: sails.config.globals.ROLE_ADMIN, email: escapeHtml(value.doctorEmail) }
        ]
      });
      doctor = results.length > 0 ? results[0] : null;
      if (doctor) {
        doctor = {
          id: doctor.id,
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          email: doctor.email,
          role: doctor.role,
          organization: doctor.organization,
        };
      }

      if (!doctor) {
        sails.config.customLogger.log('warn', 'Doctor not found', null, 'message', req.user.id);
        return res.status(400).json({
          success: false,
          error: `Doctor with email ${escapeHtml(value.doctorEmail) || ''} not found`,
        });
      }
    } else if (req.user.role === 'doctor' || req.user.role === 'admin') {
      doctor = currentUserPublic;
    }

    let queue;
    if (value.queue) {
      queue = await Queue.findOne({
        or: [{ name: value.queue }, { id: escapeHtml(value.queue) }],
      });
    }

    if (value.queue && !queue) {
      sails.config.customLogger.log('warn', `Queue not found ${escapeHtml(value.queue)}`, null, 'message', req.user.id);
      return res.status(400).json({
        error: true,
        message: `Queue ${escapeHtml(value.queue)} doesn't exist`,
      });
    }

    let translationOrganization;
    if (value.translationOrganization) {
      translationOrganization = await TranslationOrganization.findOne({
        or: [
          { name: escapeHtml(value.translationOrganization) },
          { id: escapeHtml(value.translationOrganization) },
        ],
      });
    }

    if (value.translationOrganization && !translationOrganization) {
      sails.config.customLogger.log('warn', `Translation organization not found ${escapeHtml(value.translationOrganization)}`, null, 'message', req.user.id);
      return res.status(400).json({
        success: false,
        error: `TranslationOrganization doesn't exist`,
      });
    }

    if (
      translationOrganization &&
      (translationOrganization.languages || []).indexOf(value.language) === -1
    ) {
      sails.config.customLogger.log('warn', `Patient language not found in translation organization ${escapeHtml(value.language)}`, null, 'message', req.user.id);
      return res.status(400).json({
        success: false,
        error: `patientLanguage ${escapeHtml(value.language)} doesn't exist`,
      });
    }

    let guestInvite;

    try {
      const inviteData = {
        phoneNumber: escapeHtml(value.phoneNumber),
        emailAddress: escapeHtml(value.emailAddress),
        gender: escapeHtml(value.gender),
        firstName: escapeHtml(value.firstName),
        lastName: escapeHtml(value.lastName),
        invitedBy: escapeHtml(req.user.id),
        scheduledFor: value.scheduledFor ? new Date(value.scheduledFor) : undefined,
        patientLanguage: escapeHtml(value.language),
        type: 'PATIENT',
        birthDate: escapeHtml(value.birthDate),
        patientTZ: tz,
        metadata: sanitizeMetadata(value.metadata),
      };
      if (doctor) {
        inviteData.doctor = escapeHtml(doctor.id);
        inviteData.doctorData = { email: escapeHtml(doctor.email) };
      }
      if (queue) {
        inviteData.queue = escapeHtml(queue.id);
      }
      if (translationOrganization) {
        inviteData.translationOrganization = escapeHtml(translationOrganization.id);
      }
      if (value.guestEmailAddress) {
        inviteData.guestEmailAddress = escapeHtml(value.guestEmailAddress);
      }
      if (value.guestPhoneNumber) {
        inviteData.guestPhoneNumber = escapeHtml(value.guestPhoneNumber);
      }
      if (value.messageService) {
        inviteData.messageService = escapeHtml(value.messageService);
      }
      if (value.emailAddress) {
        inviteData.messageService = '3';
      }
      if (value.sendLinkManually) {
        inviteData.messageService = '4';
      }
      if (value.guestMessageService) {
        inviteData.guestMessageService = escapeHtml(value.guestMessageService);
      }
      if (value.experts && Array.isArray(value.experts) && value.experts.length > 0) {
        inviteData.experts = value.experts.map((expert) => ({
          expertContact: escapeHtml(expert.expertContact),
          messageService: escapeHtml(expert.messageService),
        }));
      }

      invite = await PublicInvite.create(inviteData).fetch();
      sails.config.customLogger.log('info', `Invite created inviteId ${invite.id}`, null, 'server-action', req.user.id);

      const experts = value.experts;
      const expertLink = `${process.env.PUBLIC_URL}/inv/?invite=${invite.expertToken}`;
      const doctorLanguage = escapeHtml(value.doctorLanguage) || process.env.DEFAULT_DOCTOR_LOCALE;

      if (Array.isArray(experts)) {
        for (const contact of experts) {
          const { expertContact, messageService } = contact || {};
          if (typeof expertContact === 'string') {
            const isPhoneNumber = /^(\+|00)[0-9 ]+$/.test(expertContact);
            const isEmail = expertContact.includes('@');

            if (isPhoneNumber && !isEmail) {
              if (messageService === '1') {
                const type = 'please use this link';
                if (inviteData.patientLanguage) {
                  const template = await WhatsappTemplate.findOne({
                    language: inviteData.patientLanguage,
                    key: type,
                    approvalStatus: 'approved'
                  });
                  sails.config.customLogger.log('verbose', 'WhatsApp template fetched', null, 'message', req.user.id);
                  if (template && template.sid) {
                    const twilioTemplatedId = template.sid;
                    const params = { 1: invite.expertToken };
                    if (twilioTemplatedId) {
                      await sails.helpers.sms.with({
                        phoneNumber: expertContact,
                        message: sails._t(doctorLanguage, type, { expertLink }),
                        senderEmail: inviteData.doctorData?.email,
                        whatsApp: true,
                        params,
                        twilioTemplatedId
                      });
                      sails.config.customLogger.log('info', 'WhatsApp SMS sent', null, 'server-action', req.user.id);
                    } else {
                      sails.config.customLogger.log('error', 'Template id is missing for WhatsApp SMS', null, 'message', req.user.id);
                    }
                  } else {
                    sails.config.customLogger.log('error', 'WhatsApp template not approved or not found', null, 'message', req.user.id);
                  }
                }
              } else if (messageService === '2') {
                await sails.helpers.sms.with({
                  phoneNumber: expertContact,
                  message: sails._t(doctorLanguage, 'please use this link', { expertLink }),
                  senderEmail: inviteData.doctorData?.email,
                  whatsApp: false,
                });
                sails.config.customLogger.log('info', 'SMS sent', null, 'server-action', req.user.id);
              } else {
                sails.config.customLogger.log('error', `Invalid messageService info ${messageService}`, null, 'message', req.user.id);
              }
            } else if (isEmail && !isPhoneNumber) {
              await sails.helpers.email.with({
                to: expertContact,
                subject: sails._t(doctorLanguage, 'consultation link'),
                text: sails._t(doctorLanguage, 'please use this link', { expertLink }),
              });
              sails.config.customLogger.log('info', 'Email sent to expert', null, 'server-action', req.user.id);
            } else {
              sails.config.customLogger.log('error', 'Invalid contact info provided for expert', null, 'message', req.user.id);
            }
          } else {
            sails.config.customLogger.log('error', 'Expert contact info is not a string', null, 'message', req.user.id);
          }
        }
      }

      if (inviteData.guestPhoneNumber || inviteData.guestEmailAddress) {
        const guestInviteData = {
          patientInvite: invite.id,
          doctor: doctor ? doctor.id : req.user.id,
          invitedBy: req.user.id,
          scheduledFor: value.scheduledFor ? new Date(value.scheduledFor) : undefined,
          type: 'GUEST',
          guestEmailAddress: inviteData.guestEmailAddress,
          guestPhoneNumber: inviteData.guestPhoneNumber,
          guestMessageService: inviteData?.guestMessageService || '',
          emailAddress: inviteData.guestEmailAddress,
          phoneNumber: inviteData.guestPhoneNumber,
          patientLanguage: value.language,
          patientTZ: inviteData.patientTZ,
        };

        guestInvite = await PublicInvite.create(guestInviteData).fetch();
        await PublicInvite.updateOne({ id: invite.id }).set({
          guestInvite: escapeHtml(guestInvite.id),
        });
        sails.config.customLogger.log('info', `Guest invite created guestInviteId ${escapeHtml(guestInvite.id)}`, null, 'server-action', req.user.id);
      }

      if (translationOrganization) {
        const translatorRequestInviteData = {
          patientInvite: invite.id,
          translationOrganization: translationOrganization.id,
          doctor: doctor ? doctor.id : req.user.id,
          invitedBy: req.user.id,
          scheduledFor: value.scheduledFor ? new Date(value.scheduledFor) : undefined,
          patientLanguage: value.language,
          doctorLanguage: value.doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE,
          type: 'TRANSLATOR_REQUEST',
        };

        const translatorRequestInvite = await PublicInvite.create(translatorRequestInviteData).fetch();
        await PublicInvite.updateOne({ id: invite.id }).set({
          translatorRequestInvite: escapeHtml(translatorRequestInvite.id),
        });
        translatorRequestInvite.doctor = doctor || req.user;
        createTranslationRequest(translatorRequestInvite, translationOrganization);
        sails.config.customLogger.log('info', `Translator invite created translatorInviteId ${translatorRequestInvite.id}`, null, 'server-action', req.user.id);
        return res.status(200).json({
          success: true,
          invite,
        });
      }
    } catch (e) {
      sails.config.customLogger.log('error', 'Error during invite processing', { error: e?.message || e  }, 'server-action', req.user?.id);
      return res.status(500).json({
        error: true,
      });
    }

    let shouldSend = true;
    if (!value.hasOwnProperty('sendInvite')) {
      value.sendInvite = req.user.role !== 'scheduler';
    }
    shouldSend = value.sendInvite;
    const doctorLanguage = value.doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE;

    try {
      if (shouldSend) {
        invite.doctor = doctor;
        await PublicInvite.sendPatientInvite(invite);
        sails.config.customLogger.log('info', `Patient invite sent inviteId ${invite.id}`, null, 'server-action', req.user.id);
      }
      if (guestInvite) {
        guestInvite.doctor = doctor;
        await PublicInvite.sendGuestInvite(guestInvite);
        sails.config.customLogger.log('info', `Guest invite sent guestInvite ${guestInvite.id}`, null, 'server-action', req.user.id);
      }
    } catch (error) {
      sails.config.customLogger.log('error', 'Error sending invite', { error: error.message, inviteId: invite.id, uid: req.user.id }, 'server-action', req.user.id);
      await PublicInvite.destroyOne({ id: invite.id });
      return res.status(500).json({
        error: true,
        message: error?.message || sails._t(doctorLanguage, 'invite error'),
      });
    }

    if (invite.scheduledFor) {
      if (shouldSend) {
        invite.doctor = doctor;
        await PublicInvite.updateOne({ id: invite.id }).set({ status: 'SCHEDULED_FOR_INVITE' });
        await PublicInvite.setPatientOrGuestInviteReminders(invite);
        if (invite.emailAddress) {
          await PublicInvite.createAndSendICS(invite);
        }
        sails.config.customLogger.log('info', `Scheduled invite processed inviteId ${invite.id}`, null, 'server-action', req.user.id);
      }
      if (guestInvite) {
        guestInvite.doctor = doctor;
        await PublicInvite.setPatientOrGuestInviteReminders(guestInvite);
      }
    }

    invite.patientURL = `${process.env.PUBLIC_URL}/inv/?invite=${encodeURIComponent(invite.inviteToken)}`;
    invite.doctorURL = process.env.DOCTOR_URL;
    sails.config.customLogger.log('verbose', `Invite process completed inviteId ${invite.id} user ${req.user.id}`, 'message', req.user.id);
    return res.json({
      success: true,
      invite,
    });
  },

  async update(req, res) {
    const id = escapeHtml(req.params.id)
    let invite = await PublicInvite.findOne({
      id: id,
      type: 'PATIENT',
    })
      .populate('guestInvite')
      .populate('translatorInvite')
      .populate('translatorRequestInvite')
      .populate('doctor');

    if (!invite) {
      sails.config.customLogger.log('warn', `Invite  with id ${id} not found requested from user ${req.user.id}`, null, 'message', req.user.id);
      return res.notFound();
    }

    if (invite.status === 'ACCEPTED') {
      sails.config.customLogger.log('warn', `Attempt to update accepted invite (patient) from user ${req.user.id} invite ${invite.id}`, null, 'message', req.user.id);
      return res.status(400).json({
        success: false,
        error: "Can't edit Invite has been accepted by patient",
      });
    }

    if (
      invite.translatorRequestInvite &&
      invite.translatorRequestInvite.status === 'ACCEPTED'
    ) {
      sails.config.customLogger.log('warn', `Attempt to update accepted translator invite from user ${req.user.id} invite ${invite.id}`, null, 'message', req.user.id);
      return res.status(400).json({
        success: false,
        error: "can't edit Invite has been accepted by translator",
      });
    }

    const currentUserPublic = {
      id: req.user.id,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
    };

    const {
      firstName,
      lastName,
      emailAddress,
      phoneNumber,
      scheduledFor,
      birthDate,
      patientTZ,
      doctorEmail,
      queue,
      translationOrganization,
      gender,
      language,
      guestEmailAddress,
      guestPhoneNumber,
      IMADTeam,
      doctorLanguage,
      cancelGuestInvite,
      cancelTranslationRequestInvite,
      cancelScheduledFor,
      messageService,
      sendLinkManually,
      metadata
    } = req.body;

    if (scheduledFor && !moment(scheduledFor).isValid()) {
      sails.config.customLogger.log('warn', 'Invalid scheduledFor date', null, 'message', req.user.id);
      return res.status(400).json({
        success: false,
        error: 'ScheduledFor is not a valid date',
      });
    }
    if (birthDate && !moment(birthDate).isValid()) {
      sails.config.customLogger.log('warn', 'Invalid birthDate', null, 'message', req.user.id);
      return res.status(400).json({
        success: false,
        error: 'birthDate is not a valid date',
      });
    }
    if (scheduledFor && patientTZ) {
      const scheduledTimeUTC = moment.tz(scheduledFor, 'UTC').valueOf();
      const currentTimeUTC = moment().utc().valueOf();
      if (scheduledTimeUTC < currentTimeUTC) {
        sails.config.customLogger.log('warn', 'Consultation time is in the past (with timezone)', null, 'message', req.user.id);
        return res.status(400).json({
          success: false,
          error: 'Consultation Time cannot be in the past',
        });
      }
    } else if (scheduledFor && new Date(scheduledFor) < new Date()) {
      sails.config.customLogger.log('warn', 'Consultation time is in the past (fallback check)', null, 'message', req.user.id);
      return res.status(400).json({
        success: false,
        error: 'Consultation Time cannot be in the past',
      });
    }

    let doctor;
    if (doctorEmail) {
      const doctorResults = await User.find({
        or: [
          { role: sails.config.globals.ROLE_DOCTOR, email: escapeHtml(doctorEmail) },
          { role: sails.config.globals.ROLE_ADMIN, email: escapeHtml(doctorEmail) }
        ]
      });
      doctor = doctorResults.length > 0 ? doctorResults[0] : null;
      if (doctor) {
        doctor = {
          id: doctor.id,
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          email: doctor.email,
          role: doctor.role,
          organization: doctor.organization,
        };
      }
      if (!doctor) {
        sails.config.customLogger.log('warn', 'Doctor not found', null, 'message', req.user.id);
        return res.status(400).json({
          success: false,
          error: `Doctor with email ${escapeHtml(doctorEmail)} not found`,
        });
      }
    } else if (req.user.role === 'doctor') {
      doctor = currentUserPublic;
    }

    let queueObj;
    if (queue) {
      queueObj = await Queue.findOne({
        or: [{ name: queue }, { id: queue }],
      });
    }
    if (queue && !queueObj) {
      sails.config.customLogger.log('warn', `Queue not found ${escapeHtml(queue)}`, null, `message`, req.user.id);
      return res.status(400).json({
        success: false,
        error: `Queue ${escapeHtml(queue)} doesn't exist`,
      });
    }

    let translationOrganizationObj;
    if (translationOrganization) {
      translationOrganizationObj = await TranslationOrganization.findOne({
        or: [
          { name: translationOrganization },
          { id: translationOrganization },
        ],
      });
      if (!translationOrganizationObj) {
        sails.config.customLogger.log('warn', `Translation organization not found ${escapeHtml(translationOrganization)}`, null, `message`, req.user.id);
        return res.status(400).json({
          success: false,
          error: `translationOrganization ${escapeHtml(translationOrganization)} doesn't exist`,
        });
      }
      if (
        (translationOrganizationObj.languages || []).indexOf(language) === -1
      ) {
        sails.config.customLogger.log('warn', `Patient language not available in translation organization ${escapeHtml(language)}`, null, `message`, req.user.id);
        return res.status(400).json({
          success: false,
          error: `patientLanguage ${escapeHtml(language)} doesn't exist`,
        });
      }
    }

    let guestInvite;
    const hasScheduledForChanged =
      scheduledFor && invite.scheduledFor !== new Date(scheduledFor).getTime();

    try {
      let inviteData = {
        phoneNumber: escapeHtml(phoneNumber),
        emailAddress: escapeHtml(emailAddress),
        gender: escapeHtml(gender),
        firstName: escapeHtml(firstName),
        lastName: escapeHtml(lastName),
        patientLanguage: escapeHtml(language),
        IMADTeam:escapeHtml(IMADTeam),
        birthDate: escapeHtml(birthDate),
        patientTZ: escapeHtml(patientTZ),
        metadata
      };
      inviteData = JSON.parse(JSON.stringify(inviteData));

      if (cancelScheduledFor) {
        inviteData.scheduledFor = 0;
      } else if (hasScheduledForChanged) {
        inviteData.scheduledFor = new Date(scheduledFor);
      }

      if (doctor) {
        inviteData.doctor = doctor.id;
      }
      if (queueObj) {
        inviteData.queue = queueObj.id;
      }
      if (messageService) {
        inviteData.messageService = messageService;
      }
      if (emailAddress) {
        inviteData.messageService = '3';
      }
      if (sendLinkManually) {
        inviteData.messageService = '4';
      }
      if (guestEmailAddress && guestEmailAddress !== invite.guestEmailAddress) {
        inviteData.guestEmailAddress = guestEmailAddress;
      }
      if (guestPhoneNumber && guestPhoneNumber !== invite.guestPhoneNumber) {
        inviteData.guestPhoneNumber = guestPhoneNumber;
      }

      await PublicInvite.updateOne({ id: escapeHtml(invite.id) }).set(inviteData);
      invite = await PublicInvite.findOne({ id: invite.id })
        .populate('guestInvite')
        .populate('translatorInvite')
        .populate('translatorRequestInvite')
        .populate('doctor');

      sails.config.customLogger.log('info', `Invite updated  inviteId ${escapeHtml(invite.id)}`, null, 'server-action', req.user.id);

      if (cancelGuestInvite) {
        await PublicInvite.cancelGuestInvite(invite);
        sails.config.customLogger.log('info', `Guest invite cancelled inviteId ${escapeHtml(invite.id)}`, null, 'server-action', req.user.id);
      } else if (inviteData.guestPhoneNumber || inviteData.guestEmailAddress) {
        const guestInviteData = {
          patientInvite: invite.id,
          doctor: doctor ? doctor.id : req.user.id,
          invitedBy: req.user.id,
          scheduledFor: invite.scheduledFor,
          type: 'GUEST',
          guestEmailAddress: inviteData.guestEmailAddress,
          guestPhoneNumber: inviteData.guestPhoneNumber,
          emailAddress: inviteData.guestEmailAddress,
          phoneNumber: inviteData.guestPhoneNumber,
          patientLanguage: language,
        };

        if (invite.guestInvite) {
          await PublicInvite.update({ id: invite.guestInvite.id }).set(guestInviteData);
          sails.config.customLogger.log('info', `Guest invite updated guestInviteId ${invite.guestInvite.id}`, null, 'server-action', req.user.id);
        } else {
          guestInvite = await PublicInvite.create(guestInviteData).fetch();
          await PublicInvite.updateOne({ id: invite.id }).set({ guestInvite: guestInvite.id });
          sails.config.customLogger.log('info', `Guest invite created guestInviteId ${guestInvite.id}`, null, 'server-action', req.user.id);
        }
      }

      if (cancelTranslationRequestInvite) {
        await PublicInvite.cancelTranslationRequestInvite(invite);
        invite.translatorRequestInvite = null;
        sails.config.customLogger.log('info', `Translation request invite cancelled inviteId ${invite.id}`, null, 'server-action', req.user.id);
      } else {
        if (!invite.translatorRequestInvite && translationOrganizationObj) {
          const translatorRequestInviteData = {
            patientInvite: invite.id,
            translationOrganization: translationOrganizationObj.id,
            doctor: doctor ? doctor.id : req.user.id,
            invitedBy: req.user.id,
            scheduledFor: invite.scheduledFor,
            patientLanguage: language,
            doctorLanguage: doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE,
            type: 'TRANSLATOR_REQUEST',
          };

          const translatorRequestInvite = await PublicInvite.create(
            translatorRequestInviteData
          ).fetch();

          await PublicInvite.updateOne({ id: invite.id }).set({
            translatorRequestInvite: translatorRequestInvite.id,
            translationOrganization: translationOrganizationObj.id,
          });

          translatorRequestInvite.doctor = doctor || req.user;
          createTranslationRequest(translatorRequestInvite, translationOrganizationObj);
          sails.config.customLogger.log('info', 'Translator request invite created', { translatorInviteId: translatorRequestInvite.id, uid: req.user.id });
          return res.status(200).json({
            success: true,
            invite,
          });
        }
        const isPatientLanguageDifferent =
          invite.translatorRequestInvite &&
          language &&
          language !== invite.translatorRequestInvite.patientLanguage;
        const isDoctorLanguageDifferent =
          invite.translatorRequestInvite &&
          doctorLanguage &&
          doctorLanguage !== invite.translatorRequestInvite.doctorLanguage;
        const isTranslationOrganizationDifferent =
          invite.translatorRequestInvite &&
          translationOrganizationObj &&
          translationOrganizationObj.id.toString() !==
          invite.translatorRequestInvite.translationOrganization;

        if (
          (translationOrganizationObj && isPatientLanguageDifferent) ||
          isDoctorLanguageDifferent ||
          isTranslationOrganizationDifferent
        ) {
          await PublicInvite.cancelTranslationRequestInvite(invite);
          const translatorRequestInviteData = {
            patientInvite: invite.id,
            translationOrganization: translationOrganizationObj.id,
            doctor: doctor ? doctor.id : req.user.id,
            invitedBy: req.user.id,
            scheduledFor: invite.scheduledFor,
            patientLanguage: language,
            doctorLanguage: doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE,
            type: 'TRANSLATOR_REQUEST',
          };

          const translatorRequestInvite = await PublicInvite.create(
            translatorRequestInviteData
          ).fetch();

          await PublicInvite.updateOne({ id: invite.id }).set({
            translatorRequestInvite: translatorRequestInvite.id,
            translationOrganization: translationOrganizationObj.id,
          });

          translatorRequestInvite.doctor = doctor || req.user;
          createTranslationRequest(translatorRequestInvite, translationOrganizationObj);
          sails.config.customLogger.log('info', `Translator request invite updated translatorInviteId ${translatorRequestInvite.id}`, null, 'server-action', req.user.id);
          return res.status(200).json({
            success: true,
            invite,
          });
        }
      }
    } catch (e) {
      sails.config.customLogger.log('error', 'Error during invite update processing', { error: e?.message | e}, 'server-action', req.user.id);
      return res.status(500).json({
        error: true,
      });
    }

    let shouldSend = true;
    if (!req.body.hasOwnProperty('sendInvite')) {
      req.body.sendInvite = req.user.role !== 'scheduler';
    }
    shouldSend = req.body.sendInvite;

    try {
      if (shouldSend) {
        invite.doctor = doctor;
        await PublicInvite.sendPatientInvite(invite);
        sails.config.customLogger.log('info', `Patient invite sent inviteId ${invite.id}`, null, 'server-action', req.user.id);
      }
      if (guestInvite) {
        guestInvite.doctor = doctor;
        await PublicInvite.sendGuestInvite(guestInvite);
        sails.config.customLogger.log('info', `Guest invite sent guestInviteId ${guestInvite.id}`, null, 'server-action', req.user.id);
      }
    } catch (error) {
      sails.config.customLogger.log('error', 'Error sending invite', { error: error.message, inviteId: invite.id, uid: req.user.id }, 'server-action', req.user?.id);
      return res.status(500).json({
        error: true,
        message: 'Error sending Invite',
      });
    }

    if (hasScheduledForChanged && scheduledFor) {
      if (shouldSend) {
        invite.doctor = doctor;
        await PublicInvite.setPatientOrGuestInviteReminders(invite);
        sails.config.customLogger.log('info', `Patient invite reminders set inviteId ${invite.id}`, null, 'server-action', req.user.id);
      }
      if (guestInvite) {
        guestInvite.doctor = doctor;
        await PublicInvite.setPatientOrGuestInviteReminders(guestInvite);
        sails.config.customLogger.log('info', `Guest invite reminders set guestInviteId ${guestInvite.id}`, null, 'server-action', req.user.id);
      }
    }

    invite.patientURL = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    invite.doctorURL = process.env.DOCTOR_URL;
    sails.config.customLogger.log('info', `Invite update process completed inviteId ${invite.id}`, null, null, 'server-action', req.user.id);
    return res.json({
      success: true,
      invite,
    });
  },

  /**
   * resend invite
   * @param {*} req
   * @param {*} res
   */
  async resend(req, res) {
    try {
      const inviteId = escapeHtml(req.params.invite);
      sails.config.customLogger.log('info', `Resend invite process started inviteId ${inviteId}`, null, 'server-action', req.user?.id);

      const patientInvite = await PublicInvite.findOne({
        id: inviteId,
      })
        .populate('guestInvite')
        .populate('translatorInvite')
        .populate('translatorRequestInvite')
        .populate('doctor');

      if (!patientInvite) {
        sails.config.customLogger.log('warn', `Patient invite not found inviteId ${inviteId}`, null, 'message', req.user?.id);
        return res.notFound();
      }

      if (
        patientInvite.translatorRequestInvite &&
        patientInvite.translatorRequestInvite.status !== 'ACCEPTED'
      ) {
        sails.config.customLogger.log('warn', `Translation invite has not been accepted inviteId ${patientInvite.id}`, null, 'server-action', req.user?.id);
        return res.status(400).json({
          success: false,
          error: 'Translation invite have NOT been accepted',
        });
      }

      await PublicInvite.sendPatientInvite(patientInvite, true);
      await PublicInvite.updateOne({ id: inviteId }).set({
        status: 'SENT',
      });
      sails.config.customLogger.log('info', `Patient invite resent inviteId ${patientInvite.id}`, null, 'server-action', req.user?.id);

      if (patientInvite.translatorInvite) {
        const translator = await User.findOne({
          username: patientInvite.translatorInvite.id,
        });
        patientInvite.translatorInvite.doctor = patientInvite.doctor;
        await PublicInvite.sendTranslatorInvite(
          patientInvite.translatorInvite,
          translator.email
        );
        await PublicInvite.updateOne({
          id: patientInvite.translatorInvite.id,
        }).set({
          status: 'SENT',
        });
        sails.config.customLogger.log('info', `Translator invite resent translatorInviteId ${patientInvite.translatorInvite.id} inviteId ${patientInvite.id}`, null, 'server-action', req.user?.id);
      }

      if (patientInvite.guestInvite) {
        patientInvite.guestInvite.doctor = patientInvite.doctor;
        await PublicInvite.sendGuestInvite(patientInvite.guestInvite);
        await PublicInvite.updateOne({ id: patientInvite.guestInvite.id }).set({
          status: 'SENT',
        });
        sails.config.customLogger.log('info', `Guest invite resent guestInviteId ${patientInvite.guestInvite.id} inviteId ${patientInvite.id}`, null, 'server-action', req.user?.id);
      }

      if (
        patientInvite.scheduledFor &&
        patientInvite.scheduledFor > Date.now()
      ) {
        await PublicInvite.setPatientOrGuestInviteReminders(patientInvite);
        sails.config.customLogger.log('info', `Patient invite reminders set inviteId ${patientInvite.id}`, null, 'server-action', req.user?.id);
        if (patientInvite.guestInvite) {
          await PublicInvite.setPatientOrGuestInviteReminders(patientInvite.guestInvite);
          sails.config.customLogger.log('info', `Guest invite reminders set guestInviteId ${patientInvite.guestInvite.id}`, null, 'server-action', req.user?.id);
        }
      }

      patientInvite.patientURL = `${process.env.PUBLIC_URL}/inv/?invite=${encodeURIComponent(patientInvite.inviteToken)}`;
      sails.config.customLogger.log('info', `Resend invite process completed inviteId ${patientInvite.id}`, null, 'server-action', req.user?.id);

      return res.json({
        success: true,
        patientInvite,
      });
    } catch (error) {
      sails.config.customLogger.log('error', 'Error during resend invite process', {
        error: error?.message,
        inviteId: req.params.invite
      }, 'server-action', req.user?.id);
      return res.json({
        success: false,
        error: error.message,
      });
    }
  },

  async revoke(req, res) {
    try {
      const invite = await PublicInvite.findOne({ id: req.params.invite });
      if (!invite) {
        sails.config.customLogger.log('warn', `Revoke failed: Invite not found inviteId ${req.params.invite}`, null, 'message', req.user?.id);
        return res.notFound();
      }

      await PublicInvite.destroyPatientInvite(invite);
      sails.config.customLogger.log('info', `Invite successfully revoked inviteId ${invite.id}`, null, 'server-action', req.user?.id);
      return res.status(200).send();
    } catch (error) {
      sails.config.customLogger.log('error', 'Error revoking invite', {
        error: error?.message,
        inviteId: req.params.invite,
      }, 'server-action', req.user?.id);
      return res.status(500).send();
    }
  },

  /**
   * Finds the public invite linked to a consultation
   */
  async findByConsultation(req, res) {
    try {
      const consultationId = escapeHtml(req.params.consultation);
      const consultation = await Consultation.findOne({ id: consultationId });
      if (!consultation) {
        sails.config.customLogger.log('warn', `Consultation not found consultationId ${consultationId}`, null, 'message', req.user?.id);
        return res.notFound();
      }

      if (!consultation.invitationToken) {
        sails.config.customLogger.log('warn', `Consultation missing invitation token consultationId ${consultationId}`, null, 'message', req.user?.id);
        return res.notFound();
      }

      const publicinvite = await PublicInvite.findOne({
        inviteToken: consultation.invitationToken,
      });
      if (!publicinvite) {
        sails.config.customLogger.log('warn', `Public invite not found for invitation token consultationId ${consultationId}`, null, 'message', req.user?.id);
        return res.notFound();
      }

      sails.config.customLogger.log('info', `Public invite retrieved successfully consultationId ${consultationId} inviteId ${publicinvite.id}`, null, 'message', req.user?.id);
      return res.json(publicinvite);
    } catch (error) {
      sails.config.customLogger.log('error', 'Error retrieving invite by consultation', {
        error: error?.message || error,
      }, 'server-action', req.user?.id);
      return res.status(500).send();
    }
  },

  /**
   * Finds the public invite By token
   */
  async findByToken(req, res) {
    try {
      const token = req.params.invitationToken;
      sails.config.customLogger.log('info', `findByToken called ${token}`, null, 'message', req.user?.id);

      const publicinvite = await PublicInvite.findOne({
        or: [
          { inviteToken: token },
          { expertToken: token },
        ],
      })
        .populate('translationOrganization')
        .populate('doctor');

      if (!publicinvite) {
        sails.config.customLogger.log('warn', `Public invite not found token ${token}`, null, 'message', req.user?.id);
        return res.notFound();
      }

      const isExpert = publicinvite.expertToken === token;
      sails.config.customLogger.log('info', `Public invite retrieved inviteId ${publicinvite.id}`, null, 'message', req.user?.id);

      if (publicinvite.doctor) {
        publicinvite.doctor = _.pick(publicinvite.doctor, [
          'firstName',
          'lastName',
        ]);
      }

      const expertBody = {};
      if (isExpert) {
        expertBody.status = null;
        expertBody.isExpert = true;
        expertBody.expertToken = publicinvite.expertToken;
      }

      sails.config.customLogger.log('info', `findByToken completed successfully inviteId ${publicinvite.id}`, null, 'server-action', req.user?.id);
      return res.json({ ...publicinvite, expertToken: '', ...expertBody });
    } catch (error) {
      sails.config.customLogger.log('error', 'Error in findByToken', {
        error: error?.message || error
      }, 'server-action', req.user?.id);
      return res.status(500).send();
    }
  },

  async checkInviteStatus(req, res) {
    try {
      if (!req.params.invitationToken) {
        sails.config.customLogger.log('warn', 'Missing invitationToken parameter invitationToken', null, 'message', req.user?.id);
        return res.status(400).json({
          success: false,
          error: 'Missing invitation token'
        });
      }

      const invitationToken = req.params.invitationToken

      sails.config.customLogger.log('info', `Checking invite status ${invitationToken}`, null, 'message', req.user?.id);

      const publicInvite = await PublicInvite.findOne({
        or: [{ inviteToken: req.params.invitationToken }],
      });

      if (!publicInvite) {
        sails.config.customLogger.log('warn', `Invite not found ${invitationToken}`, null, 'message', req.user?.id);
        return res.json({
          success: false,
          message: 'Invite not found',
        });
      }

      const acknowledgmentStatuses = [
        'SENT',
        'READ',
        'QUEUED',
        'FAILED',
        'PENDING',
        'RECEIVED',
        'SENDING',
        'SCHEDULED',
        'DELIVERED',
        'UNDELIVERED',
        'PARTIALLY_DELIVERED',
        'SCHEDULED_FOR_INVITE',
      ];

      let requiresAcknowledgment = acknowledgmentStatuses.includes(publicInvite.status);

      sails.config.customLogger.log('info', `Invite status checked ${publicInvite.id}`, null, 'message', req.user?.id);
      return res.json({
        success: true,
        requiresAcknowledgment,
      });
    } catch (error) {
      sails.config.customLogger.log('error', 'Error checking invite status', {
        error: error?.message || error,
      }, null, 'server-action', req.user?.id);
      return res.status(500).json({
        success: false,
        message: 'An unexpected error occurred',
        error: error.message,
      });
    }
  },

  async acknowledgeInvite(req, res) {
    try {
      const { inviteToken } = req.body;

      if (!inviteToken) {
        sails.config.customLogger.log('warn', `Missing inviteToken in acknowledgeInvite request ${inviteToken}`, null, 'message', req.user?.id);
        return res.status(400).json({
          success: false,
          error: 'Missing inviteToken',
        });
      }

      sails.config.customLogger.log('info', `Acknowledging invite ${inviteToken}`, null, 'message', req.user?.id);

      const invite = await PublicInvite.findOne({ inviteToken });
      if (!invite) {
        sails.config.customLogger.log('warn', `Invite not found in acknowledgeInvite ${inviteToken}`, null, 'message', req.user?.id);
        return res.status(404).json({
          success: false,
          message: 'Invite not found',
        });
      }

      await PublicInvite.updateOne({ inviteToken }).set({ status: 'ACKNOWLEDGED' });
      sails.config.customLogger.log('info', `Invite status updated to ACKNOWLEDGED ${invite.id}`, null, 'server-action', req.user?.id);

      return res.json({
        success: true,
        message: 'Invite status updated to ACKNOWLEDGED',
      });
    } catch (error) {
      sails.config.customLogger.log('error', 'Error acknowledging invite', {
        error: error?.message || error,
      }, 'server-action', req.user?.id);
      return res.status(500).json({
        success: false,
        message: 'An unexpected error occurred',
        error: error.message,
      });
    }
  },

  async getConsultation(req, res) {
    try {
      const inviteId = req.params.invite || req.params.id;
      if (!inviteId) {
        sails.config.customLogger.log('warn', 'Missing inviteId parameter in getConsultation', null, 'message', req.user?.id);
        return res.status(500).send();
      }

      sails.config.customLogger.log('info', `Fetching consultation data inviteId ${inviteId}`, null, 'message', req.user?.id);

      const [consultation] = await Consultation.find({ invite: inviteId });
      const [anonymousConsultation] = await AnonymousConsultation.find({ invite: inviteId });

      if (!consultation && !anonymousConsultation) {
        sails.config.customLogger.log('warn', `No consultation found for inviteId ${inviteId}`, null, 'message', req.user?.id);
        return res.notFound();
      }

      if (consultation && consultation.closedAt) {
        consultation.duration = consultation.createAt - consultation.closedAt;
      }

      if (consultation) {
        const anonymousConsultationDetails = await Consultation.getAnonymousDetails(consultation);
        consultation.doctorURL = process.env.DOCTOR_URL + '/app/consultation/' + consultation.id;
        sails.config.customLogger.log('info', `Returning consultation details ${consultation.id}`, null, 'server-action', req.user?.id);
        return res.status(200).json(anonymousConsultationDetails);
      }

      if (anonymousConsultation) {
        anonymousConsultation.doctorURL = process.env.DOCTOR_URL + '/app/consultation/' + anonymousConsultation.id;
        sails.config.customLogger.log('info', `Returning anonymous consultation details ${anonymousConsultation.id}`, null, 'server-action', req.user?.id);
        return res.status(200).json(anonymousConsultation);
      }
    } catch (error) {
      sails.config.customLogger.log('error', 'Error in getConsultation', { error: error?.message | error }, 'server-action', req.user?.id);
      return res.status(500).send();
    }
  },

  async getInvite(req, res, next) {
    try {
      const inviteId = req.params.invite || req.params.id;
      if (!inviteId) {
        sails.config.customLogger.log('warn', 'Missing inviteId in getInvite', { inviteId: 'undefined' });
        return res.status(500).send();
      }

      sails.config.customLogger.log('info', `Fetching invite ${inviteId}`, null, 'message', req.user?.id);
      const invite = await PublicInvite.findOne({ id: inviteId });
      if (!invite) {
        sails.config.customLogger.log('warn', `Invite not found ${inviteId}`, null, 'message', req.user?.id);
        return res.notFound();
      }

      const [consultation] = await Consultation.find({ invite: inviteId });
      if (consultation) {
        invite.doctorURL = process.env.DOCTOR_URL + '/app/consultation/' + consultation.id;
        sails.config.customLogger.log('info', `Consultation found for invite consultationId ${consultation.id} inviteId ${inviteId}`, null, 'message', req.user?.id);
      }

      invite.patientURL = `${process.env.PUBLIC_URL}/inv/?invite=${encodeURIComponent(invite.inviteToken)}`;
      sails.config.customLogger.log('info', `Returning invite details for ${inviteId}`, null, 'server-action', req.user?.id);

      return res.json(invite);
    } catch (error) {
      sails.config.customLogger.log('error', 'Error in getInvite', { error: error?.message | error }, 'server-action', req.user?.id);
      return res.status(500).send();
    }
  },

  async closeConsultation(req, res, next) {
    try {
      const inviteId = req.params.invite;
      if (!inviteId) {
        sails.config.customLogger.log('warn', 'Missing invite parameter in closeConsultation', null, 'message', req.user?.id);
        return res.status(400).json({ success: false, error: 'Missing invite parameter' });
      }

      sails.config.customLogger.log('info', `Attempting to close consultation inviteId ${inviteId}`, null, 'message', req.user?.id);
      const [consultation] = await Consultation.find({ invite: inviteId });

      if (!consultation || consultation.status !== 'active') {
        sails.config.customLogger.log('warn', `Consultation not active or not found, checking anonymous consultation inviteId ${inviteId}`, null, 'message', req.user?.id);
        const [anonymousConsultation] = await AnonymousConsultation.find({ invite: inviteId });
        if (anonymousConsultation) {
          anonymousConsultation.duration = anonymousConsultation.closedAt - anonymousConsultation.acceptedAt;
          sails.config.customLogger.log('info', `Anonymous consultation closed inviteId ${inviteId} consultationId ${anonymousConsultation.id}`, null, 'server-action', req.user?.id);
          return res.status(200).json(anonymousConsultation);
        } else {
          sails.config.customLogger.log('warn', `No consultation found inviteId ${inviteId}`, null, 'message', req.user?.id);
          return res.status(404).json({ success: false, error: 'Consultation not found' });
        }
      }

      consultation.duration = Date.now() - consultation.acceptedAt;
      sails.config.customLogger.log('info', `Closing active consultation inviteId ${inviteId} consultationId ${consultation.id} duration ${consultation.duration}`, null, 'server-action', req.user?.id);

      await Consultation.closeConsultation(consultation);
      sails.config.customLogger.log('info', `Consultation closed successfully inviteId ${inviteId} consultationId ${consultation.id}`, null, 'message', req.user?.id);

      return res.status(200).json(consultation);
    } catch (error) {
      sails.config.customLogger.log('error', 'Error closing consultation', {
        error: error.message,
        inviteId: req.params.invite || 'undefined'
      }, 'server-action', req.user?.id);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};

/**
 * ConsultationController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */
const db = PublicInvite.getDatastore().manager;
const { ObjectId } = require('mongodb');
const Joi = require('joi');

const moment = require('moment-timezone');
const { i18n } = require('../../config/i18n');
const sanitize = require('mongo-sanitize');

// /**
//  *
//  *
//  * @param {string} inviteUrl the url for the translator invite page
//  * @returns {string} - The invitation Email text
//  */
// function getTranslationInviteText (inviteUrl, scheduledFor, languageOne, languageTwo) {
//   const scheduledForText = (scheduledFor ? ` at ${moment(scheduledFor).format('D MMMM à HH:mm')}. ` : ' ');
//   return `Bonjour, You have been invited to translate between ${languageOne} and ${languageTwo}${
//     scheduledForText
//   } Please visit this url to accept the invite ${inviteUrl}`;
// }

/**
 *
 * returns array of errors
 *
 * @param {object} invite
 */

const headersSchema = Joi.object({
  locale: Joi.string().optional(),
}).unknown(true);

const inviteDataSchema = Joi.object({
  phoneNumber: Joi.string().min(8).max(15).allow('').optional()
    .messages({
      'string.min': 'Phone number should be at least 8 digits',
      'string.max': 'Phone number should not exceed 15 digits',
    }),
  emailAddress: Joi.string().email().allow('').optional()
    .messages({
      'string.email': 'Email address must be a valid email',
    }),
  gender: Joi.string().valid('male', 'female')
    .messages({
      'any.only': 'Gender must be one of male, female, or other',
    }),
  firstName: Joi.string().min(1).max(40)
    .messages({
      'string.min': 'First name must be at least 1 character long',
      'string.max': 'First name must be less than 40 characters',
    }),
  lastName: Joi.string().min(1).max(100)
    .messages({
      'string.min': 'Last name must be at least 1 character long',
      'string.max': 'Last name must be less than 100 characters',
    }),
  invitedBy: Joi.string().allow('').optional(),
  scheduledFor: Joi.date().optional().allow('')
    .messages({
      'date.base': 'ScheduledFor must be a valid date',
    }),
  language: Joi.string().optional().allow(''),
  type: Joi.string().optional().allow(''),
  birthDate: Joi.date().optional().allow(''),
  patientTZ: Joi.string().optional().allow(''),
  metadata: Joi.any().optional(),
}).unknown(true);


function validateInviteRequest(invite) {
  const errors = [];
  if (!invite.phoneNumber && !invite.emailAddress) {
    errors.push({ message: 'emailAddress or phoneNumber are required' });
  }

  if (!invite.gender) {
    errors.push({ message: 'gender is required' });
  }
  if (invite.gender) {
    if (!['male', 'female'].includes(invite.gender)) {
      errors.push({ message: 'gender must be either male or female' });
    }
  }
  if (!invite.firstName) {
    errors.push({ message: 'firstName is required' });
  }
  if (!invite.lastName) {
    errors.push({ message: 'lastName is required' });
  }

  return errors;
}

//!function that transform DISPLAY_META in a object from a string
//  function toObjectDIsplayMeta(string, para){
//    let ObjectDisplay = {};
//   if(string === "" || string === undefined){
//     return ObjectDisplay;
//   }else{
//     let arrayString = string.split(',');
//     for (let i = 0; i < arrayString.length; i++) {
//       if(para === undefined){
//         ObjectDisplay = {};
//       }else{
//         ObjectDisplay[arrayString[i]] = para[arrayString[i]];
//       }
//     }
//     return ObjectDisplay;
//   }
// }

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

// createTranslationRequest({patientLanguage:'fr', doctorLanguage:'en'},{id:"5f1aca5ff9c3b531dd462f5c"})

module.exports = {
  async invite(req, res) {
    let invite = null;
    console.log('create invite now');
    const { error, value } = inviteDataSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details,
      });
    }
    const currentUserPublic = {
      id: req.user.id,
      firstName: req.user.firstName,
      email: req.user.email,
      lastName: req.user.lastName,
      role: req.user.role,
    };

    const { error: headersErrors, value: headers } = headersSchema.validate(req.headers, { abortEarly: false });
    if (headersErrors) {
      return res.status(400).json({
        success: false,
        error: headersErrors.details,
      });
    }

    const locale = headers.locale || i18n.defaultLocale;

    // validate
    if (req.body.isPatientInvite && !req.body.sendLinkManually) {
      const errors = validateInviteRequest(req.body);
      if (errors.length) {
        return res.status(400).json(errors);
      }

      if (
        req.user.role !== 'scheduler' &&
        (req.body.IMADTeam || req.body.birthDate)
      ) {
        return res.status(400).json({
          success: false,
          error: 'IMADTeam and birthDate are not allowed',
        });
      }
    } else {
      if (
        !req.body.translationOrganization &&
        !req.body.guestPhoneNumber &&
        !req.body.guestEmailAddress &&
        !req.body.sendLinkManually
      ) {
        return res.status(400).json({
          success: false,
          error: 'You must invite at least a patient translator or a guest!',
        });
      }
    }

    if (req.body.scheduledFor && !moment(req.body.scheduledFor).isValid()) {
      return res.status(400).json({
        success: false,
        error: 'ScheduledFor is not a valid date',
      });
    }

    if (req.body.birthDate && !moment(req.body.birthDate).isValid()) {
      return res.status(400).json({
        success: false,
        error: 'birthDate is not a valid date',
      });
    }

    if (req.body.scheduledFor && req.body.patientTZ) {
      const scheduledTimeUTC = moment.tz(req.body.scheduledFor, 'UTC').valueOf();
      const currentTimeUTC = moment().utc().valueOf();
      if (scheduledTimeUTC < currentTimeUTC) {
        return res.status(400).json({
          success: false,
          error: sails._t(locale, 'consultation past time'),
        });
      }
    } else if (req.body.scheduledFor && new Date(req.body.scheduledFor) < new Date()) {
      return res.status(400).json({
        success: false,
        error: sails._t(locale, 'consultation past time'),
      });
    }

    if (req.user.role === 'scheduler') {
      if (!req.body.doctorEmail && !req.body.queue) {
        return res.status(400).json({
          success: false,
          error: 'doctorEmail or queue is required.',
        });
      }
    }

    if (value.patientTZ) {
      const isTZValid = moment.tz.names().includes(value.patientTZ);
      if (!isTZValid) {
        return res.status(400).json({
          success: false,
          error: `Unknown timezone identifier ${value.patientTZ}`,
        });
      }
    }

    let doctor;
    if (req.body.doctorEmail) {
      // get doctor
      const results = await User.find({
        or: [
          { role: sails.config.globals.ROLE_DOCTOR, email: req.body.doctorEmail },
          { role: sails.config.globals.ROLE_ADMIN, email: req.body.doctorEmail }
        ]
      });
      doctor = results.length > 0 ? results[0] : null;
      if (doctor) {
        doctor = _.pick(doctor, [
          'id',
          'firstName',
          'lastName',
          'email',
          'role',
          'organization',
        ]);
      }

      if (!doctor) {
        return res.status(400).json({
          success: false,
          error: `Doctor with email ${value.doctorEmail || ''} not found`,
        });
      }
      // a
    } else if (req.user.role === 'doctor' || req.user.role === 'admin') {
      doctor = currentUserPublic;
    }

    let queue;
    if (value.queue) {
      queue = await Queue.findOne({
        or: [{ name: value.queue }, { id: value.queue }],
      });
    }

    if (value.queue && !queue) {
      return res.status(400).json({
        error: true,
        message: `queue ${value.queue} doesn't exist`,
      });
    }

    let translationOrganization;
    if (value.translationOrganization) {
      translationOrganization = await TranslationOrganization.findOne({
        or: [
          { name: value.translationOrganization },
          { id: value.translationOrganization },
        ],
      });
    }

    if (value.translationOrganization && !translationOrganization) {
      return res.status(400).json({
        error: true,
        message: `translationOrganization ${value.translationOrganization} doesn't exist`,
      });
    }

    if (
      translationOrganization &&
      (translationOrganization.languages || []).indexOf(value.language) ===
      -1
    ) {
      return res.status(400).json({
        error: true,
        message: `patientLanguage ${value.language} doesn't exist`,
      });
    }

    let guestInvite;

    try {
      // add other invite info
      // send invite to translator and guest

      const inviteData = {
        phoneNumber: value.phoneNumber,
        emailAddress: value.emailAddress,
        gender: value.gender,
        firstName: value.firstName,
        lastName: value.lastName,
        invitedBy: req.user.id,
        scheduledFor: value.scheduledFor
          ? new Date(value.scheduledFor)
          : undefined,
        patientLanguage: value.language,
        type: 'PATIENT',
        //IMADTeam: req.body.IMADTeam,
        birthDate: value.birthDate,
        patientTZ: value.patientTZ,
        // metadata: toObjectDIsplayMeta(process.env.DISPLAY_META,req.body.metadata),
        metadata: value.metadata,
        //! passing metadata from request
      };
      if (doctor) {
        inviteData.doctor = doctor.id;
        inviteData.doctorData = { email: doctor.email };
      }
      if (queue) {
        inviteData.queue = queue.id;
      }

      if (translationOrganization) {
        inviteData.translationOrganization = translationOrganization.id;
      }

      if (value.guestEmailAddress) {
        inviteData.guestEmailAddress = value.guestEmailAddress;
      }

      if (value.guestPhoneNumber) {
        inviteData.guestPhoneNumber = value.guestPhoneNumber;
      }

      if (value.messageService) {
        inviteData.messageService = value.messageService;
      }

      if (value.emailAddress) {
        inviteData.messageService = '3';
      }

      if (value.sendLinkManually) {
        inviteData.messageService = '4';
      }

      if (value.guestMessageService) {
        inviteData.guestMessageService = value.guestMessageService;
      }

      if (value.experts && value.experts.length > 0) {
        inviteData.experts = value.experts;
      }

      invite = await PublicInvite.create(inviteData).fetch();
      const experts = req.body.experts;

      const expertLink = `${process.env.PUBLIC_URL}/inv/?invite=${invite.expertToken}`;

      const doctorLanguage =
        req.body.doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE;

      if (Array.isArray(experts)) {
        for (const contact of experts) {
          const { expertContact, messageService } = contact || {};
          if (typeof expertContact === 'string') {
            const isPhoneNumber = /^(\+|00)[0-9 ]+$/.test(expertContact);
            const isEmail = expertContact.includes('@');

            if (isPhoneNumber && !isEmail) {
              //  WhatsApp
              if (messageService === '1') {
                const type = 'please use this link';
                if (inviteData.patientLanguage) {
                  const template = await WhatsappTemplate.findOne({ language: inviteData.patientLanguage, key: type, approvalStatus: 'approved' });
                  console.log(template, 'template');
                  if (template && template.sid) {
                    const twilioTemplatedId = template.sid;
                    const params = {
                      1: invite.expertToken
                    };
                    if (twilioTemplatedId) {
                      await sails.helpers.sms.with({
                        phoneNumber: expertContact,
                        message: sails._t(doctorLanguage, type, {
                          expertLink: expertLink,
                        }),
                        senderEmail: inviteData.doctorData?.email,
                        whatsApp: true,
                        params,
                        twilioTemplatedId
                      });
                    } else {
                      console.log('ERROR SENDING WhatsApp SMS', 'Template id is missing');
                    }
                  } else {
                    console.log('ERROR SENDING WhatsApp SMS', 'Template is not  approved');
                  }
                }
              } else if (messageService === '2') {
                await sails.helpers.sms.with({
                  phoneNumber: expertContact,
                  message: sails._t(doctorLanguage, 'please use this link', {
                    expertLink: expertLink,
                  }),
                  senderEmail: inviteData.doctorData?.email,
                  whatsApp: false,
                });
              } else {
                sails.log.error(
                  `Invalid messageService info: ${messageService}`
                );
              }

            } else if (isEmail && !isPhoneNumber) {
              await sails.helpers.email.with({
                to: expertContact,
                subject: sails._t(doctorLanguage, 'consultation link'),
                text: sails._t(doctorLanguage, 'please use this link', {
                  expertLink: expertLink,
                }),
              });
            } else {
              sails.log.error(`Invalid contact info: ${expertContact}`);
            }
          } else {
            sails.log.error(
              `Invalid contact info (not a string): ${expertContact}`
            );
          }
        }
      }

      if (inviteData.guestPhoneNumber || inviteData.guestEmailAddress) {
        const guestInviteDate = {
          patientInvite: invite.id,
          doctor: doctor ? doctor.id : req.user.id,
          invitedBy: req.user.id,
          scheduledFor: req.body.scheduledFor
            ? new Date(req.body.scheduledFor)
            : undefined,
          type: 'GUEST',
          guestEmailAddress: inviteData.guestEmailAddress,
          guestPhoneNumber: inviteData.guestPhoneNumber,
          guestMessageService: inviteData?.guestMessageService || '',
          emailAddress: inviteData.guestEmailAddress,
          phoneNumber: inviteData.guestPhoneNumber,
          patientLanguage: req.body.language,
          patientTZ: inviteData.patientTZ,
        };

        guestInvite = await PublicInvite.create(guestInviteDate).fetch();

        await PublicInvite.updateOne({ id: invite.id }).set({
          guestInvite: guestInvite.id,
        });
      }

      if (translationOrganization) {
        // create and send translator invite
        const translatorRequestInviteData = {
          patientInvite: invite.id,
          translationOrganization: translationOrganization.id,
          doctor: doctor ? doctor.id : req.user.id,
          invitedBy: req.user.id,
          scheduledFor: req.body.scheduledFor
            ? new Date(req.body.scheduledFor)
            : undefined,
          patientLanguage: req.body.language,
          doctorLanguage:
            req.body.doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE,
          type: 'TRANSLATOR_REQUEST',
        };

        const translatorRequestInvite = await PublicInvite.create(
          translatorRequestInviteData
        ).fetch();

        await PublicInvite.updateOne({ id: invite.id }).set({
          translatorRequestInvite: translatorRequestInvite.id,
        });

        translatorRequestInvite.doctor = doctor || req.user;
        createTranslationRequest(
          translatorRequestInvite,
          translationOrganization
        );

        // that's it we don't send the invite until the translation request is accepted
        return res.status(200).json({
          success: true,
          invite,
        });
      }
    } catch (e) {
      console.log('error', e);
      return res.status(500).json({
        error: true,
      });
    }

    let shouldSend = true;
    if (!req.body.hasOwnProperty('sendInvite')) {
      req.body.sendInvite = req.user.role !== 'scheduler';
    }

    shouldSend = req.body.sendInvite;
    const doctorLanguage =
      req.body.doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE;

    try {
      if (shouldSend) {
        invite.doctor = doctor;
        await PublicInvite.sendPatientInvite(invite);
      }
      if (guestInvite) {
        guestInvite.doctor = doctor;
        await PublicInvite.sendGuestInvite(guestInvite);
      }
    } catch (error) {
      console.log('ERROR SENDING Invite>>>>>>>> ', error);
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
      }
      if (guestInvite) {
        guestInvite.doctor = doctor;
        await PublicInvite.setPatientOrGuestInviteReminders(guestInvite);
      }
    }

    invite.patientURL = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    invite.doctorURL = process.env.DOCTOR_URL;
    return res.json({
      success: true,
      invite,
    });
  },

  // update
  async update(req, res) {
    let invite = await PublicInvite.findOne({
      id: req.params.id,
      type: 'PATIENT',
    })
      .populate('guestInvite')
      .populate('translatorInvite')
      .populate('translatorRequestInvite')
      .populate('doctor');

    // if no invite return 404
    if (!invite) {
      return res.notFound();
    }

    // if invite has been accepted return 400
    if (invite.status === 'ACCEPTED') {
      return res.status(400).json({
        error: true,
        message: 'can\'t edit Invite has been accepted by patient',
      });
    }

    if (
      invite.translatorRequestInvite &&
      invite.translatorRequestInvite.status === 'ACCEPTED'
    ) {
      return res.status(400).json({
        error: true,
        message: 'can\'t edit Invite has been accepted by translator',
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
      metadata
    } = req.body;

    // validate provided fields
    if (scheduledFor && !moment(scheduledFor).isValid()) {
      return res.status(400).json({
        success: false,
        error: 'ScheduledFor is not a valid date',
      });
    }

    if (birthDate && !moment(birthDate).isValid()) {
      return res.status(400).json({
        success: false,
        error: 'birthDate is not a valid date',
      });
    }

    if (scheduledFor && patientTZ) {
      const scheduledTimeUTC = moment.tz(scheduledFor, 'UTC').valueOf();
      const currentTimeUTC = moment().utc().valueOf();
      if (scheduledTimeUTC < currentTimeUTC) {
        return res.status(400).json({
          success: false,
          error: 'Consultation Time cannot be in the past',
        });
      }
    } else if (scheduledFor && new Date(scheduledFor) < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Consultation Time cannot be in the past',
      });
    }

    let doctor;
    if (doctorEmail) {
      // get doctor
      const res = await User.find({
        or: [
          { role: sails.config.globals.ROLE_DOCTOR, email: req.body.doctorEmail },
          { role: sails.config.globals.ROLE_ADMIN, email: req.body.doctorEmail }
        ]
      });
      doctor = res.length > 0 ? res[0] : null;
      if (doctor) {
        doctor = _.pick(doctor, [
          'id',
          'firstName',
          'lastName',
          'email',
          'role',
          'organization',
        ]);
      }

      if (!doctor) {
        return res.status(400).json({
          success: false,
          error: `Doctor with email ${doctorEmail} not found`,
        });
      }
      // a
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
      return res.status(400).json({
        error: true,
        message: `queue ${queue} doesn't exist`,
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
        return res.status(400).json({
          error: true,
          message: `translationOrganization ${translationOrganization} doesn't exist`,
        });
      }
      if (
        (translationOrganizationObj.languages || []).indexOf(language) === -1
      ) {
        return res.status(400).json({
          error: true,
          message: `patientLanguage ${language} doesn't exist`,
        });
      }
    }

    let guestInvite;
    const hasScheduledForChanged =
      scheduledFor && invite.scheduledFor !== new Date(scheduledFor).getTime();
    try {
      let inviteData = {
        phoneNumber: phoneNumber,
        emailAddress: emailAddress,
        gender: gender,
        firstName: firstName,
        lastName: lastName,

        patientLanguage: language,
        IMADTeam: IMADTeam,
        birthDate: birthDate,
        patientTZ: patientTZ,
        metadata: metadata
      };
      // remove undefined values
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

      if (guestEmailAddress && guestEmailAddress !== invite.guestEmailAddress) {
        inviteData.guestEmailAddress = guestEmailAddress;
      }

      if (guestPhoneNumber && guestPhoneNumber !== invite.guestPhoneNumber) {
        inviteData.guestPhoneNumber = guestPhoneNumber;
      }

      // update
      invite = await PublicInvite.updateOne({ id: invite.id }).set(inviteData);
      invite = await PublicInvite.findOne({ id: invite.id })
        .populate('guestInvite')
        .populate('translatorInvite')
        .populate('translatorRequestInvite')
        .populate('doctor');

      if (cancelGuestInvite) {
        await PublicInvite.cancelGuestInvite(invite);
      } else {
        if (inviteData.guestPhoneNumber || inviteData.guestEmailAddress) {
          const guestInviteDate = {
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

          // if guest invite already exits update it
          if (invite.guestInvite) {
            await PublicInvite.update({ id: invite.guestInvite.id }).set(
              guestInviteDate
            );
          }
          // else create new
          else {
            guestInvite = await PublicInvite.create(guestInviteDate).fetch();
            await PublicInvite.updateOne({ id: invite.id }).set({
              guestInvite: guestInvite.id,
            });
          }
        }
      }

      if (cancelTranslationRequestInvite) {
        await PublicInvite.cancelTranslationRequestInvite(invite);
        invite.translatorRequestInvite = null;
        // continue to sending invite
      }
      // if translation requirements have changed cancel translation request invite and send new one
      else {
        if (!invite.translatorRequestInvite && translationOrganizationObj) {
          // create new
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
          createTranslationRequest(
            translatorRequestInvite,
            translationOrganizationObj
          );

          // that's it we don't send the invite until the translation request is accepted
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

        // if existing update it
        if (
          (translationOrganizationObj && isPatientLanguageDifferent) ||
          isDoctorLanguageDifferent ||
          isTranslationOrganizationDifferent
        ) {
          await PublicInvite.cancelTranslationRequestInvite(invite);

          // create and send translator invite
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
          createTranslationRequest(
            translatorRequestInvite,
            translationOrganizationObj
          );

          // that's it we don't send the invite until the translation request is accepted
          return res.status(200).json({
            success: true,
            invite,
          });
        }
      }
    } catch (e) {
      console.log('error', e);
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
      }
      if (guestInvite) {
        guestInvite.doctor = doctor;
        await PublicInvite.sendGuestInvite(guestInvite);
      }
    } catch (error) {
      console.log('ERROR sending Invite ', error);
      // await PublicInvite.destroyOne({ id: invite.id });
      return res.status(500).json({
        error: true,
        message: 'Error sending Invite',
      });
    }

    if (hasScheduledForChanged && scheduledFor) {
      if (shouldSend) {
        invite.doctor = doctor;
        await PublicInvite.setPatientOrGuestInviteReminders(invite);
      }
      if (guestInvite) {
        guestInvite.doctor = doctor;
        await PublicInvite.setPatientOrGuestInviteReminders(guestInvite);
      }
    }

    invite.patientURL = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    invite.doctorURL = process.env.DOCTOR_URL;
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
      const patientInvite = await PublicInvite.findOne({
        id: sanitize(req.params.invite),
      })
        .populate('guestInvite')
        .populate('translatorInvite')
        .populate('translatorRequestInvite')
        .populate('doctor');

      if (!patientInvite) {
        return res.notFound();
      }

      if (
        patientInvite.translatorRequestInvite &&
        patientInvite.translatorRequestInvite.status !== 'ACCEPTED'
      ) {
        return res.status(400).json({
          success: false,
          error: 'Translation invite have NOT been accepted',
        });
      }

      await PublicInvite.sendPatientInvite(patientInvite, true);
      await PublicInvite.updateOne({ id: req.params.invite }).set({
        status: 'SENT',
      });

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
      }

      if (patientInvite.guestInvite) {
        patientInvite.guestInvite.doctor = patientInvite.doctor;
        await PublicInvite.sendGuestInvite(patientInvite.guestInvite);
        await PublicInvite.updateOne({ id: patientInvite.guestInvite.id }).set({
          status: 'SENT',
        });
      }

      // if the invite is scheduled for later set the reminders
      if (
        patientInvite.scheduledFor &&
        patientInvite.scheduledFor > Date.now()
      ) {
        await PublicInvite.setPatientOrGuestInviteReminders(patientInvite);
        if (patientInvite.guestInvite) {
          await PublicInvite.setPatientOrGuestInviteReminders(guestInvite);
        }
      }

      patientInvite.patientURL = `${process.env.PUBLIC_URL}/inv/?invite=${patientInvite.inviteToken}`;


      return res.json({
        success: true,
        patientInvite,
      });
    } catch (error) {
      console.log('error ', error);
      res.json({
        success: false,
        error: error.message,
      });
    }
  },

  async revoke(req, res) {
    try {
      const invite = await PublicInvite.findOne({ id: req.params.invite });

      await PublicInvite.destroyPatientInvite(invite);

      return res.status(200).send();
    } catch (error) {
      sails.log('error deleting Invite ', error);

      return res.status(500).send();
    }
  },

  /**
   * Finds the public invite linked to a consultation
   */
  async findByConsultation(req, res) {

    const consultation = await Consultation.findOne({
      id: sanitize(req.params.consultation),
    });
    if (!consultation) {
      return res.notFound();
    }

    if (!consultation.invitationToken) {
      return res.notFound();
    }
    const publicinvite = await PublicInvite.findOne({
      inviteToken: consultation.invitationToken,
    });
    if (!publicinvite) {
      return res.notFound();
    }

    res.json(publicinvite);
  },

  /**
   * Finds the public invite By token
   */
  async findByToken(req, res) {
    const publicinvite = await PublicInvite.findOne({
      or: [
        { inviteToken: req.params.invitationToken },
        { expertToken: req.params.invitationToken },
      ],
    })
      .populate('translationOrganization')
      .populate('doctor');
    if (!publicinvite) {
      return res.notFound();
    }
    const isExpert = publicinvite.expertToken === req.params.invitationToken;
    publicinvite.doctor = _.pick(publicinvite.doctor, [
      'firstName',
      'lastName',
    ]);

    const expertBody = {};
    if (isExpert) {
      expertBody.status = null;
      expertBody.isExpert = true;
      expertBody.expertToken = publicinvite.expertToken;
    }
    res.json({ ...publicinvite, expertToken: '', ...expertBody });
  },

  async checkInviteStatus(req, res) {
    try {
      const publicInvite = await PublicInvite.findOne({
        or: [
          { inviteToken: req.params.invitationToken },
        ],
      });

      if (!publicInvite) {
        return res.json({
          success: false,
          message: 'Invite not found',
        });
      }

      const acknowledgmentStatuses = [
        'SENT',
        'QUEUED',
        'PENDING',
        'SENDING',
        'FAILED',
        'SCHEDULED',
        'DELIVERED',
        'UNDELIVERED',
        'SCHEDULED_FOR_INVITE',
      ];

      let requiresAcknowledgment = false;

      for (const status of acknowledgmentStatuses) {
        if (publicInvite.status === status) {
          requiresAcknowledgment = true;
          break;
        }
      }

      return res.json({
        success: true,
        requiresAcknowledgment,
      });

    } catch (error) {
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
        return res.status(400).json({
          success: false,
          message: 'Missing inviteToken',
        });
      }

      const invite = await PublicInvite.findOne({ inviteToken });

      if (!invite) {
        return res.status(404).json({
          success: false,
          message: 'Invite not found',
        });
      }

      await PublicInvite.updateOne({ inviteToken }).set({ status: 'ACKNOWLEDGED' });

      return res.json({
        success: true,
        message: 'Invite status updated to ACKNOWLEDGED',
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'An unexpected error occurred',
        error: error.message,
      });
    }
  },

  async getConsultation(req, res) {
    const inviteId = req.params.invite || req.params.id;
    if (!inviteId) return res.status(500).send();
    const [consultation] = await Consultation.find({ invite: inviteId });
    const [anonymousConsultation] = await AnonymousConsultation.find({
      invite: inviteId,
    });

    if (!consultation && !anonymousConsultation) {
      return res.notFound();
    }
    if (consultation && consultation.closedAt) {
      consultation.duration = consultation.createAt - consultation.closedAt;
    }

    if (consultation) {
      const anonymousConsultationDetails =
        await Consultation.getAnonymousDetails(consultation);
      consultation.doctorURL =
        process.env.DOCTOR_URL + '/app/consultation/' + consultation.id;
      return res.status(200).json(anonymousConsultationDetails);
    }
    if (anonymousConsultation) {
      anonymousConsultation.doctorURL =
        process.env.DOCTOR_URL +
        '/app/consultation/' +
        anonymousConsultation.id;
      return res.status(200).json(anonymousConsultation);
    }
  },
  async getInvite(req, res, next) {
    const inviteId = req.params.invite || req.params.id;
    if (!inviteId) return res.status(500).send();
    const invite = await PublicInvite.findOne({ id: inviteId });

    if (!invite) {
      return res.notFound();
    }
    const [consultation] = await Consultation.find({ invite: inviteId });

    if (consultation) {
      invite.doctorURL =
        process.env.DOCTOR_URL + '/app/consultation/' + consultation.id;
    }

    invite.patientURL = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;

    return res.json(invite);
  },

  async closeConsultation(req, res, next) {
    const [consultation] = await Consultation.find({
      invite: req.params.invite,
    });

    if (!consultation || consultation.status !== 'active') {
      const [anonymousConsultation] = await AnonymousConsultation.find({
        invite: req.params.invite,
      });
      if (anonymousConsultation) {
        anonymousConsultation.duration =
          anonymousConsultation.closedAt - anonymousConsultation.acceptedAt;
        return res.status(200).json(anonymousConsultation);
      } else {
        return res
          .status(404)
          .json({ success: false, error: 'Consultation not found' });
      }
    }

    consultation.duration = Date.now() - consultation.acceptedAt;

    await Consultation.closeConsultation(consultation);

    res.status(200);
    return res.json(consultation);
  },
};

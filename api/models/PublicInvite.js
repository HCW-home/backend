const ics = require('ics');
const moment = require('moment-timezone');
moment.locale('fr');
const crypto = require('crypto');
const { parseTime } = require('../utils/helpers');


function parseTimeOverride(envVar) {
  const match = envVar.match(/^(\d+)([smhd])$/);

  if (!match) {
    throw new Error(`Invalid format for time override: ${envVar}`);
  }

  const number = parseInt(match[1], 10);
  const unit = match[2];

  return { number, unit };
}

function generateTimePhrase(count, unit, locale) {
  const timeUnits = {
    m: {
      singular: sails._t(locale, 'minute'),
      plural: sails._t(locale, 'minutes'),
    },
    h: {
      singular: sails._t(locale, 'hour'),
      plural: sails._t(locale, 'hours'),
    },
    d: {
      singular: sails._t(locale, 'day'),
      plural: sails._t(locale, 'days'),
    },
  };

  const timeUnit = count === 1 ? timeUnits[unit].singular : timeUnits[unit].plural;

  return sails._t(locale, 'in %(count)s %(unit)s', {
    count,
    unit: timeUnit,
  });
}

const OVERRIDE_FIRST_INVITE_REMINDER = process.env.OVERRIDE_FIRST_INVITE_REMINDER;
const OVERRIDE_SECOND_INVITE_REMINDER = process.env.OVERRIDE_SECOND_INVITE_REMINDER;
const OVERRIDE_TIME_UNTIL_SCHEDULE = process.env.OVERRIDE_TIME_UNTIL_SCHEDULE;

const DEFAULT_FIRST_INVITE_REMINDER = 24 * 60 * 60 * 1000; // 1 day
const DEFAULT_SECOND_INVITE_REMINDER = 60 * 1000; // 1 minute
const DEFAULT_TIME_UNTIL_SCHEDULE = 24 * 60 * 60 * 1000; // 1 day

const FIRST_INVITE_REMINDER = parseTime(OVERRIDE_FIRST_INVITE_REMINDER, DEFAULT_FIRST_INVITE_REMINDER);
const SECOND_INVITE_REMINDER = parseTime(OVERRIDE_SECOND_INVITE_REMINDER, DEFAULT_SECOND_INVITE_REMINDER);
const TIME_UNTIL_SCHEDULE = parseTime(OVERRIDE_TIME_UNTIL_SCHEDULE, DEFAULT_TIME_UNTIL_SCHEDULE);

const TRANSLATOR_REQUEST_TIMEOUT = 24 * 60 * 60 * 1000;
const testingUrl = `${process.env.PUBLIC_URL}/acknowledge-invite`;

async function generateToken() {
  const buffer = await new Promise((resolve, reject) => {
    crypto.randomBytes(256, (ex, buffer) => {
      if (ex) {
        reject('error generating token');
      }
      resolve(buffer);
    });
  });
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

module.exports = {
  attributes: {
    firstName: {
      type: 'string',
    },
    lastName: {
      type: 'string',
    },
    gender: {
      type: 'string',
      isIn: ['male', 'female', 'other', 'unknown'],
    },
    phoneNumber: {
      type: 'string',
    },
    messageService: {
      type: 'string',
      required: false,
    },
    whatsappMessageSid: {
      type: 'string',
      required: false,
    },
    emailAddress: {
      type: 'string',
      isEmail: true,
    },
    inviteToken: {
      type: 'string',
    },
    expertToken: {
      type: 'string',
    },
    status: {
      type: 'string',
      isIn: [
        'PENDING', 'SENT', 'ACCEPTED', 'COMPLETE', 'REFUSED', 'CANCELED',
        'ACKNOWLEDGED', 'SCHEDULED_FOR_INVITE',
        //   whatsapp statuses
        'QUEUED', 'SENDING', 'FAILED', 'DELIVERED',
        'UNDELIVERED', 'RECEIVING', 'RECEIVED', 'SCHEDULED', 'READ', 'PARTIALLY_DELIVERED'
      ],
      defaultsTo: 'SENT',
    },
    queue: {
      model: 'queue',
    },
    scheduledFor: {
      type: 'number',
    },
    // the doctor who sent the invite
    doctor: {
      model: 'user',
      required: false,
    },
    type: {
      type: 'string',
      isIn: ['GUEST', 'PATIENT', 'TRANSLATOR_REQUEST', 'TRANSLATOR'],
    },
    patientInvite: {
      model: 'publicInvite',
    },
    patientLanguage: {
      type: 'string',
    },
    doctorLanguage: {
      type: 'string',
    },
    translationOrganization: {
      model: 'translationOrganization',
    },
    guestEmailAddress: {
      type: 'string',
      isEmail: true,
    },
    guestPhoneNumber: {
      type: 'string',
    },
    guestMessageService: {
      type: 'string',
      required: false,
    },
    translator: {
      model: 'user',
      required: false,
    },
    translatorRequestInvite: {
      model: 'publicInvite',
      required: false,
    },
    translatorInvite: {
      model: 'publicInvite',
      required: false,
    },
    guestInvite: {
      model: 'publicInvite',
      required: false,
    },
    birthDate: {
      type: 'string',
    },
    IMADTeam: {
      type: 'string',
    },
    patientTZ: {
      type: 'string',
    },
    metadata: {
      type: 'json',
      required: false,
    },
    experts: {
      type: 'json',
      required: false,
    },
  },

  async beforeCreate(obj, proceed) {
    sails.config.customLogger.log('verbose', 'beforeCreate: Generating tokens', null, 'message');
    obj.inviteToken = await generateToken();
    obj.expertToken = await generateToken();
    sails.config.customLogger.log('verbose', 'beforeCreate: Tokens generated',null, 'message');
    return proceed();
  },

  async beforeUpdate(valuesToSet, proceed) {
    sails.config.customLogger.log('verbose', 'beforeUpdate: Validating scheduledFor date', null, 'message');

    if (valuesToSet.scheduledFor && !moment(valuesToSet.scheduledFor).isValid()) {
      const err = new Error('ScheduledFor is not a valid date ');
      err.name = 'INVALID_SCHEDULED_FOR';
      err.code = 400;
      sails.config.customLogger.log('error', 'beforeUpdate: Invalid scheduledFor date', null, 'message');
      return proceed(err);
    }

    if (valuesToSet.scheduledFor && valuesToSet.patientTZ) {
      const scheduledTimeUTC = moment.tz(valuesToSet.scheduledFor, 'UTC').valueOf();
      const currentTimeUTC = moment().utc().valueOf();
      if (scheduledTimeUTC < currentTimeUTC) {
        const err = new Error('Consultation Time cannot be in the past ');
        err.name = 'INVALID_SCHEDULED_FOR';
        err.code = 400;
        sails.config.customLogger.log('error', 'beforeUpdate: Consultation Time is in the past', null, 'message');
        return proceed(err);
      }
    } else if (valuesToSet.scheduledFor && new Date(valuesToSet.scheduledFor) < new Date()) {
      const err = new Error('Consultation Time cannot be in the past ');
      err.name = 'INVALID_SCHEDULED_FOR';
      err.code = 400;
      sails.config.customLogger.log('error', 'beforeUpdate: Consultation Time is in the past', null, 'message');
      return proceed(err);
    }

    sails.config.customLogger.log('info', 'beforeUpdate: Date validation passed', null, 'message');
    return proceed();
  },

  async findBy(args) {
    return PublicInvite.find(args);
  },

  sendTranslationRequestInvite(invite, email) {
    sails.config.customLogger.log('info', 'Sending translation request invite email', null, 'server-action');
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const doctorLangCode = invite.doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE;
    const inviteTime = invite.scheduledFor
      ? moment(invite.scheduledFor)
        .tz(invite.patientTZ)
        .local(doctorLangCode)
        .format('D MMMM YYYY HH:mm zz')
      : '';
    const nowDate = moment().local(doctorLangCode).format('D MMMM YYYY');
    const doctorLanguage = sails._t(doctorLangCode, doctorLangCode);
    const patientLanguage = sails._t(doctorLangCode, invite.patientLanguage);
    const doctorName = (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '');
    sails.config.customLogger.log('info', 'Translation invite email prepared', null, 'message');
    return sails.helpers.email.with({
      to: email,
      subject: sails._t(doctorLangCode, 'translation request email subject', {
        doctorLanguage,
        patientLanguage,
        branding: process.env.BRANDING,
      }),
      text: invite.scheduledFor
        ? sails._t(doctorLangCode, 'scheduled translation request email', {
          doctorLanguage,
          patientLanguage,
          inviteTime,
          url,
          branding: process.env.BRANDIN,
          doctorName,
        })
        : sails._t(doctorLangCode, 'translation request email', {
          doctorLanguage,
          patientLanguage,
          inviteTime: nowDate,
          url,
          branding: process.env.BRANDING,
          doctorName,
        }),
    });
  },

  sendTranslatorInvite(invite, email) {
    sails.config.customLogger.log('info', 'sendTranslatorInvite: Preparing translator invite email', null, 'message');
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const doctorLang = invite.doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE;
    const doctorName = (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '');
    sails.config.customLogger.log('info', 'sendTranslatorInvite: Translator invite email content prepared', null, 'message');

    return sails.helpers.email.with({
      to: email,
      subject: sails._t(doctorLang, 'translator login link email subject', {
        url,
        branding: process.env.BRANDING,
        doctorName,
      }),
      text: sails._t(doctorLang, 'translator login link email', {
        url,
        doctorName,
      }),
    });
  },

  async expireTranslatorRequest(job) {
    const { invite } = job.attrs.data;
    sails.config.customLogger.log('info', `expireTranslatorRequest: Started processing translator request expiration inviteId ${invite.id}`,null, 'message');

    const translatorRequestInvite = await PublicInvite.findOne({
      type: 'TRANSLATOR_REQUEST',
      id: invite.id,
    })
      .populate('doctor')
      .populate('patientInvite')
      .populate('translationOrganization');

    if (translatorRequestInvite.status === 'SENT') {
      sails.config.customLogger.log('info', `expireTranslatorRequest: Translator request invite ${translatorRequestInvite?.id} status is SENT`, null, 'message');

      await PublicInvite.updateOne({
        type: 'TRANSLATOR_REQUEST',
        id: invite.id,
      }).set({ status: 'REFUSED' });
      sails.config.customLogger.log('info', `expireTranslatorRequest: Updated translator request invite ${translatorRequestInvite?.id} status to REFUSED`, null, 'server-action');

      await PublicInvite.updateOne({
        id: translatorRequestInvite.patientInvite.id,
      }).set({ status: 'CANCELED' });
      sails.config.customLogger.log('info', `expireTranslatorRequest: Updated patient invite ${translatorRequestInvite?.patientInvite?.id} status to CANCELED`, null, 'server-action');

      if (translatorRequestInvite.patientInvite.guestInvite) {
        await PublicInvite.updateOne({
          id: translatorRequestInvite.patientInvite.guestInvite,
        }).set({ status: 'CANCELED' });
        sails.config.customLogger.log('info', `expireTranslatorRequest: Updated guest invite ${translatorRequestInvite?.patientInvite?.guestInvite} status to CANCELED`, null, 'server-action');
      }

      if (translatorRequestInvite.doctor.email) {
        const docLocale =
          translatorRequestInvite.doctor.preferredLanguage ||
          process.env.DEFAULT_DOCTOR_LOCALE;
        sails.config.customLogger.log('info', `expireTranslatorRequest: Sending email notification to doctor ${translatorRequestInvite.doctor.id}`, null, 'message');

        await sails.helpers.email.with({
          to: translatorRequestInvite.doctor.email,
          subject: sails._t(docLocale, 'translation request refused subject'),
          text: sails._t(docLocale, 'translation request refused body', {
            branding: process.env.BRANDING,
          }),
        });
        sails.config.customLogger.log('info', `expireTranslatorRequest: Email notification sent to doctor ${translatorRequestInvite.doctor.id}`, null, 'server-action');
      }
    }
  },

  async setTranslatorRequestTimer(invite) {
    sails.config.customLogger.log('info', `Setting translator request timer for invite ${invite.id}`, null, 'message');
    await sails.helpers.schedule.with({
      name: 'TRANSLATOR_REQUEST_EXPIRE',
      data: { invite },
      time: new Date(Date.now() + TRANSLATOR_REQUEST_TIMEOUT),
    });
    sails.config.customLogger.log('info', `Translator request timer set for invite ${invite.id}`, null, 'server-action');
  },

  async sendPatientInvite(invite, resend = false) {
    sails.config.customLogger.log('info', `sendPatientInvite: Starting patient invite ${invite.id}} process`, null, 'message');

    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const locale = invite.patientLanguage || sails.config.globals.DEFAULT_PATIENT_LOCALE;
    const timezone = invite.patientTZ || 'UTC';
    const inviteTime = invite.scheduledFor
      ? moment(invite.scheduledFor)
      .tz(timezone)
      .locale(locale)
      .format('D MMMM HH:mm') + ' ' + timezone
      : '';
    const doctorName = invite.doctor
      ? (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '')
      : '';
    const currentTime = Date.now();
    let scheduledTime = invite.scheduledFor;
    if (invite.patientTZ) {
      scheduledTime = moment.tz(invite.scheduledFor, 'UTC').valueOf();
    }
    const timeUntilScheduled = scheduledTime - currentTime;

    let testUrl = testingUrl + `/${invite.inviteToken}`;
    const message =
      invite.scheduledFor && timeUntilScheduled > SECOND_INVITE_REMINDER
        ? sails._t(locale, 'scheduled patient invite', {
          inviteTime,
          testingUrl: testUrl,
          branding: process.env.BRANDING,
          doctorName,
        })
        : sails._t(locale, 'patient invite', {
          url,
          branding: process.env.BRANDING,
          doctorName,
        });
    sails.config.customLogger.log('verbose', `sendPatientInvite: Invite with id ${invite.id} message prepared`, null, 'message');

    if (invite.emailAddress && (!invite.scheduledFor || resend)) {
      try {
        sails.config.customLogger.log('verbose', `sendPatientInvite: Sending email invite to ${invite.emailAddress}`, null, 'server-action');
        await sails.helpers.email.with({
          to: invite.emailAddress,
          subject: sails._t(locale, 'your consultation link', {
            url,
            branding: process.env.BRANDING,
            doctorName,
          }),
          text: message,
        });
        sails.config.customLogger.log('info', `sendPatientInvite: Email invite sent to ${invite.emailAddress}`, null, 'server-action');
      } catch (error) {
        sails.config.customLogger.log('error', 'sendPatientInvite: Error sending email invite', { error: error?.message || error }, 'server-action');
        if (!invite.phoneNumber) {
          return Promise.reject(error);
        }
      }
    }

    if (invite.phoneNumber) {
      if (invite.messageService === '2') {
        try {
          sails.config.customLogger.log('verbose', `sendPatientInvite: Sending SMS invite to ${invite.phoneNumber}`, null, 'message');
          await sails.helpers.sms.with({
            phoneNumber: invite.phoneNumber,
            message,
            senderEmail: invite?.doctor?.email,
            whatsApp: false,
          });
          sails.config.customLogger.log('info', `sendPatientInvite: SMS invite sent to ${invite.phoneNumber}`, null, 'server-action');
        } catch (error) {
          sails.config.customLogger.log('error', 'sendPatientInvite: Error sending SMS invite', { error: error?.message || error }, 'server-action');
          return Promise.reject(error);
        }
      } else {
        if (invite.messageService === '1') {
          try {
            sails.config.customLogger.log('verbose', `sendPatientInvite: Preparing WhatsApp SMS invite to ${invite.phoneNumber}`, null, 'message');
            const type = invite.scheduledFor && invite.scheduledFor > Date.now() ? 'scheduled patient invite' : 'patient invite';
            if (invite.patientLanguage) {
              const template = await WhatsappTemplate.findOne({
                language: invite.patientLanguage,
                key: type,
                approvalStatus: 'approved'
              });
              sails.config.customLogger.log('verbose', `sendPatientInvite: Retrieved WhatsApp template ${template ? template.id : null}`, null, 'server-action');
              if (template && template.sid) {
                const twilioTemplatedId = template.sid;
                let params = {};
                if (type === 'patient invite') {
                  params = {
                    1: process.env.BRANDING,
                    2: invite.inviteToken
                  };
                } else if (type === 'scheduled patient invite') {
                  params = {
                    1: process.env.BRANDING,
                    2: inviteTime,
                    3: invite.inviteToken
                  };
                }

                if (twilioTemplatedId) {
                  try {
                    const whatsappMessageSid = await sails.helpers.sms.with({
                      phoneNumber: invite.phoneNumber,
                      message,
                      senderEmail: invite?.doctor?.email,
                      whatsApp: true,
                      params,
                      twilioTemplatedId,
                      statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL,
                    });
                    sails.config.customLogger.log('info', `sendPatientInvite: WhatsApp SMS invite sent whatsappMessageSid ${whatsappMessageSid}`, null, 'server-action');
                    if (whatsappMessageSid) {
                      await PublicInvite.updateOne({ id: invite.id }).set({ whatsappMessageSid });
                      sails.config.customLogger.log('info', `sendPatientInvite: Updated PublicInvite with WhatsApp SMS SID inviteId ${invite.id}`, null, 'server-action');
                    }
                  } catch (error) {
                    sails.config.customLogger.log('error', 'sendPatientInvite: Error sending WhatsApp SMS invite', { error: error?.message || error }, 'server-action');
                    return Promise.reject(error);
                  }
                } else {
                  sails.config.customLogger.log('error', 'sendPatientInvite: WhatsApp Template id is missing', null, 'message');
                }
              } else {
                sails.config.customLogger.log('error', 'sendPatientInvite: WhatsApp Template is not approved or missing', null, 'message');
              }
            }
          } catch (error) {
            sails.config.customLogger.log('error', 'sendPatientInvite: Error in WhatsApp SMS invite process', { error: error?.message || error }, 'server-action');
          }
        }
      }
    }
  },

  async sendGuestInvite(invite) {
    sails.config.customLogger.log('verbose', `sendGuestInvite: Starting guest invite process ${invite.id}`, null, 'message');

    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const locale = invite.patientLanguage || sails.config.globals.DEFAULT_PATIENT_LOCALE;
    const testCallUrl = `${process.env.PUBLIC_URL}/test-call`;
    const timezone = invite.patientTZ || 'UTC';
    const inviteTime = invite.scheduledFor
      ? moment(invite.scheduledFor)
      .tz(timezone)
      .locale(locale)
      .format('D MMMM HH:mm') + ' ' + timezone
      : '';
    const currentTime = Date.now();
    let scheduledTime = invite.scheduledFor;
    if (invite.patientTZ) {
      scheduledTime = moment.tz(invite.scheduledFor, 'UTC').valueOf();
    }
    const timeUntilScheduled = scheduledTime - currentTime;
    const doctorName = (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '');

    const message =
      invite.scheduledFor && timeUntilScheduled > SECOND_INVITE_REMINDER
        ? sails._t(locale, 'scheduled guest invite', {
          inviteTime,
          testingUrl: testCallUrl,
          branding: process.env.BRANDING,
          doctorName,
        })
        : sails._t(locale, 'guest invite', {
          url,
          branding: process.env.BRANDING,
          doctorName,
        });
    sails.config.customLogger.log('info', `sendGuestInvite: Invite message prepared for ${invite.id}`,null, 'message');

    if (invite.emailAddress) {
      try {
        sails.config.customLogger.log('verbose', `sendGuestInvite: Sending email invite to ${invite.emailAddress}`, null, 'message');
        await sails.helpers.email.with({
          to: invite.emailAddress,
          subject: sails._t(locale, 'your consultation link', {
            url,
            branding: process.env.BRANDING,
            doctorName,
          }),
          text: message,
        });
        sails.config.customLogger.log('info', `sendGuestInvite: Email invite sent to ${invite.emailAddress}`, null, 'server-action');
      } catch (error) {
        sails.config.customLogger.log('error', 'sendGuestInvite: Error sending guest invite email', { error: error?.message || error }, 'server-action');
        if (!invite.phoneNumber) {
          return Promise.reject(error);
        }
      }
    }

    if (invite.phoneNumber) {
      if (invite.guestMessageService === '1') {
        const type = invite.scheduledFor && invite.scheduledFor > Date.now() ? 'scheduled guest invite' : 'guest invite';
        if (invite.patientLanguage) {
          const template = await WhatsappTemplate.findOne({
            language: invite.patientLanguage,
            key: type,
            approvalStatus: 'approved'
          });
          if (template && template.sid) {
            const twilioTemplatedId = template.sid;
            let params = {};
            if (type === 'guest invite') {
              params = {
                1: process.env.BRANDING,
                2: invite.inviteToken
              };
            } else if (type === 'scheduled guest invite') {
              params = {
                1: process.env.BRANDING,
                2: inviteTime,
                3: invite.inviteToken
              };
            }
            try {
              sails.config.customLogger.log('verbose', `sendGuestInvite: Sending WhatsApp SMS invite to ${invite.phoneNumber}`, null, 'message');
              await sails.helpers.sms.with({
                phoneNumber: invite.phoneNumber,
                message,
                senderEmail: invite.doctor?.email,
                whatsApp: true,
                params,
                twilioTemplatedId,
              });
              sails.config.customLogger.log('info', `sendGuestInvite: WhatsApp SMS invite sent to ${invite.phoneNumber}`, null, 'server-action');
            } catch (error) {
              sails.config.customLogger.log('error', 'sendGuestInvite: Error sending WhatsApp SMS invite', { error: error?.message || error }, 'server-action');
              return Promise.reject(error);
            }
          } else {
            sails.config.customLogger.log('error', 'sendGuestInvite: WhatsApp SMS template is missing or not approved', null, 'message');
          }
        }
      } else {
        try {
          sails.config.customLogger.log('info', `sendGuestInvite: Sending standard SMS invite to ${invite.phoneNumber}`, null, 'message');
          await sails.helpers.sms.with({
            phoneNumber: invite.phoneNumber,
            message,
            senderEmail: invite.doctor?.email,
            whatsApp: false,
          });
          sails.config.customLogger.log('info', `sendGuestInvite: Standard SMS invite sent to ${invite.phoneNumber}`, null, 'server-action');
        } catch (error) {
          sails.config.customLogger.log('error', 'sendGuestInvite: Error sending standard SMS invite', { error: error?.message || error }, 'server-action');
          return Promise.reject(error);
        }
      }
    }
  },

  getReminderMessage(invite) {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const locale = invite.patientLanguage || sails.config.globals.DEFAULT_PATIENT_LOCALE;
    const timezone = invite.patientTZ || 'UTC';
    const inviteTime = invite.scheduledFor
      ? moment(invite.scheduledFor)
      .tz(timezone)
      .locale(locale)
      .format('D MMMM HH:mm') + ' ' + timezone
      : '';

    const doctorName =
      (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '');

    const firstInviteReminder = process.env.OVERRIDE_FIRST_INVITE_REMINDER;
    const defaultFirstReminderTime = { number: 1, unit: 'd' };

    let parsedFirstInviteReminderTime;
    try {
      parsedFirstInviteReminderTime = firstInviteReminder
        ? parseTimeOverride(firstInviteReminder)
        : defaultFirstReminderTime;
    } catch (error) {
      parsedFirstInviteReminderTime = defaultFirstReminderTime;
    }

    const firstReminderTranslationHelper = {
      count: parsedFirstInviteReminderTime.number,
      unitOfMeasurement: parsedFirstInviteReminderTime.unit,
    };

    const firstTimePhrase = generateTimePhrase(
      firstReminderTranslationHelper.count,
      firstReminderTranslationHelper.unitOfMeasurement,
      locale
    );

    const firstReminderType =
      invite.type === 'PATIENT' ? 'first invite reminder' : 'first guest invite reminder';
    const firstReminderMessage = sails._t(locale, firstReminderType, {
      inviteTime,
      branding: process.env.BRANDING,
      doctorName,
      timePhrase: firstTimePhrase,
    });

    const secondInviteReminder = process.env.OVERRIDE_SECOND_INVITE_REMINDER;
    const defaultSecondReminderTime = { number: 1, unit: 'm' };
    let parsedSecondInviteReminderTime;
    try {
      parsedSecondInviteReminderTime = secondInviteReminder
        ? parseTimeOverride(secondInviteReminder)
        : defaultSecondReminderTime;
    } catch (error) {
      parsedSecondInviteReminderTime = defaultSecondReminderTime;
    }

    const secondReminderTranslationHelper = {
      count: parsedSecondInviteReminderTime.number,
      unitOfMeasurement: parsedSecondInviteReminderTime.unit,
    };

    const secondTimePhrase = generateTimePhrase(
      secondReminderTranslationHelper.count,
      secondReminderTranslationHelper.unitOfMeasurement,
      locale
    );

    const secondReminderType =
      invite.type === 'PATIENT' ? 'second invite reminder' : 'second guest invite reminder';
    const secondReminderMessage = sails._t(locale, secondReminderType, {
      url,
      doctorName,
      timePhrase: secondTimePhrase,
    });

    const firstReminderParams = {
      1: process.env.BRANDING,
      2: firstTimePhrase,
      3: inviteTime
    };

    const secondReminderParams = {
      1: secondTimePhrase,
      2: invite.inviteToken
    };

    return {
      firstReminderMessage,
      secondReminderMessage,
      firstReminderType,
      secondReminderType,
      firstReminderParams,
      secondReminderParams
    };
  },

  async createAndSendICS(invite) {
    const locale = invite.patientLanguage || sails.config.globals.DEFAULT_PATIENT_LOCALE;
    const currentTime = Date.now();
    let scheduledTime = invite.scheduledFor;
    if (invite.patientTZ) {
      scheduledTime = moment.tz(invite.scheduledFor, 'UTC').valueOf();
    }
    const timeUntilScheduled = scheduledTime - currentTime;
    const timezone = invite.patientTZ || 'UTC';
    const inviteTime = invite.scheduledFor
      ? moment(invite.scheduledFor)
      .tz(timezone)
      .locale(locale)
      .format('D MMMM HH:mm') + ' ' + timezone
      : '';
    const doctorName = (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '');
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;

    sails.config.customLogger.log('info', `createAndSendICS: Started processing invite ${invite.id}`, null, 'message');

    if (timeUntilScheduled < SECOND_INVITE_REMINDER) {
      const message = sails._t(locale, 'patient invite', {
        url,
        branding: process.env.BRANDING,
        doctorName,
      });
      try {
        sails.config.customLogger.log('info', `createAndSendICS: Sending immediate email invite ${invite.id}`, null, 'message');
        await sails.helpers.email.with({
          to: invite.emailAddress,
          subject: sails._t(locale, 'your consultation link', {
            url,
            branding: process.env.BRANDING,
            doctorName,
          }),
          text: message,
        });
        await PublicInvite.updateOne({ id: invite.id }).set({ status: 'SENT' });
        sails.config.customLogger.log('info', `createAndSendICS: Email invite sent and status updated ${invite.id}`, null, 'server-action');
      } catch (error) {
        sails.config.customLogger.log('error', 'createAndSendICS: Error sending immediate email invite', { error: error?.message || error }, 'server-action');
        if (!invite.phoneNumber) {
          return Promise.reject(error);
        }
      }
    } else {
      try {
        const timestamp = invite.scheduledFor;
        const date = new Date(timestamp);
        const start = [
          date.getFullYear(),
          date.getMonth() + 1,
          date.getDate(),
          date.getHours(),
          date.getMinutes(),
        ];
        const event = {
          start: start,
          duration: { hours: 1 },
          title: sails._t(locale, 'consultation branding', {
            branding: process.env.BRANDING,
          }),
          description: '',
          location: '',
          organizer: {
            name: invite.doctor?.firstName + ' ' + invite.doctor?.lastName,
            email: invite.doctor?.email,
          },
        };
        sails.config.customLogger.log('verbose', `createAndSendICS: Creating ICS event for invite ${invite.id}`, null, 'message');

        ics.createEvent(event, async (error, value) => {
          if (error) {
            sails.config.customLogger.log('error', 'createAndSendICS: Error creating ICS event', { error: error?.message || error }, 'server-action');
            return;
          }
          let testUrl = testingUrl + `/${invite.inviteToken}`;
          sails.config.customLogger.log('verbose', `createAndSendICS: ICS event created successfully for invite ${invite.id}`, null, 'server-action');
          try {
            await sails.helpers.email.with({
              to: invite.emailAddress,
              subject: sails._t(locale, 'consultation branding', {
                branding: process.env.BRANDING,
              }),
              text: sails._t(locale, 'scheduled patient invite', {
                inviteTime,
                testingUrl: testUrl,
                branding: process.env.BRANDING,
                doctorName,
              }),
              attachments: [
                {
                  filename: 'consultation.ics',
                  content: Buffer.from(value),
                },
              ],
            });
            sails.config.customLogger.log('info', `createAndSendICS: Email with ICS attachment sent for invite ${invite.id}`, null, 'message');
          } catch (err) {
            sails.config.customLogger.log('error', 'createAndSendICS: Error sending email with ICS attachment', { error: err?.message || err }, 'server-action');
          }
        });
      } catch (err) {
        sails.config.customLogger.log('error', 'createAndSendICS: An error occurred during ICS creation process', { error: err?.message || err }, 'server-action');
      }
    }
  },

  async setPatientOrGuestInviteReminders(invite) {
    sails.config.customLogger.log('info', `setPatientOrGuestInviteReminders: Starting invite reminder scheduling for ${invite.id}`, null, 'message');

    const currentTime = Date.now();
    let scheduledTime = invite.scheduledFor;
    if (invite.patientTZ) {
      scheduledTime = moment.tz(invite.scheduledFor, 'UTC').valueOf();
    }
    const timeUntilScheduled = scheduledTime - currentTime;

    sails.config.customLogger.log('verbose', `setPatientOrGuestInviteReminders: Calculated time until scheduled ${timeUntilScheduled}`, null , 'message');

    if (timeUntilScheduled > TIME_UNTIL_SCHEDULE) {
      if (invite.phoneNumber) {
        if (timeUntilScheduled > FIRST_INVITE_REMINDER) {
          sails.config.customLogger.log('info', 'setPatientOrGuestInviteReminders: Scheduling FIRST_INVITE_REMINDER_SMS', null, 'message');
          await sails.helpers.schedule.with({
            name: 'FIRST_INVITE_REMINDER_SMS',
            data: { invite },
            time: new Date(scheduledTime - FIRST_INVITE_REMINDER),
          });
        }
      }

      if (invite.emailAddress) {
        if (timeUntilScheduled > FIRST_INVITE_REMINDER) {
          sails.config.customLogger.log('info', 'setPatientOrGuestInviteReminders: Scheduling FIRST_INVITE_REMINDER_EMAIL', null, 'message');
          await sails.helpers.schedule.with({
            name: 'FIRST_INVITE_REMINDER_EMAIL',
            data: { invite },
            time: new Date(scheduledTime - FIRST_INVITE_REMINDER),
          });
        }
      }
    }

    if (invite.phoneNumber) {
      if (timeUntilScheduled > SECOND_INVITE_REMINDER) {
        sails.config.customLogger.log('info', 'setPatientOrGuestInviteReminders: Scheduling SECOND_INVITE_REMINDER_SMS', null, 'message');
        await sails.helpers.schedule.with({
          name: 'SECOND_INVITE_REMINDER_SMS',
          data: { invite },
          time: new Date(scheduledTime - SECOND_INVITE_REMINDER),
        });
      }
    }

    if (invite.emailAddress) {
      if (timeUntilScheduled > SECOND_INVITE_REMINDER) {
        sails.config.customLogger.log('info', 'setPatientOrGuestInviteReminders: Scheduling SECOND_INVITE_REMINDER_EMAIL', null, 'message');
        await sails.helpers.schedule.with({
          name: 'SECOND_INVITE_REMINDER_EMAIL',
          data: { invite },
          time: new Date(scheduledTime - SECOND_INVITE_REMINDER),
        });
      }
    }

    sails.config.customLogger.log('info', `setPatientOrGuestInviteReminders: Completed scheduling invite reminders ${invite.id}`, null, 'message');
  },

  async destroyPatientInvite(invite) {
    const db = Consultation.getDatastore().manager;
    const userCollection = db.collection('user');

    if (invite.guestInvite) {
      sails.config.customLogger.log('verbose', `destroyPatientInvite: Destroying guest invite ${invite.guestInvite}`, null, 'message');
      await PublicInvite.destroyOne({ id: invite.guestInvite });
      sails.config.customLogger.log('info', 'destroyPatientInvite: Updating guest user with consultation closed time', { userId: invite.guestInvite }, 'server-action');
      await userCollection.updateOne(
        { username: invite.guestInvite },
        {
          $set: {
            consultationClosedAtISO: new Date(),
          },
        }
      );
    }
    if (invite.translatorRequestInvite) {
      sails.config.customLogger.log('verbose', `destroyPatientInvite: Destroying translator request invite ${invite.translatorRequestInvite}`, null, 'server-action');
      await PublicInvite.destroyOne({ id: invite.translatorRequestInvite });
    }
    if (invite.translatorInvite) {
      sails.config.customLogger.log('info', `destroyPatientInvite: Destroying translator invite ${invite.translatorInvite}`, null, 'server-action');
      await PublicInvite.destroyOne({ id: invite.translatorInvite });
      sails.config.customLogger.log('info', 'destroyPatientInvite: Updating translator user with consultation closed time', { userId: invite.translatorInvite }, 'server-action');
      await userCollection.updateOne(
        { username: invite.translatorInvite },
        {
          $set: {
            consultationClosedAtISO: new Date(),
          },
        }
      );
    }

    sails.config.customLogger.log('info', `destroyPatientInvite: Destroying main invite ${invite.id}`, null, 'server-action');
    await PublicInvite.destroyOne({ id: invite.id });
    sails.config.customLogger.log('info', 'destroyPatientInvite: Updating main user with consultation closed time', { userId: invite.id }, 'server-action');
    await userCollection.updateOne(
      { username: invite.id },
      {
        $set: {
          consultationClosedAtISO: new Date(),
        },
      }
    );
  },

  async refuseTranslatorRequest(translatorRequestInvite) {
    sails.config.customLogger.log('verbose', `refuseTranslatorRequest: Starting translator request refusal ${translatorRequestInvite.id}`, null, 'message');

    translatorRequestInvite = await PublicInvite.findOne({
      id: translatorRequestInvite.id,
    })
      .populate('doctor')
      .populate('patientInvite')
      .populate('translationOrganization');

    sails.config.customLogger.log('info', `refuseTranslatorRequest: Translator request invite loaded ${translatorRequestInvite.id}`, null, 'message');

    await PublicInvite.updateOne({
      type: 'TRANSLATOR_REQUEST',
      id: translatorRequestInvite.id,
    }).set({ status: 'REFUSED' });
    sails.config.customLogger.log('info', `refuseTranslatorRequest: Updated translator request invite status to REFUSED ${translatorRequestInvite.id}`, null, 'message');

    await PublicInvite.updateOne({
      id: translatorRequestInvite.patientInvite.id,
    }).set({ status: 'CANCELED' });
    sails.config.customLogger.log('info', `refuseTranslatorRequest: Updated patient invite status to CANCELED ${translatorRequestInvite?.patientInvite?.id}`, null, 'server-action');

    if (translatorRequestInvite.patientInvite.guestInvite) {
      await PublicInvite.updateOne({
        id: translatorRequestInvite.patientInvite.guestInvite,
      }).set({ status: 'CANCELED' });
      sails.config.customLogger.log('info', `refuseTranslatorRequest: Updated guest invite status to CANCELED ${translatorRequestInvite.patientInvite.guestInvite}`, null, 'server-action');
    }

    if (translatorRequestInvite.doctor.email) {
      const docLocale =
        translatorRequestInvite.doctor.preferredLanguage ||
        process.env.DEFAULT_DOCTOR_LOCALE;
      sails.config.customLogger.log('info', `refuseTranslatorRequest: Sending refusal email to doctor ${translatorRequestInvite.doctor?.id}`, null, 'message');
      await sails.helpers.email.with({
        to: translatorRequestInvite.doctor.email,
        subject: sails._t(docLocale, 'translation request refused subject'),
        text: sails._t(docLocale, 'translation request refused body', {
          branding: process.env.BRANDING,
        }),
      });
      sails.config.customLogger.log('info', `refuseTranslatorRequest: Refusal email sent to doctor ${translatorRequestInvite.doctor?.id}`, null, 'server-action');
    }

    sails.config.customLogger.log('info', `refuseTranslatorRequest: Completed translator request refusal ${translatorRequestInvite.id}`, null, 'server-action');
  },

  async cancelTranslationRequestInvite(patientInvite) {
    sails.config.customLogger.log('verbose', `cancelTranslationRequestInvite: Starting cancellation of translator request invite ${patientInvite.id}`, null, 'message');

    if (!patientInvite.translatorRequestInvite) return;

    const translatorRequestInviteId = patientInvite.translatorRequestInvite.id || patientInvite.translatorRequestInvite;
    sails.config.customLogger.log('info', `cancelTranslationRequestInvite: Destroying translator request invite ${translatorRequestInviteId}`, null, 'server-action');
    await PublicInvite.destroyOne({ id: translatorRequestInviteId });

    if (patientInvite.translatorInvite) {
      const translatorInviteId = patientInvite.translatorInvite.id || patientInvite.translatorInvite;
      sails.config.customLogger.log('info', `cancelTranslationRequestInvite: Destroying translator invite ${translatorInviteId}`, null, 'server-action');
      await PublicInvite.destroyOne({ id: translatorInviteId });
      sails.config.customLogger.log('info', `cancelTranslationRequestInvite: Destroying user associated with translator invite ${translatorInviteId}`, null, 'server-action');
      await User.destroyOne({ username: translatorInviteId });
    }

    sails.config.customLogger.log('info', `cancelTranslationRequestInvite: Clearing translator invite references from patient invite ${patientInvite.id}`, null, 'server-action');
    await PublicInvite.updateOne({ id: patientInvite.id }).set({
      translatorRequestInvite: null,
      translatorInvite: null,
    });

    sails.config.customLogger.log('info', `cancelTranslationRequestInvite: Clearing translation organization from patient invite ${patientInvite.id}`, null, 'server-action');
    await PublicInvite.updateOne({ id: patientInvite.id }).set({
      translationOrganization: null,
    });

    sails.config.customLogger.log('info', `cancelTranslationRequestInvite: Completed cancellation of translator request invite ${patientInvite.id}`, null, 'server-action');
  },

  async cancelGuestInvite(patientInvite) {
    sails.config.customLogger.log('verbose', `cancelGuestInvite: Starting cancellation of guest invite ${patientInvite.id}`, null,'message');

    if (!patientInvite.guestInvite) return;

    await PublicInvite.updateOne({ id: patientInvite.id }).set({
      guestEmailAddress: '',
      guestPhoneNumber: '',
    });
    sails.config.customLogger.log('info', `cancelGuestInvite: Cleared guest email and phone from patient invite ${patientInvite.id}`, null, 'server-action');

    const guestInviteId = patientInvite.guestInvite.id || patientInvite.guestInvite;
    sails.config.customLogger.log('info', `cancelGuestInvite: Destroying guest invite ${guestInviteId}`, null, 'server-action');
    await PublicInvite.destroyOne({ id: guestInviteId });

    sails.config.customLogger.log('info', `cancelGuestInvite: Destroying user associated with guest invite ${guestInviteId}`, null, 'server-action');
    await User.destroyOne({ username: guestInviteId });

    sails.config.customLogger.log('info', `cancelGuestInvite: Removing guest invite reference from patient invite ${patientInvite.id}`, null, 'server-action');
    await PublicInvite.updateOne({ id: patientInvite.id }).set({
      guestInvite: null,
    });

    sails.config.customLogger.log('info', `cancelGuestInvite: Completed cancellation of guest invite ${patientInvite.id}`, null, 'message');
  },

  generateToken,
};

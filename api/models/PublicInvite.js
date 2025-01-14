/**
 * PublicInvite.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
const ics = require('ics');
const moment = require('moment-timezone');
moment.locale('fr');

function parseTime(value, defaultValue) {
  if (!value) return defaultValue;

  const timeUnit = value.slice(-1);
  const timeValue = parseInt(value.slice(0, -1), 10);

  switch (timeUnit) {
    case 's':
      return timeValue * 1000;
    case 'm':
      return timeValue * 60 * 1000;
    case 'h':
      return timeValue * 60 * 60 * 1000;
    case 'd':
      return timeValue * 24 * 60 * 60 * 1000;
    default:
      return defaultValue;
  }
}

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
const testingUrl = `${process.env.PUBLIC_URL}/test-call`;
const crypto = require('crypto');
const { importFileIfExists, createParamsFromJson } = require('../utils/helpers');
const TwilioWhatsappConfig = importFileIfExists(`${process.env.CONFIG_FILES}/twilio-whatsapp-config.json`, {});

async function generateToken() {
  const buffer = await new Promise((resolve, reject) => {
    crypto.randomBytes(256, (ex, buffer) => {
      if (ex) {
        reject('error generating token');
      }
      resolve(buffer);
    });
  });
  const token = crypto.createHash('sha1').update(buffer).digest('hex');

  return token;
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
      isIn: ['PENDING', 'SENT', 'ACCEPTED', 'COMPLETE', 'REFUSED', 'CANCELED',
      //   whatsapp statuses
      'QUEUED', 'SENDING', 'FAILED', 'DELIVERED', 'UNDELIVERED', 'RECEIVING', 'RECEIVED', 'SCHEDULED', 'READ', 'PARTIALLY_DELIVERED'
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
  },
  customToJSON() {
    return _.omit(this, ['inviteToken', 'expertToken']);
  },
  async beforeCreate(obj, proceed) {
    obj.inviteToken = await generateToken();
    obj.expertToken = await generateToken();
    return proceed();
  },
  async beforeUpdate(valuesToSet, proceed) {
    if (
      valuesToSet.scheduledFor &&
      !moment(valuesToSet.scheduledFor).isValid()
    ) {
      const err = new Error('ScheduledFor is not a valid date ');
      err.name = 'INVALID_SCHEDULED_FOR';
      err.code = 400;

      return proceed(err);
    }
    if (valuesToSet.scheduledFor && valuesToSet.patientTZ) {
      const scheduledTimeUTC = moment.tz(valuesToSet.scheduledFor, 'UTC').valueOf();
      const currentTimeUTC = moment().utc().valueOf();
      if (scheduledTimeUTC < currentTimeUTC) {
        const err = new Error('Consultation Time cannot be in the past ');
        err.name = 'INVALID_SCHEDULED_FOR';
        err.code = 400;

        return proceed(err);

      }
    } else if (valuesToSet.scheduledFor && new Date(valuesToSet.scheduledFor) < new Date()) {
      const err = new Error('Consultation Time cannot be in the past ');
      err.name = 'INVALID_SCHEDULED_FOR';
      err.code = 400;

      return proceed(err);
    }


    return proceed();
  },

  generateToken,
  sendTranslationRequestInvite(invite, email) {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const doctorLangCode =
      invite.doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE;
    const inviteTime = invite.scheduledFor
      ? moment(invite.scheduledFor)
        .tz(invite.patientTZ)
        .local(doctorLangCode)
        .format('D MMMM YYYY HH:mm zz')
      : '';
    const nowDate = moment().local(doctorLangCode).format('D MMMM YYYY');
    const doctorLanguage = sails._t(doctorLangCode, doctorLangCode);
    const patientLanguage = sails._t(doctorLangCode, invite.patientLanguage);
    const doctorName =
      (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '');

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
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const doctorLang =
      invite.doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE;
    const doctorName =
      (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '');

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
    const translatorRequestInvite = await PublicInvite.findOne({
      type: 'TRANSLATOR_REQUEST',
      id: invite.id,
    })
      .populate('doctor')
      .populate('patientInvite')
      .populate('translationOrganization');
    if (translatorRequestInvite.status === 'SENT') {
      await PublicInvite.updateOne({
        type: 'TRANSLATOR_REQUEST',
        id: invite.id,
      }).set({ status: 'REFUSED' });
      await PublicInvite.updateOne({
        id: translatorRequestInvite.patientInvite.id,
      }).set({ status: 'CANCELED' });

      if (translatorRequestInvite.patientInvite.guestInvite) {
        await PublicInvite.updateOne({
          id: translatorRequestInvite.patientInvite.guestInvite,
        }).set({ status: 'CANCELED' });
      }

      if (translatorRequestInvite.doctor.email) {
        const docLocale =
          translatorRequestInvite.doctor.preferredLanguage ||
          process.env.DEFAULT_DOCTOR_LOCALE;
        await sails.helpers.email.with({
          to: translatorRequestInvite.doctor.email,
          subject: sails._t(docLocale, 'translation request refused subject'),
          text: sails._t(docLocale, 'translation request refused body', {
            branding: process.env.BRANDING,
          }),
        });
      }
    }
  },

  async setTranslatorRequestTimer(invite) {
    await sails.helpers.schedule.with({
      name: 'TRANSLATOR_REQUEST_EXPIRE',
      data: { invite },
      time: new Date(Date.now() + TRANSLATOR_REQUEST_TIMEOUT),
    });
  },

  async sendPatientInvite(invite, resend = false) {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const locale = invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;
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

    const message =
      invite.scheduledFor && timeUntilScheduled > SECOND_INVITE_REMINDER
        ? sails._t(locale, 'scheduled patient invite', {
          inviteTime,
          testingUrl,
          branding: process.env.BRANDING,
          doctorName,
        })
        : sails._t(locale, 'patient invite', {
          url,
          branding: process.env.BRANDING,
          doctorName,
        });
    // don't send invite if there is a translator required
    if (invite.emailAddress && (!invite.scheduledFor || resend)) {
      try {
        await sails.helpers.email.with({
          to: invite.emailAddress,
          subject: sails._t(locale, 'your consultation link', {
            url,
            branding: process.env.BRANDING,
            doctorName,
          }),
          text: message,
        });
      } catch (error) {
        console.log('error Sending patient invite email', error);
        if (!invite.phoneNumber) {
          // await PublicInvite.destroyOne({ id: invite.id });
          return Promise.reject(error);
        }
      }
    }

    if (invite.phoneNumber) {
      // 2 is SMS
      if (invite.messageService === '2') {
        try {
          await sails.helpers.sms.with({
            phoneNumber: invite.phoneNumber,
            message,
            senderEmail: invite?.doctor?.email,
            whatsApp: false,
          });
        } catch (error) {
          console.log('ERROR SENDING SMS>>>>>>>> ', error);
          return Promise.reject(error);
        }
      } else {
        if (invite.messageService === '1') {
          const type = invite.scheduledFor && invite.scheduledFor > Date.now() ? 'scheduled patient invite' : 'patient invite';
          const TwilioWhatsappConfigLanguage = TwilioWhatsappConfig?.[invite?.patientLanguage] || TwilioWhatsappConfig?.['en'];
          const twilioTemplatedId = TwilioWhatsappConfigLanguage?.[type]?.twilio_template_id;

          const args = {
            language: invite?.patientLanguage || 'en',
            type,
            languageConfig: TwilioWhatsappConfig,
            url: invite.inviteToken,
            inviteDateTime: inviteTime,
          }

          const params = createParamsFromJson(args);

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
            if (whatsappMessageSid) {
              await PublicInvite.updateOne({
                id: invite.id,
              }).set({ whatsappMessageSid });
            }
          } catch (error) {
            console.log('ERROR SENDING SMS>>>>>>>> ', error);
            return Promise.reject(error);
          }
        }
      }

    }
  },

  async findBy(args) {
    return PublicInvite.find(args);
  },

  async sendGuestInvite(invite) {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const locale = invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;
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

    const doctorName =
      (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '');

    const message =
      invite.scheduledFor && timeUntilScheduled > SECOND_INVITE_REMINDER
        ? sails._t(locale, 'scheduled guest invite', {
          inviteTime,
          testingUrl,
          branding: process.env.BRANDING,
          doctorName,
        })
        : sails._t(locale, 'guest invite', {
          url,
          branding: process.env.BRANDING,
          doctorName,
        });
    // don't send invite if there is a translator required
    if (invite.emailAddress) {
      try {
        await sails.helpers.email.with({
          to: invite.emailAddress,
          subject: sails._t(locale, 'your consultation link', {
            url,
            branding: process.env.BRANDING,
            doctorName,
          }),
          text: message,
        });
      } catch (error) {
        console.log('error Sending guest invite email', error);
        if (!invite.phoneNumber) {
          // await PublicInvite.destroyOne({ id: invite.id });
          return Promise.reject(error);
        }
      }
    }

    if (invite.phoneNumber) {
      if (invite.guestMessageService === '1') {
        const type = invite.scheduledFor && invite.scheduledFor > Date.now() ? 'scheduled guest invite' : 'guest invite';
        const TwilioWhatsappConfigLanguage = TwilioWhatsappConfig?.[invite?.patientLanguage] || TwilioWhatsappConfig?.['en'];
        const twilioTemplatedId = TwilioWhatsappConfigLanguage?.[type]?.twilio_template_id;

        const args = {
          language: invite?.patientLanguage || 'en',
          type: type,
          languageConfig: TwilioWhatsappConfig,
          url: invite.inviteToken,
          inviteTime,
          inviteDateTime: inviteTime
        }

        const params = createParamsFromJson(args);

        try {
          await sails.helpers.sms.with({
            phoneNumber: invite.phoneNumber,
            message,
            senderEmail: invite.doctor?.email,
            whatsApp: true,
            params,
            twilioTemplatedId
          });
        } catch (error) {
          console.log('ERROR SENDING SMS>>>>>>>> ', error);
          // await PublicInvite.destroyOne({ id: invite.id });
          return Promise.reject(error);
        }
      } else {
        try {
          await sails.helpers.sms.with({
            phoneNumber: invite.phoneNumber,
            message,
            senderEmail: invite.doctor?.email,
            whatsApp: false,
          });
        } catch (error) {
          console.log('ERROR SENDING SMS>>>>>>>> ', error);
          // await PublicInvite.destroyOne({ id: invite.id });
          return Promise.reject(error);
        }
      }
    }
  },

  getReminderMessage(invite) {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const locale = invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;
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

    const args = {
      language: invite?.patientLanguage || 'en',
      type: firstReminderType,
      languageConfig: TwilioWhatsappConfig,
      url: invite.inviteToken,
      inviteTime,
      timePhrase: firstTimePhrase,
      inviteDateTime: inviteTime
    }

    const firstReminderParams = createParamsFromJson(args)

    const secondArgs = {
      language: invite?.patientLanguage || 'en',
      type: secondReminderType,
      languageConfig: TwilioWhatsappConfig,
      url: invite.inviteToken,
      inviteTime,
      timePhrase: secondTimePhrase,
      inviteDateTime: inviteTime
    }

    const secondReminderParams = createParamsFromJson(secondArgs)

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
    const locale = invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;
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

    const doctorName =
      (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '');
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;

    if (timeUntilScheduled < SECOND_INVITE_REMINDER) {
      const message = sails._t(locale, 'patient invite', {
            url,
            branding: process.env.BRANDING,
            doctorName,
          });
      try {
        await sails.helpers.email.with({
          to: invite.emailAddress,
          subject: sails._t(locale, 'your consultation link', {
            url,
            branding: process.env.BRANDING,
            doctorName,
          }),
          text: message,
        });
      } catch (error) {
        console.log('error Sending patient invite email', error);
        if (!invite.phoneNumber) {
          // await PublicInvite.destroyOne({ id: invite.id });
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

        console.log('Creating ICS event...');
        ics.createEvent(event, async (error, value) => {
          // const filePath = 'assets/event.ics';
          // Save the .ics file data to disk
          // fs.writeFileSync(filePath, value);

          if (error) {
            console.error('Error creating ICS event:', error);
            return;
          }

          await sails.helpers.email.with({
            to: invite.emailAddress,
            subject: sails._t(locale, 'consultation branding', {
              branding: process.env.BRANDING,
            }),
            text: sails._t(locale, 'scheduled patient invite', {
              inviteTime,
              testingUrl,
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

          console.log('Email sent successfully.');
        });
      } catch (err) {
        console.error('An error occurred:', err);
      }
    }

  },

  async setPatientOrGuestInviteReminders(invite) {
    const currentTime = Date.now();
    let scheduledTime = invite.scheduledFor;

    if (invite.patientTZ) {
      scheduledTime = moment.tz(invite.scheduledFor, 'UTC').valueOf();
    }

    const timeUntilScheduled = scheduledTime - currentTime;

    if (timeUntilScheduled > TIME_UNTIL_SCHEDULE) {
      if (invite.phoneNumber) {
        if (timeUntilScheduled > FIRST_INVITE_REMINDER) {
          await sails.helpers.schedule.with({
            name: 'FIRST_INVITE_REMINDER_SMS',
            data: { invite },
            time: new Date(scheduledTime - FIRST_INVITE_REMINDER),
          });
        }
      }

      if (invite.emailAddress) {
        if (timeUntilScheduled > FIRST_INVITE_REMINDER) {
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
        await sails.helpers.schedule.with({
          name: 'SECOND_INVITE_REMINDER_SMS',
          data: { invite },
          time: new Date(scheduledTime - SECOND_INVITE_REMINDER),
        });
      }
    }

    if (invite.emailAddress) {
      if (timeUntilScheduled > SECOND_INVITE_REMINDER) {
        await sails.helpers.schedule.with({
          name: 'SECOND_INVITE_REMINDER_EMAIL',
          data: { invite },
          time: new Date(scheduledTime - SECOND_INVITE_REMINDER),
        });
      }
    }
  },

  async destroyPatientInvite(invite) {
    const db = Consultation.getDatastore().manager;
    const userCollection = db.collection('user');

    if (invite.guestInvite) {
      await PublicInvite.destroyOne({ id: invite.guestInvite });

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
      await PublicInvite.destroyOne({ id: invite.translatorRequestInvite });
    }
    if (invite.translatorInvite) {
      await PublicInvite.destroyOne({ id: invite.translatorInvite });
      await userCollection.updateOne(
        { username: invite.translatorInvite },
        {
          $set: {
            consultationClosedAtISO: new Date(),
          },
        }
      );
    }

    await PublicInvite.destroyOne({ id: invite.id });
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
    translatorRequestInvite = await PublicInvite.findOne({
      id: translatorRequestInvite.id,
    })
      .populate('doctor')
      .populate('patientInvite')
      .populate('translationOrganization');

    await PublicInvite.updateOne({
      type: 'TRANSLATOR_REQUEST',
      id: translatorRequestInvite.id,
    }).set({ status: 'REFUSED' });
    await PublicInvite.updateOne({
      id: translatorRequestInvite.patientInvite.id,
    }).set({ status: 'CANCELED' });

    if (translatorRequestInvite.patientInvite.guestInvite) {
      await PublicInvite.updateOne({
        id: translatorRequestInvite.patientInvite.guestInvite,
      }).set({ status: 'CANCELED' });
    }

    if (translatorRequestInvite.doctor.email) {
      const docLocale =
        translatorRequestInvite.doctor.preferredLanguage ||
        process.env.DEFAULT_DOCTOR_LOCALE;
      await sails.helpers.email.with({
        to: translatorRequestInvite.doctor.email,
        subject: sails._t(docLocale, 'translation request refused subject'),
        text: sails._t(docLocale, 'translation request refused body', {
          branding: process.env.BRANDING,
        }),
      });
    }
  },

  async cancelTranslationRequestInvite(patientInvite) {
    if (!patientInvite.translatorRequestInvite) return;
    const translatorRequestInviteId =
      patientInvite.translatorRequestInvite.id ||
      patientInvite.translatorRequestInvite;
    await PublicInvite.destroyOne({ id: translatorRequestInviteId });

    if (patientInvite.translatorInvite) {
      const translatorInviteId =
        patientInvite.translatorInvite.id || patientInvite.translatorInvite;
      await PublicInvite.destroyOne({ id: translatorInviteId });
      await User.destroyOne({ username: translatorInviteId });
    }

    await PublicInvite.updateOne({ id: patientInvite.id }).set({
      translatorRequestInvite: null,
      translatorInvite: null,
    });

    await PublicInvite.updateOne({ id: patientInvite.id }).set({
      translationOrganization: null,
    });
  },
  async cancelGuestInvite(patientInvite) {
    if (!patientInvite.guestInvite) return;
    await PublicInvite.updateOne({ id: patientInvite.id }).set({
      guestEmailAddress: '',
      guestPhoneNumber: '',
    });

    const guestInviteId =
      patientInvite.guestInvite.id || patientInvite.guestInvite;
    await PublicInvite.destroyOne({ id: guestInviteId });

    await User.destroyOne({ username: guestInviteId });
    await PublicInvite.updateOne({ id: patientInvite.id }).set({
      guestInvite: null,
    });
  },
};

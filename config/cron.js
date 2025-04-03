const { CronJob } = require('cron');
const { parseTime } = require('../api/utils/helpers');

const DELETE_CLOSED_CONSULTATION_AFTER = process.env.DELETE_CLOSED_CONSULTATION_AFTER;
const DELETE_UNUSED_INVITE_AFTER = process.env.DELETE_UNUSED_INVITE_AFTER;

const DEFAULT_CONSULTATION_TIMEOUT = 24 * 60 * 60 * 1000; // 1 day
const DEFAULT_INVITATION_TIMEOUT = 24 * 60 * 60 * 1000; // 1 day

const CONSULTATION_TIMEOUT = parseTime(DELETE_CLOSED_CONSULTATION_AFTER, DEFAULT_CONSULTATION_TIMEOUT);
const INVITATION_TIMEOUT = parseTime(DELETE_UNUSED_INVITE_AFTER, DEFAULT_INVITATION_TIMEOUT);
const TRANSLATION_REQUEST_TIMEOUT = 48 * 60 * 60 * 1000;

const inviteJobs = {
  FIRST_INVITE_REMINDER_SMS: async (invite) => {
    const isWhatsApp = (invite.type === 'PATIENT' && invite.messageService === '1') ||
      (invite.type !== 'PATIENT' && invite.guestMessageService === '1');

    if (isWhatsApp) {
      const reminderData = sails.models.publicinvite.getReminderMessage(invite);
      const type = reminderData.firstReminderType;
      if (invite?.patientLanguage) {
        const template = await WhatsappTemplate.findOne({
          language: invite.patientLanguage,
          key: type,
          approvalStatus: 'approved'
        });
        sails.config.customLogger.log('verbose', `WhatsApp template fetched for first reminder template ${template}`, null, 'message');
        if (template && template.sid) {
          const twilioTemplatedId = template.sid;
          const params = reminderData.firstReminderParams;
          if (twilioTemplatedId) {
            const whatsappMessageSid = await sails.helpers.sms.with({
              phoneNumber: invite.phoneNumber,
              message: reminderData.firstReminderMessage,
              senderEmail: invite?.doctor?.email,
              whatsApp: true,
              twilioTemplatedId,
              params,
              statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL,
            });
            if (whatsappMessageSid) {
              await PublicInvite.updateOne({ id: invite.id }).set({ whatsappMessageSid });
              sails.config.customLogger.log('info', `First WhatsApp reminder SMS sent inviteId ${invite.id}`, null, 'server-action');
            }
          } else {
            sails.config.customLogger.log('error', 'ERROR SENDING WhatsApp SMS', { message: 'Template id is missing' }, 'message');
          }
        } else {
          sails.config.customLogger.log('error', 'ERROR SENDING WhatsApp SMS', { message: 'Template is not approved' }, 'message');
        }
      }
    } else {
      await sails.helpers.sms.with({
        phoneNumber: invite.phoneNumber,
        message: sails.models.publicinvite.getReminderMessage(invite).firstReminderMessage,
        senderEmail: invite?.doctor?.email,
        whatsApp: false,
      });
      sails.config.customLogger.log('info', `First reminder SMS sent (non-WhatsApp) inviteId ${invite.id}`, null, 'server-action');
    }
  },
  SECOND_INVITE_REMINDER_SMS: async (invite) => {
    const isWhatsApp = (invite.type === 'PATIENT' && invite.messageService === '1') ||
      (invite.type !== 'PATIENT' && invite.guestMessageService === '1');

    if (isWhatsApp) {
      const reminderData = sails.models.publicinvite.getReminderMessage(invite);
      const type = reminderData.secondReminderType;
      if (invite?.patientLanguage) {
        const template = await WhatsappTemplate.findOne({
          language: invite.patientLanguage,
          key: type,
          approvalStatus: 'approved'
        });
        sails.config.customLogger.log('verbose', `WhatsApp template fetched for second reminder template ${template}`, null, 'message');
        if (template && template.sid) {
          const twilioTemplatedId = template.sid;
          const params = reminderData.secondReminderParams;
          if (twilioTemplatedId) {
            const whatsappMessageSid = await sails.helpers.sms.with({
              phoneNumber: invite.phoneNumber,
              message: reminderData.secondReminderMessage,
              senderEmail: invite?.doctor?.email,
              whatsApp: true,
              params,
              twilioTemplatedId,
              statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL,
            });
            if (whatsappMessageSid) {
              await PublicInvite.updateOne({ id: invite.id }).set({ whatsappMessageSid });
              sails.config.customLogger.log('info', `Second WhatsApp reminder SMS sent inviteId ${invite.id}`, null, 'server-action');
            }
          } else {
            sails.config.customLogger.log('error', 'ERROR SENDING WhatsApp SMS', { message: 'Template id is missing' }, 'message');
          }
        } else {
          sails.config.customLogger.log('error', 'ERROR SENDING WhatsApp SMS', { message: 'Template is not approved' }, 'message');
        }
      }
    } else {
      await sails.helpers.sms.with({
        phoneNumber: invite.phoneNumber,
        message: sails.models.publicinvite.getReminderMessage(invite).secondReminderMessage,
        senderEmail: invite?.doctor?.email,
        whatsApp: false,
      });
      if (invite.type === 'PATIENT') {
        await PublicInvite.updateOne({ id: invite.id }).set({ status: 'SENT' });
      }
      sails.config.customLogger.log('info', `Second reminder SMS sent (non-WhatsApp) inviteId ${invite.id}`, null, 'server-action');
    }
  },
  FIRST_INVITE_REMINDER_EMAIL: async (invite) => {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const doctorName = (invite.doctor?.firstName || '') + ' ' + (invite.doctor?.lastName || '');
    const locale = invite.patientLanguage || sails.config.globals.DEFAULT_PATIENT_LOCALE;

    await sails.helpers.email.with({
      to: invite.emailAddress,
      subject: sails._t(locale, 'your consultation link', { url, branding: process.env.BRANDING, doctorName }),
      text: sails.models.publicinvite.getReminderMessage(invite).firstReminderMessage,
    });
    sails.config.customLogger.log('info', `First reminder email sent inviteId ${invite.id}`, null, 'server-action');
  },
  SECOND_INVITE_REMINDER_EMAIL: async (invite) => {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const doctorName = (invite.doctor?.firstName || '') + ' ' + (invite.doctor?.lastName || '');
    const locale = invite.patientLanguage || sails.config.globals.DEFAULT_PATIENT_LOCALE;

    await sails.helpers.email.with({
      to: invite.emailAddress,
      subject: sails._t(locale, 'your consultation link', { url, branding: process.env.BRANDING, doctorName }),
      text: sails.models.publicinvite.getReminderMessage(invite).secondReminderMessage,
    });
    if (invite.type === 'PATIENT') {
      await PublicInvite.updateOne({ id: invite.id }).set({ status: 'SENT' });
    }
    sails.config.customLogger.log('info', `Second reminder email sent inviteId ${invite.id}`, null, 'server-action');
  },
};

module.exports = {
  startCron: async () => {

    const defineJob = (name, cronTime, jobFunction) => {
      const job = new CronJob(cronTime, async () => {
        const jobs = await sails.models.publicinvite.findBy({ name });
        for (const jobItem of jobs) {
          await jobFunction(jobItem);
        }
      }, null, true);
      job.start();
      sails.config.customLogger.log('info', `Cron job '${name}' scheduled with cron time '${cronTime}'`, null, 'message');
      return job;
    };

    Object.keys(inviteJobs).forEach((name) => {
      defineJob(name, '*/5 * * * *', inviteJobs[name]);
    });

    defineJob('TRANSLATOR_REQUEST_EXPIRE', '*/5 * * * *', async () => {
      const jobs = await sails.models.publicinvite.findBy({ type: 'TRANSLATOR_REQUEST', status: 'SENT' });
      const now = Date.now();
      for (const job of jobs) {
        if (job.createdAt < now - TRANSLATION_REQUEST_TIMEOUT) {
          await sails.models.publicinvite.expireTranslatorRequest(job);
          sails.config.customLogger.log('info', `Translator request expired inviteId ${job.id}`, null, 'server-action');
        }
      }
    });

    defineJob('RINGING_TIMEOUT', '*/5 * * * *', async () => {
      const jobs = await sails.models.message.find({ status: 'ringing' });
      for (const job of jobs) {
        await sails.models.message.endCall(job, job.consultation, 'RINGING_TIMEOUT');
        sails.config.customLogger.log('info', `Call ended due to RINGING_TIMEOUT messageId ${job.id}`, null, 'server-action');
      }
    });

    defineJob('DURATION_TIMEOUT', '*/5 * * * *', async () => {
      const jobs = await sails.models.message.find({ status: { '!=': 'ended' } });
      for (const job of jobs) {
        await sails.models.message.endCall(job, job.consultation, 'DURATION_TIMEOUT');
        sails.config.customLogger.log('info', `Call ended due to DURATION_TIMEOUT messageId ${job.id}`, null, 'server-action');
      }
    });

    defineJob('delete old consultations', '*/5 * * * *', async () => {
      const now = Date.now();
      const consultationsToBeClosed = await sails.models.consultation.findBy({
        status: { '!=': 'closed' },
        or: [
          { acceptedAt: 0, createdAt: { '<': now - CONSULTATION_TIMEOUT } },
          { acceptedAt: { '!=': 0, '<': now - CONSULTATION_TIMEOUT } }
        ],
      });

      for (const consultation of consultationsToBeClosed) {
        await sails.models.consultation.closeConsultation(consultation);
        sails.config.customLogger.log('info', `Consultation closed due to timeout consultationId ${consultation.id}`, null, 'server-action');
      }

      const translatorRequestsToBeRefused = await sails.models.publicinvite.findBy({
        status: 'SENT',
        type: 'TRANSLATOR_REQUEST',
        createdAt: { '<': now - TRANSLATION_REQUEST_TIMEOUT },
      });

      for (const invite of translatorRequestsToBeRefused) {
        await sails.models.publicinvite.refuseTranslatorRequest(invite);
        sails.config.customLogger.log('info', `Translator request refused due to timeout inviteId ${invite.id}`, null, 'server-action');
      }
    });

    const deleteOldInvites = CronJob.from({
      cronTime: '*/5 * * * *',
      onTick: async function() {
        try {
          const now = Date.now();

          const invitesToBeRemoved = await sails.models.publicinvite.find({
            where: {
              status: 'SENT',
              type: 'PATIENT',
              or: [
                {
                  scheduledFor: { '>': 0, '<': new Date(now - INVITATION_TIMEOUT) }
                },
                {
                  or: [
                    { scheduledFor: 0 },
                    { scheduledFor: null }
                  ],
                  createdAt: { '<': new Date(now - INVITATION_TIMEOUT) }
                }
              ]
            }
          });


          for (const invitation of invitesToBeRemoved) {
            await sails.models.publicinvite.destroyOne({ id: invitation.id });
            sails.config.customLogger.log('info', `Old invite deleted inviteId ${invitation.id}`, null, 'server-action');
          }

        } catch (error) {
          sails.config.customLogger.log('error', 'Error in delete old invites job', { error: error?.message || error }, 'server-action');
        }
      },
      start: true,
    });

  },
  inviteJobs,
};

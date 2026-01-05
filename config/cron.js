const { CronJob } = require('cron');
const { parseTime } = require('../api/utils/helpers');

const DELETE_UNUSED_INVITE_AFTER = process.env.DELETE_UNUSED_INVITE_AFTER;
const DEFAULT_INVITATION_TIMEOUT = 24 * 60 * 60 * 1000; // 1 day

const INVITATION_TIMEOUT = parseTime(DELETE_UNUSED_INVITE_AFTER, DEFAULT_INVITATION_TIMEOUT);
const TRANSLATION_REQUEST_TIMEOUT = 48 * 60 * 60 * 1000;

const inviteJobs = {
  FIRST_INVITE_REMINDER_SMS: async (invite) => {
    const latestInvite = await PublicInvite.findOne({ id: invite.id }).populate('doctor');
    if (!latestInvite) {
      sails.config.customLogger.log('warn', `FIRST_INVITE_REMINDER_SMS: Invite ${invite.id} not found, skipping reminder`, null, 'server-action');
      return;
    }
    invite = latestInvite;

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
      const  whatsappMessageSid = await sails.helpers.sms.with({
        phoneNumber: invite.phoneNumber,
        message: sails.models.publicinvite.getReminderMessage(invite).firstReminderMessage,
        senderEmail: invite?.doctor?.email,
        whatsApp: false,
      });
      sails.config.customLogger.log('info', `First reminder SMS sent (non-WhatsApp) inviteId ${invite.id}`, null, 'server-action');
      if (whatsappMessageSid) {
        await PublicInvite.updateOne({ id: invite.id }).set({ whatsappMessageSid });
        sails.config.customLogger.log('info', `First SMS reminder SMS sent inviteId ${invite.id}`, null, 'server-action');
      }
    }
  },
  SECOND_INVITE_REMINDER_SMS: async (invite) => {
    const latestInvite = await PublicInvite.findOne({ id: invite.id }).populate('doctor');
    if (!latestInvite) {
      sails.config.customLogger.log('warn', `SECOND_INVITE_REMINDER_SMS: Invite ${invite.id} not found, skipping reminder`, null, 'server-action');
      return;
    }
    invite = latestInvite;

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
      const whatsappMessageSid = await sails.helpers.sms.with({
        phoneNumber: invite.phoneNumber,
        message: sails.models.publicinvite.getReminderMessage(invite).secondReminderMessage,
        senderEmail: invite?.doctor?.email,
        whatsApp: false,
      });
      if (invite.type === 'PATIENT') {
        await PublicInvite.updateOne({ id: invite.id }).set({ status: 'SENT' });
      }
      if (whatsappMessageSid) {
        await PublicInvite.updateOne({ id: invite.id }).set({ whatsappMessageSid });
        sails.config.customLogger.log('info', `Second SMS reminder SMS sent inviteId ${invite.id}`, null, 'server-action');
      }
      sails.config.customLogger.log('info', `Second reminder SMS sent (non-WhatsApp) inviteId ${invite.id}`, null, 'server-action');
    }
  },
  FIRST_INVITE_REMINDER_EMAIL: async (invite) => {
    const latestInvite = await PublicInvite.findOne({ id: invite.id }).populate('doctor');
    if (!latestInvite) {
      sails.config.customLogger.log('warn', `FIRST_INVITE_REMINDER_EMAIL: Invite ${invite.id} not found, skipping reminder`, null, 'server-action');
      return;
    }
    invite = latestInvite;

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
    const latestInvite = await PublicInvite.findOne({ id: invite.id }).populate('doctor');
    if (!latestInvite) {
      sails.config.customLogger.log('warn', `SECOND_INVITE_REMINDER_EMAIL: Invite ${invite.id} not found, skipping reminder`, null, 'server-action');
      return;
    }
    invite = latestInvite;

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
    sails.config.customLogger.log('info', `Second reminder email sent inviteId ${invite.id}`, null, 'server-action', null);
  },
  FIRST_EXPERT_REMINDER_SMS: async (invite) => {
    const latestInvite = await PublicInvite.findOne({ id: invite.id }).populate('doctor');
    if (!latestInvite) {
      sails.config.customLogger.log('warn', `FIRST_EXPERT_REMINDER_SMS: Invite ${invite.id} not found, skipping reminder`, null, 'server-action');
      return;
    }
    invite = latestInvite;

    if (!invite.experts || !Array.isArray(invite.experts) || invite.experts.length === 0) {
      sails.config.customLogger.log('verbose', `FIRST_EXPERT_REMINDER_SMS: No experts in invite ${invite.id}`, null, 'server-action');
      return;
    }

    const expertReminderData = sails.models.publicinvite.getExpertReminderMessage(invite);

    for (const contact of invite.experts) {
      const { expertContact, messageService } = contact || {};
      if (!expertContact) continue;

      const isPhoneNumber = /^(\+|00)[0-9 ]+$/.test(expertContact);
      const isEmail = expertContact.includes('@');

      if (isPhoneNumber && !isEmail) {
        if (messageService === '1') {
          if (invite.patientLanguage) {
            const template = await WhatsappTemplate.findOne({
              language: invite.patientLanguage,
              key: expertReminderData.firstReminderType,
              approvalStatus: 'approved'
            });
            if (template && template.sid) {
              try {
                await sails.helpers.sms.with({
                  phoneNumber: expertContact,
                  message: expertReminderData.firstReminderMessage,
                  senderEmail: invite?.doctor?.email,
                  whatsApp: true,
                  twilioTemplatedId: template.sid,
                  params: expertReminderData.firstReminderParams,
                  statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL,
                });
                sails.config.customLogger.log('info', `First WhatsApp reminder sent to expert ${expertContact} inviteId ${invite.id}`, null, 'server-action');
              } catch (error) {
                sails.config.customLogger.log('error', 'Error sending first WhatsApp reminder to expert', { error: error?.message || error, contact: expertContact }, 'server-action');
              }
            } else {
              sails.config.customLogger.log('error', 'WhatsApp template not approved or missing for expert reminder', null, 'message');
            }
          }
        } else if (messageService === '2') {
          try {
            await sails.helpers.sms.with({
              phoneNumber: expertContact,
              message: expertReminderData.firstReminderMessage,
              senderEmail: invite?.doctor?.email,
              whatsApp: false,
            });
            sails.config.customLogger.log('info', `First SMS reminder sent to expert ${expertContact} inviteId ${invite.id}`, null, 'server-action');
          } catch (error) {
            sails.config.customLogger.log('error', 'Error sending first SMS reminder to expert', { error: error?.message || error, contact: expertContact }, 'server-action');
          }
        }
      }
    }
  },
  SECOND_EXPERT_REMINDER_SMS: async (invite) => {
    const latestInvite = await PublicInvite.findOne({ id: invite.id }).populate('doctor');
    if (!latestInvite) {
      sails.config.customLogger.log('warn', `SECOND_EXPERT_REMINDER_SMS: Invite ${invite.id} not found, skipping reminder`, null, 'server-action');
      return;
    }
    invite = latestInvite;

    if (!invite.experts || !Array.isArray(invite.experts) || invite.experts.length === 0) {
      sails.config.customLogger.log('verbose', `SECOND_EXPERT_REMINDER_SMS: No experts in invite ${invite.id}`, null, 'server-action');
      return;
    }

    const expertReminderData = sails.models.publicinvite.getExpertReminderMessage(invite);

    for (const contact of invite.experts) {
      const { expertContact, messageService } = contact || {};
      if (!expertContact) continue;

      const isPhoneNumber = /^(\+|00)[0-9 ]+$/.test(expertContact);
      const isEmail = expertContact.includes('@');

      if (isPhoneNumber && !isEmail) {
        if (messageService === '1') {
          if (invite.patientLanguage) {
            const template = await WhatsappTemplate.findOne({
              language: invite.patientLanguage,
              key: expertReminderData.secondReminderType,
              approvalStatus: 'approved'
            });
            if (template && template.sid) {
              try {
                await sails.helpers.sms.with({
                  phoneNumber: expertContact,
                  message: expertReminderData.secondReminderMessage,
                  senderEmail: invite?.doctor?.email,
                  whatsApp: true,
                  params: expertReminderData.secondReminderParams,
                  twilioTemplatedId: template.sid,
                  statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL,
                });
                sails.config.customLogger.log('info', `Second WhatsApp reminder sent to expert ${expertContact} inviteId ${invite.id}`, null, 'server-action');
              } catch (error) {
                sails.config.customLogger.log('error', 'Error sending second WhatsApp reminder to expert', { error: error?.message || error, contact: expertContact }, 'server-action');
              }
            } else {
              sails.config.customLogger.log('error', 'WhatsApp template not approved or missing for expert reminder', null, 'message');
            }
          }
        } else if (messageService === '2') {
          try {
            await sails.helpers.sms.with({
              phoneNumber: expertContact,
              message: expertReminderData.secondReminderMessage,
              senderEmail: invite?.doctor?.email,
              whatsApp: false,
            });
            sails.config.customLogger.log('info', `Second SMS reminder sent to expert ${expertContact} inviteId ${invite.id}`, null, 'server-action');
          } catch (error) {
            sails.config.customLogger.log('error', 'Error sending second SMS reminder to expert', { error: error?.message || error, contact: expertContact }, 'server-action');
          }
        }
      }
    }
  },
  FIRST_EXPERT_REMINDER_EMAIL: async (invite) => {
    const latestInvite = await PublicInvite.findOne({ id: invite.id }).populate('doctor');
    if (!latestInvite) {
      sails.config.customLogger.log('warn', `FIRST_EXPERT_REMINDER_EMAIL: Invite ${invite.id} not found, skipping reminder`, null, 'server-action');
      return;
    }
    invite = latestInvite;

    if (!invite.experts || !Array.isArray(invite.experts) || invite.experts.length === 0) {
      sails.config.customLogger.log('verbose', `FIRST_EXPERT_REMINDER_EMAIL: No experts in invite ${invite.id}`, null, 'server-action');
      return;
    }

    const expertReminderData = sails.models.publicinvite.getExpertReminderMessage(invite);
    const locale = invite.patientLanguage || sails.config.globals.DEFAULT_PATIENT_LOCALE;
    const doctorName = (invite.doctor?.firstName || '') + ' ' + (invite.doctor?.lastName || '');

    for (const contact of invite.experts) {
      const { expertContact } = contact || {};
      if (!expertContact) continue;

      const isEmail = expertContact.includes('@');
      const isPhoneNumber = /^(\+|00)[0-9 ]+$/.test(expertContact);

      if (isEmail && !isPhoneNumber) {
        try {
          await sails.helpers.email.with({
            to: expertContact,
            subject: sails._t(locale, 'your consultation link', { url: expertReminderData.expertLink, branding: process.env.BRANDING, doctorName }),
            text: expertReminderData.firstReminderMessage,
          });
          sails.config.customLogger.log('info', `First reminder email sent to expert ${expertContact} inviteId ${invite.id}`, null, 'server-action');
        } catch (error) {
          sails.config.customLogger.log('error', 'Error sending first reminder email to expert', { error: error?.message || error, contact: expertContact }, 'server-action');
        }
      }
    }
  },
  SECOND_EXPERT_REMINDER_EMAIL: async (invite) => {
    const latestInvite = await PublicInvite.findOne({ id: invite.id }).populate('doctor');
    if (!latestInvite) {
      sails.config.customLogger.log('warn', `SECOND_EXPERT_REMINDER_EMAIL: Invite ${invite.id} not found, skipping reminder`, null, 'server-action');
      return;
    }
    invite = latestInvite;

    if (!invite.experts || !Array.isArray(invite.experts) || invite.experts.length === 0) {
      sails.config.customLogger.log('verbose', `SECOND_EXPERT_REMINDER_EMAIL: No experts in invite ${invite.id}`, null, 'server-action');
      return;
    }

    const expertReminderData = sails.models.publicinvite.getExpertReminderMessage(invite);
    const locale = invite.patientLanguage || sails.config.globals.DEFAULT_PATIENT_LOCALE;
    const doctorName = (invite.doctor?.firstName || '') + ' ' + (invite.doctor?.lastName || '');

    for (const contact of invite.experts) {
      const { expertContact } = contact || {};
      if (!expertContact) continue;

      const isEmail = expertContact.includes('@');
      const isPhoneNumber = /^(\+|00)[0-9 ]+$/.test(expertContact);

      if (isEmail && !isPhoneNumber) {
        try {
          await sails.helpers.email.with({
            to: expertContact,
            subject: sails._t(locale, 'your consultation link', { url: expertReminderData.expertLink, branding: process.env.BRANDING, doctorName }),
            text: expertReminderData.secondReminderMessage,
          });
          sails.config.customLogger.log('info', `Second reminder email sent to expert ${expertContact} inviteId ${invite.id}`, null, 'server-action');
        } catch (error) {
          sails.config.customLogger.log('error', 'Error sending second reminder email to expert', { error: error?.message || error, contact: expertContact }, 'server-action');
        }
      }
    }
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
      sails.config.customLogger.log('info', `Cron job '${name}' scheduled with cron time '${cronTime}'`, null, 'message', null);
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
          sails.config.customLogger.log('info', `Translator request expired inviteId ${job.id}`, null, 'server-action', null);
        }
      }
    });

    defineJob('RINGING_TIMEOUT', '*/5 * * * *', async () => {
      const jobs = await sails.models.message.find({ status: 'ringing' });
      for (const job of jobs) {
        await sails.models.message.endCall(job, job.consultation, 'RINGING_TIMEOUT');
        sails.config.customLogger.log('info', `Call ended due to RINGING_TIMEOUT messageId ${job.id}`, null, 'server-action',null);
      }
    });

    defineJob('DURATION_TIMEOUT', '*/5 * * * *', async () => {
      const jobs = await sails.models.message.find({ status: { '!=': 'ended' } });
      for (const job of jobs) {
        await sails.models.message.endCall(job, job.consultation, 'DURATION_TIMEOUT');
        sails.config.customLogger.log('info', `Call ended due to DURATION_TIMEOUT messageId ${job.id}`, null, 'server-action', null);
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
            const activeConsultation = await sails.models.consultation.findOne({
              invitationToken: invitation.inviteToken,
              status: 'active'
            });

            if (activeConsultation) {
              sails.config.customLogger.log('info', `Skipping invite deletion - active consultation exists inviteId ${invitation.id} consultationId ${activeConsultation.id}`, null, 'server-action');
              continue;
            }

            await sails.models.publicinvite.destroyOne({ id: invitation.id });
            sails.config.customLogger.log('info', `Old invite deleted inviteId ${invitation.id}`, null, 'server-action');
          }

        } catch (error) {
          sails.config.customLogger.log('error', 'Error in delete old invites job', { error: error?.message || error }, 'server-action', null);
        }
      },
      start: true,
    });

  },
  inviteJobs,
};

const { CronJob } = require('cron');
const CONSULTATION_TIMEOUT = 24 * 60 * 60 * 1000;
const TRANSLATION_REQUEST_TIMEOUT = 48 * 60 * 60 * 1000;

const inviteJobs = {
  FIRST_INVITE_REMINDER_SMS: async (invite) => {
    if (invite.messageService === '1') {
      await sails.helpers.sms.with({
        phoneNumber: invite.phoneNumber,
        message: sails.models.publicinvite.getReminderMessage(invite).firstReminderMessage,
        senderEmail: invite?.doctor?.email,
        whatsApp: true,
      });
    } else {
      await sails.helpers.sms.with({
        phoneNumber: invite.phoneNumber,
        message: sails.models.publicinvite.getReminderMessage(invite).firstReminderMessage,
        senderEmail: invite?.doctor?.email,
        whatsApp: false,
      });
    }
  },
  SECOND_INVITE_REMINDER_SMS: async (invite) => {
    if (invite.messageService === '1') {
      await sails.helpers.sms.with({
        phoneNumber: invite.phoneNumber,
        message: sails.models.publicinvite.getReminderMessage(invite).secondReminderMessage,
        senderEmail: invite?.doctor?.email,
        whatsApp: true,
      });
    } else {
      await sails.helpers.sms.with({
        phoneNumber: invite.phoneNumber,
        message: sails.models.publicinvite.getReminderMessage(invite).secondReminderMessage,
        senderEmail: invite?.doctor?.email,
        whatsApp: false,
      });
    }
  },
  FIRST_INVITE_REMINDER_EMAIL: async (invite) => {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const doctorName = (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '');
    const locale = invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;

    await sails.helpers.email.with({
      to: invite.emailAddress,
      subject: sails._t(locale, 'your consultation link', {
        url,
        branding: process.env.BRANDING,
        doctorName,
      }),
      text: sails.models.publicinvite.getReminderMessage(invite).firstReminderMessage,
    });
  },
  SECOND_INVITE_REMINDER_EMAIL: async (invite) => {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const doctorName = (invite.doctor.firstName || '') + ' ' + (invite.doctor.lastName || '');
    const locale = invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;

    await sails.helpers.email.with({
      to: invite.emailAddress,
      subject: sails._t(locale, 'your consultation link', {
        url,
        branding: process.env.BRANDING,
        doctorName,
      }),
      text: sails.models.publicinvite.getReminderMessage(invite).secondReminderMessage,
    });
  },
};

module.exports = {
  startCron: async () => {

    const defineJob = (name, cronTime, jobFunction) => {
      const job = new CronJob(cronTime, async () => {
        const jobs = await sails.models.publicinvite.findBy({ name });
        for (const job of jobs) {
          await jobFunction(job);
        }
      }, null, true);
      job.start();
      sails.log.info(`Cron job '${name}' scheduled with cron time '${cronTime}'`);
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
        }
      }
    });

    defineJob('RINGING_TIMEOUT', '*/5 * * * *', async () => {
      const jobs = await sails.models.message.find({ status: 'ringing' });
      for (const job of jobs) {
        await sails.models.message.endCall(job, job.consultation, 'RINGING_TIMEOUT');
      }
    });

    defineJob('DURATION_TIMEOUT', '*/5 * * * *', async () => {
      const jobs = await sails.models.message.find({ status: { '!=': 'ended' } });
      for (const job of jobs) {
        await sails.models.message.endCall(job, job.consultation, 'DURATION_TIMEOUT');
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
      }

      const translatorRequestsToBeRefused = await sails.models.publicinvite.findBy({
        status: 'SENT',
        type: 'TRANSLATOR_REQUEST',
        createdAt: { '<': now - TRANSLATION_REQUEST_TIMEOUT },
      });

      for (const invite of translatorRequestsToBeRefused) {
        await sails.models.publicinvite.refuseTranslatorRequest(invite);
      }
    });

    const deleteOldInvites = CronJob.from({
      cronTime: '*/5 * * * *',
      onTick: async function () {
          try {
            const now = Date.now();
            const invitesToBeRemoved = await sails.models.publicinvite.find({
              where: {
                status: 'SENT',
                type: 'PATIENT',
                createdAt: { '<': new Date(now - CONSULTATION_TIMEOUT) },
              }
            });

            for (const invitation of invitesToBeRemoved) {
              await sails.models.publicinvite.destroyOne({ id: invitation.id });
            }

          } catch (error) {
            console.log('Error in delete old invites job:', error);
          }
      },
      start: true,
    });

  },
  inviteJobs,
};

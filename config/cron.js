const Agenda = require("agenda");
const CONSULTATION_TIMEOUT = 24 * 60 * 60 * 1000;
const TRANSLATION_REQUEST_TIMEOUT = 48 * 60 * 60 * 1000;

module.exports = {
  startCron: async () => {
    const agenda = new Agenda({ db: { address: process.env.DB_URI } });
    await agenda.start();
    sails.agenda = agenda;

    const inviteJobs = {
      FIRST_INVITE_REMINDER_SMS: async (invite) => {
        if (invite.messageService === '1') {
          await sails.helpers.sms.with({
            phoneNumber: invite.phoneNumber,
            message:
            sails.models.publicinvite.getReminderMessage(invite)
              .firstReminderMessage,
            senderEmail: invite?.doctor?.email,
            whatsApp: true,
          });
        } else {
          await sails.helpers.sms.with({
            phoneNumber: invite.phoneNumber,
            message:
            sails.models.publicinvite.getReminderMessage(invite)
              .firstReminderMessage,
            senderEmail: invite?.doctor?.email,
            whatsApp: false,
          });
        }
      },
      SECOND_INVITE_REMINDER_SMS: async (invite) => {
        if (invite.messageService === '1') {
          //   WhatsApp
          await sails.helpers.sms.with({
            phoneNumber: invite.phoneNumber,
            message:
            sails.models.publicinvite.getReminderMessage(invite)
              .secondReminderMessage,
            senderEmail: invite?.doctor?.email,
            whatsApp: true,
          });
        } else {
          // SMS
          await sails.helpers.sms.with({
            phoneNumber: invite.phoneNumber,
            message:
            sails.models.publicinvite.getReminderMessage(invite)
              .secondReminderMessage,
            senderEmail: invite?.doctor?.email,
            whatsApp: false,
          });
        }
      },
      FIRST_INVITE_REMINDER_EMAIL: async (invite) => {
        const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;

        const doctorName =
          (invite.doctor.firstName || "") +
          " " +
          (invite.doctor.lastName || "");
        const locale =
          invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;

        await sails.helpers.email.with({
          to: invite.emailAddress,
          subject: sails._t(locale, "your consultation link", {
            url,
            branding: process.env.BRANDING,
            doctorName,
          }),
          text: sails.models.publicinvite.getReminderMessage(invite)
            .firstReminderMessage,
        });
      },
      SECOND_INVITE_REMINDER_EMAIL: async (invite) => {
        const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;

        const doctorName =
          (invite.doctor.firstName || "") +
          " " +
          (invite.doctor.lastName || "");
        const locale =
          invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;
        await sails.helpers.email.with({
          to: invite.emailAddress,
          subject: sails._t(locale, "your consultation link", {
            url,
            branding: process.env.BRANDING,
            doctorName,
          }),
          text: sails.models.publicinvite.getReminderMessage(invite)
            .secondReminderMessage,
        });
      },
    };

    await Promise.all(
      Object.keys(inviteJobs).map((name) => {
        sails.agenda.define(name, async (job) => {
          const { invite } = job.attrs.data;
          const updatedInvite = await sails.models.publicinvite.findOne({
            id: invite.id,
          });
          if (!updatedInvite) {
            console.warn("invite was deleted");
            return;
          }
          // if shceduledFor has changed, do not run the job
          if (updatedInvite.scheduledFor !== invite.scheduledFor) {
            return;
          }

          await inviteJobs[name](invite);
        });
      })
    );

    sails.agenda.define("TRANSLATOR_REQUEST_EXPIRE", async (job) => {
      await sails.models.publicinvite.expireTranslatorRequest(job);
    });

    sails.agenda.define("RINGING_TIMEOUT", async (job) => {
      const message = await sails.models.message.findOne({
        id: job.attrs.data.message.id,
      });
      if (message.status === "ringing") {
        sails.models.message.endCall(
          message,
          job.attrs.data.consultation,
          "RINGING_TIMEOUT"
        );
      }
    });
    sails.agenda.define("DURATION_TIMEOUT", async (job) => {
      const message = await sails.models.message.findOne({
        id: job.attrs.data.message.id,
      });
      if (message.status !== "ended") {
        sails.models.message.endCall(
          message,
          job.attrs.data.consultation,
          "DURATION_TIMEOUT"
        );
      }
    });

    sails.agenda.define("delete old consultations", async (job) => {
      const now = Date.now();
      const consultationsToBeClosed = await Consultation.find({
        status: { "!=": "closed" },
        or: [
          {
            acceptedAt: 0,
            createdAt: {
              "<": now - CONSULTATION_TIMEOUT,
            },
          },
          {
            acceptedAt: { "!=": 0, "<": now - CONSULTATION_TIMEOUT },
          },
        ],
      });

      console.log("consultations to be closed ", consultationsToBeClosed);

      await Promise.all(
        consultationsToBeClosed.map(async (c) => {
          return await Consultation.closeConsultation(c);
        })
      );

      const translatorRequestsToBeRefused = await PublicInvite.find({
        status: "SENT",
        type: "TRANSLATOR_REQUEST",
        createdAt: {
          "<": now - TRANSLATION_REQUEST_TIMEOUT,
        },
      });

      await Promise.all(
        translatorRequestsToBeRefused.map(async (invite) => {
          return await PublicInvite.refuseTranslatorRequest(invite);
        })
      );
    });
    await sails.agenda.every("*/5 * * * *", "delete old consultations");
  },
};

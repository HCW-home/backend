/**
 * PublicInvite.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
const ics = require("ics");
const moment = require("moment-timezone");
moment.locale("fr");

const FIRST_INVITE_REMINDER = 24 * 60 * 60 * 1000;
const SECOND_INVITE_REMINDER = 60 * 1000;
const TRANSLATOR_REQUEST_TIMEOUT = 24 * 60 * 60 * 1000;
const testingUrl = `${process.env.PUBLIC_URL}/test-call`;
const crypto = require("crypto");

async function generateToken() {
  const buffer = await new Promise((resolve, reject) => {
    crypto.randomBytes(256, (ex, buffer) => {
      if (ex) {
        reject("error generating token");
      }
      resolve(buffer);
    });
  });
  const token = crypto.createHash("sha1").update(buffer).digest("hex");

  return token;
}

module.exports = {
  attributes: {
    firstName: {
      type: "string",
    },
    lastName: {
      type: "string",
    },
    gender: {
      type: "string",
      isIn: ["male", "female", "other", "unknown"],
    },
    phoneNumber: {
      type: "string",
    },
    messageService: {
      type: "string",
      required: false,
    },
    emailAddress: {
      type: "string",
      isEmail: true,
    },
    inviteToken: {
      type: "string",
    },
    expertToken: {
      type: "string",
    },
    status: {
      type: "string",
      isIn: ["PENDING", "SENT", "ACCEPTED", "COMPLETE", "REFUSED", "CANCELED"],
      defaultsTo: "SENT",
    },
    queue: {
      model: "queue",
    },
    scheduledFor: {
      type: "number",
    },
    // the doctor who sent the invite
    doctor: {
      model: "user",
      required: false,
    },
    type: {
      type: "string",
      isIn: ["GUEST", "PATIENT", "TRANSLATOR_REQUEST", "TRANSLATOR"],
    },
    patientInvite: {
      model: "publicInvite",
    },
    patientLanguage: {
      type: "string",
    },
    doctorLanguage: {
      type: "string",
    },
    translationOrganization: {
      model: "translationOrganization",
    },
    guestEmailAddress: {
      type: "string",
      isEmail: true,
    },
    guestPhoneNumber: {
      type: "string",
    },
    translator: {
      model: "user",
      required: false,
    },
    translatorRequestInvite: {
      model: "publicInvite",
      required: false,
    },
    translatorInvite: {
      model: "publicInvite",
      required: false,
    },
    guestInvite: {
      model: "publicInvite",
      required: false,
    },
    birthDate: {
      type: "string",
    },
    IMADTeam: {
      type: "string",
    },
    patientTZ: {
      type: "string",
    },
    metadata: {
      type: "json",
      required: false,
    },
  },
  customToJSON() {
    return _.omit(this, ["inviteToken", "expertToken"]);
  },
  async beforeCreate(obj, proceed) {
    obj.inviteToken = await generateToken();
    obj.expertToken = await generateToken();
    return proceed();
  },
  async beforeUpdate(valuesToSet, proceed) {
    console.log("beforeUpdate", valuesToSet);
    if (
      valuesToSet.scheduledFor &&
      !moment(valuesToSet.scheduledFor).isValid()
    ) {
      const err = new Error("ScheduledFor is not a valid date ");
      err.name = "INVALID_SCHEDULED_FOR";
      err.code = 400;

      return proceed(err);
    }
    if (
      valuesToSet.scheduledFor &&
      new Date(valuesToSet.scheduledFor) < new Date()
    ) {
      const err = new Error("Consultation Time cannot be in the past ");
      err.name = "INVALID_SCHEDULED_FOR";
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
          .local(doctorLangCode)
          .format("D MMMM YYYY HH:mm zz")
      : "";
    const nowDate = moment().local(doctorLangCode).format("D MMMM YYYY");
    const doctorLanguage = sails._t(doctorLangCode, doctorLangCode);
    const patientLanguage = sails._t(doctorLangCode, invite.patientLanguage);
    const doctorName =
      (invite.doctor.firstName || "") + " " + (invite.doctor.lastName || "");

    return sails.helpers.email.with({
      to: email,
      subject: sails._t(doctorLangCode, "translation request email subject", {
        doctorLanguage,
        patientLanguage,
        branding: process.env.BRANDING,
      }),
      text: invite.scheduledFor
        ? sails._t(doctorLangCode, "scheduled translation request email", {
            doctorLanguage,
            patientLanguage,
            inviteTime,
            url,
            branding: process.env.BRANDIN,
            doctorName,
          })
        : sails._t(doctorLangCode, "translation request email", {
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
      (invite.doctor.firstName || "") + " " + (invite.doctor.lastName || "");

    return sails.helpers.email.with({
      to: email,
      subject: sails._t(doctorLang, "translator login link email subject", {
        url,
        branding: process.env.BRANDING,
        doctorName,
      }),
      text: sails._t(doctorLang, "translator login link email", {
        url,
        doctorName,
      }),
    });
  },

  async expireTranslatorRequest(job) {
    const { invite } = job.attrs.data;
    const translatorRequestInvite = await PublicInvite.findOne({
      type: "TRANSLATOR_REQUEST",
      id: invite.id,
    })
      .populate("doctor")
      .populate("patientInvite")
      .populate("translationOrganization");
    if (translatorRequestInvite.status === "SENT") {
      await PublicInvite.updateOne({
        type: "TRANSLATOR_REQUEST",
        id: invite.id,
      }).set({ status: "REFUSED" });
      await PublicInvite.updateOne({
        id: translatorRequestInvite.patientInvite.id,
      }).set({ status: "CANCELED" });

      if (translatorRequestInvite.patientInvite.guestInvite) {
        await PublicInvite.updateOne({
          id: translatorRequestInvite.patientInvite.guestInvite,
        }).set({ status: "CANCELED" });
      }

      if (translatorRequestInvite.doctor.email) {
        const docLocale =
          translatorRequestInvite.doctor.preferredLanguage ||
          process.env.DEFAULT_DOCTOR_LOCALE;
        await sails.helpers.email.with({
          to: translatorRequestInvite.doctor.email,
          subject: sails._t(docLocale, "translation request refused subject"),
          text: sails._t(docLocale, "translation request refused body", {
            branding: process.env.BRANDING,
          }),
        });
      }
    }
  },

  async setTranslatorRequestTimer(invite) {
    await sails.helpers.schedule.with({
      name: "TRANSLATOR_REQUEST_EXPIRE",
      data: { invite },
      time: new Date(Date.now() + TRANSLATOR_REQUEST_TIMEOUT),
    });
  },

  async sendPatientInvite(invite, resend = false) {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const locale = invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;
    const inviteTime = invite.scheduledFor
      ? moment(invite.scheduledFor)
          .tz(invite.patientTZ || moment.tz.guess())
          .locale(locale)
          .format("D MMMM HH:mm zz")
      : "";
    const doctorName = invite.doctor
      ? (invite.doctor.firstName || "") + " " + (invite.doctor.lastName || "")
      : "";
    const message =
      invite.scheduledFor && invite.scheduledFor > Date.now()
        ? sails._t(locale, "scheduled patient invite", {
            inviteTime,
            testingUrl,
            branding: process.env.BRANDING,
            doctorName,
          })
        : sails._t(locale, "patient invite", {
            url,
            branding: process.env.BRANDING,
            doctorName,
          });
    // don't send invite if there is a translator required
    if (invite.emailAddress && (!invite.scheduledFor || resend)) {
      try {
        await sails.helpers.email.with({
          to: invite.emailAddress,
          subject: sails._t(locale, "your consultation link", {
            url,
            branding: process.env.BRANDING,
            doctorName,
          }),
          text: message,
        });
      } catch (error) {
        console.log("error Sending patient invite email", error);
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
          console.log("ERROR SENDING SMS>>>>>>>> ", error);
          return Promise.reject(error);
        }
      } else {
        if (invite.messageService === '1') {
          try {
            await sails.helpers.sms.with({
              phoneNumber: invite.phoneNumber,
              message,
              senderEmail: invite?.doctor?.email,
              whatsApp: true,
            });
          } catch (error) {
            console.log("ERROR SENDING SMS>>>>>>>> ", error);
            return Promise.reject(error);
          }
        }
      }

    }
  },

  async findBy(args) {
    return  PublicInvite.find(args);
  },

  async sendGuestInvite(invite) {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const locale = invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;
    const inviteTime = invite.scheduledFor
      ? moment(invite.scheduledFor)
          .tz(invite.patientTZ || moment.tz.guess())
          .locale(locale)
          .format("D MMMM HH:mm zz")
      : "";
    const doctorName =
      (invite.doctor.firstName || "") + " " + (invite.doctor.lastName || "");

    const message =
      invite.scheduledFor && invite.scheduledFor > Date.now()
        ? sails._t(locale, "scheduled guest invite", {
            inviteTime,
            testingUrl,
            branding: process.env.BRANDING,
            doctorName,
          })
        : sails._t(locale, "guest invite", {
            url,
            branding: process.env.BRANDING,
            doctorName,
          });
    // don't send invite if there is a translator required
    if (invite.emailAddress) {
      try {
        await sails.helpers.email.with({
          to: invite.emailAddress,
          subject: sails._t(locale, "your consultation link", {
            url,
            branding: process.env.BRANDING,
            doctorName,
          }),
          text: message,
        });
      } catch (error) {
        console.log("error Sending guest invite email", error);
        if (!invite.phoneNumber) {
          // await PublicInvite.destroyOne({ id: invite.id });
          return Promise.reject(error);
        }
      }
    }

    if (invite.phoneNumber) {
      try {
        await sails.helpers.sms.with({
          phoneNumber: invite.phoneNumber,
          message,
          senderEmail: invite.doctor?.email,
          whatsApp: false,
        });
      } catch (error) {
        console.log("ERROR SENDING SMS>>>>>>>> ", error);
        // await PublicInvite.destroyOne({ id: invite.id });
        return Promise.reject(error);
      }
    }
  },

  getReminderMessage(invite) {
    const url = `${process.env.PUBLIC_URL}/inv/?invite=${invite.inviteToken}`;
    const locale = invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;
    const inviteTime = moment(invite.scheduledFor)
      .tz(invite.patientTZ || moment.tz.guess())
      .locale(locale)
      .format("D MMMM HH:mm zz");
    const doctorName =
      (invite.doctor.firstName || "") + " " + (invite.doctor.lastName || "");

    const firstReminderMessage =
      invite.type === "PATIENT"
        ? sails._t(locale, "first invite reminder", {
            inviteTime,
            branding: process.env.BRANDING,
            doctorName,
          })
        : sails._t(locale, "first guest invite reminder", {
            inviteTime,
            branding: process.env.BRANDING,
            doctorName,
          });

    const secondReminderMessage =
      invite.type === "PATIENT"
        ? sails._t(locale, "second invite reminder", { url, doctorName })
        : sails._t(locale, "second guest invite reminder", { url, doctorName });

    return {
      firstReminderMessage,
      secondReminderMessage,
    };
  },

  async createAndSendICS(invite) {
    const locale = invite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;
    const inviteTime = moment(invite.scheduledFor);
    const doctorName =
      (invite.doctor.firstName || "") + " " + (invite.doctor.lastName || "");

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
        title: sails._t(locale, "consultation branding", {
          branding: process.env.BRANDING,
        }),
        description: "",
        location: "",
        organizer: {
          name: invite.doctor?.firstName + " " + invite.doctor?.lastName,
          email: invite.doctor?.email,
        },
      };

      console.log("Creating ICS event...");
      ics.createEvent(event, async (error, value) => {
        // const filePath = 'assets/event.ics';
        // Save the .ics file data to disk
        // fs.writeFileSync(filePath, value);

        if (error) {
          console.error("Error creating ICS event:", error);
          return;
        }

        console.log("ICS event created successfully. Sending email...");
        await sails.helpers.email.with({
          to: invite.emailAddress,
          subject: sails._t(locale, "consultation branding", {
            branding: process.env.BRANDING,
          }),
          text: sails._t(locale, "scheduled patient invite", {
            inviteTime,
            testingUrl,
            branding: process.env.BRANDING,
            doctorName,
          }),
          attachments: [
            {
              filename: "consultation.ics",
              content: Buffer.from(value),
            },
          ],
        });

        console.log("Email sent successfully.");
      });
    } catch (err) {
      console.error("An error occurred:", err);
    }
  },

  async setPatientOrGuestInviteReminders(invite) {
    const currentTime = Date.now();
    const timeUntilScheduled = invite.scheduledFor - currentTime;

    if (timeUntilScheduled > TRANSLATOR_REQUEST_TIMEOUT) {
      if (invite.phoneNumber) {
        if (timeUntilScheduled > FIRST_INVITE_REMINDER) {
          await sails.helpers.schedule.with({
            name: "FIRST_INVITE_REMINDER_SMS",
            data: { invite },
            time: new Date(invite.scheduledFor - FIRST_INVITE_REMINDER),
          });
        }
      }

      if (invite.emailAddress) {
        if (timeUntilScheduled > FIRST_INVITE_REMINDER) {
          await sails.helpers.schedule.with({
            name: "FIRST_INVITE_REMINDER_EMAIL",
            data: { invite },
            time: new Date(invite.scheduledFor - FIRST_INVITE_REMINDER),
          });
        }
      }
    }

    if (invite.phoneNumber) {
      if (timeUntilScheduled > SECOND_INVITE_REMINDER) {
        await sails.helpers.schedule.with({
          name: "SECOND_INVITE_REMINDER_SMS",
          data: { invite },
          time: new Date(invite.scheduledFor - SECOND_INVITE_REMINDER),
        });
      }
    }

    if (invite.emailAddress) {
      if (timeUntilScheduled > SECOND_INVITE_REMINDER) {
        await sails.helpers.schedule.with({
          name: "SECOND_INVITE_REMINDER_EMAIL",
          data: { invite },
          time: new Date(invite.scheduledFor - SECOND_INVITE_REMINDER),
        });
      }
    }
  },

  async destroyPatientInvite(invite) {
    const db = Consultation.getDatastore().manager;
    const userCollection = db.collection("user");

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
      .populate("doctor")
      .populate("patientInvite")
      .populate("translationOrganization");

    await PublicInvite.updateOne({
      type: "TRANSLATOR_REQUEST",
      id: translatorRequestInvite.id,
    }).set({ status: "REFUSED" });
    await PublicInvite.updateOne({
      id: translatorRequestInvite.patientInvite.id,
    }).set({ status: "CANCELED" });

    if (translatorRequestInvite.patientInvite.guestInvite) {
      await PublicInvite.updateOne({
        id: translatorRequestInvite.patientInvite.guestInvite,
      }).set({ status: "CANCELED" });
    }

    if (translatorRequestInvite.doctor.email) {
      const docLocale =
        translatorRequestInvite.doctor.preferredLanguage ||
        process.env.DEFAULT_DOCTOR_LOCALE;
      await sails.helpers.email.with({
        to: translatorRequestInvite.doctor.email,
        subject: sails._t(docLocale, "translation request refused subject"),
        text: sails._t(docLocale, "translation request refused body", {
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
      guestEmailAddress: "",
      guestPhoneNumber: "",
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

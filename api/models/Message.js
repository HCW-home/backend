/**
 * Message.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
const RINGING_TIMEOUT = 5 * 60 * 1000;
const CALL_DURATION_TIMEOUT = 2 * 60 * 60 * 1000;
module.exports = {
  attributes: {
    //  ╔═╗╦═╗╦╔╦╗╦╔╦╗╦╦  ╦╔═╗╔═╗
    //  ╠═╝╠╦╝║║║║║ ║ ║╚╗╔╝║╣ ╚═╗
    //  ╩  ╩╚═╩╩ ╩╩ ╩ ╩ ╚╝ ╚═╝╚═╝

    //  ╔═╗╔╦╗╔╗ ╔═╗╔╦╗╔═╗
    //  ║╣ ║║║╠╩╗║╣  ║║╚═╗
    //  ╚═╝╩ ╩╚═╝╚═╝═╩╝╚═╝

    //  ╔═╗╔═╗╔═╗╔═╗╔═╗╦╔═╗╔╦╗╦╔═╗╔╗╔╔═╗
    //  ╠═╣╚═╗╚═╗║ ║║  ║╠═╣ ║ ║║ ║║║║╚═╗
    //  ╩ ╩╚═╝╚═╝╚═╝╚═╝╩╩ ╩ ╩ ╩╚═╝╝╚╝╚═╝

    from: {
      model: "user",
    },
    to: {
      model: "user",
    },
    text: {
      type: "string",
    },
    consultation: {
      model: "consultation",
      required: true,
    },
    read: {
      type: "boolean",
      // default:false
    },
    type: {
      type: "string",
      isIn: ["attachment", "text", "videoCall", "audioCall"],
    },
    mimeType: {
      type: "string",
    },
    fileName: {
      type: "string",
    },
    filePath: {
      type: "string",
    },
    acceptedAt: {
      type: "number",
    },
    closedAt: {
      type: "number",
    },
    isConferenceCall: {
      type: "boolean",
    },
    currentParticipants: {
      collection: "user",
    },
    participants: {
      collection: "user",
    },
    status: {
      type: "string",
      isIn: ["ringing", "ongoing", "ended"],
    },
    openViduURL: {
      type: "string",
    },
    mediasoupURL: {
      type: "string",
    },
  },
  async endCall(message, consultation, reason) {
    console.log("End call");
    await Message.updateOne({
      id: message.id,
      consultation: consultation.id,
    }).set({
      closedAt: new Date(),
      status: "ended",
    });

    const consultationParticipants =
      await Consultation.getConsultationParticipants(consultation);

    consultationParticipants.forEach((participant) => {
      sails.sockets.broadcast(participant, "endCall", {
        data: {
          reason,
          consultation,
          message,
        },
      });
    });
  },
  async afterCreate(message, proceed) {
    const consultation = await Consultation.findOne({
      id: message.consultation,
    });

    const user = await User.findOne({
      id: message.from,
    });

    const toUser = await User.findOne({
      id: message.to,
    });

    let roomNames = [message.to || consultation.queue || consultation.doctor, ...consultation.experts]
    if (user.role === 'expert') {
      roomNames = consultation.experts.filter((expert) => expert !== user.id);
      roomNames.push(consultation.doctor);
      roomNames.push(consultation.owner);
    }

    sails.sockets.broadcast(
      roomNames,
      "newMessage",
      { data: { ...message, from: user } },
    );

    if (message.type === "audioCall" || message.type === "videoCall") {
      sails.sockets.broadcast(message.from, "newMessage", { data: message });
      await sails.helpers.schedule.with({
        name: "RINGING_TIMEOUT",
        data: { message, consultation },
        time: new Date(Date.now() + RINGING_TIMEOUT),
      });

      await sails.helpers.schedule.with({
        name: "DURATION_TIMEOUT",
        data: { message },
        time: new Date(Date.now() + CALL_DURATION_TIMEOUT),
      });
    }

    const publicInvite = await PublicInvite.findOne({
      inviteToken: consultation.invitationToken,
    });

    if (publicInvite) {
      const url = `${process.env.PUBLIC_URL}/inv/?invite=${publicInvite.inviteToken}`;
      if ((user.role === sails.config.globals.ROLE_ADMIN || user.role === sails.config.globals.ROLE_DOCTOR) && publicInvite.emailAddress && !consultation.flagPatientOnline && !consultation.flagPatientNotified) {
        await PublicInvite.updateOne({ inviteToken: consultation.invitationToken }).set({ status: "SENT" });

        const locale = publicInvite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;
        await sails.helpers.email.with({
          to: publicInvite.emailAddress,
          subject: sails._t(locale, "notification for offline action subject", { branding: process.env.BRANDING }),
          text: sails._t(locale, "notification for offline action text", { url })
        });

        await Consultation.updateOne({ id: consultation.id }).set({ flagPatientNotified: true });
      }

      if ((user.role === sails.config.globals.ROLE_NURSE || user.role === sails.config.globals.ROLE_PATIENT) && !consultation.flagDoctorOnline) {
        const doctorLang = publicInvite.doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE;

        if (toUser.email) {
          await sails.helpers.email.with({
            to: toUser.email,
            subject: sails._t(doctorLang, "notification for offline action subject", { branding: process.env.BRANDING }),
            text: sails._t(doctorLang, "notification for offline action text", { url })
          });

          await Consultation.updateOne({ id: consultation.id }).set({ flagDoctorNotified: true });
        }

        if (toUser.enableNotif && toUser.notifPhoneNumber) {
          await sails.helpers.sms.with({
            phoneNumber: toUser.notifPhoneNumber,
            message: sails._t(doctorLang, "notification for offline action text", { url }),
          });

          await Consultation.updateOne({ id: consultation.id }).set({ flagDoctorNotified: true });
        }
      }
    }



    return proceed();
  },
};

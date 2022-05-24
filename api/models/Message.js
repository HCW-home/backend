/**
 * Message.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
const RINGING_TIMEOUT = 30 * 1000;
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
      Consultation.getConsultationParticipants(consultation);

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

    sails.sockets.broadcast(
      message.to || consultation.queue || consultation.doctor,
      "newMessage",
      { data: message }
    );

    if (message.type === "audioCall" || message.type === "videoCall") {
      sails.sockets.broadcast(message.from, "newMessage", { data: message });
      await sails.helpers.schedule.with({
        name: "RINGING_TIMEOUT",
        data: { message },
        time: new Date(Date.now() + RINGING_TIMEOUT),
        handler: async (job) => {
          const message = await Message.findOne({
            id: job.attrs.data.message.id,
          });
          if (message.status === "ringing") {
            Message.endCall(message, consultation, "RINGING_TIMEOUT");
          }
        },
      });

      await sails.helpers.schedule.with({
        name: "DURATION_TIMEOUT",
        data: { message },
        time: new Date(Date.now() + CALL_DURATION_TIMEOUT),
        handler: async (job) => {
          const message = await Message.findOne({
            id: job.attrs.data.message.id,
          });
          if (message.status !== "ended") {
            Message.endCall(message, consultation, "DURATION_TIMEOUT");
          }
        },
      });
    }

    return proceed();
  },
};

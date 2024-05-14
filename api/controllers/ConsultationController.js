/**
 * ConsultationController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */
const { ObjectId } = require('mongodb');
const fs = require("fs");
const path = require("path");
const json2csv = require('@json2csv/plainjs');
const jwt = require("jsonwebtoken");
const uuid = require("uuid");
const fileType = require("file-type");

const _ = require("@sailshq/lodash");
const validator = require("validator");

const db = Consultation.getDatastore().manager;

module.exports = {
  async consultationOverview(req, res) {
    let match = [
      {
        owner: new ObjectId(req.user.id),
      },
    ];
    if (req.user && req.user.role === "doctor") {
      match = [
        {
          acceptedBy: new ObjectId(req.user.id),
        },
        {
          doctor: new ObjectId(req.user.id),
          queue: null,
        },
      ];
    }

    if (req.user && req.user.role === "translator") {
      match = [{ translator: ObjectId(req.user.id) }];
    }

    if (req.user && req.user.role === "guest") {
      match = [{ guest: ObjectId(req.user.id) }];
    }

    if (req.user && req.user.role === "expert") {
      match = [{ experts: req.user.id }];
    }

    if (req.user && req.user.role === "admin") {
      match = [
        {
          acceptedBy: new ObjectId(req.user.id),
        },
        {
          doctor: new ObjectId(req.user.id),
        },
      ];
    }

    if (req.user.viewAllQueues) {
      const queues = (await Queue.find({})).map(
        (queue) => new ObjectId(queue.id)
      );
      match.push({
        status: "pending",
        queue: { $in: queues },
      });
    }
    // filter the queue of the user
    else if (req.user.allowedQueues && req.user.allowedQueues.length > 0) {
      const queues = req.user.allowedQueues.map(
        (queue) => new ObjectId(queue.id)
      );

      match.push({
        status: "pending",
        queue: { $in: queues },
      });
    }

    const agg = [
      {
        $match: {
          $or: match,
        },
      },
      {
        $project: {
          invitationToken: 0,
        },
      },
      {
        $project: {
          consultation: "$$ROOT",
        },
      },
      {
        $lookup: {
          from: "message",
          localField: "_id",
          foreignField: "consultation",
          as: "messages",
        },
      },
      {
        $project: {
          consultation: 1,
          lastMsg: {
            $arrayElemAt: ["$messages", -1],
          },

          messages: 1,
        },
      },
      {
        $project: {
          consultation: 1,
          lastMsg: 1,
          messages: {
            $filter: {
              input: "$messages",
              as: "msg",
              cond: {
                $and: [
                  {
                    $eq: ["$$msg.read", false],
                  },
                  {
                    $or: [
                      {
                        $eq: ["$$msg.to", new ObjectId(req.user.id)],
                      },
                      {
                        $eq: ["$$msg.to", null],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          consultation: 1,
          lastMsg: 1,
          unreadCount: {
            $size: "$messages",
          },
        },
      },
      {
        $lookup: {
          from: "user",
          localField: "consultation.owner",
          foreignField: "_id",
          as: "nurse",
        },
      },
      {
        $lookup: {
          from: "queue",
          localField: "consultation.queue",
          foreignField: "_id",
          as: "queue",
        },
      },
      {
        $lookup: {
          from: "user",
          localField: "consultation.acceptedBy",
          foreignField: "_id",
          as: "doctor",
        },
      },
      {
        $lookup: {
          from: "user",
          localField: "consultation.translator",
          foreignField: "_id",
          as: "translator",
        },
      },
      {
        $lookup: {
          from: "user",
          localField: "consultation.guest",
          foreignField: "_id",
          as: "guest",
        },
      },
      {
        $project: {
          guest: {
            phoneNumber: -1,
            email: -1,
          },
          translator: {
            firstName: -1,
            email: -1,
            direct: -1,
          },
          consultation: 1,
          lastMsg: 1,
          unreadCount: 1,
          doctor: {
            $arrayElemAt: ["$doctor", 0],
          },
          nurse: {
            $arrayElemAt: ["$nurse", 0],
          },
          queue: {
            $arrayElemAt: ["$queue", 0],
          },
        },
      },
      {
        $project: {
          consultation: 1,
          lastMsg: 1,
          unreadCount: 1,
          "doctor.firstName": 1,
          "doctor.lastName": 1,
          "doctor.phoneNumber": 1,
          "nurse.firstName": 1,
          "nurse.lastName": 1,
          "queue.name": 1,
          guest: {
            $arrayElemAt: ["$guest", 0],
          },
          translator: {
            $arrayElemAt: ["$translator", 0],
          },
        },
      },
      {
        $skip: parseInt(req.query.skip) || 0,
      },
      {
        $limit: parseInt(req.query.limit) || 500,
      },
    ];

    const consultationCollection = db.collection("consultation");
    const results = await consultationCollection.aggregate(agg);
    const data = await results.toArray();

    for (const index in data) {
      const item = data[index];
      if (item.consultation.experts.length) {
        const experts = await User.find({
          id: { in: item.consultation.experts },
        });
        data[index].consultation.experts = experts;
      }
    }

    res.json(data);
  },

  async create(req, res) {
    const consultationJson = req.body;
    const { user } = req;
    let invite;
    // if user is guest or translator

    if (user.role === "guest" || user.role === "translator") {
      if (!req.body.invitationToken) {
        return res.status(200).send(null);
      }
      const subInvite = await PublicInvite.findOne({
        inviteToken: req.body.invitationToken,
      });
      if (!subInvite) {
        return res.status(400).send();
      }

      invite = await PublicInvite.findOne({ id: subInvite.patientInvite });

      if (!invite) {
        return res.status(400).send();
      }

      // if the patient invite has contact details
      if (invite.emailAddress || invite.phoneNumber) {
        return res.status(200).send(null);
      }
      req.body.invitationToken = invite.inviteToken;
    }
    if (req.body.invitationToken) {
      // find patient invite

      if (!invite) {
        invite = await PublicInvite.findOne({
          or: [
            { inviteToken: req.body.invitationToken },
            { expertToken: req.body.invitationToken },
          ],
        });
      }

      // If a consultation already exist, another one should not be created
      const existingConsultation = await Consultation.findOne({
        invitationToken: req.body.invitationToken,
      });
      if (existingConsultation) {
        return res.json(existingConsultation);
      }

      const isExpert = invite.expertToken === req.body.invitationToken;
      if (invite && isExpert) {
        Consultation.update({ invitationToken: invite.inviteToken }, {})
          .fetch()
          .then((consultation) => {
            res.json(consultation[0]);
          });
        return;
      }

      if (invite) {
        if (invite.scheduledFor) {
          if (invite.scheduledFor - Date.now() > 10 * 60 * 1000) {
            console.log("cant create consultation yet");
            return res
              .status(401)
              .json({ success: false, message: "Too early for consultation" });
          }
        }

        consultationJson.firstName = invite.firstName
          ? invite.firstName
          : "No firstname";
        consultationJson.lastName = invite.lastName
          ? invite.lastName
          : "No lastname";
        consultationJson.gender = invite.gender ? invite.gender : "unknown";
        consultationJson.queue = invite.queue;
        consultationJson.doctor = invite.doctor;
        consultationJson.invite = invite.id;
        consultationJson.invitedBy = invite.invitedBy;

        consultationJson.metadata = invite.metadata; //! we pass the metadata from the invite to the consultation
        consultationJson.IMADTeam = invite.IMADTeam || "none";
        consultationJson.birthDate = invite.birthDate;
        consultationJson.expertInvitationURL = `${process.env.PUBLIC_URL}/inv/?invite=${invite.expertToken}`;
      }
    }

    if (invite) {
      // get translator and guest invites under this invite (guest / translator)
      const subInvites = await PublicInvite.find({ patientInvite: invite.id });

      if (subInvites.length) {
        // get users created by these invites (guest / translator)
        const guest = await User.findOne({
          inviteToken: { in: subInvites.map((i) => i.id) },
          role: "guest",
        });
        const translator = await User.findOne({
          inviteToken: { in: subInvites.map((i) => i.id) },
          role: "translator",
        });

        if (guest) {
          consultationJson.guest = guest.id;
        }
        if (translator) {
          consultationJson.translator = translator.id;
        }
      }
    }

    if (req.user && req.user.role === sails.config.globals.ROLE_NURSE) {
      const inviteData = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        queue: req.body.queue,
        gender: req.body.gender,
        inviteToken: req.body.invitationToken,
        expertToken: req.body.expertInvitationURL,
      };
      const newInvite = await PublicInvite.create(inviteData).fetch();
      consultationJson.id = newInvite.id;
      consultationJson.invitationToken = newInvite.inviteToken;
      consultationJson.expertInvitationURL = `${process.env.PUBLIC_URL}/inv/?invite=${newInvite.expertToken}`;
    }

    Consultation.create(consultationJson)
      .fetch()
      .then(async (consultation) => {
        await Consultation.changeOnlineStatus(req.user, true);
        if (!req.body.invitationToken && process.env.DEFAULT_QUEUE_ID) {
          await Consultation.sendPatientReadyToQueue(
            consultation,
            process.env.DEFAULT_QUEUE_ID
          );
        } else if (!req.body.invitationToken && consultation.queue) {
          await Consultation.sendPatientReadyToQueue(
            consultation,
            consultation.queue
          );
        } else {
          if (invite && invite.queue && !invite.doctor) {
            await Consultation.sendPatientReadyToQueue(
              consultation,
              invite.queue
            );
          } else if (invite?.doctor) {
            const doctor = await User.findOne({ id: invite.doctor });
            await Consultation.sendPatientReadyToDoctor(consultation, doctor);
          }
        }

        res.json(consultation);
      })
      .catch((err) => {
        console.log("ERROR WHILE CREATING CONSULTATION", err);
        const error = err && err.cause ? err.cause : err;
        res.status(400).json(error);
      });
  },

  async acceptConsultation(req, res) {
    const consultation = await Consultation.updateOne({
      id: req.params.consultation,
      status: "pending",
    }).set({
      status: "active",
      acceptedBy: req.user.id,
      acceptedAt: new Date(),
    });

    if (!consultation) {
      return res.notFound();
    }

    (await Consultation.getConsultationParticipants(consultation)).forEach(
      (participant) => {
        sails.sockets.broadcast(participant, "consultationAccepted", {
          data: {
            consultation,
            _id: consultation.id,
            doctor: {
              firstName: req.user.firstName,
              lastName: req.user.lastName,
              phoneNumber: req.user.phoneNumber ? req.user.phoneNumber : "",
            },
          },
        });
      }
    );

    return res.status(200).json({
      message: "success",
    });
  },

  async closeConsultation(req, res) {
    try {
      const consultation = await Consultation.findOne({
        id: req.params.consultation,
      });
      if (!consultation || consultation.status !== "active") {
        const anonymousConsultation = await AnonymousConsultation.find({
          consultationId: req.params.consultation,
        });
        if (anonymousConsultation) {
          return res.status(200).json(anonymousConsultation);
        } else {
          return res.notFound();
        }
      }

      // end any ongoing calls
      const selector = {
        consultation: req.params.consultation,
        type: { in: ["videoCall", "audioCall"] },
        status: { in: ["ringing", "ongoing"] },
      };

      const [call] = await Message.find({
        where: selector,
        sort: [{ createdAt: "DESC" }],
      }).limit(1);

      if (call) {
        await Message.endCall(call, consultation, "CONSULTATION_CLOSED");
      }
      await Consultation.closeConsultation(consultation);

      return res.status(200).json(consultation);
    } catch (error) {
      sails.log("error ", error);
    }
  },

  async testCall(req, res) {
    try {
      const mediasoupServers = await sails.helpers.getMediasoupServers();
      const serverIndex = Math.floor(Math.random() * mediasoupServers.length);
      const mediasoupServer = mediasoupServers[serverIndex];
      const roomIdPeerId = "test_" + uuid.v4();
      const token = await sails.helpers.getMediasoupToken.with({
        roomId: roomIdPeerId,
        peerId: roomIdPeerId,
        server: mediasoupServer,
      });
      return res.json({ token, peerId: roomIdPeerId });
    } catch (err) {
      return res
        .status(400)
        .json({ error: "An error occurred", details: err.message });
    }
  },

  async call(req, res) {
    try {
      const mediasoupServers = await sails.helpers.getMediasoupServers();

      const serverIndex = Math.floor(Math.random() * mediasoupServers.length);

      const mediasoupServer = mediasoupServers[serverIndex];

      const consultation = await Consultation.findOne({
        _id: req.params.consultation,
      });

      const callerToken = await sails.helpers.getMediasoupToken.with({
        roomId: consultation.id,
        peerId: req.user.id,
        server: mediasoupServer,
      });

      const calleeId =
        req.user.id === consultation.owner
          ? consultation.acceptedBy
          : consultation.owner;

      const patientToken = await sails.helpers.getMediasoupToken.with({
        roomId: consultation.id,
        peerId: calleeId,
        server: mediasoupServer,
      });

      // the current user
      const user = await User.findOne({
        id: req.user.id,
      });

      console.log("Callee id", calleeId);

      if (!consultation.firstCallAt) {
        await Consultation.updateOne({
          id: consultation.id,
        }).set({
          firstCallAt: new Date(),
        });
      }
      // create a new message
      const msg = await Message.create({
        type: req.query.audioOnly === "true" ? "audioCall" : "videoCall",
        consultation: req.params.consultation,
        from: req.user.id,
        to: calleeId,
        participants: [req.user.id],
        isConferenceCall: !!(
          consultation.translator ||
          consultation.guest ||
          consultation.experts?.length
        ),
        status: "ringing",
        mediasoupURL: mediasoupServer.url,
      }).fetch();

      await Message.addToCollection(msg.id, "participants", req.user.id);
      await Message.addToCollection(msg.id, "currentParticipants", req.user.id);

      const patientMsg = Object.assign({}, msg);
      patientMsg.token = patientToken;

      const publicInvite = await PublicInvite.findOne({
        inviteToken: consultation.invitationToken,
      });

      const toUser = await User.findOne({
        id: calleeId,
      });

      if (
        publicInvite &&
        !consultation.flagPatientOnline &&
        !consultation.flagPatientNotified
      ) {
        await PublicInvite.updateOne({
          inviteToken: consultation.invitationToken,
        }).set({ status: "SENT" });

        const url = `${process.env.PUBLIC_URL}/inv/?invite=${publicInvite.inviteToken}`;
        const locale =
          publicInvite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;

        if (
          toUser &&
          toUser.email &&
          toUser.role === sails.config.globals.ROLE_NURSE
        ) {
          await sails.helpers.email.with({
            to: toUser.email,
            subject: sails._t(
              locale,
              "notification for offline action subject",
              { branding: process.env.BRANDING }
            ),
            text: sails._t(
              locale,
              "notification for offline action text for nurse"
            ),
          });

          await Consultation.updateOne({ id: consultation.id }).set({
            flagPatientNotified: true,
          });
        } else if (publicInvite.email) {
          await sails.helpers.email.with({
            to: publicInvite.emailAddress,
            subject: sails._t(
              locale,
              "notification for offline action subject",
              { branding: process.env.BRANDING }
            ),
            text: sails._t(locale, "notification for offline action text", {
              url,
            }),
          });

          await Consultation.updateOne({ id: consultation.id }).set({
            flagPatientNotified: true,
          });
        }

        if (
          toUser &&
          toUser.phoneNumber &&
          toUser.role === sails.config.globals.ROLE_NURSE
        ) {
          await sails.helpers.sms.with({
            phoneNumber: toUser.phoneNumber,
            message: sails._t(
              locale,
              "notification for offline action text for nurse"
            ),
            senderEmail: publicInvite?.doctor?.email,
          });

          await Consultation.updateOne({ id: consultation.id }).set({
            flagPatientNotified: true,
          });
        } else if (publicInvite.phoneNumber) {
          await sails.helpers.sms.with({
            phoneNumber: publicInvite.phoneNumber,
            message: sails._t(locale, "notification for offline action text", {
              url,
            }),
            senderEmail: publicInvite?.doctor?.email,
          });

          await Consultation.updateOne({ id: consultation.id }).set({
            flagPatientNotified: true,
          });
        }
      }

      console.log("SEND CALL TO", calleeId);
      sails.sockets.broadcast(calleeId, "newCall", {
        data: {
          consultation: req.params.consultation,
          token: patientToken,
          id: req.params.consultation,
          user: {
            firstName: user.firstName,
            lastName: user.lastName,
          },
          audioOnly: req.query.audioOnly === "true",
          msg: patientMsg,
        },
      });

      if (consultation.translator) {
        const translatorToken = await sails.helpers.getMediasoupToken.with({
          roomId: consultation.id,
          peerId: consultation.translator,
          server: mediasoupServer,
        });
        const translatorMsg = Object.assign({}, msg);
        translatorMsg.token = translatorToken;

        sails.sockets.broadcast(consultation.translator, "newCall", {
          data: {
            consultation: req.params.consultation,
            token: translatorToken,
            id: req.params.consultation,
            audioOnly: req.query.audioOnly === "true",
            msg: translatorMsg,
          },
        });
      }

      if (consultation.experts.length) {
        for (let expert of consultation.experts) {
          const expertToken = await sails.helpers.getMediasoupToken.with({
            roomId: consultation.id,
            peerId: expert,
            server: mediasoupServer,
          });
          const expertMsg = Object.assign({}, msg);
          expertMsg.token = expertToken;

          sails.sockets.broadcast(expert, "newCall", {
            data: {
              consultation: req.params.consultation,
              token: expertToken,
              id: req.params.consultation,
              audioOnly: req.query.audioOnly === "true",
              msg: expertMsg,
            },
          });
        }
      }

      if (consultation.guest) {
        const guestToken = await sails.helpers.getMediasoupToken.with({
          roomId: consultation.id,
          peerId: consultation.guest,
          server: mediasoupServer,
        });
        const guestMsg = Object.assign({}, msg);
        guestMsg.token = guestToken;

        sails.sockets.broadcast(consultation.guest, "newCall", {
          data: {
            consultation: req.params.consultation,
            token: guestToken,
            id: req.params.consultation,
            audioOnly: req.query.audioOnly === "true",
            msg: guestMsg,
          },
        });
      }

      msg.token = callerToken;
      return res.json({
        token: callerToken,
        id: req.params.consultation,
        msg,
      });
    } catch (error) {
      console.error(error);
      return res
        .status(400)
        .json({ error: "An error occurred", details: error.message });
    }
  },

  async rejectCall(req, res) {
    try {
      const consultation = await Consultation.findOne({
        _id: req.params.consultation,
      });

      const message = await Message.findOne({
        id: req.params.message,
      }).populate("currentParticipants");

      // if conference remove them from participants
      if (message.isConferenceCall || consultation.experts?.length) {
        if (!message.currentParticipants.length || message.status === "ended") {
          return res.json({
            status: 200,
          });
        }

        await Message.removeFromCollection(
          message.id,
          "currentParticipants",
          req.user.id
        );
        // if this is the last participant end the call and destroy the session
        const isParticipant = message.currentParticipants.find(
          (p) => p.id === req.user.id
        );

        if (req.user.role === "doctor" && isParticipant) {
          await Message.endCall(message, consultation, "DOCTOR_LEFT");
        }
        // and set closed at
        else if (message.currentParticipants.length <= 2 && isParticipant) {
          await Message.endCall(message, consultation, "MEMBERS_LEFT");
        }

        return res.json({
          status: 200,
        });
      }

      await Message.updateOne({
        id: req.params.message,
        consultation: req.params.consultation,
      }).set({
        closedAt: new Date(),
      });

      await Message.endCall(message, consultation, "MEMBERS_LEFT");

      sails.sockets.broadcast(consultation.acceptedBy, "rejectCall", {
        data: {
          consultation,
          message,
        },
      });

      sails.sockets.broadcast(consultation.owner, "rejectCall", {
        data: {
          consultation,
          message,
        },
      });

      res.json({
        status: 200,
      });
    } catch (error) {
      return res.json(error);
    }
  },

  async acceptCall(req, res) {
    try {
      const consultation = await Consultation.findOne({
        _id: req.params.consultation,
      });

      const message = await Message.findOne({ id: req.params.message })
        .populate("currentParticipants")
        .populate("participants");

      // add them once to the participants list
      if (!message.participants.find((p) => p.id === req.user.id)) {
        await Message.addToCollection(
          req.params.message,
          "participants",
          req.user.id
        );
      }
      // if conference remove them from participants
      if (message.isConferenceCall) {
        await Message.addToCollection(
          req.params.message,
          "currentParticipants",
          req.user.id
        );

        // if message doesn't have accepted At add it and set status to ongoing
        if (!message.acceptAt) {
          await Message.updateOne({
            _id: req.params.message,
            consultation: req.params.consultation,
          }).set({
            acceptedAt: new Date(),
            status: "ongoing",
          });
        }
        return res.json({
          status: 200,
        });
      }
      await Message.updateOne({
        _id: req.params.message,
        consultation: req.params.consultation,
      }).set({
        acceptedAt: new Date(),
        status: "ongoing",
      });

      sails.sockets.broadcast(consultation.acceptedBy, "acceptCall", {
        data: {
          consultation,
          message,
        },
      });

      sails.sockets.broadcast(consultation.owner, "acceptCall", {
        data: {
          consultation,
          message,
        },
      });

      res.json({
        status: 200,
      });
    } catch (error) {
      return res.json(error);
    }
  },

  uploadFile(req, res) {
    const fileId = uuid.v4();
    const { locale } = req.headers || {};

    req.file("attachment").upload(
      {
        dirname: sails.config.globals.attachmentsDir,
        saveAs: function (__newFileStream, cb) {
          const fileExtension = __newFileStream.filename.split(".").pop();
          const filePath = `${req.params.consultation}_${fileId}.${fileExtension}`;
          cb(null, filePath);
        },
      },
      async function whenDone(err, uploadedFiles) {
        if (err) {
          if (err.code === "E_EXCEEDS_UPLOAD_LIMIT") {
            return res.status(413).send(sails._t(locale, "max file size"));
          }
          return res.status(500).send(err);
        }
        if (!uploadedFiles.length) {
          return res.status(400).send(sails._t(locale, "no file"));
        }

        const uploadedFile = uploadedFiles[0];
        const buffer = fs.readFileSync(uploadedFile.fd);
        const type = await fileType.fromBuffer(buffer);
        const extraMimeTypes = sails.config.globals.EXTRA_MIME_TYPES;
        const defaultMimeTypes = sails.config.globals.DEFAULT_MIME_TYPES;
        const allowedMimeTypes =
          extraMimeTypes && extraMimeTypes.length > 0
            ? extraMimeTypes
            : defaultMimeTypes;

        if (!allowedMimeTypes.includes(type?.mime)) {
          fs.unlinkSync(uploadedFile.fd);
          return res.status(400).send(sails._t(locale, "invalid file type"));
        }

        const filePath = `${
          req.params.consultation
        }_${fileId}.${uploadedFile.filename.split(".").pop()}`;

        try {
          if (process.env.NODE_ENV !== "development") {
            const { isInfected } =
              await sails.config.globals.clamscan.isInfected(uploadedFile.fd);
            if (isInfected) {
              fs.unlinkSync(uploadedFile.fd);
              return res
                .status(400)
                .send(new Error(sails._t(locale, "infected file")));
            }
          }

          const message = await Message.create({
            type: "attachment",
            mimeType: uploadedFile.type,
            fileName: uploadedFile.filename,
            filePath,
            consultation: req.params.consultation,
            to: req.body.to || null,
            from: req.user.id,
          }).fetch();

          return res.ok({ message });
        } catch (error) {
          sails.log("Error processing file upload: ", error);
          try {
            fs.unlinkSync(uploadedFile.fd);
          } catch (deleteError) {
            sails.log("Error deleting file: ", deleteError);
          }

          return res.serverError();
        }
      }
    );
  },

  async attachment(req, res) {
    const attachment = validator.escape(req.params.attachment).trim();
    const msg = await Message.findOne({
      id: attachment,
    });

    if (!msg.mimeType.startsWith("audio")) {
      res.setHeader(
        "Content-disposition",
        `attachment; filename=${msg.fileName}`
      );
      // res.setHeader(
      //   "content-type",
      //   "application/pdf"
      // );
    }
    const filePath = `${sails.config.globals.attachmentsDir}/${msg.filePath}`;

    if (!fs.existsSync(filePath)) {
      return res.notFound();
    }
    const readStream = fs.createReadStream(filePath);

    readStream.pipe(res);
  },

  async patientFeedback(req, res) {
    try {
      await Consultation.updateOne({
        id: req.body.consultationId,
      }).set({
        patientRating: req.body.rating || "",
        patientComment: req.body.comment,
      });
      await AnonymousConsultation.updateOne({
        consultationId: req.body.consultationId,
      }).set({
        patientRating: req.body.rating || "",
        patientComment: req.body.comment,
      });
      res.json({ status: 200 });
    } catch (error) {
      return res.status(500).json(error);
    }
  },

  async doctorFeedback(req, res) {
    try {
      await Consultation.updateOne({
        id: req.body.consultationId,
      }).set({
        doctorRating: req.body.rating || "",
        doctorComment: req.body.comment,
      });
      await AnonymousConsultation.updateOne({
        consultationId: req.body.consultationId,
      }).set({
        doctorRating: req.body.rating || "",
        doctorComment: req.body.comment,
      });
      res.json({ status: 200 });
    } catch (error) {
      return res.status(500).json(error);
    }
  },

  async consultationsCSV(req, res) {
    try {
      const consultations = await AnonymousConsultation.find()
        .populate("acceptedBy")
        .populate("queue")
        .populate("owner");
      const mappedConsultations = consultations.map(
        Consultation.getConsultationReport
      );

      const fields = Consultation.columns.map((c) => c.colName);
      const opts = { fields };
      const parser = new json2csv.Parser();
      const csv = parser.parse(mappedConsultations, opts);

      res.setHeader('Content-Disposition', 'attachment; filename="consultations_summary.csv"');
      res.setHeader('Content-Type', 'text/csv');
      res.send(csv);
    } catch (err) {
      console.error(err);
      res.status(500).send('Error generating CSV file');
    }
  },

  async getCurrentCall(req, res) {
    const selector = {
      consultation: req.params.consultation,
      type: { in: ["videoCall", "audioCall"] },
      status: { in: ["ringing", "ongoing"] },
    };

    const [call] = await Message.find({
      where: selector,
      sort: [{ createdAt: "DESC" }],
    }).limit(1);

    let mediasoupServer;
    if (call) {
      [mediasoupServer] = await MediasoupServer.find({
        url: call.mediasoupURL,
      }).limit(1);
      if (!mediasoupServer) {
        if (call.mediasoupURL === process.env.MEDIASOUP_URL) {
          mediasoupServer = {
            url: process.env.MEDIASOUP_URL,
            password: process.env.MEDIASOUP_SECRET,
            username: process.env.MEDIASOUP_USER,
          };
        } else {
          return res.status(500).send();
        }
      }

      const token = await sails.helpers.getMediasoupToken.with({
        roomId: req.params.consultation,
        peerId: req.user.id,
        server: mediasoupServer,
      });

      call.token = token;
    }
    res.status(200).json(call);
  },

  async getConsultationFromToken(req, res) {
    const tokenString = req.query.token;

    if (!tokenString) {
      return res.status(400).json({
        message: "invalidUrl",
      });
    }

    try {
      const token = await Token.findOne({ token: tokenString });

      if (!token) {
        return res.status(400).json({
          message: "tokenExpired",
        });
      }

      const consultationId = token.value;

      const consultation = await Consultation.findOne({ id: consultationId });
      if (!consultation) {
        return res.status(400).json({
          message: "invalidUrl",
        });
      }
      const queue = await Queue.findOne({ id: consultation.queue });
      return res
        .status(200)
        .json({ id: consultation.id, status: consultation.status, queue });
    } catch (error) {
      return res
        .status(500)
        .json({ success: false, message: "Something went wrong" });
    }
  },

  async planConsultation(req, res) {
    const { delay } = req.body;

    if (!delay || delay > 60 || delay < 0) {
      return res.status(400).json({
        message: "invalidDelay",
      });
    }

    if (!req.body.token) {
      return res.status(400).json({
        message: "invalidUrl",
      });
    }
    try {
      const token = await Token.findOne({ token: req.body.token });

      if (!token) {
        return res.status(400).json({
          message: "tokenExpired",
        });
      }

      const consultationId = token.value;

      let consultation = await Consultation.findOne({
        id: consultationId,
      }).populate("invite");
      if (!consultation) {
        return res.status(400).json({
          message: "invalidUrl",
        });
      }
      if (consultation.status !== "pending") {
        return res.status(400).json({
          message: "alreadyStarted",
        });
      }

      const doctor = await User.findOne({ id: token.user });
      if (!doctor) {
        return res.status(400).json({
          message: "invalidUrl",
        });
      }

      await Consultation.updateOne({
        id: consultationId,
        status: "pending",
      }).set({
        status: "active",
        acceptedBy: token.user,
        acceptedAt: new Date(),
        consultationEstimatedAt: new Date(new Date().getTime() + delay * 60000),
      });

      consultation = await Consultation.findOne({
        id: consultationId,
      }).populate("invite");

      (await Consultation.getConsultationParticipants(consultation)).forEach(
        (participant) => {
          sails.sockets.broadcast(participant, "consultationAccepted", {
            data: {
              consultation,
              _id: consultation.id,
              doctor: {
                firstName: doctor.firstName,
                lastName: doctor.lastName,
                phoneNumber: doctor.phoneNumber ? doctor.phoneNumber : "",
              },
            },
          });
        }
      );

      const patientLanguage =
        consultation.invite && consultation.invite.patientLanguage
          ? consultation.invite.patientLanguage
          : process.env.DEFAULT_PATIENT_LOCALE;
      const doctorDelayMsg = sails._t(
        patientLanguage,
        "doctor delay in minutes",
        { delay, patientLanguage, branding: process.env.BRANDING }
      );

      const message = await Message.create({
        text: doctorDelayMsg,
        consultation: consultationId,
        type: "text",
        to: consultation.owner,
      }).fetch();
      await Message.afterCreate(message, (err, message) => {});

      return res.status(200).json({
        message: "success",
      });
    } catch (error) {
      return res
        .status(500)
        .json({ success: false, message: "Something went wrong" });
    }
  },
};

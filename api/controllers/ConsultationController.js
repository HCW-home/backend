const { ObjectId } = require('mongodb');
const fs = require('fs');
const json2csv = require('@json2csv/plainjs');
const uuid = require('uuid');
const fileType = require('file-type');
const path = require('path');

const validator = require('validator');
const { escapeHtml } = require('../utils/helpers');

const db = Consultation.getDatastore().manager;

module.exports = {

  async consultationOverview(req, res) {
    try {
      let match = [
        {
          owner: new ObjectId(req.user.id),
        },
      ];
      if (req.user && req.user.role === 'doctor') {
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

      if (req.user && req.user.role === 'translator') {
        match = [{ translator: new ObjectId(req.user.id) }];
      }

      if (req.user && req.user.role === 'guest') {
        match = [{ guest: new ObjectId(req.user.id) }];
      }

      if (req.user && req.user.role === 'expert') {
        match = [{ experts: req.user.id }];
      }

      if (req.user && req.user.role === 'admin') {
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
          status: 'pending',
          queue: { $in: queues },
        });
      } else if (req.user.allowedQueues && req.user.allowedQueues.length > 0) {
        const queues = req.user.allowedQueues.map(
          (queue) => new ObjectId(queue.id)
        );

        match.push({
          status: 'pending',
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
            consultation: '$$ROOT',
          },
        },
        {
          $lookup: {
            from: 'message',
            localField: '_id',
            foreignField: 'consultation',
            as: 'messages',
          },
        },
        {
          $project: {
            consultation: 1,
            lastMsg: {
              $arrayElemAt: ['$messages', -1],
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
                input: '$messages',
                as: 'msg',
                cond: {
                  $and: [
                    {
                      $eq: ['$$msg.read', false],
                    },
                    {
                      $or: [
                        {
                          $eq: ['$$msg.to', new ObjectId(req.user.id)],
                        },
                        {
                          $eq: ['$$msg.to', null],
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
              $size: '$messages',
            },
          },
        },
        {
          $lookup: {
            from: 'user',
            localField: 'consultation.owner',
            foreignField: '_id',
            as: 'nurse',
          },
        },
        {
          $lookup: {
            from: 'queue',
            localField: 'consultation.queue',
            foreignField: '_id',
            as: 'queue',
          },
        },
        {
          $lookup: {
            from: 'user',
            localField: 'consultation.acceptedBy',
            foreignField: '_id',
            as: 'doctor',
          },
        },
        {
          $lookup: {
            from: 'user',
            localField: 'consultation.translator',
            foreignField: '_id',
            as: 'translator',
          },
        },
        {
          $lookup: {
            from: 'user',
            localField: 'consultation.guest',
            foreignField: '_id',
            as: 'guest',
          },
        },
        {
          $lookup: {
            from: 'publicinvite',
            localField: 'consultation.guestInvite',
            foreignField: '_id',
            as: 'guestInvite',
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
              $arrayElemAt: ['$doctor', 0],
            },
            nurse: {
              $arrayElemAt: ['$nurse', 0],
            },
            queue: {
              $arrayElemAt: ['$queue', 0],
            },
            guestInvite: {
              $arrayElemAt: ['$guestInvite', 0],
            },
          },
        },
        {
          $project: {
            consultation: 1,
            lastMsg: 1,
            unreadCount: 1,
            'doctor.firstName': 1,
            'doctor.lastName': 1,
            'doctor.phoneNumber': 1,
            'nurse.firstName': 1,
            'nurse.lastName': 1,
            'queue': 1,
            guestInvite: 1,
            guest: {
              $arrayElemAt: ['$guest', 0],
            },
            translator: {
              $arrayElemAt: ['$translator', 0],
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

      sails.config.customLogger.log('info', 'Running consultation overview aggregation', null, 'message', req.user?.id);

      const consultationCollection = db.collection('consultation');
      const results = await consultationCollection.aggregate(agg);
      const data = await results.toArray();

      sails.config.customLogger.log('info', `Aggregation completed resultCount is ${data.length}`, null, 'message', req.user?.id);

      for (const index in data) {
        const item = data[index];
        if (item.consultation.experts.length) {
          const experts = await User.find({
            id: { in: item.consultation.experts },
          });
          data[index].consultation.experts = experts;
          sails.config.customLogger.log('verbose', `Processed experts for consultation ${item.consultation.id} expertCount ${experts.length}`, null, 'message', req.user?.id);
        }
      }

      res.json(data);
    } catch (err) {
      sails.config.customLogger.log('error', 'Error in consultationOverview', { error: err?.message || err }, 'server-action', req.user?.id);
      return res.serverError(err);

    }
  },

  async create(req, res) {
    try {
      const consultationJson = req.body;
      const { user } = req;
      let invite;

      if (user.role === 'guest' || user.role === 'translator') {
        if (!req.body.invitationToken) {
          sails.config.customLogger.log('info', `No invitationToken provided for guest/translator userId ${user.id}`, null, 'message', user.id);
          return res.status(200).send(null);
        }

        const subInvite = await PublicInvite.findOne({
          inviteToken: escapeHtml(req.body.invitationToken),
        });
        if (!subInvite) {
          sails.config.customLogger.log('warn', `Sub-invite not found token ${req.body.invitationToken}`, null, 'message', user.id);
          return res.status(400).send();
        }

        invite = await PublicInvite.findOne({ id: subInvite.patientInvite });
        if (!invite) {
          sails.config.customLogger.log('warn', `Invite not found for sub-invite ${subInvite.id}`, null, 'message', user.id);
          return res.status(400).send();
        }

        if (invite.emailAddress || invite.phoneNumber) {
          sails.config.customLogger.log('info', `Invite contains emailAddress/phoneNumber, consultation not created invite id ${invite.id}`, null, 'message', user.id);
          return res.status(200).send(null);
        }
        req.body.invitationToken = invite.inviteToken;
      }

      if (req.body.invitationToken) {
        if (!invite) {
          const sanitizedToken = escapeHtml(req.body.invitationToken);
          invite = await PublicInvite.findOne({
            or: [
              { inviteToken: sanitizedToken },
              { expertToken: sanitizedToken },
            ],
          });
        }

        const existingConsultation = await Consultation.findOne({
          invitationToken: req.body.invitationToken,
        });
        if (existingConsultation) {
          sails.config.customLogger.log('verbose', `Existing consultation found with invitationToken ${req.body.invitationToken} consultationId ${existingConsultation.id}`, null, 'message', user.id);
          return res.json(existingConsultation);
        }

        const isExpert = invite.expertToken === req.body.invitationToken;
        if (invite && isExpert) {
          Consultation.update({ invitationToken: invite.inviteToken }, {})
            .fetch()
            .then((consultation) => {
              sails.config.customLogger.log('info', `Returning consultation update for expert invite ${invite.inviteToken} consultation ${consultation?.[0]?.id}`, null, 'server-action', user?.id);
              res.json(consultation[0]);
            });
          return;
        }

        if (invite) {
          if (invite.scheduledFor && (invite.scheduledFor - Date.now() > 10 * 60 * 1000)) {
            sails.config.customLogger.log('warn', `Attempt to create consultation too early inviteId ${invite.id} scheduledFor ${invite.scheduledFor}`, null, 'message', user?.id);
            return res.status(401).json({ success: false, message: 'Too early for consultation' });
          }

          consultationJson.firstName = invite.firstName ? invite.firstName : 'No firstname';
          consultationJson.lastName = invite.lastName ? invite.lastName : 'No lastname';
          consultationJson.gender = invite.gender ? invite.gender : 'unknown';
          consultationJson.queue = invite.queue;
          consultationJson.doctor = invite.doctor;
          consultationJson.invite = invite.id;
          consultationJson.invitedBy = invite.invitedBy;
          consultationJson.metadata = invite.metadata; // Pass metadata from the invite to the consultation
          consultationJson.IMADTeam = invite.IMADTeam || 'none';
          consultationJson.birthDate = invite.birthDate;
          consultationJson.expertInvitationURL = `${process.env.PUBLIC_URL}/inv/?invite=${invite.expertToken}`;
        }
      }

      if (invite) {
        const subInvites = await PublicInvite.find({ patientInvite: invite.id });
        if (subInvites.length) {
          const guest = await User.findOne({
            inviteToken: { in: subInvites.map((i) => i.id) },
            role: 'guest',
          });
          const guestInvite = subInvites.find((i) => i.type === 'GUEST');
          const translatorInvite = subInvites.find((i) => i.type === 'TRANSLATOR');
          const translator = await User.findOne({
            inviteToken: { in: subInvites.map((i) => i.id) },
            role: 'translator',
          });

          if (guest) {
            consultationJson.guest = guest.id;
          }
          if (guestInvite) {
            consultationJson.guestInvite = guestInvite.id;
          }
          if (translator) {
            consultationJson.translator = translator.id;
          }
          if (translatorInvite) {
            consultationJson.translatorInvite = translatorInvite.id;
          }
          sails.config.customLogger.log('info', `Processed sub-invites for consultation creation inviteId ${invite.id}`, null, 'message', user?.id);
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
        sails.config.customLogger.log('info', `New invite created by nurse ${newInvite.id}`, null, 'server-action');
      }

      const newConsultation = await Consultation.create(consultationJson).fetch();
      sails.config.customLogger.log('info', `Consultation created ${newConsultation.id}`, null, 'server-action', user?.id);

      await Consultation.changeOnlineStatus(req.user, true);

      if (!req.body.invitationToken && process.env.DEFAULT_QUEUE_ID) {
        await Consultation.sendPatientReadyToQueue(newConsultation, process.env.DEFAULT_QUEUE_ID);
        sails.config.customLogger.log('info', `Patient ready notification sent to default queue consultationId ${newConsultation.id} queueId ${process.env.DEFAULT_QUEUE_ID}`, null, 'server-action', user?.id);
      } else if (!req.body.invitationToken && newConsultation.queue) {
        await Consultation.sendPatientReadyToQueue(newConsultation, newConsultation.queue);
        sails.config.customLogger.log('info', `Patient ready notification sent to consultation queue consultationId ${newConsultation.id} queueId ${newConsultation.queue}`, null, 'server-action', user?.id);
      } else {
        if (invite && invite.queue && !invite.doctor) {
          await Consultation.sendPatientReadyToQueue(newConsultation, invite.queue);
          sails.config.customLogger.log('info', `Patient ready notification sent based on invite queue consultationId ${newConsultation.id} queueId ${invite.queue}`, null, 'server-action', user?.id);
        } else if (invite?.doctor) {
          const doctor = await User.findOne({ id: invite.doctor });
          await Consultation.sendPatientReadyToDoctor(newConsultation, doctor);
          sails.config.customLogger.log('info', `Patient ready notification sent to doctor based on invite consultationId ${newConsultation.id} doctorId ${doctor.id}`, null, 'server-action', user?.id);
        }
      }

      return res.json(newConsultation);
    } catch (err) {
      sails.config.customLogger.log('error', 'Error while creating consultation', { error: err?.message || err }, 'server-action', req.user?.id);
      const error = err && err.cause ? err.cause : err;
      return res.status(400).json(error);
    }
  },

  async acceptConsultation(req, res) {
    try {
      const consultation = await Consultation.updateOne({
        id: req.params.consultation,
        status: 'pending'
      }).set({
        status: 'active',
        acceptedBy: req.user.id,
        acceptedAt: new Date()
      });

      if (!consultation) {
        sails.config.customLogger.log('warn', `Consultation with id ${req.params.consultation} not found or not pending`, null, 'message', req.user.id);
        return res.notFound();
      }

      sails.config.customLogger.log('info', `Consultation ${consultation.id} accepted by doctor ${req.user.id}`, null, 'server-action', req.user.id);

      const participants = await Consultation.getConsultationParticipants(consultation);
      participants.forEach((participant) => {
        sails.sockets.broadcast(participant, 'consultationAccepted', {
          data: {
            consultation,
            _id: consultation.id,
            doctor: {
              firstName: req.user.firstName,
              lastName: req.user.lastName,
              phoneNumber: req.user.phoneNumber ? req.user.phoneNumber : ''
            }
          }
        });
        sails.config.customLogger.log('info', `Broadcast consultationAccepted event to participant ${participant} consultationId ${consultation.id}`, null, 'server-action', req.user.id);
      });

      return res.status(200).json({
        message: 'success'
      });
    } catch (err) {
      sails.config.customLogger.log('error', 'Error accepting consultation', { consultationId: req.params.consultation, error: err?.message || err }, 'server-action', req.user?.id);
      return res.serverError({ error: 'Error accepting consultation' });
    }
  },

  async closeConsultation(req, res) {
    try {
      const { user } = req;
      const consultation = await Consultation.findOne({ id: req.params.consultation });
      if (!consultation || consultation.status !== 'active') {
        sails.config.customLogger.log('warn', `Consultation ${req.params.consultation} not found or not active for closure`, null, 'message', user?.id);
        const anonymousConsultation = await AnonymousConsultation.find({ consultationId: req.params.consultation });
        if (anonymousConsultation) {
          sails.config.customLogger.log('info', `Returning anonymous consultation data consultationId ${req.params.consultation}`, null, 'server-action', user?.id);
          return res.status(200).json(anonymousConsultation);
        } else {
          sails.config.customLogger.log('warn', `Anonymous consultation with id ${req.params.consultation} not found`, null, 'message', user?.id);
          return res.notFound();
        }
      }

      const selector = {
        consultation: req.params.consultation,
        type: { in: ['videoCall', 'audioCall'] },
        status: { in: ['ringing', 'ongoing'] },
      };

      sails.config.customLogger.log('info', `Searching for ongoing calls for ${req.params.consultation}`, null, 'message', user?.id);
      const [call] = await Message.find({
        where: selector,
        sort: [{ createdAt: 'DESC' }],
      }).limit(1);

      if (call) {
        sails.config.customLogger.log('info', `Ongoing call found, ending call callId ${call.id} consultationId ${req.params.consultation}`, null, 'server-action', user?.id);
        await Message.endCall(call, consultation, 'CONSULTATION_CLOSED');
      } else {
        sails.config.customLogger.log('info', `No ongoing call found for consultation ${req.params.consultation}`, null, 'server-action', user?.id);
      }

      await Consultation.closeConsultation(consultation);
      sails.config.customLogger.log('info', `Consultation ${consultation.id} closed successfully`, null, 'server-action', user?.id);
      return res.status(200).json(consultation);
    } catch (error) {
      sails.config.customLogger.log('error', 'Error closing consultation', { consultationId: req.params.consultation, error: error?.message || error }, 'server-action', req.user?.id);
      return res.serverError({ error: 'Error closing consultation', details: error.message });
    }
  },

  async testCall(req, res) {
    try {
      const { user } = req;
      const mediasoupServers = await sails.helpers.getMediasoupServers();
      sails.config.customLogger.log('verbose', `Retrieved mediasoup servers serverCount is ${mediasoupServers.length}`, null, 'server-action', user?.id);

      const serverIndex = Math.floor(Math.random() * mediasoupServers.length);
      const mediasoupServer = mediasoupServers[serverIndex];
      sails.config.customLogger.log('info', 'Selected mediasoup server', null, 'server-action', user?.id);

      const roomIdPeerId = 'test_' + uuid.v4();
      sails.config.customLogger.log('info', `Generated roomIdPeerId ${roomIdPeerId}`, null, 'server-action', user?.id);

      const token = await sails.helpers.getMediasoupToken.with({
        roomId: roomIdPeerId,
        peerId: roomIdPeerId,
        server: mediasoupServer,
      });
      sails.config.customLogger.log('info', `Obtained mediasoup token for ${roomIdPeerId}`, null, 'server-action', user?.id);

      return res.json({ token, peerId: roomIdPeerId });
    } catch (err) {
      sails.config.customLogger.log('error', 'Error in testCall', { error: err?.message || err }, 'server-action', req.user?.id);
      return res.status(400).json({ error: 'An error occurred', details: err?.message }, 'server-action');
    }
  },

  async call(req, res) {
    try {
      const mediasoupServers = await sails.helpers.getMediasoupServers();
      sails.config.customLogger.log('verbose', `Retrieved mediasoup servers count is ${mediasoupServers.length}`, null, 'server-action', req.user?.id);
      const serverIndex = Math.floor(Math.random() * mediasoupServers.length);
      const mediasoupServer = mediasoupServers[serverIndex];
      sails.config.customLogger.log('info', `Selected mediasoup server ${mediasoupServer.url}`, null,'message', req.user?.id);
      const id = validator.escape(req.params.consultation);
      const consultation = await Consultation.findOne({ _id: id });
      if (!consultation) {
        sails.config.customLogger.log('warn', `Consultation with id ${id} not found`, null, 'message', req.user?.id);
        return res.notFound({ error: 'Consultation not found' });
      }
      sails.config.customLogger.log('info', `Consultation found ${consultation.id}`, null, 'message', req.user?.id);
      const callerToken = await sails.helpers.getMediasoupToken.with({
        roomId: consultation.id,
        peerId: req.user.id,
        server: mediasoupServer,
      });
      sails.config.customLogger.log('info', `Caller token generated consultationId ${consultation.id}, callerId ${req.user.id}`, null, 'server-action', req.user?.id);
      const calleeId = req.user.id === consultation.owner ? consultation.acceptedBy : consultation.owner;
      const patientToken = await sails.helpers.getMediasoupToken.with({
        roomId: consultation.id,
        peerId: calleeId,
        server: mediasoupServer,
      });
      sails.config.customLogger.log('info', `Patient token generated consultationId ${consultation.id} callerId ${calleeId}`, null, 'server-action', req.user?.id);
      const user = await User.findOne({ id: req.user.id });
      sails.config.customLogger.log('info', `Callee id determined ${calleeId}`, null, 'message', req.user?.id);
      if (!consultation.firstCallAt) {
        await Consultation.updateOne({ id: consultation.id }).set({ firstCallAt: new Date() });
        sails.config.customLogger.log('info', `Set firstCallAt for consultation ${consultation.id}`, null, 'server-action', req.user?.id);
      }
      const callType = req.query.audioOnly === 'true' ? 'audioCall' : 'videoCall';
      const msg = await Message.create({
        type: callType,
        consultation: req.params.consultation,
        from: req.user.id,
        to: calleeId,
        participants: [req.user.id],
        isConferenceCall: !!(consultation.translator || consultation.guest || (consultation.experts && consultation.experts.length)),
        status: 'ringing',
        mediasoupURL: mediasoupServer.url,
      }).fetch();
      sails.config.customLogger.log('info', `Call message created msgId ${msg.id} consultationId ${consultation.id}`, null, 'server-action', req.user?.id);
      await Message.addToCollection(msg.id, 'participants', req.user.id);
      await Message.addToCollection(msg.id, 'currentParticipants', req.user.id);
      const patientMsg = { ...msg, token: patientToken };
      const publicInvite = await PublicInvite.findOne({ inviteToken: consultation.invitationToken });
      const toUser = await User.findOne({ id: calleeId });
      if (publicInvite && !consultation.flagPatientOnline && !consultation.flagPatientNotified) {
        await PublicInvite.updateOne({ inviteToken: consultation.invitationToken }).set({ status: 'SENT' });
        const url = `${process.env.PUBLIC_URL}/inv/?invite=${publicInvite.inviteToken}`;
        const locale = publicInvite.patientLanguage || sails.config.globals.DEFAULT_PATIENT_LOCALE;
        if (toUser && toUser.email && toUser.role === sails.config.globals.ROLE_NURSE) {
          await sails.helpers.email.with({
            to: toUser.email,
            subject: sails._t(locale, 'notification for offline action subject', { branding: process.env.BRANDING }),
            text: sails._t(locale, 'notification for offline action text for nurse'),
          });
          await Consultation.updateOne({ id: consultation.id }).set({ flagPatientNotified: true });
        } else if (publicInvite.email) {
          await sails.helpers.email.with({
            to: publicInvite.emailAddress,
            subject: sails._t(locale, 'notification for offline action subject', { branding: process.env.BRANDING }),
            text: sails._t(locale, 'notification for offline action text', { url }),
          });
          await Consultation.updateOne({ id: consultation.id }).set({ flagPatientNotified: true });
        }
        if (toUser && toUser.phoneNumber && toUser.role === sails.config.globals.ROLE_NURSE) {
          await sails.helpers.sms.with({
            phoneNumber: toUser.phoneNumber,
            message: sails._t(locale, 'notification for offline action text for nurse'),
            senderEmail: publicInvite?.doctor?.email,
          });
          await Consultation.updateOne({ id: consultation.id }).set({ flagPatientNotified: true });
        } else if (publicInvite.phoneNumber) {
          await sails.helpers.sms.with({
            phoneNumber: publicInvite.phoneNumber,
            message: sails._t(locale, 'notification for offline action text', { url }),
            senderEmail: publicInvite?.doctor?.email,
          });
          await Consultation.updateOne({ id: consultation.id }).set({ flagPatientNotified: true });
        }
        sails.config.customLogger.log('info', `Offline notification sent to patient for consultation ${consultation.id}`, null, 'server-action', req.user?.id);
      }
      const hideCallerName = sails.config.globals.hideCallerName;
      sails.config.customLogger.log('info', `Broadcasting new call to caller ${calleeId}`, null, 'server-action', req.user?.id);
      sails.sockets.broadcast(calleeId, 'newCall', {
        data: {
          consultation: req.params.consultation,
          token: patientToken,
          id: req.params.consultation,
          user: hideCallerName
            ? { firstName: 'Anonymous', lastName: '' }
            : { firstName: user.firstName, lastName: user.lastName },
          audioOnly: req.query.audioOnly === 'true',
          msg: patientMsg,
        },
      });
      if (consultation.translator) {
        const translatorToken = await sails.helpers.getMediasoupToken.with({
          roomId: consultation.id,
          peerId: consultation.translator,
          server: mediasoupServer,
        });
        const translatorMsg = { ...msg, token: translatorToken };
        sails.config.customLogger.log('info', `Broadcasting new call to translator ${consultation.translator}`, null, 'server-action', req.user?.id);
        sails.sockets.broadcast(consultation.translator, 'newCall', {
          data: {
            consultation: req.params.consultation,
            token: translatorToken,
            id: req.params.consultation,
            audioOnly: req.query.audioOnly === 'true',
            msg: translatorMsg,
          },
        });
      }
      if (consultation.experts && consultation.experts.length) {
        for (let expert of consultation.experts) {
          const expertToken = await sails.helpers.getMediasoupToken.with({
            roomId: consultation.id,
            peerId: expert,
            server: mediasoupServer,
          });
          const expertMsg = { ...msg, token: expertToken };
          sails.config.customLogger.log('info', `Broadcasting new call to expert ${expert}`, null, 'server-action', req.user?.id);
          sails.sockets.broadcast(expert, 'newCall', {
            data: {
              consultation: req.params.consultation,
              token: expertToken,
              id: req.params.consultation,
              audioOnly: req.query.audioOnly === 'true',
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
        const guestMsg = { ...msg, token: guestToken };
        sails.config.customLogger.log('info', `Broadcasting new call to guest ${consultation.guest}`, null, 'server-action', req.user?.id);
        sails.sockets.broadcast(consultation.guest, 'newCall', {
          data: {
            consultation: req.params.consultation,
            token: guestToken,
            id: req.params.consultation,
            audioOnly: req.query.audioOnly === 'true',
            msg: guestMsg,
          },
        });
      }
      msg.token = callerToken;
      sails.config.customLogger.log('info', `Call setup completed consultationId ${consultation.id} callerId ${req.user.id}`, null, 'message', req.user?.id);
      return res.json({
        token: callerToken,
        id: validator.escape(req.params.consultation),
        msg,
      });
    } catch (error) {
      sails.config.customLogger.log('error', 'Error in call endpoint', { error: error?.message || error }, 'server-action', req.user?.id);
      return res.status(400).json({ error: 'An error occurred', details: error?.message });
    }
  },

  async rejectCall(req, res) {
    try {
      const consultation = await Consultation.findOne({ _id: req.params.consultation });
      const message = await Message.findOne({ id: req.params.message }).populate('currentParticipants');
      if (message.isConferenceCall || consultation.experts?.length) {
        if (!message.currentParticipants.length || message.status === 'ended') {
          sails.config.customLogger.log('info', `No active conference participants or call already ended messageId ${message.id}`,null, 'message', req.user?.id);
          return res.json({ status: 200 });
        }
        await Message.removeFromCollection(message.id, 'currentParticipants', req.user.id);
        const isParticipant = message.currentParticipants.find(p => p.id === req.user.id);
        if (req.user.role === 'doctor' && isParticipant) {
          await Message.endCall(message, consultation, 'DOCTOR_LEFT');
          sails.config.customLogger.log('info', `Call ended due to doctor leaving messageId ${message.id} doctorId ${req.user.id}`, null, 'server-action', req.user?.id);
        } else if (message.currentParticipants.length <= 2 && isParticipant) {
          await Message.endCall(message, consultation, 'MEMBERS_LEFT');
          sails.config.customLogger.log('info', `Call ended due to members leaving messageId ${message.id}`, null, 'server-action', req.user?.id);
        }
        return res.json({ status: 200 });
      }
      await Message.updateOne({ id: req.params.message, consultation: req.params.consultation }).set({ closedAt: new Date() });
      await Message.endCall(message, consultation, 'MEMBERS_LEFT');
      sails.sockets.broadcast(consultation.acceptedBy, 'rejectCall', { data: { consultation, message } });
      sails.sockets.broadcast(consultation.owner, 'rejectCall', { data: { consultation, message } });
      sails.config.customLogger.log('info', `Call rejection broadcast consultationId ${consultation.id} messageId ${message.id}`, null, 'serer-action', req.user?.id);
      return res.json({ status: 200 });
    } catch (error) {
      sails.config.customLogger.log('error', 'Error in rejectCall', { error: error?.message || error }, 'server-action', req.user?.id);
      return res.json(error);
    }
  },

  async acceptCall(req, res) {
    try {
      const consultation = await Consultation.findOne({ _id: req.params.consultation });
      const message = await Message.findOne({ id: req.params.message })
        .populate('currentParticipants')
        .populate('participants');
      if (!message.participants.find(p => p.id === req.user.id)) {
        await Message.addToCollection(req.params.message, 'participants', req.user.id);
      }
      if (message.isConferenceCall) {
        await Message.addToCollection(req.params.message, 'currentParticipants', req.user.id);
        if (!message.acceptAt) {
          await Message.updateOne({ _id: req.params.message, consultation: req.params.consultation }).set({
            acceptedAt: new Date(),
            status: 'ongoing',
          });
        }
        sails.config.customLogger.log('info', `Conference call accepted messageId ${req.params.message} userId ${req.user.id}`, null, 'user-action', req.user?.id);
        return res.json({ status: 200 });
      }
      await Message.updateOne({ _id: req.params.message, consultation: req.params.consultation }).set({
        acceptedAt: new Date(),
        status: 'ongoing',
      });
      sails.sockets.broadcast(consultation.acceptedBy, 'acceptCall', {
        data: { consultation, message },
      });
      sails.sockets.broadcast(consultation.owner, 'acceptCall', {
        data: { consultation, message },
      });
      sails.config.customLogger.log('info', `Call accepted broadcast for consultationId ${consultation.id} messageId ${message.id}`, null, 'server-action', req.user?.id);
      return res.json({ status: 200 });
    } catch (error) {
      sails.config.customLogger.log('error', 'Error in acceptCall', { error: error?.message || error }, 'server-action', req.user?.id);
      return res.json(error);
    }
  },

  uploadFile(req, res) {
    const fileId = uuid.v4();
    const locale = validator.escape(req.headers?.locale || 'en').trim();
    const sanitizedLocale = locale || 'en';

    req.file('attachment').upload(
      {
        dirname: sails.config.globals.attachmentsDir,
        saveAs: function(__newFileStream, cb) {
          const fileExtension = __newFileStream.filename.split('.').pop();
          const filePath = `${req.params.consultation}_${fileId}.${fileExtension}`;
          cb(null, filePath);
        },
      },
      async function whenDone(err, uploadedFiles) {
        if (err) {
          if (err.code === 'E_EXCEEDS_UPLOAD_LIMIT') {
            sails.config.customLogger.log('error', 'Upload error: exceeds upload limit', null, 'message', req.user?.id);
            return res.status(413).send(sails._t(sanitizedLocale, 'max file size'));
          }
          sails.config.customLogger.log('error', 'Upload error', { error: err?.message || err }, 'message', req.user?.id);
          return res.status(500).send(sails._t(sanitizedLocale, 'server error'));
        }
        if (!uploadedFiles.length) {
          sails.config.customLogger.log('info', 'No file uploaded', null, 'message', req.user?.id);
          return res.status(400).send(sails._t(sanitizedLocale, 'no file'));
        }

        const uploadedFile = uploadedFiles[0];
        let buffer;
        try {
          buffer = fs.readFileSync(uploadedFile.fd);
        } catch (readError) {
          sails.config.customLogger.log('error', 'Error reading uploaded file', { error: readError?.message || readError }, 'message', req.user?.id);
          return res.status(500).send(sails._t(sanitizedLocale, 'server error'));
        }
        const type = await fileType.fromBuffer(buffer);
        const extraMimeTypes = sails.config.globals.EXTRA_MIME_TYPES;
        const defaultMimeTypes = sails.config.globals.DEFAULT_MIME_TYPES;
        const allowedMimeTypes = extraMimeTypes && extraMimeTypes.length > 0
          ? extraMimeTypes
          : defaultMimeTypes;

        if (!allowedMimeTypes.includes(type?.mime)) {
          sails.config.customLogger.log('error', `Invalid file type mime ${type?.mime}`, null, 'message', req.user?.id);
          fs.unlinkSync(uploadedFile.fd);
          return res.status(400).send(sails._t(locale, 'invalid file type'));
        }

        const filePath = `${req.params.consultation}_${fileId}.${uploadedFile.filename.split('.').pop()}`;

        try {
          if (process.env.NODE_ENV !== 'development') {
            try {
              const { isInfected } = await sails.config.globals.clamscan.isInfected(uploadedFile.fd);
              if (isInfected) {
                sails.config.customLogger.log('error', `File is infected fileName ${uploadedFile?.filename}`, null, 'message', req.user?.id);
                fs.unlinkSync(uploadedFile.fd);
                return res.status(400).send(new Error(sails._t(locale, 'infected file')));
              }
            } catch (clamscanError) {
              sails.config.customLogger.log('error', 'Error during file virus scan', { error: clamscanError?.message || clamscanError }, 'server-action', req.user?.id);
              if (uploadedFile.id) {
                fs.unlinkSync(uploadedFile.fd);
              }
              return res.status(500).send(sails._t(locale, 'virus scan'));
            }
          }

          const message = await Message.create({
            type: 'attachment',
            mimeType: uploadedFile.type,
            fileName: uploadedFile.filename,
            filePath,
            consultation: req.params.consultation,
            to: req.body.to || null,
            from: req.user.id,
          }).fetch();

          sails.config.customLogger.log('info', `File uploaded and message created successfully messageId ${message.id}`, null, 'server-action', req.user?.id);
          return res.ok({ message });
        } catch (error) {
          sails.config.customLogger.log('error', 'Error processing file upload', { error: error?.message || error }, 'message', req.user?.id);
          try {
            fs.unlinkSync(uploadedFile.fd);
          } catch (deleteError) {
            sails.config.customLogger.log('error', 'Error deleting file', { error: deleteError?.message || deleteError }, 'message', req.user?.id);
          }
          return res.serverError();
        }
      }
    );
  },

  async attachment(req, res) {
    const attachment = validator.escape(req.params.attachment).trim();
    const msg = await Message.findOne({ id: attachment });
    if (!msg.mimeType.startsWith('audio')) {
      res.setHeader('Content-disposition', `attachment; filename=${msg.fileName}`);
    }
    const baseDir = sails.config.globals.attachmentsDir;

    const inputPath = msg.filePath;
    const resolvedPath = path.resolve(baseDir, inputPath);

    if (!resolvedPath.startsWith(baseDir)) {
      sails.config.customLogger.log('warn', `Path traversal attempt blocked: ${resolvedPath}`, null, 'message', req.user?.id);
      return res.forbidden({ message: 'Invalid file path' });
    }

    if (!fs.existsSync(resolvedPath)) {
      sails.config.customLogger.log('warn', `File not found in ${resolvedPath}`, null, 'message', req.user?.id);
      return res.notFound();
    }

    const filePath = resolvedPath;
    if (!fs.existsSync(filePath)) {
      sails.config.customLogger.log('warn', `File not found in ${filePath}`, null, 'message', req.user?.id);
      return res.notFound();
    }
    res.setHeader('Content-Type', msg.mimeType);
    const readStream = fs.createReadStream(filePath);
    readStream.on('error', (err) => {
      sails.config.customLogger.log('error', 'Error reading file', { error: err?.message || err }, 'server-action', req.user?.id);
      return res.serverError();
    });
    readStream.pipe(res);
  },

  async patientFeedback(req, res) {
    try {
      await Consultation.updateOne({ id: req.body.consultationId }).set({
        patientRating: req.body.rating || '',
        patientComment: req.body.comment,
      });
      await AnonymousConsultation.updateOne({ consultationId: req.body.consultationId }).set({
        patientRating: req.body.rating || '',
        patientComment: req.body.comment,
      });
      sails.config.customLogger.log('info', `Patient feedback updated for consultationId ${req.body.consultationId}`, null, 'server-action', req.user?.id);
      return res.json({ status: 200 });
    } catch (error) {
      sails.config.customLogger.log('error', 'Error updating patient feedback', { error: error?.message || error }, 'server-action', req.user?.id);
      return res.status(500).json(error);
    }
  },

  async doctorFeedback(req, res) {
    try {
      await Consultation.updateOne({ id: req.body.consultationId }).set({
        doctorRating: req.body.rating || '',
        doctorComment: req.body.comment,
      });
      await AnonymousConsultation.updateOne({ consultationId: req.body.consultationId }).set({
        doctorRating: req.body.rating || '',
        doctorComment: req.body.comment,
      });
      sails.config.customLogger.log('info', `Doctor feedback updated for consultationId ${req.body.consultationId}`, null, 'server-action', req.user?.id);
      return res.json({ status: 200 });
    } catch (error) {
      sails.config.customLogger.log('error', 'Error updating doctor feedback', { error: error?.message || error }, 'server-action', req.user?.id);
      return res.status(500).json(error);
    }
  },

  async consultationsCSV(req, res) {
    try {
      const consultations = await AnonymousConsultation.find()
        .populate('acceptedBy')
        .populate('queue')
        .populate('owner');
      sails.config.customLogger.log('info', `Fetched consultations for CSV export count ${consultations.length}`, null, 'server-action', req.user?.id);
      const mappedConsultations = consultations.map(Consultation.getConsultationReport);
      const fields = Consultation.columns.map(c => c.colName);
      const opts = { fields };
      const parser = new json2csv.Parser();
      const csv = parser.parse(mappedConsultations, opts);
      sails.config.customLogger.log('info', `CSV file generated recordCount ${mappedConsultations.length}`, null, 'message', req.user?.id);
      res.setHeader('Content-Disposition', 'attachment; filename="consultations_summary.csv"');
      res.setHeader('Content-Type', 'text/csv');
      return res.send(csv);
    } catch (err) {
      sails.config.customLogger.log('error', 'Error generating CSV file', { error: err?.message || err }, 'server-action', req.user?.id);
      return res.status(500).send('Error generating CSV file');
    }
  },

  async getCurrentCall(req, res) {
    try {
      const selector = {
        consultation: req.params.consultation,
        type: { in: ['videoCall', 'audioCall'] },
        status: { in: ['ringing', 'ongoing'] },
      };
      const [call] = await Message.find({ where: selector, sort: [{ createdAt: 'DESC' }] }).limit(1);
      let mediasoupServer;
      if (call) {
        [mediasoupServer] = await MediasoupServer.find({ url: call.mediasoupURL }).limit(1);
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
        call.token = await sails.helpers.getMediasoupToken.with({
          roomId: escapeHtml(req.params.consultation),
          peerId: req.user.id,
          server: mediasoupServer,
        });
      }
      return res.status(200).json(call);
    } catch (error) {
      return res.status(500).json({ error: 'An error occurred', details: error.message });
    }
  },

  async getConsultationFromToken(req, res) {
    let tokenString = req.query.token;
    if (!tokenString) {
      sails.config.customLogger.log('warn', 'Token missing in getConsultationFromToken', null, 'message', req.user?.id);
      return res.status(400).json({ message: 'invalidUrl' });
    }
    tokenString = escapeHtml(tokenString.trim());
    try {
      const token = await Token.findOne({ token: tokenString });
      if (!token) {
        sails.config.customLogger.log('warn', `Token not found or expired ${tokenString}`, null, 'message', req.user?.id);
        return res.status(400).json({ message: 'tokenExpired' });
      }
      const consultationId = token.value;
      const consultation = await Consultation.findOne({ id: consultationId });
      if (!consultation) {
        sails.config.customLogger.log('warn', `Consultation ${consultationId} not found for token`, null, 'message', req.user?.id);
        return res.status(400).json({ message: 'invalidUrl' });
      }
      const queue = await Queue.findOne({ id: consultation.queue });
      sails.config.customLogger.log('verbose', `Consultation ${consultationId} retrieved from token: queue ${ queue ? queue.id : null}`, null, 'server-action', req.user?.id);
      return res.status(200).json({ id: consultation.id, status: consultation.status, queue });
    } catch (error) {
      sails.config.customLogger.log('error', 'Error in getConsultationFromToken', { error: error?.message || error }, 'server-action', req.user?.id);
      return res.status(500).json({ success: false, message: 'Something went wrong' });
    }
  },

  async planConsultation(req, res) {
    const { delay } = req.body;
    if (!delay || delay > 60 || delay < 0) {
      return res.status(400).json({ message: 'invalidDelay' });
    }
    if (!req.body.token) {
      return res.status(400).json({ message: 'invalidUrl' });
    }
    try {
      const token = await Token.findOne({ token: req.body.token });
      if (!token) {
        sails.config.customLogger.log('warn', `Token ${req.body.token} not found or expired`, null, 'message', req.user?.id);
        return res.status(400).json({ message: 'tokenExpired' });
      }
      const consultationId = token.value;
      let consultation = await Consultation.findOne({ id: consultationId }).populate('invite');
      if (!consultation) {
        sails.config.customLogger.log('warn', `Consultation ${consultationId} not found for token`, null, 'message', req.user?.id);
        return res.status(400).json({ message: 'invalidUrl' });
      }
      if (consultation.status !== 'pending') {
        sails.config.customLogger.log('warn', `Consultation ${consultationId} already started`, null, 'message', req.user?.id);
        return res.status(400).json({ message: 'alreadyStarted' });
      }
      const doctor = await User.findOne({ id: token.user });
      if (!doctor) {
        sails.config.customLogger.log('warn', `Doctor not found for token ${token.user}`, null, 'message', req.user?.id);
        return res.status(400).json({ message: 'invalidUrl' });
      }
      await Consultation.updateOne({ id: consultationId, status: 'pending' }).set({
        status: 'active',
        acceptedBy: token.user,
        acceptedAt: new Date(),
        consultationEstimatedAt: new Date(new Date().getTime() + delay * 60000),
      });
      consultation = await Consultation.findOne({ id: consultationId }).populate('invite');
      const participants = await Consultation.getConsultationParticipants(consultation);
      participants.forEach((participant) => {
        sails.sockets.broadcast(participant, 'consultationAccepted', {
          data: {
            consultation,
            _id: consultation.id,
            doctor: {
              firstName: doctor.firstName,
              lastName: doctor.lastName,
              phoneNumber: doctor.phoneNumber ? doctor.phoneNumber : '',
            },
          },
        });
      });
      const patientLanguage =
        consultation.invite && consultation.invite.patientLanguage
          ? consultation.invite.patientLanguage
          : sails.config.globals.DEFAULT_PATIENT_LOCALE;
      const doctorDelayMsg = sails._t(patientLanguage, 'doctor delay in minutes', {
        delay,
        patientLanguage,
        branding: process.env.BRANDING,
      });
      const message = await Message.create({
        text: doctorDelayMsg,
        consultation: consultationId,
        type: 'text',
        to: consultation.owner,
        from: token.user,
      }).fetch();
      await Message.afterCreate(message, (err, message) => {});
      sails.config.customLogger.log('verbose', `Consultation ${consultationId} planned: delay ${delay} `, null, 'message', req.user?.id);
      return res.status(200).json({ message: 'success' });
    } catch (error) {
      sails.config.customLogger.log('error', 'Error in planConsultation', { error: error?.message || error }, 'server-action', req.user?.id);
      return res.status(500).json({ success: false, message: 'Something went wrong' });
    }
  }
};

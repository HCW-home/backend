const { ObjectId } = require('mongodb');
const _ = require('@sailshq/lodash');
const moment = require('moment');

const columns = [
  { colName: 'Invite sent at', key: 'inviteCreatedAt' },
  { colName: 'Consultation scheduled at', key: 'inviteScheduledFor' },
  { colName: 'Waiting queue', key: 'queue.name' },
  { colName: 'Patient jointed consultation at', key: 'consultationCreatedAt' },
  { colName: 'Consultation closed at', key: 'closedAt' },
  { colName: 'Total call with answer', key: 'successfulCallsCount' },
  { colName: 'Total call without answer', key: 'missedCallsCount' },
  { colName: 'Call average', key: 'averageCallDuration' },
  { colName: 'Satisfaction rate patient', key: 'patientRating' },
  { colName: 'Satisfaction message patient', key: 'patientComment' },
  { colName: 'Satisfaction rate caregiver', key: 'doctorRating' },
  { colName: 'Satisfaction message caregiver', key: 'doctorComment' },
  { colName: 'Department', key: 'acceptedBy.department' },
  { colName: 'Function', key: 'acceptedBy._function' },
  { colName: 'caregiver ID', key: 'acceptedBy.id' },
  {
    colName: 'Number of participant joined',
    key: 'numberOfEffectiveParticipants',
  },
  {
    colName: 'Number of participant expected',
    key: 'numberOfPlannedParticipants',
  },
  { colName: 'Languages', key: 'languages' },
  { colName: 'Translation organization', key: 'translationOrganization' },
  { colName: 'Translator name', key: 'interpreterName' },
  { colName: 'Handling estimated at', key: 'consultationEstimatedAt' },
  { colName: 'First call at', key: 'firstCallAt' },
];

module.exports = {
  attributes: {
    firstName: {
      type: 'string',
      required: true,
    },
    lastName: {
      type: 'string',
      required: true,
    },
    gender: {
      type: 'string',
      isIn: ['male', 'female', 'other', 'unknown'],
      required: true,
    },
    birthDate: {
      type: 'string',
    },
    IMADTeam: {
      type: 'string',
      required: true,
    },
    invitationToken: {
      type: 'string',
      required: false,
    },
    expertInvitationURL: {
      type: 'string',
      required: false,
    },
    flagPatientNotified: {
      type: 'boolean',
      required: false,
    },
    flagDoctorNotified: {
      type: 'boolean',
      required: false,
    },
    experts: {
      type: 'json',
      columnType: 'array',
      defaultsTo: [],
    },
    status: {
      type: 'string',
      isIn: ['pending', 'active', 'closed'],
      // default:'pending',
      required: true,
    },
    type: {
      type: 'string',
      isIn: ['PATIENT', 'GUEST', 'TRANSLATOR'],
    },
    queue: {
      model: 'queue',
      required: false,
    },
    acceptedBy: {
      model: 'user',
    },
    owner: {
      model: 'user',
      required: false,
    },
    invitedBy: {
      model: 'user',
    },
    translator: {
      model: 'user',
      required: false,
    },
    guestInvite: {
      model: 'publicInvite',
      required: false,
    },
    translatorInvite: {
      model: 'publicInvite',
      required: false,
    },
    guest: {
      model: 'user',
      required: false,
    },
    acceptedAt: {
      type: 'number',
    },
    closedAt: {
      type: 'number',
    },
    patientRating: {
      type: 'string',
      required: false,
    },
    patientComment: {
      type: 'string',
      required: false,
    },
    doctorRating: {
      type: 'string',
      required: false,
    },
    doctorComment: {
      type: 'string',
      required: false,
    },
    // the doctor who sent the invite
    doctor: {
      model: 'user',
      required: false,
    },
    invite: {
      model: 'PublicInvite',
      required: false,
    },
    flagPatientOnline: {
      type: 'boolean',
      required: false,
    },
    flagGuestOnline: {
      type: 'boolean',
      required: false,
    },

    flagTranslatorOnline: {
      type: 'boolean',
      required: false,
    },
    flagDoctorOnline: {
      type: 'boolean',
      required: false,
    },
    scheduledFor: {
      type: 'number',
    },
    consultationEstimatedAt: {
      type: 'number',
    },
    firstCallAt: {
      type: 'number',
    },
  },

  async beforeCreate(consultation, cb) {
    if (
      !consultation.queue &&
      !consultation.doctor &&
      process.env.DEFAULT_QUEUE_ID
    ) {
      const defaultQueue = await Queue.findOne({
        id: process.env.DEFAULT_QUEUE_ID,
      });
      if (defaultQueue) {
        sails.config.customLogger.log('verbose', `Assigning the default queue to the consultation as no queue is set defaultQueueId ${defaultQueue?.id}`, null, 'message');
        consultation.queue = defaultQueue.id;
      }
    }
    cb();
  },

  async afterCreate(consultation, proceed) {
    await Consultation.broadcastNewConsultation(consultation);
    sails.config.customLogger.log('info', `New consultation broadcast consultationId ${consultation.id}`, null, 'server-action');
    return proceed();
  },

  async beforeDestroy(criteria, proceed) {
    sails.config.customLogger.log('verbose', `Deleting consultation with criteria ${criteria}`, null, 'message');
    const consultation = await Consultation.findOne({ _id: criteria.where.id });
    await Message.destroy({ consultation: criteria.where.id });
    if (consultation.invitationToken) {
      await PublicInvite.updateOne({
        inviteToken: consultation.invitationToken,
      }).set({ status: 'SENT' });
      sails.config.customLogger.log('info', `Public invite status updated to SENT for consultation ${consultation?.id}`, null, 'server-action');
    }
    sails.sockets.broadcast(
      consultation.queue || consultation.doctor,
      'consultationCanceled',
      {
        event: 'consultationCanceled',
        data: { _id: criteria.where.id, consultation: criteria.where },
      }
    );
    sails.config.customLogger.log('info', `Consultation with id ${consultation.id} cancellation broadcast`, null, 'server-action');
    return proceed();
  },

  async broadcastNewConsultation(consultation) {
    const nurse = await User.findOne({ id: consultation.owner });
    const translator = await User.findOne({ id: consultation.translator });
    const guest = await User.findOne({ id: consultation.guest });
    const queue = await Queue.findOne({ id: consultation.queue });
    let guestInvite = null;
    if (consultation.guestInvite) {
      guestInvite = await PublicInvite.findOne({ id: consultation.guestInvite });
    }
    sails.config.customLogger.log('info', `Broadcasting new consultation ${consultation.id}`, null, 'server-action');
    const participants = await Consultation.getConsultationParticipants(consultation);
    participants.forEach((participant) => {
      sails.sockets.broadcast(participant, 'newConsultation', {
        event: 'newConsultation',
        data: {
          _id: consultation.id,
          unreadCount: 0,
          consultation,
          nurse,
          translator,
          guest,
          queue,
          guestInvite
        }
      });
      sails.config.customLogger.log('info', `Broadcast new consultation ${consultation.id} to participant ${participant} `, null, 'message');
    });
    sails.config.customLogger.log('verbose', `Finished broadcasting new consultation ${consultation.id} participantCount ${participants.length}`, null, 'server-action');
  },

  async getConsultationParticipants(consultation) {
    const consultationParticipants = [consultation.owner];
    if (consultation.translator) {
      consultationParticipants.push(consultation.translator);
    }
    if (consultation.acceptedBy) {
      consultationParticipants.push(consultation.acceptedBy);
    }
    if (consultation.guest) {
      consultationParticipants.push(consultation.guest);
    }
    if (consultation.owner) {
      consultationParticipants.push(consultation.owner);
    }
    if (consultation.status === 'pending' && consultation.queue) {
      consultationParticipants.push(consultation.queue);
    }
    if (
      consultation.doctor &&
      consultation.doctor !== consultation.acceptedBy
    ) {
      consultationParticipants.push(consultation.doctor);
    }
    if (consultation.experts?.length) {
      consultation.experts.forEach((expert) => {
        consultationParticipants.push(expert);
      });
    }
    sails.config.customLogger.log('info', `Consultation participants computed for consultation ${consultation.id || consultation._id}`, null, 'message');
    return consultationParticipants;
  },

  async findBy(args) {
    return Consultation.find(args);
  },

  async getAnonymousDetails(consultation) {
    const anonymousConsultation = {
      consultationId: consultation.id,
      IMADTeam: consultation.IMADTeam,
      acceptedAt: consultation.acceptedAt,
      closedAt: consultation.closedAt || Date.now(),
      consultationCreatedAt: consultation.createdAt,
      queue: consultation.queue,
      owner: consultation.owner,
      acceptedBy: consultation.acceptedBy,

      patientRating: consultation.patientRating,
      patientComment: consultation.patientComment,
      doctorRating: consultation.doctorRating,
      doctorComment: consultation.doctorComment,
      doctor: consultation.doctor,
      invite: consultation.invite,
      invitedBy: consultation.invitedBy,
      numberOfPlannedParticipants: 2,
      firstCallAt: consultation.firstCallAt,
      consultationEstimatedAt: consultation.consultationEstimatedAt,
    };
    if (consultation.invite) {
      let invite;
      try {
        invite = await PublicInvite.findOne({ id: consultation.invite });
        if (invite) {
          anonymousConsultation.inviteScheduledFor = invite.scheduledFor;
          anonymousConsultation.doctor = invite.doctor;
          anonymousConsultation.inviteCreatedAt = invite.createdAt;

          const translatorInvite = await PublicInvite.findOne({
            patientInvite: invite.id,
            type: 'TRANSLATOR',
          });
          const guestInvite = await PublicInvite.findOne({
            patientInvite: invite.id,
            type: 'GUEST',
          });

          anonymousConsultation.numberOfPlannedParticipants =
            anonymousConsultation.numberOfPlannedParticipants +
            (translatorInvite ? 1 : 0) +
            (guestInvite ? 1 : 0);

          const translationRequestInvite = await PublicInvite.findOne({
            patientInvite: invite.id,
            type: 'TRANSLATOR_REQUEST',
          }).populate('translationOrganization');

          if (translationRequestInvite) {
            anonymousConsultation.languages =
              sails._t('fr', translationRequestInvite.doctorLanguage) +
              ', ' +
              sails._t('fr', translationRequestInvite.patientLanguage);

            anonymousConsultation.translationOrganization =
              translationRequestInvite.translationOrganization.name;
          }

          if (translatorInvite) {
            const translator = await User.findOne({
              username: translatorInvite.id,
            });
            anonymousConsultation.interpreterName = translator.firstName;
          }
        }
      } catch (error) {
        sails.config.customLogger.log('error', `Error finding invite`, { error: error?.message || error }, 'server-action');
      }
    }

    try {
      const doctorTextMessagesCount = await Message.count({
        from: consultation.acceptedBy,
        consultation: consultation.id,
        type: 'text',
      });
      const patientTextMessagesCount = await Message.count({
        from: consultation.owner,
        consultation: consultation.id,
        type: 'text',
      });
      const missedCallsCount = await Message.count({
        consultation: consultation.id,
        type: { in: ['videoCall', 'audioCall'] },
        acceptedAt: 0,
      });
      const successfulCalls = await Message.find({
        consultation: consultation.id,
        type: { in: ['videoCall', 'audioCall'] },
        acceptedAt: { '!=': 0 },
        closedAt: { '!=': 0 },
      }).populate('participants');
      const successfulCallsCount = await Message.count({
        consultation: consultation.id,
        type: { in: ['videoCall', 'audioCall'] },
        acceptedAt: { '!=': 0 },
      });

      const callDurations = successfulCalls.map(
        (c) => c.closedAt - c.acceptedAt
      );
      const sum = callDurations.reduce((a, b) => a + b, 0);
      const averageCallDurationMs = sum / callDurations.length || 0;
      const averageCallDuration = averageCallDurationMs / 60000;

      anonymousConsultation.numberOfEffectiveParticipants =
        successfulCalls.length > 0
          ? _.max(successfulCalls.map((c) => c.participants.length))
          : 0;
      anonymousConsultation.doctorTextMessagesCount = doctorTextMessagesCount;
      anonymousConsultation.patientTextMessagesCount = patientTextMessagesCount;
      anonymousConsultation.missedCallsCount = missedCallsCount;
      anonymousConsultation.successfulCallsCount = successfulCallsCount;
      anonymousConsultation.averageCallDuration = averageCallDuration;

      sails.config.customLogger.log('info', `Anonymous consultation details computed for consultation id ${consultation.id}`, null,'message');
    } catch (error) {
      sails.config.customLogger.log('error', `Error counting messages for consultation id ${consultation.id}`, { error: error?.message || error }, 'server-action');
    }

    sails.config.customLogger.log('verbose', `Anonymous consultation created for consultation id ${consultation.id}`, null,'server-action');

    return anonymousConsultation;
  },

  async sendConsultationClosed(consultation) {
    const participants = await Consultation.getConsultationParticipants(consultation);
    sails.config.customLogger.log('info', `Broadcasting consultationClosed for consultation id ${consultation.id}`, null, 'message');
    participants.forEach((participant) => {
      sails.sockets.broadcast(participant, 'consultationClosed', {
        data: {
          consultation,
          _id: consultation.id,
        },
      });
      sails.config.customLogger.log('info', `Broadcast consultationClosed ${consultation.id} to participant ${participant}`, null, 'server-action');
    });
  },

  async closeConsultation(consultation) {
    if (consultation.status === 'closed') {
      return;
    }
    const db = Consultation.getDatastore().manager;
    const closedAt = new Date();

    try {
      const anonymousConsultation = await Consultation.getAnonymousDetails(consultation);
      await AnonymousConsultation.create(anonymousConsultation);
      sails.config.customLogger.log('info', `Anonymous consultation details saved for consultation id ${consultation.id}`,null, 'server-action');
    } catch (error) {
      sails.config.customLogger.log('error', `Error saving anonymous details for consultation id ${consultation.id}`, { error: error?.message || error }, 'server-action');
    }

    if (consultation.invitationToken) {
      try {
        const patientInvite = await PublicInvite.findOne({ inviteToken: consultation.invitationToken });
        if (patientInvite) {
          await PublicInvite.destroyPatientInvite(patientInvite);
          sails.config.customLogger.log('info', `Patient invite destroyed for consultation id ${consultation.id}`, null,'server-action');
        }
      } catch (error) {
        sails.config.customLogger.log('error', `Error destroying invite for consultation id ${consultation.id}`, { error: error?.message || error }, 'server-action');
      }
    }

    const messageCollection = db.collection('message');
    const consultationCollection = db.collection('consultation');

    try {
      const callMessages = await Message.find({
        consultation: consultation.id,
        type: { in: ['videoCall', 'audioCall'] },
      });
      try {
        await AnonymousCall.createEach(
          callMessages.map((m) => {
            delete m.id;
            return m;
          })
        );
        sails.config.customLogger.log('info', `Anonymous calls saved for consultation id ${consultation.id}`, null, 'server-action');
      } catch (error) {
        sails.config.customLogger.log('error', `Error creating anonymous calls for consultation id ${consultation.id}`, { error: error?.message || error }, 'server-action');
      }
    } catch (error) {
      sails.config.customLogger.log('error', `Error finding call messages for consultation id ${consultation.id}`, { consultationId: consultation.id, error: error?.message || error }, 'server-action');
    }

    if (!consultation.queue) {
      consultation.queue = null;
    }

    try {
      await consultationCollection.updateOne(
        { _id: new ObjectId(consultation.id) },
        {
          $set: {
            status: 'closed',
            closedAtISO: closedAt,
            closedAt: closedAt.getTime(),
          },
        }
      );
      sails.config.customLogger.log('info', `Consultation status updated to closed in database for consultation id ${consultation.id}`, null,'server-action');
    } catch (error) {
      sails.config.customLogger.log('error', `Error updating consultation status in database for consultation id ${consultation.id}`, { consultationId: consultation.id, error: error?.message || error }, 'server-action');
    }

    try {
      await messageCollection.updateOne(
        { consultation: new ObjectId(consultation.id) },
        {
          $set: {
            consultationClosedAtISO: closedAt,
            consultationClosedAt: closedAt.getTime(),
          },
        },
        { multi: true }
      );
      sails.config.customLogger.log('info', `Messages updated with consultation closed timestamps for consultation id ${consultation.id}`, null,'server-action');
    } catch (error) {
      sails.config.customLogger.log('error', `Error updating messages with consultation closed timestamps for consultation id ${consultation.id}`, { error: error?.message || error }, 'server-action');
    }

    consultation.status = 'closed';
    consultation.closedAtISO = closedAt;
    consultation.closedAt = closedAt.getTime();

    await Consultation.sendConsultationClosed(consultation);
    sails.config.customLogger.log('info', `Consultation closed event emitted for consultation id ${consultation.id}`, null, 'server-action');
  },

  async getUserConsultationsFilter(user) {
    let match = [
      {
        owner: new ObjectId(user.id),
      },
    ];
    if (user && user.role === 'doctor') {
      match = [
        {
          acceptedBy: new ObjectId(user.id),
        },
        {
          doctor: new ObjectId(user.id),
          queue: null,
        },
      ];
    }

    if (user && user.role === 'translator') {
      match = [{ translator: new ObjectId(user.id) }];
    }

    if (user && user.role === 'guest') {
      match = [{ guest: new ObjectId(user.id) }];
    }

    if (user && user.role === 'expert') {
      match = [{ experts: user.id }];
    }

    if (user && user.role === 'admin') {
      match = [
        {
          acceptedBy: new ObjectId(user.id),
        },
        {
          doctor: new ObjectId(user.id),
        },
      ];
    }

    if (user.viewAllQueues || user.role === sails.config.globals.ROLE_ADMIN) {
      const queues = (await Queue.find({})).map(
        (queue) => new ObjectId(queue.id)
      );
      match.push({
        status: 'pending',
        queue: { $in: queues },
      });
    }
    // filter the queue of the user
    else if (user.allowedQueues && user.allowedQueues.length > 0) {
      const queues = user.allowedQueues.map((queue) => new ObjectId(queue.id));

      match.push({
        status: 'pending',
        queue: { $in: queues },
      });
    }

    return match;
  },

  async changeOnlineStatus(user, isOnline) {
    const db = Consultation.getDatastore().manager;
    const consultationCollection = db.collection('consultation');

    const match = await Consultation.getUserConsultationsFilter(user);
    const result = await consultationCollection.find({ $or: match });
    const userConsultations = await result.toArray();

    for (const consultation of userConsultations) {
      switch (user.role) {
        case 'patient':
        case 'nurse':
          await Consultation.update({ id: consultation._id.toString() }).set({
            flagPatientOnline: isOnline,
            flagPatientNotified: false,
          });
          consultation.flagPatientOnline = isOnline;
          consultation.flagPatientNotified = false;
          break;
        case 'guest':
          await Consultation.update({ id: consultation._id.toString() }).set({
            flagGuestOnline: isOnline,
          });
          consultation.flagGuestOnline = isOnline;
          break;
        case 'translator':
          await Consultation.update({ id: consultation._id.toString() }).set({
            flagTranslatorOnline: isOnline,
          });
          consultation.flagTranslatorOnline = isOnline;
          break;
        case 'admin':
        case 'doctor':
          await Consultation.update({ id: consultation._id.toString() }).set({
            flagDoctorOnline: isOnline,
            flagDoctorNotified: false,
          });
          consultation.flagDoctorOnline = isOnline;
          consultation.flagDoctorNotified = false;
          break;
        case 'expert':
          const expertsFlags = await Consultation.findOne({
            id: consultation._id.toString(),
          });
          await Consultation.update({ id: consultation._id.toString() }).set({
            flagExpertsOnline: {
              ...expertsFlags.flagExpertsOnline,
              [user.id]: isOnline,
            },
          });
          consultation.flagExpertsOnline = {
            ...expertsFlags.flagExpertsOnline,
            [user.id]: isOnline,
          };
          break;
        default:
          break;
      }
      const participants = await Consultation.getConsultationParticipants(consultation);
      for (const participant of participants) {
        const participantId = participant.toString();
        if (participantId === user.id) continue;

        sails.sockets.broadcast(participantId, 'onlineStatusChange', {
          data: {
            consultation: {
              flagPatientOnline: consultation.flagPatientOnline,
              flagGuestOnline: consultation.flagGuestOnline,
              flagTranslatorOnline: consultation.flagTranslatorOnline,
              flagDoctorOnline: consultation.flagDoctorOnline,
              translator: consultation.translator,
              guest: consultation.guest,
              flagExpertsOnline: consultation.flagExpertsOnline,
            },
            _id: consultation._id,
          },
        });
        sails.config.customLogger.log('info', `Broadcast online status change to participant ${participantId} for consultation ${consultation._id}`, null, 'server-action');
      }
    }
  },

  getConsultationReport(consultation) {
    if (consultation.owner) {
      consultation.owner.name = `${consultation.owner.firstName} ${consultation.owner.lastName}`;
    }
    if (consultation.acceptedBy) {
      consultation.acceptedBy.name = `${consultation.acceptedBy.firstName} ${consultation.acceptedBy.lastName}`;
    }
    const mappedConsultation = {};
    const dateFields = [
      'createdAt',
      'updatedAt',
      'acceptedAt',
      'closedAt',
      'inviteScheduledFor',
      'consultationCreatedAt',
      'inviteCreatedAt',
      'consultationEstimatedAt',
      'firstCallAt',
      'acceptedBy.createdAt',
      'acceptedBy.updatedAt',
      'owner.createdAt',
      'owner.updatedAt'
    ];

    columns.forEach((col) => {
      let value = _.get(consultation, col.key);

      if (dateFields.includes(col.key) && typeof value === 'number' && value) {
        value = moment(value).format('MM/DD/YYYY HH:mm:ss');
      }
      mappedConsultation[col.colName] = value;
    });
    sails.config.customLogger.log('info', `Consultation report generated for consultation id ${consultation.id}`, null, 'message');
    return mappedConsultation;
  },

  async sendPatientReadyToQueue(consultation, queue) {
    try {
      const doctors = await Queue.getQueueUsers(queue);
      sails.config.customLogger.log('verbose', `Sending patient ready notification for consultation id ${consultation.id} to queue ${queue.id}`, null, 'server-action');
      for (const doctor of doctors) {
        await Consultation.sendPatientReadyToDoctor(consultation, doctor);
        sails.config.customLogger.log('verbose', `Patient ready notification sent to doctor ${doctor.id} for consultation ${consultation.id}`,  null, 'message');
      }
    } catch (error) {
      sails.config.customLogger.log('error', `Error sending patient ready notifications for consultation id ${consultation.id}`, { error: error?.message || error }, 'server-action');
      throw error;
    }
  },

  async sendPatientReadyToDoctor(consultation, doctor) {
    const doctorId = doctor._id ? doctor._id.toString() : doctor.id;
    if (doctor && doctor.enableNotif && doctor.notifPhoneNumber) {
      const tokenString = await PublicInvite.generateToken();
      const token = await Token.create({
        token: tokenString,
        user: doctorId,
        value: consultation.id,
      }).fetch();
      const db = Consultation.getDatastore().manager;
      const tokenCollection = db.collection('token');
      await tokenCollection.updateOne(
        { _id: new ObjectId(token.id) },
        { $set: { closedAtISO: new Date() } }
      );
      const url = `${process.env.DOCTOR_URL}/app/plan-consultation?token=${tokenString}`;
      const doctorLanguage = doctor.preferredLanguage || process.env.DEFAULT_DOCTOR_LOCALE;
      if (doctor.messageService === '1') {
        const type = 'patient is ready';
        if (doctorLanguage) {
          const template = await WhatsappTemplate.findOne({
            language: doctorLanguage,
            key: type,
            approvalStatus: 'approved'
          });
          if (template && template.sid) {
            const twilioTemplatedId = template.sid;
            const params = { 1: tokenString };
            if (twilioTemplatedId) {
              await sails.helpers.sms.with({
                phoneNumber: doctor.notifPhoneNumber,
                message: sails._t(doctorLanguage, 'patient is ready', { url }),
                senderEmail: doctor?.email,
                whatsApp: true,
                params,
                twilioTemplatedId
              });
              sails.config.customLogger.log('info', `WhatsApp SMS sent to doctor ${doctorId} for consultation ${consultation.id}`, null, 'server-action');
            } else {
              sails.config.customLogger.log('warn', `Template id is missing for WhatsApp SMS for doctor ${doctorId}`, null, 'message');
            }
          } else {
            sails.config.customLogger.log('warn', `WhatsApp template not approved or not found for doctor ${doctorId}`, null, 'message');
          }
        }
      } else {
        await sails.helpers.sms.with({
          phoneNumber: doctor.notifPhoneNumber,
          message: sails._t(doctorLanguage, 'patient is ready', { url }),
          senderEmail: doctor?.email,
        });
        sails.config.customLogger.log('info', `SMS sent to doctor ${doctorId} for consultation ${consultation.id}`, null, 'message');
      }
    }
  },

  columns,

};

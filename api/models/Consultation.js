/**
 * Consultation.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

const ObjectId = require('mongodb').ObjectID;
const _ = require('@sailshq/lodash');
const jwt = require('jsonwebtoken');


const columns = [
  { colName: 'Invitation envoyée le', key: 'inviteCreatedAt' },
  { colName: 'Consultation planifiée le', key: 'inviteScheduledFor' },
  { colName: 'File d\'attente', key: 'queue.name' },
  { colName: 'Patient consultation demandée à', key: 'consultationCreatedAt' },
  { colName: 'IMAD equipe', key: 'IMADTeam' },
  { colName: 'Consultation clôturée le', key: 'closedAt' },
  { colName: 'Total appel avec réponse', key: 'successfulCallsCount' },
  { colName: 'Total appel sans réponse', key: 'missedCallsCount' },
  { colName: 'Moyenne durée appel', key: 'averageCallDuration' },
  { colName: 'Patient taux satisfaction', key: 'patientRating' },
  { colName: 'Patient satisfaction message', key: 'patientComment' },
  { colName: 'Docteur taux satisfaction', key: 'doctorRating' },
  { colName: 'Docteur satisfaction message', key: 'doctorComment' },
  { colName: 'Department', key: 'acceptedBy.department' },
  { colName: 'Function', key: 'acceptedBy._function' },
  { colName: 'Docteur ID', key: 'acceptedBy.id' },
  { colName: 'Nombre de participants effectifs', key: 'numberOfEffectiveParticipants'},
  { colName: 'Nombre de participants prévus', key: 'numberOfPlannedParticipants'},
  { colName: 'Langues' , key: 'languages'},
  { colName: 'Organisation d\'interprétariat', key: 'translationOrganization'},
  { colName: 'Nom de l\'interprète', key: 'interpreterName' },
  { colName: 'consultationEstimatedAt', key: 'Prise en charge estimée' },
  { colName: 'firstCallAt', key: 'Premier appel effectué' },

];



module.exports = {

  attributes: {
    firstName: {
      type: 'string',
      required: true
    },
    lastName: {
      type: 'string',
      required: true
    },
    gender: {
      type: 'string', isIn: ['male', 'female', 'other', 'unknown'],
      required: true
    },
    birthDate: {
      type: 'string'
    },
    IMADTeam: {
      type: 'string',
      required: true
    },
    invitationToken: {
      type: 'string',
      required: false
    },
    status: {
      type: 'string',
      isIn: ['pending', 'active', 'closed'],
      // default:'pending',
      required: true
    },
    type: {
      type: 'string',
      isIn: ['PATIENT', 'GUEST', 'TRANSLATOR']
    },
    queue: {
      model: 'queue',
      required: false
    },
    acceptedBy: {
      model: 'user'
    },
    owner: {
      model: 'user',
      required: false
    },
    invitedBy: {
      model: 'user'
    },
    translator: {
      model: 'user',
      required: false
    },
    guest: {
      model: 'user',
      required: false
    },
    acceptedAt: {
      type: 'number'
    },
    closedAt: {
      type: 'number'
    },
    patientRating: {
      type: 'string',
      required: false
    },
    patientComment: {
      type: 'string',
      required: false
    },
    doctorRating: {
      type: 'string',
      required: false
    },
    doctorComment: {
      type: 'string',
      required: false
    },
    // the doctor who sent the invite
    doctor: {
      model: 'user',
      required: false
    },
    // patient invite
    invite: {
      model: 'PublicInvite',
      required: false
    },
    flagPatientOnline: {
      type: 'boolean',
      required: false
    },
    flagGuestOnline: {
      type: 'boolean',
      required: false
    },

    flagTranslatorOnline: {
      type: 'boolean',
      required: false
    },
    flagDoctorOnline: {
      type: 'boolean',
      required: false
    },
    scheduledFor: {
      type: 'number'
    },
    consultationEstimatedAt: {
      type: 'number'
    },
    firstCallAt: {
      type: 'number'
    }
  },

  async beforeCreate (consultation, cb) {

    if (!consultation.queue && !consultation.doctor && process.env.DEFAULT_QUEUE_ID) {
      const defaultQueue = await Queue.findOne({ id: process.env.DEFAULT_QUEUE_ID });
      if (defaultQueue) {
        console.log('Assigning the default queue to the consultation as no queue is set');
        consultation.queue = defaultQueue.id;
      }
    }
    cb();
  },


  async afterCreate (consultation, proceed) {

    await Consultation.broadcastNewConsultation(consultation);

    return proceed();
  },


  async beforeDestroy (criteria, proceed) {
    console.log('DELETE CONSULTATION', criteria);
    const consultation = await Consultation.findOne({ _id: criteria.where.id });
    await Message.destroy({ consultation: criteria.where.id });
    if (consultation.invitationToken) {
      await PublicInvite.updateOne({ inviteToken: consultation.invitationToken }).set({ status: 'SENT' });
    }

    sails.sockets.broadcast(consultation.queue || consultation.doctor, 'consultationCanceled',
      { event: 'consultationCanceled', data: { _id: criteria.where.id, consultation: criteria.where } });
    return proceed();
  },

  async broadcastNewConsultation (consultation) {
    const nurse = await User.findOne({ id: consultation.owner });
    const translator = await User.findOne({ id: consultation.translator });
    const guest = await User.findOne({ id: consultation.guest });

    Consultation.getConsultationParticipants(consultation).forEach(participant => {
      sails.sockets.broadcast(participant, 'newConsultation',
          { event: 'newConsultation', data: { _id: consultation.id, unreadCount: 0, consultation, nurse, translator, guest } });
    });

  },
  getConsultationParticipants (consultation) {
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
    if (consultation.status === 'pending' && consultation.queue) {
      consultationParticipants.push(consultation.queue);
    }
    if (consultation.doctor && consultation.doctor !== consultation.acceptedBy) {
      consultationParticipants.push(consultation.doctor);
    }
    return consultationParticipants;
  },

  async getAnonymousDetails (consultation) {

    // consultation = await Consultation.findOne({id:'5e81e3838475f6352ef40aec'})
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
      consultationEstimatedAt: consultation.consultationEstimatedAt

    };
    if (consultation.invite) {

      let invite
      try {

        invite = await PublicInvite.findOne({ id: consultation.invite });
        if (invite) {
          anonymousConsultation.inviteScheduledFor = invite.scheduledFor;
          anonymousConsultation.doctor = invite.doctor;
          anonymousConsultation.inviteCreatedAt = invite.createdAt;

          const translatorInvite = await PublicInvite.findOne({ patientInvite: invite.id, type:"TRANSLATOR"});
          const guestInvite = await PublicInvite.findOne({ patientInvite: invite.id, type:"GUEST"});

          anonymousConsultation.numberOfPlannedParticipants = anonymousConsultation.numberOfPlannedParticipants + (translatorInvite? 1:0) + (guestInvite? 1:0)

          const translationRequestInvite = await PublicInvite.findOne({ patientInvite: invite.id, type:"TRANSLATOR_REQUEST"}).populate('translationOrganization');

          if(translationRequestInvite){
            anonymousConsultation.languages = sails._t('fr', translationRequestInvite.doctorLanguage) +', ' +
            sails._t('fr', translationRequestInvite.patientLanguage)

            anonymousConsultation.translationOrganization = translationRequestInvite.translationOrganization.name
          }

          if(translatorInvite){
            const translator = await User.findOne({ username: translatorInvite.id});
            anonymousConsultation.interpreterName = translator.firstName
          }

        }


      } catch (error) {
        console.log('Error finding invite ', error);

      }
    }

    try {

      const doctorTextMessagesCount = await Message.count({ from: consultation.acceptedBy, consultation: consultation.id, type: 'text' });
      const patientTextMessagesCount = await Message.count({ from: consultation.owner, consultation: consultation.id, type: 'text' });
      const missedCallsCount = await Message.count({ consultation: consultation.id, type: { in: ['videoCall', 'audioCall'] }, acceptedAt: 0 });
      const successfulCalls = await Message.find({ consultation: consultation.id, type: { in: ['videoCall', 'audioCall'] }, acceptedAt: { '!=': 0 }, closedAt: { '!=': 0 } }).populate('participants');
      const successfulCallsCount = await Message.count({ consultation: consultation.id, type: { in: ['videoCall', 'audioCall'] }, acceptedAt: { '!=': 0 } });

      const callDurations = successfulCalls.map(c => c.closedAt - c.acceptedAt);
      const sum = callDurations.reduce((a, b) => a + b, 0);
      const averageCallDurationMs = (sum / callDurations.length) || 0;
      const averageCallDuration = averageCallDurationMs / 60000;


      anonymousConsultation.numberOfEffectiveParticipants = (successfulCalls.length>0)?_.max(successfulCalls.map(c=> c.participants.length)):0;
      anonymousConsultation.doctorTextMessagesCount = doctorTextMessagesCount;
      anonymousConsultation.patientTextMessagesCount = patientTextMessagesCount;
      anonymousConsultation.missedCallsCount = missedCallsCount;
      anonymousConsultation.successfulCallsCount = successfulCallsCount;
      anonymousConsultation.averageCallDuration = averageCallDuration;
      anonymousConsultation.consultationEstimatedAt = consultationEstimatedAt;

      console.log('anonymous consultation ', anonymousConsultation);
    } catch (error) {

      console.log('Error counting messages ', error);
    }
    console.log('create anonymous ', anonymousConsultation);

    return anonymousConsultation

  },
  sendConsultationClosed (consultation) {
    // emit consultation closed event with the consultation
    Consultation.getConsultationParticipants(consultation).forEach(participant => {

      sails.sockets.broadcast(participant, 'consultationClosed', {
        data: {
          consultation,
          _id: consultation.id
        }
      });
    });
  },
  async closeConsultation (consultation) {

    if(consultation.status === 'closed'){
      return;
    }
    const db = Consultation.getDatastore().manager;

    const closedAt = new Date();


    try {

     const anonymousConsultation =  await Consultation.getAnonymousDetails(consultation);
     await AnonymousConsultation.create(anonymousConsultation);
    } catch (error) {
      console.error('Error Saving anonymous details ', error);
    }

    if (consultation.invitationToken) {
      try {
        const patientInvite = await PublicInvite.findOne({ inviteToken: consultation.invitationToken });
        await PublicInvite.destroyPatientInvite(patientInvite);

      } catch (error) {
        console.error('Error destroying Invite ', error);
      }
    }



    const messageCollection = db.collection('message');
    const consultationCollection = db.collection('consultation');
    try {


      const callMessages = await Message.find({ consultation: consultation.id, type: { in: ['videoCall', 'audioCall'] } });
      // const callMessages = await callMessagesCursor.toArray();
      // save info for stats
      try {

        await AnonymousCall.createEach(callMessages.map(m => {
          delete m.id;
          return m;
        }));
      } catch (error) {
        console.log('Error creating anonymous calls ', error);
      }

    } catch (error) {
      console.log('Error finding messages ', error);
    }
    if (!consultation.queue) {
      consultation.queue = null;
    }


    // mark consultation as closed and set closedAtISO for mongodb ttl
    const { result } = await consultationCollection.update({ _id: new ObjectId(consultation.id) }, {
      $set: {
        status: 'closed',
        closedAtISO: closedAt,
        closedAt: closedAt.getTime()
      }
    });



    // set consultationClosedAtISO for mongodb ttl index
    await messageCollection.update({ consultation: new ObjectId(consultation.id) }, {
      $set: {
        consultationClosedAtISO: closedAt,
        consultationClosedAt: closedAt.getTime()
      }
    }, { multi: true });




    consultation.status = 'closed';
    consultation.closedAtISO = closedAt;
    consultation.closedAt = closedAt.getTime();

    // emit consultation closed event with the consultation
    Consultation.sendConsultationClosed(consultation);
  },

  async getUserConsultationsFilter(user){
    let match = [{
      owner: new ObjectId(user.id)
    }];
    if (user && user.role === 'doctor') {

      match = [{
        acceptedBy: new ObjectId(user.id)
      }, {
        doctor: new ObjectId(user.id),
        queue: null
      }
      ];
    }

    if (user && user.role === 'translator') {
      match = [{ translator: ObjectId(user.id) }];
    }

    if (user && user.role === 'guest') {
      match = [{ guest: ObjectId(user.id) }];
    }


    if (user.viewAllQueues) {
      const queues = (await Queue.find({})).map(queue => new ObjectId(queue.id));
      match.push(
        {
          status: 'pending',
          queue: { $in: queues }

        }
      );
    } else
    // filter the queue of the user
    if (user.allowedQueues && user.allowedQueues.length > 0) {
      const queues = user.allowedQueues.map(queue => new ObjectId(queue.id));

      match.push(
        {
          status: 'pending',
          queue: { $in: queues }
        }
      );
    }


    return match


  },


  async changeOnlineStatus(user, isOnline){
    const db = Consultation.getDatastore().manager;
    const consultationCollection = db.collection('consultation');

    const match = await Consultation.getUserConsultationsFilter(user)
    const result = await consultationCollection.find({$or:match})
    const userConsultations = await result.toArray()

    userConsultations.forEach(async consultation => {
      switch (user.role) {
        case 'patient':
        case 'nurse':
          await Consultation.update({ id: consultation._id.toString() })
            .set({ flagPatientOnline: isOnline })
              consultation.flagPatientOnline = isOnline
          break;
        case 'guest':
          await Consultation.update({ id: consultation._id.toString() })
              .set({ flagGuestOnline: isOnline })
              consultation.flagGuestOnline = isOnline
          break;
        case 'translator':
          await Consultation.update({ id: consultation._id.toString() })
              .set({ flagTranslatorOnline: isOnline })
              consultation.flagTranslatorOnline = isOnline
          break;
        case 'doctor':
          await Consultation.update({ id: consultation._id.toString() })
              .set({ flagDoctorOnline: isOnline })
              consultation.flagDoctorOnline = isOnline
          break;
        default:
          break;
      }
      Consultation.getConsultationParticipants(consultation).forEach(participant => {

        // don't echo the event
        if(participant === user.id) return;
        sails.sockets.broadcast(participant, 'onlineStatusChange', {
          data: {
            consultation:{
              flagPatientOnline: consultation.flagPatientOnline,
              flagGuestOnline: consultation.flagGuestOnline,
              flagTranslatorOnline: consultation.flagTranslatorOnline,
              flagDoctorOnline: consultation.flagDoctorOnline,
              translator: consultation.translator,
              guest: consultation.guest
            },
            _id: consultation._id,
            // user
          }
        });
      });
    });

  },
  getConsultationReport(consultation){

    if (consultation.owner) {
      consultation.owner.name = `${consultation.owner.firstName } ${ consultation.owner.lastName}`;
    }
    if (consultation.acceptedBy) {
      consultation.acceptedBy.name = `${consultation.acceptedBy.firstName } ${ consultation.acceptedBy.lastName}`;
    }
    const mappedConsultation = {};
    columns.forEach(col => {
      mappedConsultation[col.colName] = _.get(consultation, col.key);
    });
    return mappedConsultation;

  },
  columns,
  async sendPatientReadyToQueue(consultation,  queue){
    const doctors = await Queue.getQueueUsers(queue)
    doctors.forEach(async doctor => {
    await  Consultation.sendPatientReadyToDoctor(consultation, doctor)
    });
  },
  async sendPatientReadyToDoctor(consultation,  doctor){

    const doctorId = doctor._id?doctor._id.toString():doctor.id;
    if (doctor && doctor.enableNotif && doctor.notifPhoneNumber) {

      const tokenString = await PublicInvite.generateToken()
      const token = await Token.create({token:tokenString, user:doctorId, value:consultation.id}).fetch();
      const db = Consultation.getDatastore().manager;
      const tokenCollection = db.collection('token');
      await tokenCollection.update({ _id: new ObjectId(token.id) }, {
        $set: {
          closedAtISO: new Date(),
        }
      });
      const url = `${process.env.DOCTOR_URL}/app/plan-consultation?token=${tokenString}`;
      const doctorLanguage = doctor.preferredLanguage || process.env.DEFAULT_DOCTOR_LOCALE;

      await sails.helpers.sms.with({
        phoneNumber: doctor.notifPhoneNumber,
        message: sails._t(doctorLanguage,"patient is ready",{url})
      });

    }

  }
  // afterUpdate(consultation){
  //   Consultation.getConsultationParticipants().forEach(participant=>{
  //     sails.sockets.broadcast(participant, 'consultationUpdated', {
  //       data: {consultation}
  //     })
  //   })
  // }

};

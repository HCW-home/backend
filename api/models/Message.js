const RINGING_TIMEOUT = 5 * 60 * 1000;
const CALL_DURATION_TIMEOUT = 2 * 60 * 60 * 1000;

module.exports = {
  attributes: {
    from: {
      model: 'user',
    },
    to: {
      model: 'user',
    },
    text: {
      type: 'string',
      maxLength: 100000,
      allowNull: true
    },
    consultation: {
      model: 'consultation',
      required: true,
    },
    read: {
      type: 'boolean',
    },
    type: {
      type: 'string',
      isIn: ['attachment', 'text', 'videoCall', 'audioCall', 'ownershipTransfer'],
    },
    mimeType: {
      type: 'string',
    },
    fileName: {
      type: 'string',
    },
    filePath: {
      type: 'string',
    },
    isEncrypted: {
      type: 'boolean',
      defaultsTo: false,
    },
    acceptedAt: {
      type: 'number',
    },
    closedAt: {
      type: 'number',
    },
    isConferenceCall: {
      type: 'boolean',
    },
    currentParticipants: {
      collection: 'user',
    },
    participants: {
      collection: 'user',
    },
    status: {
      type: 'string',
      isIn: ['ringing', 'ongoing', 'ended'],
    },
    openViduURL: {
      type: 'string',
    },
    mediasoupURL: {
      type: 'string',
    },
    fromUserDetail: {
      type: 'json',
      defaultsTo: {},
    },
  },

  customToJSON: function() {
    let obj;
    if (typeof this.toObject === 'function') {
      obj = this.toObject();
    } else {
      obj = { ...this };
    }
    if (obj.isEncrypted && obj.text && obj.type === 'text') {
      if (sails.config.globals.ENCRYPTION_KEY) {
        const encryption = sails.helpers.encryption();
        obj.text = encryption.decryptText(obj.text);
      } else {
        obj.text = 'Message cannot be decrypted';
      }
    }
    return obj;
  },

  async endCall(message, consultation, reason) {
    sails.config.customLogger.log('info', `End call triggered consultationId ${consultation.id} messageId ${message.id}`, null, 'server-action');
    await Message.updateOne({
      id: message.id,
      consultation: consultation.id,
    }).set({
      closedAt: new Date(),
      status: 'ended',
    });

    const consultationParticipants = await Consultation.getConsultationParticipants(consultation);

    consultationParticipants.forEach((participant) => {
      sails.config.customLogger.log('info', `Broadcasting endCall event participantId ${participant} consultationId ${consultation.id}`, null, 'server-action');
      sails.sockets.broadcast(participant, 'endCall', {
        data: {
          reason,
          consultation,
          message,
        },
      });
    });
  },

  async beforeCreate(message, proceed) {
    try {
      const user = await User.findOne({ id: message.from });
      if (user) {
        message.fromUserDetail = {
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          id: user.id,
        };
        sails.config.customLogger.log('info', `Message beforeCreate: Added user details for MongoID: ${user.id}`, null,'message');
      }

      if (sails.config.globals.ENCRYPTION_ENABLED && message.text && message.type === 'text') {
        const encryption = sails.helpers.encryption();
        message.text = encryption.encryptText(message.text);
        message.isEncrypted = true;
        sails.config.customLogger.log('info', 'Message text encrypted', null, 'server-action');
      }

      return proceed();
    } catch (error) {
      sails.config.customLogger.log('error', 'Error in beforeCreate', error, 'server-action');
      return proceed(error);
    }
  },

  async afterCreate(message, proceed) {
    const consultation = await Consultation.findOne({ id: message.consultation });
    const user = await User.findOne({ id: message.from });
    const toUser = await User.findOne({ id: message.to });

    const participants = await Consultation.getConsultationParticipants(consultation, { includeSharedQueueUsers: true });

    const senderInMultipleRoles =
      consultation.owner === message.from && consultation.acceptedBy === message.from;

    const roomNames = senderInMultipleRoles
      ? participants
      : participants.filter(p => p !== message.from);

    const fromUserDetail = {
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      id: user.id,
    };

    const broadcastMessage = { ...message, fromUserDetail };
    if (broadcastMessage.isEncrypted && broadcastMessage.text && broadcastMessage.type === 'text') {
      const encryption = sails.helpers.encryption();
      broadcastMessage.text = encryption.decryptText(broadcastMessage.text);
    }

    sails.config.customLogger.log('info', `Broadcasting newMessage event to roomNames ${roomNames}`, null, 'server-action');
    sails.sockets.broadcast(roomNames, 'newMessage', {
      data: broadcastMessage,
    });

    if (message.type === 'audioCall' || message.type === 'videoCall') {
      sails.config.customLogger.log('info', `Broadcasting newMessage event for call type userId ${message.from}`, null, 'server-action');
      sails.sockets.broadcast(message.from, 'newMessage', { data: message });

      sails.config.customLogger.log('info', `Scheduling RINGING_TIMEOUT helper messageId ${message.id}`, null, 'server-action');
      await sails.helpers.schedule.with({
        name: 'RINGING_TIMEOUT',
        data: { message, consultation },
        time: new Date(Date.now() + RINGING_TIMEOUT),
      });

      sails.config.customLogger.log('info', `Scheduling DURATION_TIMEOUT helper messageId ${message.id}`, null, 'server-action');
      await sails.helpers.schedule.with({
        name: 'DURATION_TIMEOUT',
        data: { message },
        time: new Date(Date.now() + CALL_DURATION_TIMEOUT),
      });
    }

    const publicInvite = await PublicInvite.findOne({
      inviteToken: consultation.invitationToken,
    });

    if (consultation) {
      const url = `${process.env.PUBLIC_URL}/inv/?invite=${consultation.invitationToken}`;
      if (
        (user.role === sails.config.globals.ROLE_ADMIN ||
          user.role === sails.config.globals.ROLE_DOCTOR) &&
        !consultation.flagPatientOnline &&
        !consultation.flagPatientNotified
      ) {
        sails.config.customLogger.log('info', `Updating public invite status to SENT inviteToken ${consultation.invitationToken}`, null, 'server-action');

        if (publicInvite) {
          await PublicInvite.updateOne({
            inviteToken: consultation.invitationToken,
          }).set({ status: 'SENT' });
        }

        const locale = publicInvite.patientLanguage || sails.config.globals.DEFAULT_PATIENT_LOCALE;

        if (
          toUser &&
          toUser.email &&
          toUser.role === sails.config.globals.ROLE_NURSE
        ) {
          sails.config.customLogger.log('info', `Sending email notification to nurse ${toUser.email}`, null, 'server-action');
          await sails.helpers.email.with({
            to: toUser.email,
            subject: sails._t(locale, 'notification for offline action subject', { branding: process.env.BRANDING }),
            text: sails._t(locale, 'notification for offline action text for nurse'),
          });

          await Consultation.updateOne({ id: consultation.id }).set({
            flagPatientNotified: true,
          });
        } else if (publicInvite.emailAddress) {
          sails.config.customLogger.log('info', `Sending email notification to patient ${publicInvite.emailAddress}`, null, 'server-action');
          await sails.helpers.email.with({
            to: publicInvite.emailAddress,
            subject: sails._t(locale, 'notification for offline action subject', { branding: process.env.BRANDING }),
            text: sails._t(locale, 'notification for offline action text', { url }),
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
          sails.config.customLogger.log('info', `Sending SMS notification to nurse ${toUser.phoneNumber}`, null, 'server-action');
          await sails.helpers.sms.with({
            phoneNumber: toUser.phoneNumber,
            message: sails._t(locale, 'notification for offline action text for nurse'),
            senderEmail: publicInvite?.doctor?.email,
          });
          await Consultation.updateOne({ id: consultation.id }).set({
            flagPatientNotified: true,
          });
        }
      }

      if (
        (user.role === sails.config.globals.ROLE_EXPERT || user.role === sails.config.globals.ROLE_NURSE ||
          user.role === sails.config.globals.ROLE_PATIENT) &&
        !consultation.flagDoctorOnline &&
        !consultation.flagDoctorNotified
      ) {
        const doctorLang = process.env.DEFAULT_DOCTOR_LOCALE;
        const url = `${process.env.DOCTOR_URL}/app/consultation/${consultation.id}`;

        if (toUser?.enableNotif && toUser?.notifPhoneNumber) {
          if (toUser.messageService === '1') {
            const type = 'notification for offline action text for doctor';
            const doctorLanguage = toUser.preferredLanguage || process.env.DEFAULT_DOCTOR_LOCALE;
            if (doctorLanguage) {
              const template = await WhatsappTemplate.findOne({
                language: doctorLanguage,
                key: type,
                approvalStatus: 'approved',
              });
              if (template && template.sid) {
                const twilioTemplatedId = template.sid;
                const params = { 1: consultation.id };
                sails.config.customLogger.log('info', `Sending WhatsApp SMS to doctor ${toUser.notifPhoneNumber}`, null, 'server-action');
                await sails.helpers.sms.with({
                  phoneNumber: toUser?.notifPhoneNumber,
                  message: sails._t(doctorLang, 'notification for offline action text for doctor', {url}),
                  senderEmail: toUser?.email,
                  whatsApp: true,
                  params,
                  twilioTemplatedId,
                });
              } else {
                sails.config.customLogger.log('error', 'ERROR SENDING WhatsApp SMS - Template id is missing or not approved', null, 'server-action');
              }
            }
          } else {
            sails.config.customLogger.log('info', `Sending SMS notification to doctor ${toUser.notifPhoneNumber}`, null, 'server-action');
            await sails.helpers.sms.with({
              phoneNumber: toUser?.notifPhoneNumber,
              message: sails._t(doctorLang, 'notification for offline action text for doctor', {url}),
              senderEmail: toUser?.email,
            });
          }
          await Consultation.updateOne({ id: consultation.id }).set({
            flagDoctorNotified: true,
          });
        } else if (toUser?.email) {
          sails.config.customLogger.log('info', `Sending email notification to doctor ${toUser.email}`, null, 'server-action');
          await sails.helpers.email.with({
            to: toUser.email,
            subject: sails._t(doctorLang, 'notification for offline action subject', { branding: process.env.BRANDING }),
            text: sails._t(doctorLang, 'notification for offline action text for doctor', {url}),
          });
          await Consultation.updateOne({ id: consultation.id }).set({
            flagDoctorNotified: true,
          });
        }
      }
    }

    return proceed();
  }
};

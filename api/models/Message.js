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
      isIn: ['attachment', 'text', 'videoCall', 'audioCall'],
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

  async endCall(message, consultation, reason) {
    sails.config.customLogger.log('info', 'End call triggered', {
      consultationId: consultation.id,
      messageId: message.id
    }, 'server-action');
    await Message.updateOne({
      id: message.id,
      consultation: consultation.id,
    }).set({
      closedAt: new Date(),
      status: 'ended',
    });

    const consultationParticipants = await Consultation.getConsultationParticipants(consultation);

    consultationParticipants.forEach((participant) => {
      sails.config.customLogger.log('info', 'Broadcasting endCall event', {
        participantId: participant,
        consultationId: consultation.id
      }, 'server-action');
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
        sails.config.customLogger.log('info', `Message beforeCreate: Added user details for MongoID: ${user.id}`, 'message');
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

    let roomNames = [
      message.to || consultation.queue || consultation.doctor,
      ...consultation.experts,
    ];
    if (user?.role === 'expert') {
      roomNames = consultation.experts.filter((expert) => expert !== user.id);
      roomNames.push(consultation.doctor);
      roomNames.push(consultation.owner);
    }
    const fromUserDetail = {
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      id: user.id,
    };

    sails.config.customLogger.log('info', 'Broadcasting newMessage event', { roomNames }, 'server-action');
    sails.sockets.broadcast(roomNames, 'newMessage', {
      data: { ...message, fromUserDetail },
    });

    if (message.type === 'audioCall' || message.type === 'videoCall') {
      sails.config.customLogger.log('info', 'Broadcasting newMessage event for call type', { userId: message.from }, 'server-action');
      sails.sockets.broadcast(message.from, 'newMessage', { data: message });

      sails.config.customLogger.log('info', 'Scheduling RINGING_TIMEOUT helper', { messageId: message.id }, 'server-action');
      await sails.helpers.schedule.with({
        name: 'RINGING_TIMEOUT',
        data: { message, consultation },
        time: new Date(Date.now() + RINGING_TIMEOUT),
      });

      sails.config.customLogger.log('info', 'Scheduling DURATION_TIMEOUT helper', { messageId: message.id }, 'server-action');
      await sails.helpers.schedule.with({
        name: 'DURATION_TIMEOUT',
        data: { message },
        time: new Date(Date.now() + CALL_DURATION_TIMEOUT),
      });
    }

    const publicInvite = await PublicInvite.findOne({
      inviteToken: consultation.invitationToken,
    });

    if (publicInvite) {
      const url = `${process.env.PUBLIC_URL}/inv/?invite=${publicInvite.inviteToken}`;
      if (
        (user.role === sails.config.globals.ROLE_ADMIN ||
          user.role === sails.config.globals.ROLE_DOCTOR) &&
        !consultation.flagPatientOnline &&
        !consultation.flagPatientNotified
      ) {
        sails.config.customLogger.log('info', 'Updating public invite status to SENT', { inviteToken: consultation.invitationToken }, 'server-action');
        await PublicInvite.updateOne({
          inviteToken: consultation.invitationToken,
        }).set({ status: 'SENT' });

        const locale = publicInvite.patientLanguage || process.env.DEFAULT_PATIENT_LOCALE;

        if (
          toUser &&
          toUser.email &&
          toUser.role === sails.config.globals.ROLE_NURSE
        ) {
          sails.config.customLogger.log('info', 'Sending email notification to nurse', { email: toUser.email }, 'server-action');
          await sails.helpers.email.with({
            to: toUser.email,
            subject: sails._t(locale, 'notification for offline action subject', { branding: process.env.BRANDING }),
            text: sails._t(locale, 'notification for offline action text for nurse'),
          });

          await Consultation.updateOne({ id: consultation.id }).set({
            flagPatientNotified: true,
          });
        } else if (publicInvite.emailAddress) {
          sails.config.customLogger.log('info', 'Sending email notification to patient', { email: publicInvite.emailAddress }, 'server-action');
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
          sails.config.customLogger.log('info', 'Sending SMS notification to nurse', { phoneNumber: toUser.phoneNumber }, 'server-action');
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
        (user.role === sails.config.globals.ROLE_NURSE ||
          user.role === sails.config.globals.ROLE_PATIENT) &&
        !consultation.flagDoctorOnline &&
        !consultation.flagDoctorNotified
      ) {
        const doctorLang = publicInvite.doctorLanguage || process.env.DEFAULT_DOCTOR_LOCALE;

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
                const params = {};
                sails.config.customLogger.log('info', 'Sending WhatsApp SMS to doctor', { phoneNumber: toUser.notifPhoneNumber }, 'server-action');
                await sails.helpers.sms.with({
                  phoneNumber: toUser?.notifPhoneNumber,
                  message: sails._t(doctorLang, 'notification for offline action text for doctor'),
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
            sails.config.customLogger.log('info', 'Sending SMS notification to doctor', { phoneNumber: toUser.notifPhoneNumber }, 'server-action');
            await sails.helpers.sms.with({
              phoneNumber: toUser?.notifPhoneNumber,
              message: sails._t(doctorLang, 'notification for offline action text for doctor'),
              senderEmail: toUser?.email,
            });
          }
          await Consultation.updateOne({ id: consultation.id }).set({
            flagDoctorNotified: true,
          });
        } else if (toUser?.email) {
          sails.config.customLogger.log('info', 'Sending email notification to doctor', { email: toUser.email }, 'server-action');
          await sails.helpers.email.with({
            to: toUser.email,
            subject: sails._t(doctorLang, 'notification for offline action subject', { branding: process.env.BRANDING }),
            text: sails._t(doctorLang, 'notification for offline action text for doctor'),
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

module.exports = {
  sendExpertLink: async function(req, res) {
    try {
      const { expertLink, to, consultationId, messageService } = req.body;
      const { locale } = req.headers || {};
      let consultation = await Consultation.findOne({ id: consultationId }).populate('doctor');
      if (consultation && !consultation.expertToken) {
        sails.config.customLogger.log('warn', 'expertLink is missing', null, 'message', req.user?.id);
        return res.badRequest({ message: 'Expert token is required' });
      }
      const isPhoneNumber = /^(\+|00)[0-9 ]+$/.test(to);
      const isEmail = to.includes('@');
      if (isPhoneNumber && !isEmail) {
        if (messageService === '1') {
          const type = 'please use this link';
          const language = req?.body?.language || 'en';
          const template = await WhatsappTemplate.findOne({ language, key: type, approvalStatus: 'approved' });
          sails.config.customLogger.log('info', `Fetched WhatsApp template for type "${type}" and language "${language}"`, null, 'message', req.user?.id);
          if (template && template.sid) {
            const twilioTemplatedId = template.sid;
            const params = { 1: consultation.expertToken };
            if (twilioTemplatedId) {
              await sails.helpers.sms.with({
                phoneNumber: to,
                message: sails._t(locale, type, { expertLink: consultation.expertInvitationURL }),
                senderEmail: consultation.doctor?.email,
                whatsApp: true,
                params,
                twilioTemplatedId
              });
              sails.config.customLogger.log('verbose', `WhatsApp SMS sent successfully to ${to}`, null, 'server-action', req.user?.id);
            } else {
              sails.config.customLogger.log('warn', 'Template id is missing for WhatsApp SMS', null, 'message', req.user?.id);
            }
          } else {
            sails.config.customLogger.log('warn', `WhatsApp template not found or missing sid for language "${language}" and type "${type}"`, null, 'message', req.user?.id);
          }
        } else if (messageService === '2') {
          await sails.helpers.sms.with({
            phoneNumber: to,
            message: sails._t(locale, 'please use this link', { expertLink: expertLink?.expertLink }),
            senderEmail: consultation.doctor?.email,
            whatsApp: false,
          });
          sails.config.customLogger.log('verbose', `SMS sent successfully to ${to}`, null, 'server-action', req.user?.id);
        }
        return res.ok({ message: 'SMS sent successfully' });
      } else if (isEmail && !isPhoneNumber) {
        await sails.helpers.email.with({
          to,
          subject: sails._t(locale, 'consultation link'),
          text: sails._t(locale, 'please use this link', { expertLink: expertLink?.expertLink }),
        });
        sails.config.customLogger.log('verbose', `Email sent successfully to ${to}`, null, 'server-action', req.user?.id);
        return res.ok({ message: 'Email sent successfully' });
      } else {
        sails.config.customLogger.log('warn', `Invalid "to" field. It should be either a valid email address or phone number. to ${to}`, null, 'server-action', req.user?.id);
        return res.badRequest({
          message: 'Invalid "to" field. It should be either a valid email address or phone number.',
        });
      }
    } catch (error) {
      sails.config.customLogger.log('error', 'Error sending message', { error: error?.message || error }, null, 'server-action', req.user?.id);
      return res.serverError({ message: 'Error sending message' });
    }
  },
};

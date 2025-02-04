module.exports = {
  sendExpertLink: async function(req, res) {
    try {
      const { expertLink, to, consultationId, messageService } = req.body;
      const { locale } = req.headers || {};
      let consultation = await Consultation.findOne({ id: consultationId }).populate('doctor');
      if (!expertLink) {
        sails.config.customLogger.log('warn', 'expertLink is missing');
        return res.badRequest({ message: 'expertLink is required' });
      }
      const isPhoneNumber = /^(\+|00)[0-9 ]+$/.test(to);
      const isEmail = to.includes('@');
      if (isPhoneNumber && !isEmail) {
        if (messageService === '1') {
          const type = 'please use this link';
          const language = req?.body?.language || 'en';
          const template = await WhatsappTemplate.findOne({ language, key: type, approvalStatus: 'approved' });
          sails.config.customLogger.log('info', `Fetched WhatsApp template for type "${type}" and language "${language}"`);
          if (template && template.sid) {
            const twilioTemplatedId = template.sid;
            const params = { 1: expertLink?.expertLink };
            if (twilioTemplatedId) {
              await sails.helpers.sms.with({
                phoneNumber: to,
                message: sails._t(locale, type, { expertLink: expertLink?.expertLink }),
                senderEmail: consultation.doctor?.email,
                whatsApp: true,
                params,
                twilioTemplatedId
              });
              sails.config.customLogger.log('info', 'WhatsApp SMS sent successfully', { to });
            } else {
              sails.config.customLogger.log('warn', 'Template id is missing for WhatsApp SMS');
            }
          } else {
            sails.config.customLogger.log('warn', `WhatsApp template not found or missing sid for language "${language}" and type "${type}"`);
          }
        } else if (messageService === '2') {
          await sails.helpers.sms.with({
            phoneNumber: to,
            message: sails._t(locale, 'please use this link', { expertLink: expertLink?.expertLink }),
            senderEmail: consultation.doctor?.email,
            whatsApp: false,
          });
          sails.config.customLogger.log('info', 'SMS sent successfully', { to });
        }
        return res.ok({ message: 'SMS sent successfully' });
      } else if (isEmail && !isPhoneNumber) {
        await sails.helpers.email.with({
          to,
          subject: sails._t(locale, 'consultation link'),
          text: sails._t(locale, 'please use this link', { expertLink: expertLink?.expertLink }),
        });
        sails.config.customLogger.log('info', 'Email sent successfully', { to });
        return res.ok({ message: 'Email sent successfully' });
      } else {
        sails.config.customLogger.log('warn', 'Invalid "to" field. It should be either a valid email address or phone number.', { to });
        return res.badRequest({
          message: 'Invalid "to" field. It should be either a valid email address or phone number.',
        });
      }
    } catch (error) {
      sails.config.customLogger.log('error', 'Error sending message', { error: error?.message || error });
      return res.serverError({ message: 'Error sending message' });
    }
  },
};

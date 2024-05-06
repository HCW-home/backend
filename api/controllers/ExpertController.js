module.exports = {
  sendExpertLink: async function (req, res) {
    try {
      const { expertLink, to, consultationId, messageService } = req.body;
      const { locale } = req.headers || {};

      let consultation = await Consultation.findOne({
        id: consultationId,
      }).populate("doctor")

      if (!expertLink) {
        return res.badRequest({ message: "expertLink is required" });
      }
      const isPhoneNumber = /^(\+|00)[0-9 ]+$/.test(to);
      const isEmail = to.includes("@");

      if (isPhoneNumber && !isEmail) {
        if (messageService === '1') {
          // WhatsApp
          await sails.helpers.sms.with({
            phoneNumber: to,
            message: sails._t(locale, "please use this link", {
              expertLink: expertLink?.expertLink,
            }),
            senderEmail: consultation.doctor?.email,
            whatsApp: true,
          });
        } else if(messageService === '2')  {
        //   SMS
          await sails.helpers.sms.with({
            phoneNumber: to,
            message: sails._t(locale, "please use this link", {
              expertLink: expertLink?.expertLink,
            }),
            senderEmail: consultation.doctor?.email,
            whatsApp: false,
          });
        }


        return res.ok({ message: "SMS sent successfully" });
      } else if (isEmail && !isPhoneNumber) {
        await sails.helpers.email.with({
          to,
          subject: sails._t(locale, "consultation link"),
          text: sails._t(locale, "please use this link", {
            expertLink: expertLink?.expertLink,
          }),
        });

        return res.ok({ message: "Email sent successfully" });
      } else {
        return res.badRequest({
          message:
            'Invalid "to" field. It should be either a valid email address or phone number.',
        });
      }
    } catch (error) {
      sails.log.error("Error sending message", error);
      return res.serverError({ message: "Error sending message" });
    }
  },
};

module.exports = {
  sendExpertLink: async function (req, res) {
    try {
      const { expertLink, to } = req.body;

      if (!expertLink) {
        return res.badRequest({ message: 'expertLink is required' });
      }
      const isPhoneNumber = /^(\+|00)[0-9 ]+$/.test(to);
      const isEmail = to.includes('@');

      if (isPhoneNumber && !isEmail) {
        await sails.helpers.sms.with({
          phoneNumber: to,
          message: `Here is the expert link: ${expertLink}`,
        });

        return res.ok({ message: 'SMS sent successfully' });
      }
      else if (isEmail && !isPhoneNumber) {
        await sails.helpers.email.with({
          to,
          subject: "Expert Link",
          text: `Here is the expert link: ${expertLink}`,
        });

        return res.ok({ message: 'Email sent successfully' });
      }
      else {
        return res.badRequest({ message: 'Invalid "to" field. It should be either a valid email address or phone number.' });
      }
    } catch (error) {
      sails.log.error('Error sending message', error);
      return res.serverError({ message: 'Error sending message' });
    }
  },
};


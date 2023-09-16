module.exports = {
  sendExpertLink: async function (req, res) {
    try {
      const { expertLink, to } = req.body;

      if (!expertLink) {
        return res.badRequest({ message: 'expertLink is required' });
      }

      await sails.helpers.email.with({
        to,
        subject: "Expert Link",
        text: `Here is the expert link: ${expertLink}`,
      });

      return res.ok({ message: 'Email sent successfully' });
    } catch (error) {
      sails.log.error('Error sending email', error);
      return res.serverError({ message: 'Error sending email' });
    }
  },
};

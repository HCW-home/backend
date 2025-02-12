module.exports = {
  statusCallback: async (req, res) => {
    try {
      const messageSid = req.body.MessageSid;
      const messageStatus = req.body.SmsStatus;

      if (messageStatus) {
        await PublicInvite.updateOne({
          whatsappMessageSid: messageSid,
        }).set({
          status: messageStatus.toUpperCase(),
        });
      }
      sails.config.customLogger.log('info', 'Twilio status callback processed', {
        messageSid,
        messageStatus,
      });

      return res.ok();
    } catch (error) {
      sails.config.customLogger.log('error', 'Error handling Twilio status callback', {
        error: error?.message,
      });
      return res.serverError();
    }
  }
};

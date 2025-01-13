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
      sails.log.info(`Message SID: ${messageSid}, Status: ${messageStatus}`);


      return res.ok();
    } catch (error) {
      sails.log.error('Error handling Twilio status callback:', error?.message);
      return res.serverError();
    }
  }
};

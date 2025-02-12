module.exports = {

  async subscribe(req, res) {
    if (!req.isSocket) {
      sails.config.customLogger.log('warn', 'subscribe: Request is not a socket.');
      return res.badRequest();
    }
    const user = await User.findOne({ id: req.user.id });
    if (!user) {
      sails.config.customLogger.log('error', 'Unauthorized access attempt - User not found');
      return res.forbidden();
    }
    const socketId = sails.sockets.getId(req);
    const socket = sails.sockets.get(socketId);
    socket.once('disconnect', async (reason) => {
      sails.config.customLogger.log('info', `User disconnected: ID=${user.id}, Reason=${reason}`);
      await Consultation.changeOnlineStatus(user, false);
    });
    sails.sockets.join(req, user.id, async (err) => {
      await Consultation.changeOnlineStatus(user, true);
      if (err) {
        sails.config.customLogger.log('error', `Error joining session: ${err.message}`);
        return res.serverError(err);
      }
      sails.config.customLogger.log('info', `User subscribed to room: ID=${user.id}`);
      return res.json({ message: `Subscribed to room ${user.id}` });
    });
  }

};


module.exports = {

  async subscribe(req, res) {
    if (!req.isSocket) {
      sails.config.customLogger.log('warn', 'subscribe: Request is not a socket.', null, 'message', req.user?.id);
      return res.badRequest();
    }
    const user = await User.findOne({ id: req.user.id });
    if (!user) {
      sails.config.customLogger.log('error', 'Unauthorized access attempt - User not found', null, 'message', req.user?.id);
      return res.forbidden();
    }
    const socketId = sails.sockets.getId(req);
    const socket = sails.sockets.get(socketId);
    socket.once('disconnect', async (reason) => {
      sails.config.customLogger.log('info', `User disconnected: ID=${user.id}, Reason=${reason}`, null, 'server-action', req.user?.id);
      await Consultation.changeOnlineStatus(user, false);
    });
    sails.sockets.join(req, user.id, async (err) => {
      await Consultation.changeOnlineStatus(user, true);
      if (err) {
        sails.config.customLogger.log('error', `Error joining session: ${err?.message || err}`, null, 'server-action', req.user?.id);
        return res.serverError(err);
      }
      sails.config.customLogger.log('info', `User subscribed to room: ID=${user.id}`, null, 'message', req.user?.id);
      return res.json({ message: `Subscribed to room ${user.id}` });
    });
  }

};


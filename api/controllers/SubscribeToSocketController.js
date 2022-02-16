/**
 * SubscribeToSocketController
 *
 * @description :: subscribe users to a room with their id for socket communications.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */


module.exports = {

  async subscribe (req, res) {
    if (!req.isSocket) {
      return res.badRequest();
    }

    const user = await User.findOne({ id: req.user.id });

    if (!user) {
      return res.forbidden();
    }



    const socketId = sails.sockets.getId(req);
    const socket = sails.sockets.get(socketId);

    socket.once('disconnect', async (reason) => {
      await Consultation.changeOnlineStatus(user, false)
    });
    sails.sockets.join(req, user.id, async (err) => {
      await Consultation.changeOnlineStatus(user, true)
      if (err) {
        sails.log('error joining session ', err);
        return res.serverError(err);
      }

      return res.json({
        message: `Subscribed to a fun room called ${user.id}!`
      });
    });

  }

};


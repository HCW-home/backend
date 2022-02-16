/**
 * SubscribeToDoctorsController
 *
 * @description ::  subscribe doctor users to a doctors  room .
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */


/**
 * Promisify sails.sockets.join
 *
 * @param {object} req
 * @param {string} room
 */
function joinP (req, room) {

  return new Promise((resolve, reject) => {
    sails.sockets.join(req, room, (err) => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}
module.exports = {

  async subscribe (req, res) {
    if (!req.isSocket) {
      return res.badRequest();
    }


    if (!req.user) {return res.forbidden();}
    if (req.user.role !== 'doctor') {
      return res.forbidden();
    }


    let queues = req.user.allowedQueues && req.user.allowedQueues.map(q => q.id);
    if (req.user.viewAllQueues) {

      queues = (await Queue.find()).map(q => q.id);
    }
    if (!queues || !queues.length) {
      res.status(200);
      return res.json({
        message: 'Subscribed to doctors! No queues '
      });
    }
    try {

      await Promise.all(queues.map(q => joinP(req, q.toString())));
    } catch (err) {
      return res.serverError(err);

    }

    res.status(200);
    return res.json({
      message: 'Subscribed to doctors!'
    });

  }

};


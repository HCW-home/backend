/**
 * QueueController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */

module.exports = {
  async find(req, res) {
    const userId = req.user ? req.user.id : 'unknown';
    const userRole = req.user ? req.user.role : 'unknown';
    sails.config.customLogger.log('info', 'Queue find action initiated', { userId, userRole });

    const viewAll = req.user.role === sails.config.globals.ROLE_ADMIN ? !!req.query.viewAllQueues : false;

    if (
      viewAll ||
      req.user.viewAllQueues ||
      req.user.role === sails.config.globals.ROLE_NURSE ||
      req.user.role === sails.config.globals.ROLE_SCHEDULER
    ) {
      const queues = await Queue.find({});
      sails.config.customLogger.log('info', 'Returning all queues', { userId, queueCount: queues.length });
      return res.json(queues);
    }

    if (req.user.allowedQueues && req.user.allowedQueues.length > 0) {
      sails.config.customLogger.log('info', 'Returning allowed queues for user', {
        userId,
        allowedQueueCount: req.user.allowedQueues.length,
      });
      return res.json(req.user.allowedQueues);
    }

    sails.config.customLogger.log('warn', 'No queues available for user', { userId });
    return res.json([]);
  }
};

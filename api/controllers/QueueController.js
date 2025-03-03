module.exports = {
  async find(req, res) {
    const userId = req.user ? req.user.id : 'unknown';
    const userRole = req.user ? req.user.role : 'unknown';
    sails.config.customLogger.log('verbose', `Queue find action initiated for user with id ${userId} and role ${userRole}`, null, 'user-action');

    const viewAll = req.user.role === sails.config.globals.ROLE_ADMIN ? !!req.query.viewAllQueues : false;

    if (
      viewAll ||
      req.user.viewAllQueues ||
      req.user.role === sails.config.globals.ROLE_NURSE ||
      req.user.role === sails.config.globals.ROLE_SCHEDULER
    ) {
      const queues = await Queue.find({});
      sails.config.customLogger.log('verbose', 'Returning all queues', { userId, queueCount: queues.length }, 'server-action');
      return res.json(queues);
    }

    if (req.user.allowedQueues && req.user.allowedQueues.length > 0) {
      sails.config.customLogger.log('verbose', `Returning allowed queues for user ${userId} allowedQueueCount ${req.user.allowedQueues.length}`, null, 'server-action');
      return res.json(req.user.allowedQueues);
    }

    sails.config.customLogger.log('warn', `No queues available for user with id ${userId}`, null, 'message');
    return res.json([]);
  }
};

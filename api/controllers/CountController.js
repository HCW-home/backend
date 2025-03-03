const actionUtil = require('sails/lib/hooks/blueprints/actionUtil');

module.exports = {
  count(request, response) {
    sails.config.customLogger.log('info', 'Count action initiated');
    const Model = actionUtil.parseModel(request);
    const criteria = actionUtil.parseCriteria(request);

    Model.count(criteria).exec((error, count) => {
      if (error) {
        sails.config.customLogger.log('error', 'Error in count action', { error: error?.message || error }, 'server-action', request.user?.id);
        return response.negotiate(error);
      } else {
        sails.config.customLogger.log('info', `Count result ${count}`, null, 'message', request.user?.id);
        return response.ok({ count });
      }
    });
  },
};

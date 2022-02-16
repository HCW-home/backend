const actionUtil = require('sails/lib/hooks/blueprints/actionUtil');
module.exports = {
  /*
   * Generic count action for controller.
   *
   * @param   {Request}   request
   * @param   {Response}  response
   */
  count(request, response) {
    console.log('count');
    const Model = actionUtil.parseModel(request);
    const criteria = actionUtil.parseCriteria(request);

    Model
      .count(criteria)
      .exec((error, count) => {
        if (error) {
          console.log(error);
          response.negotiate(error);
        } else {
          console.log(count);
          response.ok({ count });
        }
      });
  },
};

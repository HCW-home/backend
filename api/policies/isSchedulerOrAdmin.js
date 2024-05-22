module.exports = function (req, res, proceed) {


  if (req.user && (req.user.role === sails.config.globals.ROLE_SCHEDULER || req.user.role === sails.config.globals.ROLE_ADMIN)) {
    return proceed();
  }
  return res.forbidden();


};

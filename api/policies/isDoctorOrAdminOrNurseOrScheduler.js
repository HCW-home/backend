module.exports = function (req, res, proceed) {


  if (req.user && (req.user.role === sails.config.globals.ROLE_ADMIN || req.user.role === sails.config.globals.ROLE_DOCTOR || req.user.role === sails.config.globals.ROLE_NURSE || req.user.role === sails.config.globals.ROLE_SCHEDULER)) {
    return proceed();

  }
  return res.forbidden();


};

module.exports = function (req, res, proceed) {


  if (req.user && (req.user.role === sails.config.globals.ROLE_ADMIN || req.user.role === sails.config.globals.ROLE_NURSE)) {
    return proceed();

  }
  return res.forbidden();


};

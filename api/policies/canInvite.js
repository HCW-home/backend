const roles = ['admin', 'doctor', 'scheduler']
module.exports = function (req, res, proceed) {


  if (req.user && roles.includes(req.user.role)) {
    return proceed();
  }
  return res.forbidden();


};

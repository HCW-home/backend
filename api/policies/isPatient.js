module.exports = function (req, res, proceed) {


  if (req.user && req.user.role === 'patient') {
    return proceed();

  }
  return res.forbidden();


};

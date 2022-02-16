module.exports = function (req, res, proceed) {


  if (req.user && req.user.role === 'doctor') {
    return proceed();

  }
  return res.forbidden();


};

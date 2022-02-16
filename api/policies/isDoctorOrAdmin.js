module.exports = function (req, res, proceed) {


  if (req.user && (req.user.role === 'admin' || req.user.role === 'doctor')) {
    return proceed();

  }
  return res.forbidden();


};

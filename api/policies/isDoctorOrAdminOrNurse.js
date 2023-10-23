module.exports = function (req, res, proceed) {


  if (req.user && (req.user.role === 'admin' || req.user.role === 'doctor' || req.user.role === 'nurse')) {
    return proceed();

  }
  return res.forbidden();


};

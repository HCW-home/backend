module.exports = function (req, res, proceed) {


  if (req.user && (req.user.role === 'patient' || req.user.role === 'nurse' || req.user.role === 'translator')) {
    return proceed();

  }
  return res.forbidden();


};

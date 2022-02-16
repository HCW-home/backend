module.exports = function (req, res, proceed) {


  if (req.user && req.user.role === 'nurse') {
    return proceed();
  }
  return res.forbidden();


};

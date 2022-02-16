module.exports = function (req, res, proceed) {


  if (req.user && req.user.role === 'scheduler') {
    return proceed();
  }
  return res.forbidden();


};

module.exports = function (req, res, proceed) {






  if (req.user && req.user.role === 'admin') {
    return proceed();

  }
  return res.forbidden();


};

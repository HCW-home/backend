module.exports = function (req, res, proceed) {

  req.body.doctor = req.user.id;
  return proceed();
};

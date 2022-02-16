module.exports = function (req, res, proceed) {


  req.body.status = 'pending';
  req.body.owner = req.user.id;
  return proceed();
};

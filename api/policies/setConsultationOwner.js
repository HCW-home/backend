module.exports = function (req, res, proceed) {
  req.body.status = 'pending';

  if (req.user.role !== 'guest' && req.user.role !== 'translator' && req.user.role !== 'expert') {
    req.body.owner = req.user.id;
  }

  return proceed();
};

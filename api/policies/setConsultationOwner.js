module.exports = function (req, res, proceed) {
  req.body.status = 'pending';

  if (req.user.role !== 'guest' && req.user.role !== 'translator') {
    req.body.owner = req.user.id;
  }

  return proceed();
};

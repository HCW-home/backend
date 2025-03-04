module.exports = function (req, res) {
  let inviteId = (req.body ? req.body.invite : null) || req.params.invite || req.query.invite || req.params.id;
  if (inviteId) {
    return inviteId;
  }
  if (req.query.where) {
    try {
      inviteId = JSON.parse(req.query.where).invite;
    } catch (err) {
      sails.config.customLogger.log('error', 'Invalid where parameter for invite ID', { error: err?.message || err}, 'message', req.user?.id);
      return res.badRequest('invalid where parameter');
    }
  }
  return inviteId;
};

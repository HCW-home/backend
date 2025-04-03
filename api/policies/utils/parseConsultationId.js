module.exports = function (req, res) {
  let consultationId = (req.body ? req.body.consultation : null) || req.params.consultation || req.query.consultation;
  if (consultationId) {
    return consultationId;
  }
  if (req.query.where) {
    try {
      consultationId = JSON.parse(req.query.where).consultation;
    } catch (err) {
      sails.config.customLogger.log('error', 'Invalid where parameter for consultation ID', { error: err?.message || err }, 'message', req.user?.id);
      return res.badRequest('invalid where parameter');
    }
  }
  return consultationId;
};

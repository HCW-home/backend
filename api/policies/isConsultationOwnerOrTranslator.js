module.exports = async function (req, res, proceed) {
  let consultationId = (req.body ? req.body.consultation : null) || req.params.consultation;
  if (req.query.where) {
    try {
      consultationId = JSON.parse(req.query.where).consultation;
    } catch (err) {
      sails.config.customLogger.log('error', 'Invalid where parameter in consultation middleware', { error: err?.message || err }, 'message', req.user?.id);
      return res.badRequest('invalid where parameter');
    }
  }
  let consultation;
  try {
    if (req.user.role === 'nurse' || req.user.role === 'patient') {
      consultation = await Consultation.count({
        id: consultationId,
        owner: req.user.id
      });
    } else if (req.user.role === 'doctor') {
      consultation = await Consultation.count({
        id: consultationId,
        or: [
          { acceptedBy: req.user.id, _id: consultationId },
          { acceptedBy: null }
        ]
      });
    } else if (req.user.role === 'translator') {
      consultation = await Consultation.count({
        id: consultationId,
        translator: req.user.id
      });
    }
  } catch (err) {
    sails.config.customLogger.log('error', 'Error checking consultation access', { consultationId, error: err?.message || err }, 'server-action', req.user?.id);
    return res.serverError('Server error');
  }
  if (!consultation) {
    sails.config.customLogger.log('warn', `Forbidden access to consultation for consultationId ${consultationId}`, null, 'message', req.user?.id);
    return res.forbidden();
  }
  return proceed();
};

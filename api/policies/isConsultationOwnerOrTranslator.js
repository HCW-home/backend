module.exports = async function (req, res, proceed) {
  let consultationId = (req.body ? req.body.consultation : null) || req.params.consultation;
  if (req.query.where) {
    try {
      consultationId = JSON.parse(req.query.where).consultation;
    } catch (err) {
      sails.config.customLogger.log('error', 'Invalid where parameter in consultation middleware', { error: err?.message || err });
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
    sails.config.customLogger.log('error', 'Error checking consultation access', { userId: req.user.id, consultationId, error: err?.message || err });
    return res.serverError('Server error');
  }
  if (!consultation) {
    sails.config.customLogger.log('warn', 'Forbidden access to consultation', { userId: req.user.id, consultationId });
    return res.forbidden();
  }
  return proceed();
};

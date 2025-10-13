module.exports = async function (req, res, proceed) {
  let consultationId = (req.body ? req.body.consultation : null) || req.params.consultation;
  if (req.query.where) {
    try {
      consultationId = JSON.parse(req.query.where).consultation;
    } catch (err) {
      sails.config.customLogger.log('error', 'Invalid where parameter in consultation middleware', { error: err.message }, 'message', req.user?.id);
      return res.badRequest('invalid where parameter');
    }
  }
  let consultation;
  let consultationExists;
  try {
    consultationExists = await Consultation.count({
      id: consultationId
    });

    if (!consultationExists) {
      sails.config.customLogger.log('warn', `Consultation not found: ${consultationId}`, null, 'message', req.user?.id);
      return res.notFound('Consultation not found');
    }

    if (req.user.role === 'expert') {
      consultation = await Consultation.count({
        id: consultationId,
        experts: req.user.id
      });
    } else if (req.user.role === 'nurse' || req.user.role === 'patient') {
      consultation = await Consultation.count({
        id: consultationId,
        owner: req.user.id
      });
    } else if (req.user.role === 'doctor' || req.user.role === 'admin') {
      consultation = await Consultation.count({
        id: consultationId,
        or: [
          { acceptedBy: req.user.id, _id: consultationId },
          { acceptedBy: null }
        ]
      });

      if (!consultation) {
        const consultationData = await Consultation.findOne({ id: consultationId }).populate('queue');
        if (consultationData && consultationData.queue && consultationData.queue.shareWhenOpened) {
          consultation = 1;
        }
      }
    } else if (req.user.role === 'translator') {
      consultation = await Consultation.count({
        id: consultationId,
        translator: req.user.id
      });
    } else if (req.user.role === 'guest') {
      consultation = await Consultation.count({
        id: consultationId,
        guest: req.user.id
      });
    }
  } catch (err) {
    sails.config.customLogger.log('error', 'Error checking consultation access', { consultationId, error: err?.message || err }, 'message', req.user?.id);
    return res.serverError('Server error');
  }

  if (!consultation) {
    sails.config.customLogger.log('warn', `Forbidden: User does not have access to consultation ${consultationId}`, null, 'message', req.user?.id);
    return res.forbidden('You do not have permission to access this consultation');
  }

  return proceed();
};

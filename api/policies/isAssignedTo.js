module.exports = async function(req, res, proceed) {

  let consultationId = (req.body ? req.body.consultation : null) || req.params.consultation;
  if (req.query.where) {
    try {
      consultationId = JSON.parse(req.query.where).consultation;
    } catch (err) {
      sails.config.customLogger.log('error', 'Invalid where parameter for consultation ID', { error: err?.message || err }, 'message', req.user?.id);
      res.badRequest('invalid where parameter');
    }
  }

  let consultation;

  consultation = await Consultation.findOne({
    id: consultationId
  });


  if (!consultation) {
    sails.config.customLogger.log('warn', 'Consultation not found', { consultationId });
    return res.forbidden('Consultation not found');
  }

  if (consultation.queue) {

    if (!req.user.viewAllQueues) {
      if (!req.user.allowedQueues || !req.user.allowedQueues.length) {
        return res.forbidden();
      }

      const isQueueAllowed = req.user.allowedQueues.find(q => consultation.queue === q.id);
      if (!isQueueAllowed) {
        return res.forbidden();
      }

    }

  } else if (consultation.doctor) {
    if (req.user.id !== consultation.doctor) {
      return res.forbidden();
    }
  }

  return proceed();
};

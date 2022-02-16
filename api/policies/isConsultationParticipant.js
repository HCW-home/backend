module.exports = async function (req, res, proceed) {

  let consultationId = (req.body ? req.body.consultation : null) || req.params.consultation;
  if (req.query.where) {
    try {
      consultationId = JSON.parse(req.query.where).consultation;
    } catch (err) {
      console.error(err);
      res.badRequest('invalid where parameter');
    }
  }
  let consultation;
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
  } else if (req.user.role === 'guest') {
    consultation = await Consultation.count({
      id: consultationId,
      guest: req.user.id
    });
  }

  if (!consultation) {

    return res.forbidden();
  }

  return proceed();
};

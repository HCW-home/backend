
module.exports = async function (req, res, proceed) {

  let consultation;
  const { user } = req;
  if (user.role === sails.config.globals.ROLE_DOCTOR || user.role === sails.config.globals.ROLE_ADMIN) {
    // doctors can respond to pending consultation
    consultation = await Consultation.findOne({
      or: [
        { status: 'pending', id: req.body.consultation || req.params.consultation },
        { acceptedBy: user.id, id: req.body.consultation || req.params.consultation }
      ] });
  }

  if (user.role === sails.config.globals.ROLE_NURSE || user.role === sails.config.globals.ROLE_PATIENT) {
    consultation = await Consultation.findOne(
        { owner: user.id, _id: req.body.consultation || req.params.consultation }
    );
  }

  if (user.role === sails.config.globals.ROLE_EXPERT) {
    consultation = await Consultation.findOne({
      id: req.body.consultation,
      experts: req.user.id
    });
  }

  if (!consultation) {
    return res.forbidden();
  }
  // if consultation it's closed it's forbiden to add a comment
  else if (consultation.status === 'closed') {
    res.status(403);
    return res.json({ message: 'closed' });
  }

  req.body.from = user.id;
  // Ignore the "to" sent through the api
  req.body.to = null;

  // Determine the message destination based on sender's role and consultation state
  if (user.role === sails.config.globals.ROLE_DOCTOR || user.role === sails.config.globals.ROLE_ADMIN) {
    // Doctor/Admin sending message -> send to patient/owner
    req.body.to = consultation.owner;
  } else if (user.role === sails.config.globals.ROLE_NURSE || user.role === sails.config.globals.ROLE_PATIENT) {
    // Patient/Nurse sending message -> send to doctor (if assigned)
    if (consultation.acceptedBy) {
      req.body.to = consultation.acceptedBy;
    } else if (consultation.doctor) {
      req.body.to = consultation.doctor;
    }
    // If no doctor assigned yet (pending consultation), to remains null (broadcast to queue)
  } else if (user.role === sails.config.globals.ROLE_EXPERT) {
    // Expert sending message -> send to doctor or owner based on consultation state
    if (consultation.acceptedBy) {
      req.body.to = consultation.acceptedBy;
    } else {
      req.body.to = consultation.owner;
    }
  } else if (user.role === sails.config.globals.ROLE_TRANSLATOR) {
    // Translator sending message -> typically to owner, but could be to doctor
    if (consultation.acceptedBy && consultation.acceptedBy !== user.id) {
      req.body.to = consultation.acceptedBy;
    } else {
      req.body.to = consultation.owner;
    }
  } else if (user.role === sails.config.globals.ROLE_GUEST) {
    // Guest sending message -> typically to owner or doctor
    if (consultation.acceptedBy) {
      req.body.to = consultation.acceptedBy;
    } else {
      req.body.to = consultation.owner;
    }
  }

  return proceed();
};

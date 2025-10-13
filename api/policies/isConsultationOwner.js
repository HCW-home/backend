const parseConsultationId = require("./utils/parseConsultationId");
module.exports = async function (req, res, proceed) {
  const consultationId = parseConsultationId(req, res);

  if (!consultationId) {
    return res.notFound();
  }

  let consultationExists;
  try {
    consultationExists = await Consultation.count({
      id: consultationId
    });

    if (!consultationExists) {
      sails.config.customLogger.log('warn', `Consultation not found: ${consultationId}`, null, 'message', req.user?.id);
      return res.notFound('Consultation not found');
    }
  } catch (err) {
    sails.config.customLogger.log('error', 'Error checking consultation existence', { consultationId, error: err?.message || err }, 'server-action', req.user?.id);
    return res.serverError('Server error');
  }

  let consultation;
  const { role } = req.user;
  try {
    if (role === "nurse" || role === "patient") {
    consultation = await Consultation.count({
      id: consultationId,
      owner: req.user.id,
    });
  } else if (role === "doctor" || role === "admin") {
    // Check if the user does have access to this specific consultation
    consultation = null;
    let acceptedByMyselfOrDoctor = 0;
    let acceptedBySomeoneElse = 0;
    // If the authenticated account accepted it, allow access...
    acceptedByMyselfOrDoctor = await Consultation.count({
      id: consultationId,
      or: [{ acceptedBy: req.user.id }, { doctor: req.user.id }],
    });

    if (acceptedByMyselfOrDoctor) {
      consultation = 1;
    } else {
      // Check if the consultation belongs to a shared queue
      const consultationData = await Consultation.findOne({ id: consultationId }).populate('queue');
      if (consultationData && consultationData.queue && consultationData.queue.shareWhenOpened) {
        consultation = 1;
      } else {
        acceptedBySomeoneElse = await Consultation.count({
          id: consultationId,
          and: [
            { acceptedBy: { "!=": null } },
            { acceptedBy: { "!=": req.user.id } },
          ],
        });

        if (acceptedBySomeoneElse) {
          consultation = 0;
        } else {
          const myQueues = req.user.allowedQueues;
          if (myQueues) {
            consultation = await Consultation.count({
              id: consultationId,
              acceptedBy: null,
              queue: { in: myQueues.map((q) => q.id) },
            });
          }
        }
      }
    }
  } else if (role === "scheduler") {
    consultation = await Consultation.count({
      id: consultationId,
      invitedBy: req.user.id,
    });
  } else if (role === "translator") {
    consultation = await Consultation.count({
      id: consultationId,
      translator: req.user.id,
    });
  } else if (role === "guest") {
    consultation = await Consultation.count({
      id: consultationId,
      guest: req.user.id,
    });
  } else if (role === "expert") {
    consultation = await Consultation.count({
      id: consultationId,
      experts: req.user.id,
    });
    } else {
      sails.config.customLogger.log('warn', `Unknown role: ${role}`, null, 'message', req.user?.id);
      return res.forbidden('Invalid user role');
    }
  } catch (err) {
    sails.config.customLogger.log('error', 'Error checking consultation access', { consultationId, error: err?.message || err }, 'server-action', req.user?.id);
    return res.serverError('Server error');
  }

  if (!consultation) {
    sails.config.customLogger.log('warn', `Forbidden: User does not have access to consultation ${consultationId}`, null, 'message', req.user?.id);
    return res.forbidden('You do not have permission to access this consultation');
  }

  return proceed();
};

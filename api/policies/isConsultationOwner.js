const parseConsultationId = require("./utils/parseConsultationId");
module.exports = async function (req, res, proceed) {
  const consultationId = parseConsultationId(req, res);

  if (!consultationId) {
    return res.notFound();
  }
  let consultation;
  const { role } = req.user;
  if (role === "nurse" || role === "patient") {
    consultation = await Consultation.count({
      id: consultationId,
      owner: req.user.id,
    });
  } else if (role === "doctor" || role === "admin") {
    consultation = await Consultation.count({
      id: consultationId,
      or: [
        { acceptedBy: req.user.id, _id: consultationId },
        { acceptedBy: null },
      ],
    });

    // Check if the user does have access to this specific consultation
    consultation = null;
    // If the authenticated account accepted it, allow access...
    consultation = await Consultation.count({
      id: consultationId,
      acceptedBy: req.user.id,
    });

    if (!consultation) {
      // If accepted by someone else, not allow read it
      consultation = await Consultation.count({
        id: consultationId,
        and: [
          { acceptedBy: { "!=": null } },
          { acceptedBy: { "!=": req.user.id } },
        ],
      });
    }

    // Check if the consultation is in an accessible queue and not accepted yet
    if (!consultation) {
      const myQueues = req.user.allowedQueues;
      if (myQueues) {
        consultation = await Consultation.count({
          id: consultationId,
          acceptedBy: null,
          queue: { in: myQueues.map((q) => q.id) },
        });
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
    return res.notFound();
  }
  if (!consultation) {
    return res.forbidden();
  }

  return proceed();
};

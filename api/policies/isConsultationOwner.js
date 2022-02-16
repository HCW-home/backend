const parseConsultationId = require('./utils/parseConsultationId')
module.exports = async function (req, res, proceed) {

  const consultationId =  parseConsultationId(req, res)

  if(!consultationId){
    return res.notFound()
  }
  let consultation;
  const {role} = req.user
  if (role === 'nurse' || role === 'patient') {

    consultation = await Consultation.count({
      id: consultationId,
      owner: req.user.id
    });

  } else if (role === 'doctor') {

    consultation = await Consultation.count({
      id: consultationId,
      or: [
        { acceptedBy: req.user.id, _id: consultationId },
        { acceptedBy: null }
      ]
    });

  }else if(role === 'scheduler'){
    consultation = await Consultation.count({
      id: consultationId,
      invitedBy: req.user.id
    });
  }else if(role === 'translator'){
    consultation = await Consultation.count({
      id: consultationId,
      translator: req.user.id
    });
  }else if (role === 'guest'){
    consultation = await Consultation.count({
      id: consultationId,
      guest: req.user.id
    });
  }else{
    return res.notFound()
  }
  if (!consultation) {

    return res.forbidden();
  }

  return proceed();
};

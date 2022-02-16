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

  consultation = await Consultation.findOne({
    id: consultationId
  });



  if(consultation.queue){

    if(!req.user.viewAllQueues){
      if (!req.user.allowedQueues ||  !req.user.allowedQueues.length) {
        return res.forbidden();
      }

      const isQueueAllowed = req.user.allowedQueues.find(q=> consultation.queue === q.id)
      if(!isQueueAllowed){
        return res.forbidden();
      }

    }

  }else if(consultation.doctor){
    if(req.user.id !== consultation.doctor){
      return res.forbidden();
    }
  }

  return proceed();
};

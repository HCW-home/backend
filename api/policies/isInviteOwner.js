
const parseInviteId = require('./utils/parseInviteId')

module.exports = async function (req, res, proceed) {

  const ownerFilter = {

    type: 'PATIENT',

  }

  let queues = [];
  if (req.user.allowedQueues && req.user.allowedQueues.length > 0) {
    queues = req.user.allowedQueues.map(q => q.id);
  } else if (req.user.viewAllQueues) {
    queues = await Queue.find({});
    queues = queues.map(q => q.id);
  }

  ownerFilter.or = [
    {
      doctor: req.user.id
    },
    {

      queue: queues
    },
    {
      invitedBy: req.user.id
    }
  ]

  const inviteId = parseInviteId(req, res)
  if(inviteId){
    ownerFilter.id = inviteId
    const exists = await PublicInvite.count(ownerFilter)
    if(!exists){
      const [consultation] = await Consultation.find({invite: inviteId});
      if(consultation){
        if(consultation.doctor === req.user.id || consultation.invitedBy === req.user.id){
          return proceed();
        }
      }
      const [anonymousConsultation] = await AnonymousConsultation.find({invite: inviteId});
     if(anonymousConsultation){
       if(anonymousConsultation.doctor === req.user.id || anonymousConsultation.invitedBy === req.user.id){
         return proceed();
       }
     }
      return res.notFound()
    }
  }else{
    req.query.where = JSON.stringify(ownerFilter);
  }

  return proceed();

};

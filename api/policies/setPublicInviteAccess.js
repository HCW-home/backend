module.exports = async function(req, res, proceed) {

  let queues = []

  if (req.user.allowedQueues && req.user.allowedQueues.length > 0) {
    queues = req.user.allowedQueues.map(q=>q.id);
  }
  //if the user have no queue by default he can see alls
  else  if(req.user.viewAllQueues) {
      queues = await Queue.find({});
      queues = queues.map(q=>q.id);

  }


  req.query.where = {
    or: [
      {doctor: req.user.id},
      {queue: queues}
    ]
  }

  return proceed();
};

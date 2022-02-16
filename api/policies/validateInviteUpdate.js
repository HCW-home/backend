
module.exports = function (req, res, proceed) {


  if(req.body.scheduledFor){
    try {

      req.body.scheduledFor = new Date(req.body.scheduledFor);
    } catch (error) {
      return res.status(400).json({success: false, error: 'scheduledFor is not a valid date'})
    }
  }


  return proceed();
};

module.exports = function (req, res) {

  let consultationId = (req.body ? req.body.consultation : null) || req.params.consultation || req.query.consultation;
  if(consultationId) return consultationId;
  if (req.query.where) {
    try {
      consultationId = JSON.parse(req.query.where).consultation;
    } catch (err) {
      console.error(err);
      res.badRequest('invalid where parameter');
    }
  }
  return consultationId

}

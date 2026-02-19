const jwt = require('jsonwebtoken');

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return req.query.token || null;
}

module.exports = function(req, res, proceed) {

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  jwt.verify(token, sails.config.globals.APP_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (decoded.singleFactor) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (decoded.role === 'doctor') {
      if (!decoded.doctorClientVersion) {
        await User.updateOne({ email: decoded.email }).set({ doctorClientVersion: 'invalid' });
        return res.status(401).json({ error: 'Unauthorized App version needs to be updated' });
      }
      if (decoded.doctorClientVersion === 'invalid') {
        return res.status(401).json({ error: 'Unauthorized App version needs to be updated' });
      }
    }

    const user = await User.findOne({
      id: decoded.id
    }).populate('allowedQueues');


    if (!user) {
      sails.log('error ', 'No user');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = user;
    return proceed();
  });


};

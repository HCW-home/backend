const jwt = require('jsonwebtoken');

module.exports = {
  generateToken(user) {
    const token = jwt.sign({ id: user.id }, sails.config.globals.APP_SECRET, { expiresIn: sails.config.globals.ACCESS_TOKEN_LIFE });
    const refreshToken = jwt.sign({ id: user.id }, sails.config.globals.REFRESH_TOKEN_SECRET, { expiresIn: sails.config.globals.REFRESH_TOKEN_LIFE });
    return { token, refreshToken };
  },

  verifyToken(token, isRefreshToken = false) {
    const secret = isRefreshToken ? sails.config.globals.REFRESH_TOKEN_SECRET : sails.config.globals.APP_SECRET;
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      throw error;
    }
  }
};

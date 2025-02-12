const jwt = require('jsonwebtoken');

module.exports = {
  generateToken(user) {
    sails.config.customLogger.log('info', `Generating JWT tokens for user ${user.id}`);
    const token = jwt.sign(
      { id: user.id },
      sails.config.globals.APP_SECRET,
      { expiresIn: sails.config.globals.ACCESS_TOKEN_LIFE }
    );
    const refreshToken = jwt.sign(
      { id: user.id },
      sails.config.globals.REFRESH_TOKEN_SECRET,
      { expiresIn: sails.config.globals.REFRESH_TOKEN_LIFE }
    );
    sails.config.customLogger.log('info', `JWT tokens generated successfully for user ${user.id}`);
    return { token, refreshToken };
  },

  verifyToken(token, isRefreshToken = false) {
    const secret = isRefreshToken
      ? sails.config.globals.REFRESH_TOKEN_SECRET
      : sails.config.globals.APP_SECRET;
    try {
      sails.config.customLogger.log('info', 'Verifying JWT token');
      return jwt.verify(token, secret);
    } catch (error) {
      sails.config.customLogger.log('error', 'Error verifying JWT token', { error: error?.message || error });
      throw error;
    }
  }
};

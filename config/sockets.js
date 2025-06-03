const jwt = require('jsonwebtoken')
module.exports.sockets = {
  transports: [
    'websocket',
  ],
  adapter: '@sailshq/socket.io-redis',
  host:  process.env.REDIS_HOST || '127.0.0.1' ,
  port: process.env.REDIS_PORT || '6379',
  pass: process.env.REDIS_PASSWORD,
  origins: '*:*',

  'heartbeat timeout': 25,
  pingTimeout:10000,
  'heartbeat interval': 15,
  pingInterval:15000,

  beforeConnect(handshake, proceed) {
    if (handshake._query && handshake._query.token) {
      jwt.verify(
        handshake._query.token,
        sails.config.globals.APP_SECRET,
        async (err, decoded) => {
          if (err) {
            sails.config.customLogger.log('error', 'JWT verification failed', null, 'server-action', null);
            return proceed(false);
          }
          const user = await User.findOne({ id: decoded.id });
          if (!user) {
            sails.config.customLogger.log('error', 'No user found', null, 'server-action', null);
            return proceed(false);
          }
          handshake.user = user;
          sails.config.customLogger.log('info', `Connecting User to Socket: ${user.id}`, null, 'server-action', user?.id);
          return proceed(undefined, true);
        }
      );
    } else {
      sails.config.customLogger.log('warn', 'No token was found', null, 'server-action', null);
      return proceed({ message: 'no Token was found' }, false);
    }
  }

}

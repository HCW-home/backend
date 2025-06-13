const Redis = require('ioredis');

module.exports = {
  check: async function (req, res) {
    const startTime = Date.now();
    let response = {
      status: 'success',
      mongo: 'healthy',
      redis: 'healthy',
      clamav: 'healthy'
    };

    const checkMongo = () => new Promise((resolve) => {
      const mongoDbNativeConnection = sails.getDatastore().manager;
      if (!mongoDbNativeConnection) {
        sails.config.customLogger.log('error', 'MongoDB not reachable', null, 'message', null);
        response.mongo = 'unhealthy';
      } else {
        sails.config.customLogger.log('verbose', 'MongoDB is healthy', null, 'message', null);
      }
      resolve();
    });

    const checkRedis = () => new Promise((resolve) => {
      const redisClient = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379
      });

      redisClient.ping((err, result) => {
        redisClient.disconnect();
        if (err || result !== 'PONG') {
          sails.config.customLogger.log('error', 'Redis not reachable', {
            error: err ? err.message : 'Invalid response'
          }, 'message', null);
          response.redis = 'unhealthy';
        } else {
          sails.config.customLogger.log('verbose', 'Redis is healthy', null, 'message', null);
        }
        resolve();
      });
    });

    const checkClamAV = () => new Promise((resolve) => {
      const clamscanInstance = sails.config.globals.clamscan;
      if (!clamscanInstance) {
        sails.config.customLogger.log('error', 'ClamAV not initialized (clamscan object missing)', null, 'message', null);
        response.clamav = 'unhealthy';
        return resolve();
      }

      clamscanInstance.getVersion().then(version => {
        sails.config.customLogger.log('verbose', `ClamAV is responsive: version ${version}`, null, 'message', null);
        resolve();
      }).catch(err => {
        sails.config.customLogger.log('error', 'ClamAV is not responsive to version check', { error: err.message }, 'message', null);
        response.clamav = 'unhealthy';
        resolve();
      });
    });

    await Promise.allSettled([
      checkMongo(),
      checkRedis(),
      checkClamAV()
    ]);


    if (response.mongo !== 'healthy' || response.redis !== 'healthy' || response.clamav !== 'healthy') {
      response.status = 'failure';
      sails.config.customLogger.log('error', 'System health check failed', response, 'server-action', null);
      return res.status(503).send(response);
    }

    sails.config.customLogger.log('verbose', `System health check successful`, null, 'message', null);
    return res.status(200).send(response);
  }
};

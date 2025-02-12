const Redis = require('ioredis');
const net = require('net');
const fs = require('fs');

module.exports = {
  check: async function(req, res) {
    const startTime = Date.now();
    let response = {
      status: 'success',
      mongo: 'healthy',
      redis: 'healthy',
      clamav: 'healthy'
    };

    const checkMongo = new Promise((resolve, reject) => {
      let mongoDbNativeConnection = sails.getDatastore().manager;
      if (!mongoDbNativeConnection) {
        sails.config.customLogger.log('error', 'MongoDB not reachable', { component: 'MongoDB' });
        reject(new Error('MongoDB not reachable'));
      } else {
        sails.config.customLogger.log('info', 'MongoDB is healthy', { component: 'MongoDB' });
        resolve();
      }
    });

    const checkRedis = new Promise((resolve, reject) => {
      const redisClient = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379
      });

      redisClient.ping((err, result) => {
        redisClient.disconnect();
        if (err || result !== 'PONG') {
          sails.config.customLogger.log('error', 'Redis not reachable', {
            component: 'Redis',
            error: err ? err.message : 'Invalid response'
          });
          reject(new Error('Redis not reachable'));
        } else {
          sails.config.customLogger.log('info', 'Redis is healthy', { component: 'Redis' });
          resolve();
        }
      });
    });

    const checkClamAV = new Promise((resolve, reject) => {
      if (process.env.CLAM_SOCKET) {
        fs.access(process.env.CLAM_SOCKET, (err) => {
          if (err) {
            sails.config.customLogger.log('error', 'ClamAV UNIX socket not reachable', {
              component: 'ClamAV',
              socket: process.env.CLAM_SOCKET
            });
            reject(new Error('ClamAV UNIX socket not reachable'));
          } else {
            sails.config.customLogger.log('info', 'ClamAV UNIX socket is reachable', {
              component: 'ClamAV',
              socket: process.env.CLAM_SOCKET
            });
            resolve();
          }
        });
      } else if (process.env.CLAM_HOST) {
        const clamavClient = new net.Socket();
        const clamPort = process.env.CLAM_PORT || 3310;
        clamavClient.connect(clamPort, process.env.CLAM_HOST, () => {
          clamavClient.end();
          sails.config.customLogger.log('info', 'ClamAV TCP socket is reachable', {
            component: 'ClamAV',
            host: process.env.CLAM_HOST,
            port: clamPort
          });
          resolve();
        });
        clamavClient.on('error', (err) => {
          sails.config.customLogger.log('error', 'ClamAV TCP socket not reachable', {
            component: 'ClamAV',
            host: process.env.CLAM_HOST,
            error: err.message
          });
          reject(new Error('ClamAV TCP socket not reachable'));
        });
      } else {
        const defaultSocket = 'var/run/clamd.scan/clamd.sock';
        fs.access(defaultSocket, (err) => {
          if (err) {
            sails.config.customLogger.log('error', 'ClamAV default UNIX socket not reachable', {
              component: 'ClamAV',
              socket: defaultSocket
            });
            reject(new Error('ClamAV default UNIX socket not reachable'));
          } else {
            sails.config.customLogger.log('info', 'ClamAV default UNIX socket is reachable', {
              component: 'ClamAV',
              socket: defaultSocket
            });
            resolve();
          }
        });
      }
    });

    try {
      await Promise.all([checkMongo, checkRedis, checkClamAV]);
      response.responseTime = Date.now() - startTime;
      sails.config.customLogger.log('info', 'System health check successful', {
        responseTime: response.responseTime
      });
      return res.status(200).send(response);
    } catch (error) {
      response.status = 'failure';
      if (error.message === 'MongoDB not reachable') {
        response.mongo = error.message;
      }
      if (error.message === 'Redis not reachable') {
        response.redis = error.message;
      }
      if (error.message.includes('ClamAV')) {
        response.clamav = error.message;
      }
      sails.config.customLogger.log('error', 'System health check failed', { error: error.message });
      return res.status(503).send(response);
    }
  }
};

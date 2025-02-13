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
        sails.config.customLogger.log('error', 'MongoDB not reachable', null, 'message');
        reject(new Error('MongoDB not reachable'));
      } else {
        sails.config.customLogger.log('info', 'MongoDB is healthy', null, 'message');
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
            error: err ? err.message : 'Invalid response'
          }, 'message');
          reject(new Error('Redis not reachable'));
        } else {
          sails.config.customLogger.log('info', 'Redis is healthy', null, 'message');
          resolve();
        }
      });
    });

    const checkClamAV = new Promise((resolve, reject) => {
      if (process.env.CLAM_SOCKET) {
        fs.access(process.env.CLAM_SOCKET, (err) => {
          if (err) {
            sails.config.customLogger.log('error', 'ClamAV UNIX socket not reachable', {
              socket: process.env.CLAM_SOCKET
            }, 'message');
            reject(new Error('ClamAV UNIX socket not reachable'));
          } else {
            sails.config.customLogger.log('info', 'ClamAV UNIX socket is reachable', {
              socket: process.env.CLAM_SOCKET
            }, 'message');
            resolve();
          }
        });
      } else if (process.env.CLAM_HOST) {
        const clamavClient = new net.Socket();
        const clamPort = process.env.CLAM_PORT || 3310;
        clamavClient.connect(clamPort, process.env.CLAM_HOST, () => {
          clamavClient.end();
          sails.config.customLogger.log('info', 'ClamAV TCP socket is reachable', {
            host: process.env.CLAM_HOST,
            port: clamPort
          }, 'message');
          resolve();
        });
        clamavClient.on('error', (err) => {
          sails.config.customLogger.log('error', 'ClamAV TCP socket not reachable', {
            host: process.env.CLAM_HOST,
            error: err.message
          }, 'message');
          reject(new Error('ClamAV TCP socket not reachable'));
        });
      } else {
        const defaultSocket = 'var/run/clamd.scan/clamd.sock';
        fs.access(defaultSocket, (err) => {
          if (err) {
            sails.config.customLogger.log('error', 'ClamAV default UNIX socket not reachable', {
              socket: defaultSocket
            }, 'message');
            reject(new Error('ClamAV default UNIX socket not reachable'));
          } else {
            sails.config.customLogger.log('info', 'ClamAV default UNIX socket is reachable', {
              socket: defaultSocket
            }, 'message');
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
      }, 'message');
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
      sails.config.customLogger.log('error', 'System health check failed', { error: error.message }, 'server-action');
      return res.status(503).send(response);
    }
  }
};

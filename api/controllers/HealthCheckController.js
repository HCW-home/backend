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

    // Check MongoDB
    const checkMongo = new Promise((resolve, reject) => {
      let mongoDbNativeConnection = sails.getDatastore().manager;
      if (!mongoDbNativeConnection) {
        reject(new Error('MongoDB not reachable'));
      }
      resolve();
    });

    const checkRedis = new Promise((resolve, reject) => {
      const redisClient = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379
      });

      redisClient.ping((err, result) => {
        redisClient.disconnect();
        if (err || result !== 'PONG') {
          reject(new Error('Redis not reachable'));
        }
        resolve();
      });
    });

    // Check ClamAV socket/connection
    const checkClamAV = new Promise((resolve, reject) => {
      if (process.env.CLAM_SOCKET) {
        fs.access(process.env.CLAM_SOCKET, (err) => {
          if (err) {
            reject(new Error('ClamAV UNIX socket not reachable'));
          } else {
            resolve();
          }
        });
      } else if (process.env.CLAM_HOST) {
        const clamavClient = new net.Socket();
        clamavClient.connect(process.env.CLAM_PORT || 3310, process.env.CLAM_HOST, () => {
          clamavClient.end();
          resolve();
        });
        clamavClient.on('error', (err) => {
          reject(new Error('ClamAV TCP socket not reachable'));
        });
      } else {
        fs.access('var/run/clamd.scan/clamd.sock', (err) => {
          if (err) {
            reject(new Error('ClamAV default UNIX socket not reachable'));
          } else {
            resolve();
          }
        });
      }
    });

    try {
      await Promise.all([checkMongo, checkRedis, checkClamAV]);
      response.responseTime = Date.now() - startTime;
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

      return res.status(503).send(response);
    }
  }
};

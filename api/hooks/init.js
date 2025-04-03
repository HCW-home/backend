let NodeClam = require("clamscan");
module.exports = function myBasicHook(sails) {
  return {
    async initialize(cb) {
      sails.config.customLogger.log('verbose', 'Initializing BasicHook...', null, 'message', null);
      try {
        const clamdscanConfig = {};
        if (process.env.CLAM_SOCKET) {
          sails.config.customLogger.log('verbose', 'Using CLAM_SOCKET for clamscan configuration', null, 'message', null);
          clamdscanConfig.socket = process.env.CLAM_SOCKET;
        }
        if (process.env.CLAM_HOST && !process.env.CLAM_SOCKET) {
          sails.config.customLogger.log('verbose', 'Using CLAM_HOST for clamscan configuration', null, 'message', null);
          clamdscanConfig.host = process.env.CLAM_HOST;
          clamdscanConfig.port = process.env.CLAM_PORT || '3310';
        }
        if (!process.env.CLAM_HOST && !process.env.CLAM_SOCKET) {
          sails.config.customLogger.log('warn', 'No CLAM_HOST or CLAM_SOCKET provided, using default socket path for clamscan', null, 'message', null);
          clamdscanConfig.socket = 'var/run/clamd.scan/clamd.sock';
        }
        const clamscan = await new NodeClam().init({
          remove_infected: true,
          clamdscan: clamdscanConfig,
          preference: "clamdscan",
        });
        sails.config.globals.clamscan = clamscan;
        sails.config.customLogger.log('verbose', 'clamscan initialized successfully', null, 'server-action', null);
      } catch (error) {
        sails.config.customLogger.log('error', "Error initializing clamscan: ", error, null, 'server-action', null);
      }
      try {
        sails.config.customLogger.log('verbose', 'Starting cron initialization', null, 'message',null);
        await sails.config.startCron();
        sails.config.customLogger.log('verbose', 'Cron initialized successfully', null, 'server-action',null);
      } catch (error) {
        sails.config.customLogger.log('error', "Error initializing cron", error,  'server-action', null);
      }
      sails.config.customLogger.log('verbose', 'BasicHook initialization completed' , null, 'server-action', null);
      return cb();
    },
  };
};

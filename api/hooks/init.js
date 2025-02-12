let NodeClam = require("clamscan");
module.exports = function myBasicHook(sails) {
  return {
    async initialize(cb) {
      sails.config.customLogger.log('info', 'Initializing myBasicHook...');
      try {
        const clamdscanConfig = {};
        if (process.env.CLAM_SOCKET) {
          sails.config.customLogger.log('info', 'Using CLAM_SOCKET for clamscan configuration');
          clamdscanConfig.socket = process.env.CLAM_SOCKET;
        }
        if (process.env.CLAM_HOST && !process.env.CLAM_SOCKET) {
          sails.config.customLogger.log('info', 'Using CLAM_HOST for clamscan configuration');
          clamdscanConfig.host = process.env.CLAM_HOST;
          clamdscanConfig.port = process.env.CLAM_PORT || '3310';
        }
        if (!process.env.CLAM_HOST && !process.env.CLAM_SOCKET) {
          sails.config.customLogger.log('warn', 'No CLAM_HOST or CLAM_SOCKET provided, using default socket path for clamscan');
          clamdscanConfig.socket = 'var/run/clamd.scan/clamd.sock';
        }
        const clamscan = await new NodeClam().init({
          remove_infected: true,
          clamdscan: clamdscanConfig,
          preference: "clamdscan",
        });
        sails.config.globals.clamscan = clamscan;
        sails.config.customLogger.log('info', 'clamscan initialized successfully');
      } catch (error) {
        sails.config.customLogger.log('error', "Error initializing clamscan: ", error);
      }
      try {
        sails.config.customLogger.log('info', 'Starting cron initialization');
        await sails.config.startCron();
        sails.config.customLogger.log('info', 'Cron initialized successfully');
      } catch (error) {
        sails.config.customLogger.log('error', "Error initializing cron", error);
      }
      sails.config.customLogger.log('info', 'myBasicHook initialization completed');
      return cb();
    },
  };
};

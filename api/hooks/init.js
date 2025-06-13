let NodeClam = require("clamscan");

module.exports = function myBasicHook(sails) {
  return {
    async initialize(cb) {
      sails.config.customLogger.log('verbose', 'Initializing BasicHook...', null, 'message', null);

      const maxRetries = parseInt(process.env.CLAM_RETRY_COUNT || '3', 10);
      const retryDelayMs = parseInt(process.env.CLAM_RETRY_DELAY || '2000', 10);

      async function initializeClamscanWithRetry(attempt = 1) {
        sails.config.customLogger.log('verbose', `Clamscan initialization attempt ${attempt}`, null, 'message', null);

        const clamdscanConfig = {};
        if (process.env.CLAM_SOCKET) {
          sails.config.customLogger.log('verbose', 'Using CLAM_SOCKET for clamscan configuration', null, 'message', null);
          clamdscanConfig.socket = process.env.CLAM_SOCKET;
        } else if (process.env.CLAM_HOST) {
          sails.config.customLogger.log('verbose', 'Using CLAM_HOST for clamscan configuration', null, 'message', null);
          clamdscanConfig.host = process.env.CLAM_HOST;
          clamdscanConfig.port = process.env.CLAM_PORT || '3310';
        } else {
          sails.config.customLogger.log('warn', 'No CLAM_HOST or CLAM_SOCKET provided, using default socket path for clamscan', null, 'message', null);
          clamdscanConfig.socket = 'var/run/clamd.scan/clamd.sock';
        }

        try {
          const clamscan = await new NodeClam().init({
            remove_infected: true,
            clamdscan: clamdscanConfig,
            preference: "clamdscan",
          });
          sails.config.globals.clamscan = clamscan;
          sails.config.customLogger.log('verbose', 'clamscan initialized successfully', null, 'server-action', null);
        } catch (error) {
          sails.config.customLogger.log('error', `Clamscan init failed on attempt ${attempt}: ${error.message}`, error, null, 'server-action', null);
          if (attempt < maxRetries) {
            sails.config.customLogger.log('verbose', `Retrying clamscan initialization in ${retryDelayMs}ms`, null, 'server-action', null);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            return initializeClamscanWithRetry(attempt + 1);
          } else {
            sails.config.customLogger.log('error', 'Max retries reached. Failed to initialize clamscan.', null, 'server-action', null);
          }
        }
      }

      await initializeClamscanWithRetry();

      try {
        sails.config.customLogger.log('verbose', 'Starting cron initialization', null, 'message', null);
        await sails.config.startCron();
        sails.config.customLogger.log('verbose', 'Cron initialized successfully', null, 'server-action', null);
      } catch (error) {
        sails.config.customLogger.log('error', 'Error initializing cron', error, 'server-action', null);
      }

      sails.config.customLogger.log('verbose', 'BasicHook initialization completed', null, 'server-action', null);
      return cb();
    },
  };
};

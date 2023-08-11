let NodeClam = require("clamscan");
module.exports = function myBasicHook(sails) {
  return {
    async initialize(cb) {
      try {
        const clamdscanConfig = {};
        if (process.env.CLAM_SOCKET) {
          clamdscanConfig.socket = process.env.CLAM_SOCKET;
        }
        if (process.env.CLAM_HOST && !process.env.CLAM_SOCKET) {
          clamdscanConfig.host = process.env.CLAM_HOST;
          clamdscanConfig.port = process.env.CLAM_PORT || '3310';
        }
        if (!process.env.CLAM_HOST && !process.env.CLAM_SOCKET) {
          clamdscanConfig.socket = 'var/run/clamd.scan/clamd.sock';
        }
        const clamscan = await new NodeClam().init({
          remove_infected: true,
          clamdscan: clamdscanConfig,
          preference: "clamdscan",
        });

        sails.config.globals.clamscan = clamscan;
      } catch (error) {
        console.error("Error initializing clamscan: ", error);
        if (process.env.NODE_ENV === "production") {
          process.exit(1);
        }
      }

      try {
        // Do some stuff here to initialize hook
        // And then call `cb` to continue
        await sails.config.startCron();
      } catch (error) {
        console.error("Error initializing cron", error);
      }
      return cb();
    },
  };
};

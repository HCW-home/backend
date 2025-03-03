module.exports = {
  customLogger: {
    level: process.env.LOGLEVEL || 'info',
    logFormat: process.env.LOGFORMAT || 'default',
    levels: {
      silent: 0,
      error: 1,
      warn: 2,
      debug: 3,
      info: 4,
      verbose: 5,
      silly: 6,
    },
    log: function(level, message, meta, category, userId) {
      if (this.levels[level] <= this.levels[this.level]) {
        const timestamp = new Date().toISOString();

        let formattedMessage;

        if (this.logFormat === 'splunk') {
          formattedMessage = category
            ? `${timestamp};${level};${category};${userId || ''}: ${message}`
            : `${timestamp};${level};${userId || ''}: ${message}`;
        } else {
          formattedMessage = message;
        }

        if (meta) {
          sails.log[level](formattedMessage, meta);
        } else {
          sails.log[level](formattedMessage);
        }
      }
    },
  },
};

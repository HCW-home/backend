module.exports = {
  customLogger: {
    level: process.env.LOGLEVEL || 'info',
    levels: {
      silent: 0	,
      error: 1,
      warn: 2,
      debug: 3,
      info: 4,
      verbose: 5,
      silly: 6,
    },
    log: function (level, message, meta) {
      if (this.levels[level] <= this.levels[this.level]) {
        if (meta) {
          sails.log[level](message, meta);
        } else {
          sails.log[level](message);
        }
      }
    },
  },
};

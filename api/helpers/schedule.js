const { CronJob } = require('cron');
const { inviteJobs } = require('../../config/cron');

module.exports = {
  friendlyName: 'Schedule',
  description: 'Schedule something.',
  inputs: {
    name: {
      type: 'string',
      required: true,
    },
    time: {
      type: 'ref',
      required: true,
    },
    data: {
      type: 'ref',
    },
  },
  exits: {
    success: {
      description: 'All done.',
    },
    invalidHelper: {
      description: 'Invalid helper name provided.',
    },
    error: {
      description: 'An error occurred.',
    },
  },

  fn: async function(inputs, exits) {
    try {
      if (inputs.time instanceof Date) {
        const now = new Date();
        const delay = inputs.time.getTime() - now.getTime();
        if (delay > 0) {
          if (inviteJobs[inputs.name]) {
            sails.config.customLogger.log('info', `Scheduling job '${inputs.name}' to run in ${delay} ms`, null, 'server-action', null);
            setTimeout(async () => {
              await inviteJobs[inputs.name](inputs.data.invite);
            }, delay);
          } else {
            sails.config.customLogger.log('info', `Invalid helper name: '${inputs.name}'`, null, 'server-action', null);
          }
        } else {
          sails.config.customLogger.log('error', `Invalid time: ${inputs.time}`,null, 'server-action', null);
          return exits.error();
        }
      } else {
        sails.config.customLogger.log('info', `Scheduling job '${inputs.name}' with cron string '${inputs.time}'`,null, 'server-action', null);
        if (inviteJobs[inputs.name]) {
          const job = new CronJob(inputs.time, async () => {
            await inviteJobs[inputs.name](inputs.data.invite);
          }, null, true);
          job.start();
        } else {
          sails.config.customLogger.log('info', `Invalid helper name: '${inputs.name}'`, null, 'server-action', null);
        }
      }
      return exits.success();
    } catch (error) {
      sails.config.customLogger.log('error', `Error in schedule function: ${error}`,null, 'server-action', null);
      return exits.error();
    }
  },
};

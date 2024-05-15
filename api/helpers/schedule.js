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
      // if (!inviteJobs[inputs.name]) {
      //   sails.log.error(`Invalid helper name: ${inputs.name}`);
      //   return exits.invalidHelper();
      // }

      if (inputs.time instanceof Date) {
        const now = new Date();
        const delay = inputs.time.getTime() - now.getTime();
        if (delay > 0) {
          if (inviteJobs[inputs.name]) {
            sails.log.info(`Scheduling job '${inputs.name}' to run in ${delay} ms`);
            setTimeout(async () => {
              await inviteJobs[inputs.name](inputs.data.invite);
            }, delay);
          } else {
            sails.log.info(`Invalid helper name: '${inputs.name}'`);
          }
        } else {
          sails.log.error(`Invalid time: ${inputs.time}`);
          return exits.error();
        }
      } else {
        sails.log.info(`Scheduling job '${inputs.name}' with cron string '${inputs.time}'`);
        if (inviteJobs[inputs.name]) {
          const job = new CronJob(inputs.time, async () => {
            await inviteJobs[inputs.name](inputs.data.invite);
          }, null, true);
        job.start();
        } else {
          sails.log.info(`Invalid helper name: '${inputs.name}'`);
        }
      }

      return exits.success();
    } catch (error) {
      sails.log.error(`Error in schedule function: ${error}`);
      return exits.error();
    }
  },
};

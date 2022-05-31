module.exports = {
  friendlyName: "Schedule",

  description: "Schedule something.",

  inputs: {
    name: {
      type: "string",
      required: true,
    },

    time: {
      type: "ref",
    },
    data: {
      type: "ref",
    },
  },

  exits: {
    success: {
      description: "All done.",
    },
  },

  fn: async function (inputs, exits) {
    await sails.agenda.schedule(inputs.time, inputs.name, inputs.data);
    return exits.success();
  },
};

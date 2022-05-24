module.exports = {
  friendlyName: "Schedule",

  description: "Schedule something.",

  inputs: {
    name: {
      type: "string",
      required: true,
    },
    handler: {
      type: "ref",
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

  fn: async function (inputs) {
    // TODO
    console.log("agenda ", sails.agenda);
    if (!sails.agenda._definitions[inputs.name]) {
      sails.agenda.define(inputs.name, inputs.handler);
    }
    sails.agenda.schedule(inputs.time, inputs.name, inputs.data);
  },
};

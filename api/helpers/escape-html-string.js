module.exports = {
  friendlyName: 'Escape HTML',
  inputs: {
    str: {
      type: 'string',
      required: true,
    },
  },

  fn: async function(inputs) {
    return inputs.str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};

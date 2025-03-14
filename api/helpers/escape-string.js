module.exports = {
  friendlyName: 'Escape string',
  description: 'Safely escape a string for HTML output.',
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

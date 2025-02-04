module.exports = {

  attributes: {
    token: {
      type: 'string',
    },
    user: {
      model: 'user',
      required: false
    },
    value: {
      type:'string'
    }
  },

};


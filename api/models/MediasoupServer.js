
module.exports = {
  tableName: 'mediasoupserver',

  attributes: {
    url:{
      type: 'string',
    },
    password:{
      type: 'string'
    },
    username:{
      type: 'string'
    },
    maxNumberOfSessions:{
      type: 'number'
    },
    active:{
      type: 'boolean'
    }
  },

};


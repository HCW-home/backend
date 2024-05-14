module.exports = {
  tableName: 'sms_providers',

  attributes: {
    order:{
      type: 'number'
    },
    provider:{
      type: 'string'
    },
    prefix:{
      type: 'string'
    },
    isWhatsapp:{
      type: 'boolean'
    },
    isDisabled:{
      type: 'boolean'
    }
  },

};


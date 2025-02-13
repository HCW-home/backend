module.exports = {

  attributes: {

    from: {
      model: 'user'
    },
    to: {
      model: 'user'
    },
    consultation: {
      model: 'consultation',
      required: true
    },
    read: {
      type: 'boolean'
      // default:false
    },
    type: {
      type: 'string',
      isIn: ['attachment', 'text', 'videoCall', 'audioCall']
    },
    acceptedAt: {
      type: 'number'
    },
    closedAt: {
      type: 'number'
    },
    messageCreatedAt:{
      type:'number'
    }
  },

};


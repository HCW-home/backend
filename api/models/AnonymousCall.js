/**
 * AnonymousMessage.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

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


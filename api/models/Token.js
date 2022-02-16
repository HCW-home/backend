/**
 * Token.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

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


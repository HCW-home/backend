/**
 * Translator.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

module.exports = {

  attributes: {

    organization: {
      model: 'translationOrganization',
      required: true
    },
    languages: {
      type: 'json'
    },
    email: {
      type: 'string'
    },
    isADistributionList: {
      type: 'boolean'
    },
    canRefuse: {
      type: 'boolean'
    }

  }

};


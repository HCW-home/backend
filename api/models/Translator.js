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


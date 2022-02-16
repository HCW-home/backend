
const axios = require('axios');


module.exports = {


  friendlyName: 'Redmine',


  description: 'Post issue to Redmine.',


  inputs: {
    title: {
      type: 'string',

      description: 'Issue title',
      required: true
    },
    description:{
      type: 'string',

      description: 'Issue description',
      required: true
    },
    browserDetails:{
      type: 'string',

      description: 'User agent',
      required: true
    }
  },


  exits: {

    success: {
      description: 'All done.',
    },

  },


  fn: async function (inputs, exits) {
    // TODO

  const {title, description,  browserDetails} =  inputs
  const issueObject = {
    issue: {
      project_id: 'hug-home-web',
      subject: title,
      description,
      custom_fields: [

        {
          id: 2,
          value: browserDetails
        }
      ]
    }
  };




  axios.post(`${sails.config.globals.REDMINE_DOMAIN}/issues.json?key=${sails.config.globals.REDMINE_API_KEY}`, issueObject)
    .then((response) => {
      console.log('issue response ', response)
      // const ticketId = response.data.issue.id;
      // Add Gilles as a watcher
      // axios.post(`${process.env.REDMINE_DOMAIN}/issues/${ticketId}/watchers.json?key=${process.env.REDMINE_API_KEY}&user_id=4`, {})
      //   .then(() => { })
      //   .catch(() => { });
      exits.success(response)
    })
    .catch((err) => {
      console.log('error posting issue ', err)
    });
  }


};

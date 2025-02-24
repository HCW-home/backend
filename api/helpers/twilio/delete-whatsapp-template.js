const axios = require('axios');

module.exports = {
  friendlyName: 'Delete WhatsApp Template in Twilio',
  description: 'Deletes a WhatsApp message template using Twilio Content API',

  inputs: {
    twilioTemplateId: {
      type: 'string',
      required: true,
      description: 'The Twilio template ID to delete',
    },
  },

  async fn(inputs, exits) {
    const { twilioTemplateId } = inputs;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    try {
      sails.config.customLogger.log('info', `Deleting WhatsApp Template in Twilio with ID: ${twilioTemplateId}`, null, 'user-action');
      await axios.delete(`https://content.twilio.com/v1/Content/${twilioTemplateId}`, {
        auth: {
          username: accountSid,
          password: authToken,
        },
      });
      sails.config.customLogger.log('verbose', `Successfully deleted WhatsApp Template in Twilio with ID: ${twilioTemplateId}`, null, 'server-action');
      return exits.success({ message: 'Template deleted successfully in Twilio' });
    } catch (error) {
      sails.config.customLogger.log('error', `Error deleting WhatsApp Template in Twilio: ${error.response ? JSON.stringify(error.response.data) : error.message}`, 'server-action');
      return exits.error(
        error.response ? error.response.data : error.message
      );
    }
  },
};

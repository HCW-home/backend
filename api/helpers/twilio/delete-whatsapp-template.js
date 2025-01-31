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
      await axios.delete(`https://content.twilio.com/v1/Content/${twilioTemplateId}`, {
        auth: {
          username: accountSid,
          password: authToken,
        },
      });

      return exits.success({ message: 'Template deleted successfully in Twilio' });
    } catch (error) {
      return exits.error(
        error.response ? error.response.data : error.message
      );
    }
  },
};

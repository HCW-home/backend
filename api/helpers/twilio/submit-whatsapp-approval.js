const axios = require('axios');

module.exports = {
  friendlyName: 'Submit WhatsApp Template for Approval',
  description: 'Submits a Twilio WhatsApp template for approval',

  inputs: {
    sid: {
      type: 'string',
      required: true,
      description: 'The Twilio Content SID of the template to be submitted for approval.',
    },
    name: {
      type: 'string',
      required: true,
      description: 'The friendly name of the template to be submitted.',
    },
    category: {
      type: 'string',
      required: true,
      description: 'The WhatsApp category for the template (e.g., UTILITY, MARKETING).',
    },
  },

  async fn(inputs, exits) {
    const { sid, name, category } = inputs;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    try {
      const endpoint = `https://content.twilio.com/v1/Content/${sid}/ApprovalRequests/whatsapp`;

      const response = await axios.post(
        endpoint,
        { name, category },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          auth: {
            username: accountSid,
            password: authToken,
          },
        }
      );

      return exits.success(response.data);
    } catch (error) {
      console.error('Error submitting WhatsApp template for approval:', error.response?.data || error.message);
      return exits.error(error.response?.data || error.message);
    }
  },
};

const axios = require('axios');

module.exports = {
  friendlyName: 'Create WhatsApp Template in Twilio',
  description: 'Creates a WhatsApp message template using Twilio Content API',

  inputs: {
    name: { type: 'string', required: true },
    language: { type: 'string', required: true },
    body: { type: 'string', required: true },
    category: { type: 'string', required: true },
    contentType: { type: 'string', defaultsTo: 'twilio/text', description: 'The content type of the template (e.g., twilio/text)' },
    variables: { type: 'json', required: false },
  },

  async fn(inputs, exits) {
    const { name, language, body, category, contentType, variables } = inputs;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    try {

      const createResponse = await axios.post(
        'https://content.twilio.com/v1/Content',
        {
          friendly_name: name,
          language,
          types: {
            [contentType]: { body },
          },
          ...(variables && { variables }),
        },
        {
          auth: {
            username: accountSid,
            password: authToken,
          },
        }
      );

      const contentSid = createResponse.data.sid;

      const approvalResponse = await axios.post(
        `https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/whatsapp`,
        {
          name,
          category,
        },
        {
          auth: {
            username: accountSid,
            password: authToken,
          },
        }
      );

      return exits.success({
        twilioTemplateId: contentSid,
        approvalStatus: approvalResponse.data.status,
      });
    } catch (error) {
      return exits.error(error.response ? error.response.data : error.message);
    }
  },
};

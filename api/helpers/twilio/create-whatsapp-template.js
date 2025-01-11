const twilio = require('twilio');

module.exports = {
  friendlyName: 'Create WhatsApp Template',
  description: 'Creates and submits a WhatsApp template for approval via Twilio',

  inputs: {
    friendly_name: { type: 'string', required: true },
    language: { type: 'string', required: true },
    body: { type: 'string', required: true },
    category: { type: 'string', required: true },
    contentType: { type: 'string', required: true },
    variables: { type: 'json', required: false },
    actions: { type: 'json', required: false }
  },

  async fn(inputs, exits) {
    const { friendly_name, language, body, category, contentType, variables, actions } = inputs;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    try {
      const client = twilio(accountSid, authToken);

      const payload = {
        friendly_name,
        language: language,
        category: category,
        variables,
        types: {
          [contentType]: {
            body: body,
            ...(actions && { actions }),
          },
        },
      };

      const response = await client.content.v1.contents.create(payload);

      return exits.success(response);
    } catch (error) {
      return exits.error(error.message || error);
    }
  },
};

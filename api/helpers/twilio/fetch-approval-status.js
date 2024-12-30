const axios = require('axios');

module.exports = {
  friendlyName: 'Fetch Template Approval Status',
  description: 'Fetches the approval status of a WhatsApp template via Twilio',

  inputs: {
    twilioTemplateId: {
      type: 'string',
      required: true,
      description: 'The Twilio template ID to fetch status for',
    },
  },

  async fn(inputs, exits) {
    const { twilioTemplateId } = inputs;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    try {
      const response = await axios.get(
        `https://content.twilio.com/v1/Content/${twilioTemplateId}/ApprovalRequests`,
        {
          auth: {
            username: accountSid,
            password: authToken,
          },
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const approvalRequest = response.data.whatsapp || {};

      return exits.success({
        status: approvalRequest.status,
        rejectionReason: approvalRequest.rejection_reason || null,
      });
    } catch (error) {
      return exits.error(error.response ? error.response.data : error.message);
    }
  },
};

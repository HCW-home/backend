const axios = require('axios');

module.exports = {
  friendlyName: 'Fetch Template Approval Status',
  description: 'Fetches the approval status of a WhatsApp template via Twilio',

  inputs: {
    sid: {
      type: 'string',
      required: true,
      description: 'The Twilio template ID to fetch status for',
    },
  },

  async fn(inputs, exits) {
    const { sid } = inputs;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    try {
      sails.config.customLogger.log('info', `Fetching approval status for template SID: ${sid}`, null, 'user-action', null);
      const response = await axios.get(
        `https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`,
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
      sails.config.customLogger.log('info', `Fetched approval status for template SID: ${sid} status ${approvalRequest.status}`, null, 'server-action', null);
      return exits.success({
        status: approvalRequest.status,
        rejectionReason: approvalRequest.rejection_reason || null,
      });
    } catch (error) {
      sails.config.customLogger.log('error', `Error fetching approval status for template SID: ${sid}`, error?.response ? error.response?.data : error?.message, 'server-action', null);
      return exits.error(error.response ? error.response.data : error.message);
    }
  },
};

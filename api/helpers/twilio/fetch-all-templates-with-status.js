const twilio = require('twilio');

module.exports = {
  friendlyName: 'Fetch All Templates with Status from Twilio',
  description: 'Fetches all templates from Twilio and their approval status.',

  inputs: {},

  async fn(inputs, exits) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    try {
      const client = twilio(accountSid, authToken);

      const templates = await client.content.v1.contents.list();

      const templatesWithStatus = [];
      for (const template of templates) {
        try {
          const approvalResponse = await client.request({
            method: 'GET',
            uri: `${template.url}/ApprovalRequests`,
          });

          console.log(approvalResponse, 'approvalResponse');
          const approvalData = approvalResponse?.body?.whatsapp || {};
          templatesWithStatus.push({
            ...template,
            approvalStatus: approvalData.status || 'draft',
            rejectionReason: approvalData.rejection_reason || null,
          });
        } catch (error) {
          sails.log.warn(`Failed to fetch approval status for template ${template.sid}:`, error.message);
          templatesWithStatus.push({
            ...template,
            approvalStatus: 'unknown',
            rejectionReason: null,
          });
        }
      }

      return exits.success(templatesWithStatus);
    } catch (error) {
      return exits.error(error.message || error);
    }
  },
};

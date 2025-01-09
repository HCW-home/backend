module.exports = {
  async syncTemplates() {
    try {
      const templates = await sails.helpers.twilio.fetchAllTemplatesWithStatus();

      for (const template of templates) {
        await WhatsappTemplate.findOrCreate(
          { sid: template.sid },
          {
            sid: template.sid,
            friendlyName: template.friendlyName,
            language: template.language,
            variables: template.variables || {},
            types: template.types || {},
            url: template.url,
            dateCreated: template.dateCreated,
            dateUpdated: template.dateUpdated,
            links: template.links || {},
            approvalStatus: template.approvalStatus,
            rejectionReason: template.rejectionReason,

          }
        ).exec(async (err, record) => {
          if (!err && record) {
            await WhatsappTemplate.updateOne({ id: record.id }).set({
              approvalStatus: template.approvalStatus,
              rejectionReason: template.rejectionReason,
            });
          }
        });
      }

      sails.log.info(`Synced ${templates.length} templates from Twilio.`);
    } catch (error) {
      sails.log.error('Failed to sync templates from Twilio:', error.message || error);
    }
  },
};

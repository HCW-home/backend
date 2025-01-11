module.exports = {

  async submitTemplate(req, res) {
    const { id } = req.body;

    if (!id) {
      return res.badRequest({ error: 'Template ID is required' });
    }

    try {
      const template = await WhatsappTemplate.findOne({ id: id });

      if (!template) {
        return res.notFound({ error: 'Template not found' });
      }

      if (template.approvalStatus !== 'draft') {
        return res.badRequest({ error: 'Only DRAFT templates can be submitted for approval' });
      }

      const twilioResponse = await sails.helpers.twilio.createWhatsappTemplate.with({
        friendly_name: template.friendlyName,
        language: template.language,
        body: template.body,
        category: template.category,
        contentType: template.contentType,
        variables: template.variables,
      });


      await sails.helpers.twilio.submitWhatsappApproval.with({
        sid: twilioResponse.sid,
        name: template.friendlyName,
        category: template.category,

      });

      await WhatsappTemplate.updateOne({ id: id }).set({
        sid: twilioResponse.sid,
        approvalStatus: 'pending',
      });

      return res.ok({
        message: 'Template submitted for approval successfully',
        twilioResponse,
      });
    } catch (error) {
      return res.serverError({ error: 'Failed to submit template', details: error });
    }
  },

  async fetchTemplates(req, res) {
    const { language, approvalStatus } = req.query;

    try {
      const filters = {};
      if (language) {
        filters.language = language;
      }
      if (approvalStatus) {
        filters.approvalStatus = approvalStatus;
      }

      const templates = await WhatsappTemplate.find(filters);

      return res.json(templates);
    } catch (error) {
      return res.serverError({ error: 'Failed to fetch templates', details: error });
    }
  },

  async deleteTemplate(req, res) {
    const { id } = req.body;

    if (!id) {
      return res.badRequest({ error: 'Template ID is required' });
    }

    try {
      const template = await WhatsappTemplate.findOne({ id: id });

      if (!template) {
        return res.notFound({ error: 'Template not found in the database' });
      }

      if (template.twilioTemplateId) {
        try {
          await sails.helpers.twilio.deleteWhatsappTemplate({ twilioTemplateId: template.twilioTemplateId });
        } catch (twilioError) {
          sails.log.warn('Failed to delete template in Twilio:', twilioError.message || twilioError);
        }
      }

      const deletedTemplate = await WhatsappTemplate.destroyOne({ id: id });

      if (!deletedTemplate) {
        return res.notFound({ error: 'Failed to delete template from the database.' });
      }

      return res.ok({ message: 'Template deleted successfully', deletedTemplate });
    } catch (error) {
      return res.serverError({ error: 'Failed to delete template', details: error });
    }
  },

  async refreshStatus(req, res) {
    const { id } = req.body;

    if (!id) {
      return res.badRequest({ error: 'Template ID is required' });
    }

    try {
      const template = await WhatsappTemplate.findOne({ id: id });

      if (!template || !template.sid) {
        return res.notFound({ error: 'Template not found or not yet submitted to Twilio' });
      }

      const approvalDetails = await sails.helpers.twilio.fetchApprovalStatus.with({
        sid: template.sid,
      });

      await WhatsappTemplate.updateOne({ id: id }).set({
        approvalStatus: approvalDetails.status,
        rejectionReason: approvalDetails.rejectionReason
      });

      return res.json({ approvalDetails });
    } catch (error) {
      return res.serverError({ error: 'Failed to refresh template status', details: error });
    }
  },

};

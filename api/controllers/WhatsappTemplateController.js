const { syncTemplates } = require('../services/SyncTwilioTemplates');
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
        actions: template.actions,
      });


      await sails.helpers.twilio.submitWhatsappApproval.with({
        sid: twilioResponse.sid, name: template.friendlyName, category: template.category,

      });

      await WhatsappTemplate.updateOne({ id: id }).set({
        sid: twilioResponse.sid, approvalStatus: 'pending',
      });

      return res.ok({
        message: 'Template submitted for approval successfully', twilioResponse,
      });
    } catch (error) {
      return res.serverError({ error: 'Failed to submit template', details: error });
    }
  },

  async bulkSubmitTemplates(req, res) {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.badRequest({ error: 'Template IDs are required and must be an array' });
    }

    const results = [];
    const errors = [];

    for (const id of ids) {
      try {
        const template = await WhatsappTemplate.findOne({ id: id });

        if (!template) {
          errors.push({ id, error: 'Template not found' });
          continue;
        }

        if (template.approvalStatus !== 'draft') {
          errors.push({ id, error: 'Only DRAFT templates can be submitted for approval' });
          continue;
        }

        const twilioResponse = await sails.helpers.twilio.createWhatsappTemplate.with({
          friendly_name: template.friendlyName,
          language: template.language,
          body: template.body,
          category: template.category,
          contentType: template.contentType,
          variables: template.variables,
          actions: template.actions,
        });

        await sails.helpers.twilio.submitWhatsappApproval.with({
          sid: twilioResponse.sid, name: template.friendlyName, category: template.category,
        });

        await WhatsappTemplate.updateOne({ id: id }).set({
          sid: twilioResponse.sid, approvalStatus: 'pending',
        });

        results.push({
          id, message: 'Template submitted for approval successfully', twilioResponse,
        });
      } catch (error) {
        errors.push({ id, error: 'Failed to submit template', details: error });
      }
    }

    return res.ok({
      message: 'Bulk submission process completed', results, errors,
    });
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

      sails.log.info("Starting template synchronization...");
      await syncTemplates();
      sails.log.info("Template synchronization completed.");


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
        approvalStatus: approvalDetails.status, rejectionReason: approvalDetails.rejectionReason
      });

      return res.json({ approvalDetails });
    } catch (error) {
      return res.serverError({ error: 'Failed to refresh template status', details: error });
    }
  },

  async updateTemplateBody(req, res) {
    const { id } = req.params;
    const { body } = req.body;

    if (!id || !body) {
      return res.badRequest({ error: 'Template ID and body are required' });
    }

    try {
      const template = await WhatsappTemplate.findOne({ id: id });

      if (!template) {
        return res.notFound({ error: 'Template not found' });
      }

      if (template.approvalStatus !== 'draft') {
        return res.badRequest({ error: 'Only DRAFT templates can be updated' });
      }

      const updatedTemplate = await WhatsappTemplate.updateOne({ id: id }).set({ body });

      if (!updatedTemplate) {
        return res.serverError({ error: 'Failed to update the template body' });
      }

      return res.ok({
        message: 'Template body updated successfully',
        updatedTemplate,
      });
    } catch (error) {
      return res.serverError({ error: 'Failed to update the template body', details: error });
    }
  }


};

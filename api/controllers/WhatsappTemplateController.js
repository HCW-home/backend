const { syncTemplates } = require('../services/SyncTwilioTemplates');
const { escapeHtml } = require('../utils/helpers');
module.exports = {

  async submitTemplate(req, res) {
    const { id } = req.body;

    if (!id) {
      return res.badRequest({ error: 'Template ID is required' });
    }

    try {
      const template = await WhatsappTemplate.findOne({ id: id });

      if (!template) {
        sails.config.customLogger.log('warn', `Template with id ${id} not found`, null, 'message', req.user?.id);
        return res.notFound({ error: 'Template not found' });
      }

      if (template.approvalStatus !== 'draft') {
        sails.config.customLogger.log('warn', `Attempt to submit a non-draft template with id ${id}`, null, 'user-action', req.user?.id);
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
        sid: twilioResponse.sid,
        name: template.friendlyName,
        category: template.category,
      });

      await WhatsappTemplate.updateOne({ id: id }).set({
        sid: twilioResponse.sid,
        approvalStatus: 'pending',
      });

      sails.config.customLogger.log('info', `Template with id ${id} submitted for approval successfully`, null, 'server-action', req.user?.id);

      return res.status(200).json({
        message: 'Template submitted for approval successfully',
        twilioResponse,
      });
    } catch (error) {
      sails.config.customLogger.log('error', `Failed to submit template with id ${id}`, {details: error}, 'server-action', req.user?.id);
      return res.serverError({ error: 'Failed to submit template', details: error });
    }
  },

  async bulkSubmitTemplates(req, res) {
    const ids = escapeHtml(req.body.ids)
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.badRequest({ error: 'Template IDs are required and must be an array' });
    }
    const results = [];
    const errors = [];
    for (const id of ids) {
      try {
        const template = await WhatsappTemplate.findOne({ id: id });
        if (!template) {
          sails.config.customLogger.log('warn', `Template with id ${id} not found`, null, 'message', req.user?.id);
          errors.push({ id, error: 'Template not found' });
          continue;
        }
        if (template.approvalStatus !== 'draft') {
          sails.config.customLogger.log('warn', `Attempt to submit a non-draft template with id ${id}`, null, 'user-action', req.user?.id);
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
          sid: twilioResponse.sid,
          name: template.friendlyName,
          category: template.category,
        });
        await WhatsappTemplate.updateOne({ id: id }).set({
          sid: twilioResponse.sid,
          approvalStatus: 'pending',
        });
        sails.config.customLogger.log('info', `Template with id ${id} submitted for approval successfully`, null, 'server-action', req.user?.id);
        results.push({
          id,
          message: 'Template submitted for approval successfully',
        });
      } catch (error) {
        sails.config.customLogger.log('error', `Failed to submit template with id ${id}`, { error: error?.message || error }, 'server-action', req.user?.id);
        errors.push({ id, error: 'Failed to submit template', details: error });
      }
    }
    return res.status(200).json({
      message: 'Bulk submission process completed',
      results,
      errors,
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
      const templates = await WhatsappTemplate.find(filters).sort('key ASC');
      sails.config.customLogger.log('info', `Templates fetched successfully with filters ${filters}`, null , 'message', req.user?.id);
      return res.json(templates);
    } catch (error) {
      sails.config.customLogger.log('error', 'Failed to fetch templates', { error: error?.message || error}, 'server-action', req.user?.id);
      return res.serverError({ error: 'Failed to fetch templates', details: error });
    }
  },

  async deleteTemplate(req, res) {
    const id = escapeHtml(req.body.id);
    if (!id) {
      return res.badRequest({ error: 'Template ID is required' });
    }
    try {
      const template = await WhatsappTemplate.findOne({ id });
      if (!template) {
        sails.config.customLogger.log('warn', `Template with id ${id} not found in the database`, null, 'message', req.user?.id);
        return res.notFound({ error: 'Template not found in the database' });
      }
      if (template.twilioTemplateId) {
        try {
          await sails.helpers.twilio.deleteWhatsappTemplate({ twilioTemplateId: template.twilioTemplateId });
          sails.config.customLogger.log('info', `Template with id ${id} deleted from Twilio successfully twilioTemplateId ${template.twilioTemplateId}`, null, 'server-action', req.user?.id);
        } catch (twilioError) {
          sails.config.customLogger.log('warn', `Failed to delete template in Twilio for id ${id}`, { error: twilioError?.message || twilioError }, 'server-action', req.user?.id);
        }
      }
      const deletedTemplate = await WhatsappTemplate.destroyOne({ id: id });
      sails.config.customLogger.log('info', `Starting template synchronization for template id ${id}`, null, 'message', req.user?.id);
      await syncTemplates();
      sails.config.customLogger.log('info', `Template synchronization completed for template id ${id}`, null, 'server-action', req.user?.id);
      if (!deletedTemplate) {
        sails.config.customLogger.log('warn', `Failed to delete template from the database for id ${id}`, null, 'message', req.user?.id);
        return res.notFound({ error: 'Failed to delete template from the database.' });
      }
      sails.config.customLogger.log('info', `Template with id ${id} deleted successfully`, null, 'server-action', req.user?.id);
      return res.status(200).json({ message: 'Template deleted successfully', deletedTemplate });
    } catch (error) {
      sails.config.customLogger.log('error', `Failed to delete template with id ${id}`, { error: error?.message || error }, 'server-action', req.user?.id);
      return res.serverError({ error: 'Failed to delete template', details: error });
    }
  },

  async refreshStatus(req, res) {
    const id = escapeHtml(req.body.id);
    if (!id) {
      return res.badRequest({ error: 'Template ID is required' });
    }
    try {
      const template = await WhatsappTemplate.findOne({ id: id });
      if (!template || !template.sid) {
        sails.config.customLogger.log('warn', `Template with id ${id} not found or not yet submitted to Twilio`, null, 'message', req.user?.id);
        return res.notFound({ error: 'Template not found or not yet submitted to Twilio' });
      }
      const approvalDetails = await sails.helpers.twilio.fetchApprovalStatus.with({
        sid: template.sid,
      });
      await WhatsappTemplate.updateOne({ id: id }).set({
        approvalStatus: approvalDetails.status,
        rejectionReason: approvalDetails.rejectionReason,
      });
      sails.config.customLogger.log('info', `Template with id ${id} status refreshed successfully status ${approvalDetails.status}`, null, 'server-action', req.user?.id);
      return res.json({ approvalDetails });
    } catch (error) {
      sails.config.customLogger.log('error', `Failed to refresh template status for id ${id}`, { error: error?.message || error }, 'server-action', req.user?.id);
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
        sails.config.customLogger.log('warn', `Template with id ${id} not found`, null, 'message', req.user?.id);
        return res.notFound({ error: 'Template not found' });
      }
      if (template.approvalStatus !== 'draft') {
        sails.config.customLogger.log('warn', `Attempt to update a non-draft template with id ${id} currentStatus ${template.approvalStatus}`, null, 'message', req.user?.id);
        return res.badRequest({ error: 'Only DRAFT templates can be updated' });
      }
      const updatedTemplate = await WhatsappTemplate.updateOne({ id }).set({ body });
      if (!updatedTemplate) {
        sails.config.customLogger.log('error', `Failed to update the template body for id ${id}`, null, 'server-action', req.user?.id);
        return res.serverError({ error: 'Failed to update the template body' });
      }
      sails.config.customLogger.log('info', `Template with id ${id} body updated successfully`, null, 'server-action', req.user?.id);
      return res.status(200).json({
        message: 'Template body updated successfully',
      });
    } catch (error) {
      sails.config.customLogger.log('error', `Failed to update the template body for id ${id}`, { error: error?.message || error }, 'server-action', req.user?.id);
      return res.serverError({ error: 'Failed to update the template body', details: error });
    }
  }

};

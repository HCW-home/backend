module.exports = {
  async createTemplate(req, res) {
    const { name, language, body, category, contentType, variables } = req.body;

    if (!name || !language || !body || !category || !contentType) {
      return res.badRequest({
        error: 'Missing required fields: name, language, body, category, contentType',
      });
    }

    try {
      const formattedVariables = {};
      if (variables && variables.length) {
        variables.forEach((v, index) => {
          formattedVariables[(index + 1).toString()] = v;
        });
      }

      const newTemplate = await WhatsappTemplate.create({
        name,
        language,
        body,
        category,
        contentType,
        variables: formattedVariables,
        status: 'draft',
      }).fetch();

      return res.ok({ message: 'Template created successfully', newTemplate });
    } catch (error) {
      return res.serverError({ error: 'Failed to create template', details: error });
    }
  },
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

      if (template.status !== 'draft') {
        return res.badRequest({ error: 'Only DRAFT templates can be submitted for approval' });
      }

      console.log(template, 'template');

      const twilioResponse = await sails.helpers.twilio.createWhatsappTemplate.with({
        name: template.name,
        language: template.language,
        body: template.body,
        category: template.category,
        contentType: template.contentType,
        variables: template.variables,
      });

      await WhatsappTemplate.updateOne({ id: id }).set({
        twilioTemplateId: twilioResponse.twilioTemplateId,
        status: 'pending',
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
    const { language } = req.query;

    try {
      const filters = language ? { language } : {};
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

      if (!template || !template.twilioTemplateId) {
        return res.notFound({ error: 'Template not found or not yet submitted to Twilio' });
      }

      const approvalDetails = await sails.helpers.twilio.fetchApprovalStatus.with({
        twilioTemplateId: template.twilioTemplateId,
      });

      await WhatsappTemplate.updateOne({ id: id }).set({
        status: approvalDetails.status,
        rejectionReason: approvalDetails.rejectionReason
      });

      return res.json({ approvalDetails });
    } catch (error) {
      return res.serverError({ error: 'Failed to refresh template status', details: error });
    }
  },

  async fetchContentTypes(req, res) {
    const contentTypes = [
      { type: 'twilio/text', description: 'Text' },
      { type: 'twilio/media', description: 'Media' },
      { type: 'twilio/quick-replies', description: 'Quick Reply' },
      { type: 'twilio/call-to-action', description: 'Call to action' },
      { type: 'twilio/list-picker', description: 'List Picker' },
      { type: 'twilio/card', description: 'Card' },
      { type: 'whatsapp/card', description: 'WhatsApp Card' },
    ];

    return res.json(contentTypes);
  },
};

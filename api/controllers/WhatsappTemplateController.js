module.exports = {
  async createTemplate(req, res) {
    const { name, language, body, category, contentType } = req.body;

    if (!name || !language || !body || !category || !contentType) {
      return res.badRequest({
        error: 'Missing required fields: name, language, body, category, contentType',
      });
    }

    try {
      const newTemplate = await WhatsappTemplate.create({
        name,
        language,
        body,
        category,
        contentType,
        status: 'DRAFT',
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

      if (template.status !== 'DRAFT') {
        return res.badRequest({ error: 'Only DRAFT templates can be submitted for approval' });
      }

      console.log(template, 'template');

      const twilioResponse = await sails.helpers.twilio.createWhatsappTemplate.with({
        name: template.name,
        language: template.language,
        body: template.body,
        category: template.category,
        contentType: template.contentType,
      });

      await WhatsappTemplate.updateOne({ id: id }).set({
        twilioTemplateId: twilioResponse.twilioTemplateId,
        status: 'PENDING',
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

  async fetchContentTypes(req, res) {
    const contentTypes = [
      { type: 'twilio/text', description: 'Plain text messages' },
      { type: 'twilio/interactive', description: 'Interactive messages (buttons, etc.)' },
    ];

    return res.ok(contentTypes);
  },
};

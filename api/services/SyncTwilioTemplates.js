const TemplatesConfig = require('../../config/templates');
const { attributes: req } = require('../models/Token');

function convertPlaceholders(template) {
  if (!template) {
    return '';
  }

  let index = 1;
  return template.replace(/%\((.*?)\)s/g, (_, key) => {
    if (key === 'url' || key === 'testingUrl' || key === 'expertLink') {
      return '';
    }
    return `{{${index++}}}`;
  });
}


module.exports = {

  async syncTemplates() {
    const requiredTemplates = TemplatesConfig.requiredTemplates;

    try {
      const supportedLanguages = sails.config.i18n.locales || [];
      const existingTemplates = await WhatsappTemplate.find();

      for (const template of requiredTemplates) {
        for (const language of supportedLanguages) {
          const friendlyName = `${template.key.replace(/\s+/g, '_').toLowerCase()}_${language}`;

          const existingTemplate = existingTemplates.find(
            (t) => t.key === template.key && t.language === language
          );

          if (!existingTemplate) {
            sails.config.customLogger.log(
              'verbose',
              `Template "${template.key}" is missing for language "${language}". Creating...`,
              null,
              'message',
              null
            );

            const translatedActions = (template.actions || []).map((action) => ({
              title: sails._t(language, `${action.title}`),
              url: action.url,
              type: action.type || 'URL',
            }));

            const body = convertPlaceholders(sails._t(language, template.key));

            await WhatsappTemplate.create({
              key: template.key,
              friendlyName: friendlyName,
              body,
              language,
              category: template.category,
              contentType: template.contentType,
              variables: template.variables,
              actions: translatedActions,
              approvalStatus: 'draft',
            });

            sails.config.customLogger.log(
              'verbose',
              `Template "${template.key}" created for language "${language}".`,
              null, 'message', null
            );
          } else {
            sails.config.customLogger.log(
              'verbose',
              `Template "${template.key}" already exists for language "${language}".`,
              null, 'message', null
            );
          }
        }
      }

      sails.config.customLogger.log('verbose', 'Template synchronization completed.', null, 'message', null);
    } catch (error) {
      sails.config.customLogger.log('error', 'Error during template synchronization:', { error: error?.message || error }, 'server-action', null);
    }
  }
};

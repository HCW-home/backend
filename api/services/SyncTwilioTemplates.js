const TemplatesConfig = require('../../config/templates');

function convertPlaceholders(template) {
  if (!template) {
    return '';
  }

  let index = 1;
  return template.replace(/%\((.*?)\)s/g, (_, key) => {
    if (key === 'url' || key === 'testingUrl') {
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
          const friendlyName = `${template.key
            .replace(/\s+/g, '_')
            .toLowerCase()}_${language}`;

          const existingTemplate = existingTemplates.find(
            (t) => t.key === template.key && t.language === language
          );

          if (!existingTemplate) {
            sails.log.info(
              `Template "${template.key}" is missing for language "${language}". Creating...`
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
              // body: sails._t(language, 'whatsappTemplates.' + template.key),
              body,
              language,
              category: template.category,
              contentType: template.contentType,
              variables: template.variables,
              actions: translatedActions,
              approvalStatus: 'draft',
            });

            sails.log.info(
              `Template "${template.key}" created for language "${language}".`
            );
          } else {
            sails.log.info(
              `Template "${template.key}" already exists for language "${language}".`
            );
          }
        }
      }

      sails.log.info('Template synchronization completed.');
    } catch (error) {
      sails.log.error('Error during template synchronization:', error);
    }
  },
};

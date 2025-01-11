const TemplatesConfig = require('../../config/templates');

module.exports = {
  async syncTemplates() {
    const requiredTemplates = TemplatesConfig.requiredTemplates;

    try {
      const supportedLanguages = sails.config.i18n.locales || [];

      console.log(supportedLanguages, 'supportedLanguages');
      const existingTemplates = await WhatsappTemplate.find();

      for (const template of requiredTemplates) {
        for (const language of supportedLanguages) {
          const friendlyName = `${template.key
            .replace(/\s+/g, "_")
            .toLowerCase()}_${language}`;

          const existingTemplate = existingTemplates.find(
            (t) => t.key === template.key && t.language === language
          );

          if (!existingTemplate) {
            sails.log.info(
              `Template "${template.key}" is missing for language "${language}". Creating...`
            );

            await WhatsappTemplate.create({
              key: template.key,
              friendlyName: friendlyName,
              body: sails._t(language, template.key),
              language,
              category: template.category,
              contentType: template.contentType,
              variables: template.variables.reduce((acc, param, index) => {
                acc[(index + 1).toString()] = param;
                return acc;
              }, {}),
              approvalStatus: "draft",
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

      sails.log.info("Template synchronization completed.");
    } catch (error) {
      sails.log.error("Error during template synchronization:", error);
    }
  },
};

const fs = require('fs');
const path = require('path');

function importFileIfExists(filePath, defaultValue) {
  try {
    const resolvedPath = path.resolve(filePath);

    if (fs.existsSync(resolvedPath)) {
      return require(resolvedPath);
    } else {
      return defaultValue || null;
    }
  } catch (error) {
    return defaultValue || null;
  }
}

function createParamsFromJson(args) {
  const { language, type, languageConfig, url, timePhrase, inviteTime, inviteDateTime } = args || {};
  const TwilioWhatsappConfigLanguage = languageConfig[language] || languageConfig['en'];
  const templateConfig = TwilioWhatsappConfigLanguage?.[type];

  if (!templateConfig) {
    throw new Error(`No template configuration found for type: ${type}`);
  }

  const templateParams = templateConfig.params;
  const params = {};

  templateParams.forEach((placeholder, index) => {
    let value;
    switch (placeholder) {
      case '$(branding)s':
        value = process.env.BRANDING;
        break;
      case '%(url)s':
        value = url;
        break;
      case '%(inviteTime)s':
        value = inviteTime;
        break;
      case '%(inviteDateTime)s':
        value = inviteDateTime;
        break;
      case '%(timePhrase)s':
        value = timePhrase;
        break;
      default:
        value = '';
    }

    params[index + 1] = value;
  });

  return params;
}


module.exports = {
  importFileIfExists,
  createParamsFromJson
}

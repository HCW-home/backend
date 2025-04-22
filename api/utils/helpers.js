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
    sails.config.customLogger.log('warn', `No template configuration found for type: ${type}`, null, 'message', null);
    return {};
  }

  const templateParams = templateConfig.params;
  const params = {};

  templateParams?.forEach((placeholder, index) => {
    let value;
    switch (true) {
      case placeholder.includes('$(branding)s'):
        value = placeholder.replace('$(branding)s', process.env.BRANDING || 'DefaultBranding');
        break;
      case placeholder.includes('%(url)s'):
        value = placeholder.replace('%(url)s', url || '');
        break;
      case placeholder.includes('%(inviteTime)s'):
        value = placeholder.replace('%(inviteTime)s', inviteTime || '');
        break;
      case placeholder.includes('%(inviteDateTime)s'):
        value = placeholder.replace('%(inviteDateTime)s', inviteDateTime || '');
        break;
      case placeholder.includes('%(timePhrase)s'):
        value = placeholder.replace('%(timePhrase)s', timePhrase || '');
        break;
      default:
        value = placeholder;
    }

    params[index + 1] = value;
  });

  return params;
}

function parseTime(value, defaultValue) {
  if (!value) return defaultValue;

  const timeUnit = value.slice(-1);
  const timeValue = parseInt(value.slice(0, -1), 10);

  switch (timeUnit) {
    case 's':
      return timeValue * 1000;
    case 'm':
      return timeValue * 60 * 1000;
    case 'h':
      return timeValue * 60 * 60 * 1000;
    case 'd':
      return timeValue * 24 * 60 * 60 * 1000;
    default:
      return defaultValue;
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  const tagPattern = /<\/?[a-z][\s\S]*?>/i;

  if (!tagPattern.test(str)) {
    return str;
  }

  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#x27;',
  };

  return str.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

function sanitizeMetadata(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeMetadata);
  } else if (typeof obj === 'object' && obj !== null) {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      acc[escapeHtml(key)] = sanitizeMetadata(value);
      return acc;
    }, {});
  } else if (typeof obj === 'string') {
    return escapeHtml(obj);
  } else {
    return obj;
  }
}

async function recreateTTLIndex(collection, field, expireAfterSeconds) {
  const indexName = `${field}_1`;
  try {
    await collection.dropIndex(indexName);
    sails.config.customLogger.log('info', `Dropped existing TTL index: ${indexName}`, null, 'server-action');
  } catch (err) {
    if (err?.codeName !== 'IndexNotFound') {
      throw err;
    }
  }
  await collection.createIndex({ [field]: 1 }, { expireAfterSeconds });
  sails.config.customLogger.log('info', `Created TTL index on '${field}' with expiry: ${expireAfterSeconds}s`, null, 'server-action');
}


module.exports = {
  parseTime,
  escapeHtml,
  sanitizeMetadata,
  recreateTTLIndex,
  importFileIfExists,
  createParamsFromJson,
};

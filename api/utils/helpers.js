const validator = require('validator');

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
      const sanitizedKey = typeof key === 'string' ? validator.escape(key) : key;
      acc[sanitizedKey] = sanitizeMetadata(value);
      return acc;
    }, {});
  } else if (typeof obj === 'string') {
    return validator.escape(obj);
  } else {
    return obj;
  }
}

async function recreateTTLIndex(collection, field, expireAfterSeconds) {
  const indexName = `${field}_1`;
  const db = Consultation.getDatastore().manager;

  const collections = await db.listCollections().toArray();
  const collectionName = collection.collectionName;
  const collectionExists = collections.some(col => col.name === collectionName);

  if (!collectionExists) {
    sails.config.customLogger.log('error', `Collection '${collectionName}' does not exist. Cannot create TTL index.`);
    return;
  }

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

function cleanPhoneNumberForTwilio(number) {
  let cleaned = number.replace(/[^+\d]/g, '');
  if (!cleaned.startsWith('+')) {
    cleaned = `+${cleaned}`;
  }

  return cleaned;
}

module.exports = {
  parseTime,
  escapeHtml,
  sanitizeMetadata,
  recreateTTLIndex,
  cleanPhoneNumberForTwilio
};

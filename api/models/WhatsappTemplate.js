module.exports = {
  attributes: {
    language: {
      type: 'string',
      required: true,
    },
    name: {
      type: 'string',
      required: true,
    },
    twilioTemplateId: {
      type: 'string',
      allowNull: true,
    },
    params: {
      type: 'json',
      defaultsTo: [],
    },
    variables: {
      type: 'json',
      defaultsTo: [],
    },
    contentType: {
      type: 'string',
      isIn: ['twilio/text', 'twilio/media', 'twilio/quick-replies', 'twilio/call-to-action', 'twilio/list-picker', 'twilio/card', 'whatsapp/card'],
      required: true,
    },
    category: {
      type: 'string',
      isIn: ['TRANSACTIONAL', 'MARKETING', 'OTP'],
      required: true,
    },
    status: {
      type: 'string',
      isIn: ['draft','received','pending','approved','rejected'],
      defaultsTo: 'PENDING',
    },
    rejectionReason: {
      type: 'string',
      allowNull: true,
    },
  },
  beforeCreate: async function (values, proceed) {
    const existingTemplate = await WhatsappTemplate.findOne({
      name: values.name,
      language: values.language,
    });

    if (existingTemplate) {
      return proceed(new Error('A template with the same name and language already exists.'));
    }

    return proceed();
  },
};

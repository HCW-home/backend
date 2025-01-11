module.exports = {
  attributes: {
    sid: {
      type: 'string',
      unique: true,
    },

    friendlyName: {
      type: 'string',
      required: true,
    },

    language: {
      type: 'string',
      required: true,
    },

    category: {
      type: 'string',
      isIn: ['UTILITY', 'MARKETING', 'AUTHENTICATION'],
    },

    contentType: {
      type: 'string',
    },

    variables: {
      type: 'json',
      example: { name: 'foo' },
    },

    types: {
      type: 'json',
      description: 'An object containing different template content types.',
      example: {
        'twilio/text': {
          body: 'Foo Bar Co is located at 39.7392, 104.9903',
        },
        'twilio/location': {
          longitude: 104.9903,
          latitude: 39.7392,
          label: 'Foo Bar Co',
        },
      },
    },

    url: {
      type: 'string',
    },

    dateCreated: {
      type: 'string',
      columnType: 'datetime',
      description: 'The date and time when this template was created.',
      example: '2015-07-30T19:00:00Z',
    },

    dateUpdated: {
      type: 'string',
      columnType: 'datetime',
      description: 'The date and time when this template was last updated.',
      example: '2015-07-30T19:00:00Z',
    },

    links: {
      type: 'json',
      description: 'Links to related actions for this template, such as approval requests.',
      example: {
        approval_create: 'https://content.twilio.com/v1/Content/HX.../ApprovalRequests/whatsapp',
        approval_fetch: 'https://content.twilio.com/v1/Content/HX.../ApprovalRequests',
      },
    },
    approvalStatus: {
      type: 'string',
      isIn: ['pending', 'approved', 'rejected', 'draft', 'unknown', 'received'],
      defaultsTo: 'draft',
    },
    rejectionReason: {
      type: 'string',
      allowNull: true,
    },
  },
};

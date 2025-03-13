module.exports = {
  tableName: 'mediasoupserver',

  attributes: {
    url: {
      type: 'string',
      required: true,
      maxLength: 2048,
      description: 'The URL for the mediasoup server',
      example: 'https://example.com',
      isURL: true
    },
    password: {
      type: 'string',
      required: true,
      maxLength: 100,
      description: 'Encrypted or plaintext password (should be hashed ideally)',
    },
    username: {
      type: 'string',
      required: true,
      maxLength: 100,
      description: 'Username used for server access',
    },
    maxNumberOfSessions: {
      type: 'number',
      required: true,
      min: 1,
      max: 1000,
      description: 'Max allowed sessions'
    },
    active: {
      type: 'boolean',
      defaultsTo: true,
      description: 'Server active status',
    }
  },
};

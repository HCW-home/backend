module.exports = {
  attributes: {
    sid: {
      type: 'string',
      unique: true,
      nullable: true,
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
    },
    url: {
      type: 'string',
    },
    actions: {
      type: 'json',
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

const bcrypt = require('bcrypt');

module.exports = {
  attributes: {
    username: {
      type: 'string'
    },
    email: {
      type: 'string',
      isEmail: true,
      required: false
    },
    firstName: {
      type: 'string'
    },
    lastName: {
      type: 'string'
    },
    role: {
      type: 'string',
      isIn: ['doctor', 'nurse', 'admin', 'patient', 'translator', 'guest', 'scheduler', 'expert'],
      required: true
    },
    password: {
      type: 'string'
    },
    smsVerificationCode: {
      type: 'string'
    },
    smsAttempts: {
      type: 'number'
    },
    temporaryAccount: {
      type: 'boolean'
    },
    inviteToken: {
      model: 'PublicInvite',
      required: false
    },
    resetPasswordToken: {
      type: 'string',
      required: false
    },
    phoneNumber: {
      type: 'string'
    },
    authPhoneNumber: {
      type: 'string'
    },
    notifPhoneNumber: {
      type: 'string'
    },
    enableNotif: {
      type: 'boolean',
      defaultsTo: false
    },
    consultations: {
      collection: 'consultation',
      via: 'owner'
    },
    allowedQueues: {
      // columnType: 'array',
      collection: 'queue'
    },
    viewAllQueues: {
      type: 'boolean',
      defaultsTo: false
    },
    doctorClientVersion: {
      type: 'string',
      required: false
    },
    department: {
      type: 'string'
    },
    _function: {
      type: 'string'
    },
    lastLoginType: {
      type: 'string',
      isIn: ['saml', 'local', 'sslcert', 'invite', 'openidconnect']
    },
    preferredLanguage: {
      type: 'string'
    },
    direct: {
      type: 'string'
    },
    organization: {
      type: 'string'
    },
    country: {
      type: 'string'
    },
    sex: {
      type: 'string',
      isIn: ['male', 'female', 'other']
    },
    status: {
      type: 'string',
      isIn: ['approved', 'not-approved'],
      defaultsTo: 'approved'
    },
    doctorTermsVersion: {
      type: 'string',
      defaultsTo: '0',
      required: false
    },
    messageService: {
      type: 'string',
      isIn: ['1', '2'],
      defaultsTo: '2'
    },
  },

  generatePassword(clearPassword) {
    return new Promise((resolve, reject) => {
      bcrypt.genSalt(10, (err, salt) => {
        if (err) {
          sails.config.customLogger.log('error', 'Error generating salt', { error: err?.message || err }, 'server-action');
          return reject(err);
        }
        sails.config.customLogger.log('verbose', 'Salt generated successfully', null, 'message');
        bcrypt.hash(clearPassword, salt, (err, hash) => {
          if (err) {
            sails.config.customLogger.log('error', 'Error encrypting password', { error: err?.message || err }, 'server-action');
            return reject(err);
          }
          sails.config.customLogger.log('info', 'Password encrypted successfully', null, 'message');
          resolve(hash);
        });
      });
    });
  },

  customToJSON() {
    return _.omit(this, ['password', 'smsVerificationCode']);
  },

  async beforeCreate(user, cb) {
    sails.config.customLogger.log('verbose', 'User beforeCreate hook triggered', { userId: user.id || 'new user' }, 'message');
    try {
      if (!user.password) {
        sails.config.customLogger.log('info', 'User beforeCreate: No password provided, skipping password hashing', null, 'message');
        return cb();
      }
      const existing = await User.findOne({ email: user.email });
      if (existing) {
        sails.config.customLogger.log('error', 'User beforeCreate: Email already used', null, 'message');
        return cb({
          message: 'Email already used'
        });
      }
      bcrypt.genSalt(10, (err, salt) => {
        if (err) {
          sails.config.customLogger.log('error', 'User beforeCreate: Error generating salt', { error: err?.message || err }, 'server-action');
          return cb(err);
        }
        bcrypt.hash(user.password, salt, (err, hash) => {
          if (err) {
            sails.config.customLogger.log('error', 'User beforeCreate: Error hashing password', { error: err?.message || err }, 'server-action');
            return cb(err);
          }
          user.password = hash;
          sails.config.customLogger.log('info', 'User beforeCreate: Password hashed successfully', null, 'message');
          return cb();
        });
      });
    } catch (error) {
      sails.config.customLogger.log('error', 'User beforeCreate: Unexpected error', { error: error.message }, 'server-action');
      return cb(error);
    }
  },

  async beforeUpdate(valuesToSet, proceed) {
    try {
      if (valuesToSet.email) {
        if (valuesToSet.password) {
          sails.config.customLogger.log('verbose', 'User beforeUpdate: Password update detected, hashing password', null, 'message');
          bcrypt.genSalt(10, (err, salt) => {
            if (err) {
              sails.config.customLogger.log('error', 'User beforeUpdate: Error generating salt for password update', { error: err?.message || err}, 'server-action');
              return proceed(err);
            }
            bcrypt.hash(valuesToSet.password, salt, (err, hash) => {
              if (err) {
                sails.config.customLogger.log('error', 'User beforeUpdate: Error hashing updated password', { error: err?.message || err }, 'server-action');
                return proceed(err);
              }
              valuesToSet.password = hash;
              sails.config.customLogger.log('info', 'User beforeUpdate: Password updated successfully', null, 'message');
              checkDuplicateEmail();
            });
          });
        } else {
          checkDuplicateEmail();
        }

        async function checkDuplicateEmail() {
          const currentUser = valuesToSet.id ? await User.findOne({ id: valuesToSet.id }) : null;
          if (currentUser && currentUser.email === valuesToSet.email) {
            sails.config.customLogger.log('verbose', 'User beforeUpdate: Email unchanged', null, 'message');
            return proceed();
          }
          const existingUsers = await User.find({
            email: valuesToSet.email,
            id: { '!=': valuesToSet.id }
          });
          if (existingUsers.length > 0) {
            sails.config.customLogger.log('error', 'User beforeUpdate: Duplicate email found', null, 'message');
            const err = new Error('Email have already been used');
            err.name = 'DUPLICATE_EMAIL';
            err.code = 400;
            return proceed(err);
          }
          sails.config.customLogger.log('verbose', 'User beforeUpdate: Email validation passed', null, 'message');
          return proceed();
        }
      } else {
        sails.config.customLogger.log('verbose', 'User beforeUpdate: No email update detected, proceeding', null, 'message');
        proceed();
      }
    } catch (e) {
      sails.config.customLogger.log('error', 'User beforeUpdate: Unexpected error', { error: e?.message }, 'server-action');
      return proceed(e);
    }
  }

};

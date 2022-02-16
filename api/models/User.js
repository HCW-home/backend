/**
 * User.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
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
      isIn: ['doctor', 'nurse', 'admin', 'patient', 'translator', 'guest', 'scheduler'],
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
    // Add a reference to Consultation
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
      isIn: ['saml', 'local', 'sslcert', 'invite']
    },
    preferredLanguage: {
      type: 'string'
    },
    direct: {
      type: 'string'
    }
  },

  generatePassword (clearPassword) {
    return new Promise((resolve, reject) => {
      bcrypt.genSalt(10, (err, salt) => {
        console.log('SALT GENERATED', salt);
        if (err) { reject(err); }
        bcrypt.hash(clearPassword, salt, (err, hash) => {
          console.log('PASSWORD ENCRYPTED', hash);
          crypted = hash;
          if (err) { reject(err); }
          resolve(hash);
        });
      });
    });

  },

  customToJSON () {
    return _.omit(this, ['password', 'smsVerificationCode']);
  },
  async beforeCreate (user, cb) {
    try {
      // if(user.role === 'nurse') {return cb();}
      if (!user.password) {
        return cb();
      }
      const existing = await User.findOne({ email: user.email });
      if (existing) {
        return cb({
          message: 'Email already used '
        });
      }
      bcrypt.genSalt(10, (err, salt) => {
        if (err) { return cb(err); }
        bcrypt.hash(user.password, salt, (err, hash) => {
          if (err) { return cb(err); }
          user.password = hash;
          return cb();
        });
      });
    } catch (error) {
      console.log('error ', error);
      return cb(error);
    }

  },

  async beforeUpdate (valuesToSet, proceed) {


    if (valuesToSet.email) {
      let existing = false;
      if(valuesToSet.id){
        existing = await User.findOne({ email: valuesToSet.email, id: { '!=': valuesToSet.id } });
      }else{
        existing = await User.findOne({ email: valuesToSet.email });
      }

      if (existing) {
        const err = new Error('Email have already been used ');
        err.name = 'DUPLICATE_EMAIL';
        err.code = 400;

        return proceed(err);
      }
    }
    proceed();

  }

};

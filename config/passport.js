const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const OpenIDConnectStrategy = require('passport-openidconnect');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const fs = require("fs");

const passportCustom = require("passport-custom");

const CustomStrategy = passportCustom.Strategy;

const validator = require('validator');

function getUserDetails(user) {
  return {
    email: user.email,
    username: user.username,
    id: user.id,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    authPhoneNumber: user.authPhoneNumber,
    viewAllQueues: user.viewAllQueues,
    doctorClientVersion: user.doctorClientVersion,
    notifPhoneNumber: user.notifPhoneNumber,
    doctorTermsVersion: user.doctorTermsVersion,
    enableNotif: user.enableNotif,
  };
}

passport.serializeUser((user, cb) => {
  cb(null, user.id);
});

passport.deserializeUser((id, cb) => {
  User.findOne({ id }, (err, user) => {
    if (err) {
      sails.config.customLogger.log('error', `Error getting user with MongoID: ${id}`, err, 'server-action');
    }
    cb(err, user);
  });
});

passport.use(
  "invite",
  new CustomStrategy(async (req, callback) => {
    const token = validator.escape(req.body.inviteToken);
    sails.config.customLogger.log('info', `Processing invite for token with MongoID: ${token}`, null, 'message');
    const invite = await PublicInvite.findOne({
      or: [
        { inviteToken: token },
        { expertToken: token }
      ]
    });

    if (!invite) {
      sails.config.customLogger.log('info', `Invite not found for token: ${token}`, null, 'message');
      return callback({ invite: "not-found" }, null);
    }

    if (invite.type === "TRANSLATOR_REQUEST") {
      sails.config.customLogger.log('info', `Invite type TRANSLATOR_REQUEST cannot be used for login for invite ID: ${invite.id}`, null, 'message');
      return callback({ invite: "cannot use this invite for login" }, null);
    }

    const isExpert = invite.expertToken === token;

    if (
      !isExpert && (
        invite.status === "ACCEPTED" ||
        invite.status === "COMPLETED" ||
        invite.status === "REFUSED"
      )
    ) {
      sails.config.customLogger.log('info', `Invite already processed for invite ID: ${invite.id}`, null, 'message');
      return callback({ invite: "invite have already been accepted" }, null);
    }

    if (invite.status === "SENT") {
      await PublicInvite.updateOne({ inviteToken: token }).set({
        status: "ACCEPTED",
      });
      sails.config.customLogger.log('info', `Invite status updated to ACCEPTED for invite ID: ${invite.id}`, null, 'server-action');
    }

    let user = await User.findOne({ role: { '!=': 'expert' }, username: invite.id });

    if (user && !isExpert) {
      if (user.hasOwnProperty('status') && user.status !== "approved") {
        sails.config.customLogger.log('error', `User not approved for user with MongoID: ${user.id}`, null, 'message');
        return callback(new Error("User is not approved"));
      }
      sails.config.customLogger.log('info', `Existing user found with MongoID: ${user.id}`, null, 'message');
      return callback(null, user);
    }

    const newUser = {
      username: invite.id,
      firstName: "",
      lastName: "",
      role: isExpert ? 'expert' : invite.type.toLowerCase(),
      password: "",
      temporaryAccount: true,
      inviteToken: invite.id,
    };

    if (invite.emailAddress) {
      newUser.email = invite.emailAddress;
    }
    if (invite.phoneNumber) {
      newUser.phoneNumber = invite.phoneNumber;
    }
    if (req.body.phoneNumber) {
      newUser.phoneNumberEnteredByPatient = validator.escape(req.body.phoneNumber);
    }

    if (req.body.firstName) {
      newUser.firstName = validator.escape(req.body.firstName);
    }
    if (req.body.lastName) {
      newUser.lastName = validator.escape(req.body.lastName);
    }

    user = await User.create(newUser).fetch();
    sails.config.customLogger.log('info', `New user created with MongoID: ${user.id} for invite ID: ${invite.id}`, null, 'server-action');

    if (isExpert) {
      const patientInvite = await PublicInvite.findOne({
        expertToken: req.body.inviteToken,
      });

      await Consultation.findOne({ invitationToken: patientInvite.inviteToken })
        .then(async (consultation) => {
          if (consultation) {
            // consultation.status = 'active';
            consultation.experts.push(user.id);

            (await Consultation.getConsultationParticipants(consultation)).forEach(
              (participant) => {
                sails.config.customLogger.log('info', `Broadcasting consultation ${consultation?.id} update for participant with MongoID: ${participant}`, null, 'server-action');
                sails.sockets.broadcast(participant, "consultationUpdated", {
                  data: { consultation },
                });
              }
            );
          }
          return Consultation.update({ _id: consultation?.id }, consultation);
        })
        .then(updatedConsultation => {
          sails.config.customLogger.log('info', `Updated consultation ${updatedConsultation?.id} for invite ID: ${invite.id}`, null, 'server-action');
        })
        .catch(err => sails.config.customLogger.log('error', `Error updating consultation for invite ID: ${invite.id}`, err, 'server-action'));
    }

    if (invite.type === "GUEST") {
      const patientInvite = await PublicInvite.findOne({
        guestInvite: invite.id,
      });
      if (patientInvite) {
        const [consultation] = await Consultation.update({
          invite: patientInvite.id,
        })
          .set({ guest: user.id })
          .fetch();
        if (consultation) {
          (await Consultation.getConsultationParticipants(consultation)).forEach(
            (participant) => {
              sails.config.customLogger.log('info', `Broadcasting consultation ${consultation?.id} update for participant with MongoID: ${participant}`, null, 'server-action');
              sails.sockets.broadcast(participant, "consultationUpdated", {
                data: { consultation },
              });
            }
          );
        }
      }
    }

    return callback(null, user);
  })
);

passport.use(
  "sms",
  new CustomStrategy(async (req, cb) => {
    const user = await User.findOne({ id: req.body.user });
    const { locale } = req.headers || {};
    if (!user || (user.hasOwnProperty('status') && user.status !== "approved")) {
      sails.config.customLogger.log('error', `User with MongoID: ${req.body.user} is not approved`, null, 'message');
      return cb(new Error('User is not approved'));
    }
    jwt.verify(
      user.smsVerificationCode,
      sails.config.globals.APP_SECRET,
      async (err, decoded) => {
        if (err) {
          if (err.name === "TokenExpiredError") {
            sails.config.customLogger.log('info', `SMS verification token expired for user with MongoID: ${req.body.user}`, null, 'message');
            return cb(null, false, { message: sails._t(locale, 'expired code') });
          }
          sails.config.customLogger.log('error', `Error verifying SMS token for user with MongoID: ${req.body.user}`, err, 'message');
          return cb(null, false, { message: sails._t(locale, 'invalid token') });
        }

        if (decoded.code !== req.body.smsVerificationCode) {
          sails.config.customLogger.log('info', `Invalid SMS verification code provided for user with MongoID: ${req.body.user}`, null, 'message');
          user.smsAttempts++;
          if (user.smsAttempts > 9) {
            await User.updateOne({ id: req.body.user }).set({
              smsVerificationCode: "",
            });
            sails.config.customLogger.log('info', `User with MongoID: ${req.body.user} reached maximum SMS verification attempts`, null, 'message');
            return cb(null, false, { message: "MAX_ATTEMPTS" });
          } else {
            await User.updateOne({ id: req.body.user }).set({
              smsAttempts: user.smsAttempts,
            });
            return cb(null, false, { message: sails._t(locale, 'invalid verification code') });
          }
        }

        sails.config.customLogger.log('info', `SMS login successful for user with MongoID: ${req.body.user}`, null, 'message');
        return cb(null, user, { message: sails._t(locale, 'SMS login successful') });
      }
    );
  })
);

passport.use(
  "2FA",
  new CustomStrategy(async (req, cb) => {
    const user = await User.findOne({ id: req.body.user });
    const { locale } = req.headers || {};
    if (!user || (user.hasOwnProperty('status') && user.status !== "approved")) {
      sails.config.customLogger.log('error', `User with MongoID: ${req.body.user} is not approved`, null, 'message');
      return cb(new Error('User is not approved'));
    }

    jwt.verify(
      req.body.localLoginToken,
      sails.config.globals.APP_SECRET,
      async (err, decoded) => {
        if (err) {
          if (err.name === "TokenExpiredError") {
            sails.config.customLogger.log('info', `Local login token expired for user with MongoID: ${req.body.user}`, null, 'message');
            return cb(null, false, { message: sails._t(locale, 'expired token') });
          }
          sails.config.customLogger.log('error', `Error verifying local login token for user with MongoID: ${req.body.user}`, err, 'message');
          return cb(null, false, { message: sails._t(locale, 'invalid token') });
        }

        if (decoded.id !== user.id) {
          sails.config.customLogger.log('error', `Decoded local token ID does not match user ID for user with MongoID: ${req.body.user}`, null, 'message');
          return cb(null, false, { message: sails._t(locale, 'invalid token') });
        }

        jwt.verify(
          req.body.smsLoginToken,
          sails.config.globals.APP_SECRET,
          async (err, decoded) => {
            if (err) {
              if (err.name === "TokenExpiredError") {
                sails.config.customLogger.log('info', `SMS login token expired for user with MongoID: ${req.body.user}`, null, 'message');
                return cb(null, false, { message: sails._t(locale, 'expired token') });
              }
              sails.config.customLogger.log('error', `Error verifying SMS login token for user with MongoID: ${req.body.user}`, err, 'server-action');
              return cb(null, false, { message: sails._t(locale, 'invalid token') });
            }

            if (decoded.id !== user.id) {
              sails.config.customLogger.log('error', `Decoded SMS token ID does not match user ID for user with MongoID: ${req.body.user}`, null, 'message');
              return cb(null, false, { message: sails._t(locale, 'invalid token') });
            }

            const userDetails = getUserDetails(user);
            const { token, refreshToken } = TokenService.generateToken(userDetails) || {};
            userDetails.token = token;
            userDetails.refreshToken = refreshToken;

            sails.config.customLogger.log('info', `2FA login successful for user with MongoID: ${req.body.user}`, null, 'message');
            return cb(null, userDetails, { message: sails._t(locale, '2FA login successful') });
          }
        );
      }
    );
  })
);

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passportField: "password",
      passReqToCallback: true
    },
    (req, email, password, cb) => {
      const { locale } = req.headers;
      sails.config.customLogger.log('info', `Local strategy: Attempting login with provided email`, null, 'message');
      User.findOne(
        {
          email: email.toLowerCase(),
          temporaryAccount: { "!=": true },
          role: { '!=': sails.config.globals.ROLE_NURSE }
        },
        (err, user) => {
          if (err) {
            sails.config.customLogger.log('error', `Local strategy: Error finding user with email provided`, err, 'server-action');
            return cb(err);
          }
          if (!user) {
            sails.config.customLogger.log('info', `Local strategy: No user found for provided email`, null, 'message');
            return cb(null, false, {
              message: sails._t(locale, 'invalid email'),
            });
          }
          if (user && user.hasOwnProperty('status') && user.status !== "approved") {
            sails.config.customLogger.log('error', `Local strategy: User with MongoID: ${user.id} is not approved`, null, 'message');
            return cb(new Error('User is not approved'));
          }
          bcrypt.compare(password, user.password, (err, res) => {
            if (err) {
              sails.config.customLogger.log('error', `Local strategy: Error comparing password for user with MongoID: ${user.id}`, err, 'server-action');
              return cb(err);
            }
            if (!res) {
              sails.config.customLogger.log('info', `Local strategy: Invalid password for user with MongoID: ${user.id}`, null, 'message');
              return cb(null, false, {
                message: sails._t(locale, 'invalid email'),
              });
            }
            if (user.role === "doctor") {
              if (!user.doctorClientVersion) {
                sails.config.customLogger.log('info', `Local strategy: Doctor user with MongoID: ${user.id} requires browser cache update`, null, 'message');
                return cb(null, false, {
                  message: sails._t(locale, 'browser cache'),
                });
              }
            }
            const userDetails = getUserDetails(user);
            const { token, refreshToken } = TokenService.generateToken(userDetails) || {};
            userDetails.token = token;
            userDetails.refreshToken = refreshToken;
            userDetails.smsVerificationCode = user.smsVerificationCode;
            sails.config.customLogger.log('info', `Local strategy: Login successful for user with MongoID: ${user.id}`, null, 'message');
            return cb(null, userDetails, { message: sails._t(locale, 'login successful') });
          });
        }
      );
    }
  )
);

let openidConnectAdminStrategy;
if (process.env.LOGIN_METHOD === 'openid') {
  openidConnectAdminStrategy = new OpenIDConnectStrategy(
    {
      issuer: process.env['OPENID_ISSUER_BASE_URL'],
      authorizationURL: process.env['OPENID_AUTHORIZATION_URL'],
      tokenURL: process.env['OPENID_TOKEN_URL'],
      userInfoURL: process.env['OPENID_USER_INFO_URL'],
      clientID: process.env['OPENID_CLIENT_ID'],
      clientSecret: process.env['OPENID_CLIENT_SECRET'],
      callbackURL: `${process.env['OPENID_CALLBACK_URL']}?role=admin`,
      scope: process.env.OPENID_SCOPE
        ? process.env.OPENID_SCOPE?.split(',')
        : ['profile'],
    },
    async (issuer, profile, cb) => {
      try {
        sails.config.customLogger.log('info', 'Processing OpenID Connect Admin Strategy callback', null, 'message');
        const email = profile.emails[0].value;
        if (!email) {
          const err = `Email field profile.emails[0].value doesn't exist`;
          sails.config.customLogger.log('error', err, null, 'message');
          return cb(new Error(err));
        }
        let user = await User.findOne({
          email,
          role: sails.config.globals.ROLE_ADMIN,
        });
        if (user) {
          sails.config.customLogger.log('info', `Admin user found with MongoID: ${user.id}`, null, 'message');
          if (user.hasOwnProperty('status') && user.status !== "approved") {
            sails.config.customLogger.log('error', `Admin user with MongoID: ${user.id} is not approved`, null, 'message');
            return cb(new Error('User is not approved'));
          }
          const { token, refreshToken } = TokenService.generateToken(user) || {};
          user.token = token;
          user.refreshToken = refreshToken;
          sails.config.customLogger.log('info', `Login Successful for admin user with MongoID: ${user.id}`, null, 'message');
          return cb(null, user, { message: "Login Successful" });
        } else {
          sails.config.customLogger.log('error', `Admin user not found for email: ${email}`, null, 'message');
          return cb(new Error('Access is denied'));
        }
      } catch (error) {
        sails.config.customLogger.log('error', 'Error creating admin user via OpenID Connect', error, 'server-action');
        return cb(error);
      }
    }
  );
  passport.use('openidconnect_admin', openidConnectAdminStrategy);
}

let openidConnectNurseStrategy;
if (process.env.LOGIN_METHOD === 'openid') {
  openidConnectNurseStrategy = new OpenIDConnectStrategy(
    {
      issuer: process.env['OPENID_ISSUER_BASE_URL'],
      authorizationURL: process.env['OPENID_AUTHORIZATION_URL'],
      tokenURL: process.env['OPENID_TOKEN_URL'],
      userInfoURL: process.env['OPENID_USER_INFO_URL'],
      clientID: process.env['OPENID_CLIENT_ID'],
      clientSecret: process.env['OPENID_CLIENT_SECRET'],
      callbackURL: `${process.env['OPENID_CALLBACK_URL']}?role=nurse`,
      scope: process.env.OPENID_SCOPE ? process.env.OPENID_SCOPE?.split(',') : ['profile'],
    },
    async (issuer, profile, cb) => {
      try {
        sails.config.customLogger.log('info', 'Processing OpenID Connect Nurse Strategy callback', null, 'message');
        const email = profile.emails[0].value;
        if (!email) {
          const err = `Email field profile.emails[0].value doesn't exist`;
          sails.config.customLogger.log('error', err, null, 'message');
          return cb(new Error(err));
        }

        let user = await User.findOne({
          email,
          role: sails.config.globals.ROLE_NURSE,
        });

        if (!user) {
          sails.config.customLogger.log('verbose', `Nurse user not found for email: ${email}, checking for admin user`, null, 'message');
          const adminUser = await User.findOne({ email, role: sails.config.globals.ROLE_ADMIN });
          if (adminUser) {
            user = adminUser;
            sails.config.customLogger.log('info', `Admin user found for email: ${email}, allowing access as nurse`, null, 'message');
          } else {
            sails.config.customLogger.log('error', `User not allowed to use this app for email: ${email}`, null, 'message');
            return cb(new Error('User is not allowed to use this app'));
          }
        }

        if (user && user.status === 'approved') {
          const { token, refreshToken } = TokenService.generateToken(user) || {};
          user.token = token;
          user.refreshToken = refreshToken;
          sails.config.customLogger.log('info', `Login successful for nurse user with MongoID: ${user.id}`, null, 'message');
          return cb(null, user, { message: "Login Successful" });
        } else {
          sails.config.customLogger.log('error', `User with MongoID: ${user.id} is not approved`, null, 'message');
          return cb(new Error('User is not approved'));
        }
      } catch (error) {
        sails.config.customLogger.log('error', 'Error creating nurse user via OpenID Connect', error, 'server-action');
        return cb(error);
      }
    }
  );
  passport.use('openidconnect_nurse', openidConnectNurseStrategy);
}

let openidConnectDoctorStrategy;
if (process.env.LOGIN_METHOD === 'openid') {
  openidConnectDoctorStrategy = new OpenIDConnectStrategy(
    {
      issuer: process.env['OPENID_ISSUER_BASE_URL'],
      authorizationURL: process.env['OPENID_AUTHORIZATION_URL'],
      tokenURL: process.env['OPENID_TOKEN_URL'],
      userInfoURL: process.env['OPENID_USER_INFO_URL'],
      clientID: process.env['OPENID_CLIENT_ID'],
      clientSecret: process.env['OPENID_CLIENT_SECRET'],
      callbackURL: `${process.env['OPENID_CALLBACK_URL']}?role=doctor`,
      scope: process.env.OPENID_SCOPE ? process.env.OPENID_SCOPE?.split(',') : ['profile'],
    },
    async (issuer, profile, cb) => {
      try {
        sails.config.customLogger.log('info', 'Processing OpenID Connect Doctor Strategy callback', null, 'message');
        sails.config.customLogger.log('verbose', `Profile with id ${profile.id} received from OpenID Connect`, null, 'message');
        const email = profile.emails[0].value;
        const [firstName, lastName] = profile.displayName ? profile.displayName.split(' ') : ['', ''];
        if (!email) {
          const err = `Email field profile.emails[0].value doesn't exist`;
          sails.config.customLogger.log('error', err, null, 'message');
          return cb(new Error(err));
        }
        let user = await User.findOne({
          email,
          role: sails.config.globals.ROLE_DOCTOR
        });
        if (user && user.role === sails.config.globals.ROLE_DOCTOR) {
          if (user.hasOwnProperty('status') && user.status !== "approved") {
            sails.config.customLogger.log('error', `User with MongoID: ${user.id} is not approved`, null, 'message');
            return cb(new Error('User is not approved'));
          }
          user = await User.findOne({ id: user.id }).populate("allowedQueues");
          sails.config.customLogger.log('info', `Doctor user found with MongoID: ${user.id}`, null, 'message');
        }
        if (!user) {
          sails.config.customLogger.log('info', `No doctor user found for doctor email, checking admin role`, null, 'message');
          user = await User.findOne({
            email,
            role: sails.config.globals.ROLE_ADMIN
          });
        }
        if (!user) {
          let conflictingUsers = await User.find({
            email: email,
            role: { in: [sails.config.globals.ROLE_NURSE, sails.config.globals.ROLE_SCHEDULER] }
          });
          if (conflictingUsers && conflictingUsers.length > 0) {
            sails.config.customLogger.log('error', `Conflicting users found for email`, null, 'message');
            return cb(new Error('A user with this email already exists with a different role'));
          }
          user = await User.create({
            email: email,
            firstName: firstName || '',
            lastName: lastName || '',
            status: process.env.OPENID_AUTOCREATE_USER === 'true' ? 'approved' : 'not-approved',
            role: sails.config.globals.ROLE_DOCTOR
          }).fetch();
          sails.config.customLogger.log('info', `New doctor user created with MongoID: ${user.id}`, null, 'message');
        }
        const { token, refreshToken } = TokenService.generateToken(user) || {};
        user.token = token;
        user.refreshToken = refreshToken;
        sails.config.customLogger.log('info', `Login successful for doctor user with MongoID: ${user.id}`, null, 'message');
        return cb(null, user, { message: "Login Successful" });
      } catch (error) {
        sails.config.customLogger.log('error', 'Error creating doctor user via OpenID Connect', error, 'server-action');
        return cb(error);
      }
    }
  );
  passport.use('openidconnect_doctor', openidConnectDoctorStrategy);
}


const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const OpenIDConnectStrategy = require('passport-openidconnect');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const { Strategy } = require("passport-trusted-header");

const passportCustom = require("passport-custom");

const CustomStrategy = passportCustom.Strategy;

const ActiveDirectory = require("activedirectory");
const validator = require('validator');
const config = {
  url: process.env.AD_URIS,
  baseDN: process.env.AD_BASE,
  username: process.env.AD_USER,
  password: process.env.AD_PASSWORD,
};
const ad = new ActiveDirectory(config);

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
    enableNotif: user.enableNotif,
  };
}

passport.serializeUser((user, cb) => {
  cb(null, user.id);
});

passport.deserializeUser((id, cb) => {
  User.findOne({ id }, (err, user) => {
    if (err) {
      console.log("ERROR getting user ", err);
    }
    cb(err, user);
  });
});

passport.use(
  "invite",
  new CustomStrategy(async (req, callback) => {
    const token = validator.escape(req.body.inviteToken)
    const invite = await PublicInvite.findOne({
      or: [
        { inviteToken: token },
        { expertToken: token }
      ]
    });

    if (!invite) {
      return callback({ invite: "not-found" }, null);
    }

    if (invite.type === "TRANSLATOR_REQUEST") {
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
      return callback({ invite: "invite have already been accepted" }, null);
    }

    if (invite.status === "SENT") {
      await PublicInvite.updateOne({ inviteToken: token }).set({
        status: "ACCEPTED",
      });
    }

    let user = await User.findOne({ role: { '!=': 'expert' }, username: invite.id });

    if (user && !isExpert) {
      if (user.hasOwnProperty('status') && user.status !== "approved") {
        return callback(new Error("User is not approved"));
      }
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

    if (isExpert) {
      const patientInvite = await PublicInvite.findOne({
        expertToken: req.body.inviteToken,
      });

      await Consultation.findOne({ invitationToken: patientInvite.inviteToken })
        .then( async (consultation) => {

          if (consultation) {
            consultation.status = 'active';
            consultation.experts.push(user.id);

            (await Consultation.getConsultationParticipants(consultation)).forEach(
              (participant) => {
                console.log('participant', participant);
                sails.sockets.broadcast(participant, "consultationUpdated", {
                  data: { consultation },
                });
              }
            );
          }

          return Consultation.update({ _id: consultation.id }, consultation);
        })
        .then(updatedConsultation => {
          console.log('Updated consultation:', updatedConsultation);
        })
        .catch(err => console.error(err));
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
              sails.sockets.broadcast(participant, "consultationUpdated", {
                data: { consultation },
              });
            }
          );
        }
      }
    }

    callback(null, user);
  })
);

passport.use(
  "sms",
  new CustomStrategy(async (req, cb) => {
    const user = await User.findOne({ id: req.body.user });
    const { locale } = req.headers || {};
    if (!user || (user.hasOwnProperty('status') && user.status !== "approved")) {
      return cb(new Error('User is not approved'));
    }
    jwt.verify(
      user.smsVerificationCode,
      sails.config.globals.APP_SECRET,
      async (err, decoded) => {
        if (err) {
          if (err.name === "TokenExpiredError") {
            return cb(null, false, { message: sails._t(locale, 'expired code') });
          }
          console.error("error ", err);
          return cb(null, false, { message: sails._t(locale, 'invalid token') });
        }

        if (decoded.code !== req.body.smsVerificationCode) {
          user.smsAttempts++;
          if (user.smsAttempts > 9) {
            await User.updateOne({ id: req.body.user }).set({
              smsVerificationCode: "",
            });
            return cb(null, false, { message: "MAX_ATTEMPTS" });
          } else {
            await User.updateOne({ id: req.body.user }).set({
              smsAttempts: user.smsAttempts,
            });
            return cb(null, false, { message: sails._t(locale, 'invalid verification code') });
          }
        }

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
      return cb(new Error('User is not approved'));
    }

    jwt.verify(
      req.body.localLoginToken,
      sails.config.globals.APP_SECRET,
      async (err, decoded) => {
        if (err) {
          if (err.name === "TokenExpiredError") {
            return cb(null, false, { message: sails._t(locale, 'expired token') });
          }
          console.error("error ", err);
          return cb(null, false, { message: sails._t(locale, 'invalid token') });
        }

        if (decoded.id !== user.id) {
          return cb(null, false, { message: sails._t(locale, 'invalid token') });
        }

        jwt.verify(
          req.body.smsLoginToken,
          sails.config.globals.APP_SECRET,
          async (err, decoded) => {
            if (err) {
              if (err.name === "TokenExpiredError") {
                return cb(null, false, { message: sails._t(locale, 'expired token') });
              }
              console.error("error ", err);
              return cb(null, false, { message: sails._t(locale, 'invalid token') });
            }

            if (decoded.id !== user.id) {
              return cb(null, false, { message: sails._t(locale, 'invalid token') });
            }

            const userDetails = getUserDetails(user);
            const { token, refreshToken } = TokenService.generateToken(userDetails) || {};
            userDetails.token = token;
            userDetails.refreshToken = refreshToken;

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
      User.findOne(
        {
          email: email.toLowerCase(),
          temporaryAccount: { "!=": true },
          role: { '!=': sails.config.globals.ROLE_NURSE }
        },
        (err, user) => {
          if (err) {
            return cb(err);
          }
          if (!user ||( user.hasOwnProperty('status') && user.status !== "approved")) {
            return cb(new Error('User is not approved'));
          }
          bcrypt.compare(password, user.password, (err, res) => {
            if (err) {
              return cb(err);
            }

            if (!res) {
              return cb(null, false, {
                message: sails._t(locale, 'invalid email'),
              });
            }
            if (user.role === "doctor") {
              if (!user.doctorClientVersion) {
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
            return cb(null, userDetails, { message: sails._t(locale, 'login successful') });
          });
        }
      );
    }
  )
);

let openidConnectAdminStrategy;
if ( process.env.LOGIN_METHOD === 'openid') {
  openidConnectAdminStrategy = new OpenIDConnectStrategy({
      issuer: process.env['OPENID_ISSUER_BASE_URL'],
      authorizationURL: process.env['OPENID_AUTHORIZATION_URL'],
      tokenURL: process.env['OPENID_TOKEN_URL'],
      userInfoURL: process.env['OPENID_USER_INFO_URL'],
      clientID: process.env['OPENID_CLIENT_ID'],
      clientSecret: process.env['OPENID_CLIENT_SECRET'],
      callbackURL: `${process.env['OPENID_CALLBACK_URL']}?role=admin`,
      scope: process.env.OPENID_SCOPE ? (process.env.OPENID_SCOPE).split(',') : ['profile'],
    },
    async (issuer, profile, cb) => {
      try {
        const email = profile.emails[0].value;
        if (!email) {
          const err = `Email field profile.emails[0].value doesn't exist`;
          console.error(err);
          return cb(new Error(err));
        }

        let user = await User.findOne({
          email,
          role: sails.config.globals.ROLE_ADMIN
        });

        if (user) {
          if (user.hasOwnProperty('status') && user.status !== "approved") {
            return cb(new Error('User is not approved'));
          }
          const { token, refreshToken } = TokenService.generateToken(user) || {};

          user.token = token;
          user.refreshToken = refreshToken;
          return cb(null, user, { message: "Login Successful" });
        } else {
          return cb(new Error('Access is denied'));
        }

      } catch (error) {
        sails.log("error creating user ", error);
        return cb(error);
      }
    }
  )
  passport.use('openidconnect_admin', openidConnectAdminStrategy);
}

let openidConnectNurseStrategy
if (process.env.LOGIN_METHOD === 'openid') {
  openidConnectNurseStrategy = new OpenIDConnectStrategy({
      issuer: process.env['OPENID_ISSUER_BASE_URL'],
      authorizationURL: process.env['OPENID_AUTHORIZATION_URL'],
      tokenURL: process.env['OPENID_TOKEN_URL'],
      userInfoURL: process.env['OPENID_USER_INFO_URL'],
      clientID: process.env['OPENID_CLIENT_ID'],
      clientSecret: process.env['OPENID_CLIENT_SECRET'],
      callbackURL: `${process.env['OPENID_CALLBACK_URL']}?role=nurse`,
      scope: process.env.OPENID_SCOPE ? (process.env.OPENID_SCOPE).split(',') : ['profile'],
    },
    async (issuer, profile, cb) => {
      try {
        const email = profile.emails[0].value;
        if (!email) {
          const err = `Email field profile.emails[0].value doesn't exist`;
          console.error(err);
          return cb(new Error(err));
        }

        let user = await User.findOne({
          email,
          role: sails.config.globals.ROLE_NURSE
        });

        if (!user) {
          return cb(new Error('User is not allowed to use this app'));
        } else if (user && user.status === 'approved') {
          const { token, refreshToken } = TokenService.generateToken(user) || {};
          user.token = token;
          user.refreshToken = refreshToken;
          return cb(null, user, { message: "Login Successful" });
        } else {
          return cb(new Error('User is not approved'));
        }

      } catch (error) {
        sails.log("error creating user ", error);
        return cb(error);
      }
    }
  )
  passport.use('openidconnect_nurse', openidConnectNurseStrategy);
}

let openidConnectDoctorStrategy
if (process.env.LOGIN_METHOD === 'openid') {
  openidConnectDoctorStrategy = new OpenIDConnectStrategy({
      issuer: process.env['OPENID_ISSUER_BASE_URL'],
      authorizationURL: process.env['OPENID_AUTHORIZATION_URL'],
      tokenURL: process.env['OPENID_TOKEN_URL'],
      userInfoURL: process.env['OPENID_USER_INFO_URL'],
      clientID: process.env['OPENID_CLIENT_ID'],
      clientSecret: process.env['OPENID_CLIENT_SECRET'],
      callbackURL: `${process.env['OPENID_CALLBACK_URL']}?role=doctor`,
      scope: process.env.OPENID_SCOPE ? (process.env.OPENID_SCOPE).split(',') : ['profile'],
    },
    async (issuer, profile, cb) => {
      try {
        console.log("PROFILE ", profile);
        const email = profile.emails[0].value;
        const [firstName, lastName] = profile.displayName ? profile.displayName.split(' ') : '';
        if (!email) {
          const err = `Email field profile.emails[0].value doesn't exist`;
          console.error(err);
          return cb(new Error(err));
        }
        let user
        user = await User.findOne({
          email,
          role: sails.config.globals.ROLE_DOCTOR
        });

        if (user && user.role === sails.config.globals.ROLE_DOCTOR) {
          if (user.hasOwnProperty('status') && user.status !== "approved") {
            return cb(new Error('User is not approved'));
          }
          user = await User.findOne({ id: user.id }).populate("allowedQueues");
        }

        if (!user) {
          user = await User.findOne({
            email,
            role: sails.config.globals.ROLE_ADMIN
          });
        }

        if (!user || (user.hasOwnProperty('status') &&user.status !== "approved")) {
          return cb(new Error('User is not approved'));
        }

        const { token, refreshToken } = TokenService.generateToken(user) || {};

        user.token = token;
        user.refreshToken = refreshToken;

        return cb(null, user, { message: "Login Successful" });
      } catch (error) {
        sails.log("error creating user ", error);
        return cb(error);
      }
    }
  )
  passport.use('openidconnect_doctor', openidConnectDoctorStrategy);
}

const options = {
  headers: ["x-ssl-client-s-dn"],
};

passport.use(
  new Strategy(options, async (requestHeaders, cb) => {
    let user = null;
    const userDn = requestHeaders["x-ssl-client-s-dn"];
    const CNMatch = userDn.match(/CN=([^\/]+)/);
    const emailMatch = userDn.match(/emailAddress=([^\/\s]+)/);
    const login = CNMatch && CNMatch[1] ? CNMatch[1].split(/\s+/)[0] : null;
    const firstName = login;
    const email = `${ firstName }@imad.ch`;
    const lastName = "UNKNOWN";

    sails.log.debug("headers ", userDn, firstName, lastName, email);

    if (!firstName) {
      return cb(new Error("CN field is not present"), null, {
        message: "CN field is not present",
      });
    }
    if (email) {
      user = await User.findOne({ email });
      if (!user) {
        try {
          user = await User.create({
            email,
            firstName,
            lastName,
            role: sails.config.globals.ROLE_NURSE,
          }).fetch();
        } catch (error) {
          return cb(error, null, { message: "Login Unsuccessful" });
        }
      }

      if (user.hasOwnProperty('status') && user.status !== "approved") {
        return cb(new Error('User is not approved'));
      }

      const { token, refreshToken } = TokenService.generateToken(user) || {};

      user.token = token;
      user.refreshToken = refreshToken;

      return cb(null, user, { message: "Login Successful" });
    } else {
      return cb(null, null, { message: "email not found" });
    }
  })
);

const SamlStrategy = require("@node-saml/passport-saml").Strategy;
let samlStrategy;

if ((process.env.LOGIN_METHOD === 'both' || process.env.LOGIN_METHOD === 'saml')) {
  samlStrategy = new SamlStrategy(
    {
      callbackUrl:
        (process.env.LOGIN_METHOD === 'both' || process.env.LOGIN_METHOD === 'saml') ? process.env.SAML_CALLBACK : '',
      path: "/api/v1/login-callback",
      entryPoint:
        (process.env.LOGIN_METHOD === 'both' || process.env.LOGIN_METHOD === 'saml') ?
          process.env.SAML_ENTRY_POINT : '',
      logoutUrl: process.env.LOGOUT_URL,
      issuer: (process.env.LOGIN_METHOD === 'both' || process.env.LOGIN_METHOD === 'saml') ? process.env.SAML_ISSUER : '',
      cert: (process.env.LOGIN_METHOD === 'both' || process.env.LOGIN_METHOD === 'saml') ? process.env.SAML_CERT : '',
      decryptionPvk: (process.env.LOGIN_METHOD === 'both' || process.env.LOGIN_METHOD === 'saml') ? fs.readFileSync(process.env.SAML_PATH_KEY, "utf-8") : '',
      privateKey: (process.env.LOGIN_METHOD === 'both' || process.env.LOGIN_METHOD === 'saml') ? fs.readFileSync(process.env.SAML_PATH_KEY, "utf-8") : '',
    },
    async (profile, cb) => {
      try {
        console.log("PROFILE ", profile);
        if (!profile[process.env.EMAIL_FIELD]) {
          const err = `Email field ${ process.env.EMAIL_FIELD } doesn't exist`;
          console.error(err);
          return cb(new Error(err));
        }
        let user = await User.findOne({
          email: profile[process.env.EMAIL_FIELD],
          role: "doctor",
        }).populate("allowedQueues");

        if (!user || (user.hasOwnProperty('status') && user.status !== "approved")) {
          return cb(new Error('User is not approved'));
        }

        const { token, refreshToken } = TokenService.generateToken(user) || {};

        user.token = token;
        user.refreshToken = refreshToken;

        return cb(null, user, { message: "Login Successful" });
      } catch (error) {
        sails.log("error creating user ", error);
        return cb(error);
      }
    }
  );

  passport.use(samlStrategy);
}

exports.samlStrategy = samlStrategy;

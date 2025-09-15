const bodyParser = require('body-parser');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const Joi = require('joi');
const { i18n } = require('../../config/i18n');
const { escapeHtml } = require('../utils/helpers');

const SMS_CODE_LIFESPAN = 5 * 60;


const headersSchema = Joi.object({
  locale: Joi.string().optional(),
}).unknown(true);

function generateVerificationCode() {
  const possible = '0123456789';
  let string = '';
  for (let i = 0; i < 6; i++) {
    string += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return string;
}

const canLoginLocal = async (req) => {
  if (
    process.env.LOGIN_METHOD === 'password' ||
    process.env.LOGIN_METHOD === 'both'
  ) {
    return true;
  }
  if (req.user && req.user.role === 'doctor') {
    return false;
  } else if (req.body.email) {
    const isDoctor = await User.count({
      email: req.body.email,
      role: 'doctor',
    });
    return !isDoctor;
  } else if (typeof req.body.user === 'string') {
    const isDoctor = await User.count({ id: req.body.user, role: 'doctor' });
    return !isDoctor;
  }
  return false;
};

module.exports = {

  async loginInvite(req, res) {
    try {
      const invite = await PublicInvite.findOne({
        or: [
          { inviteToken: req.body.inviteToken },
          { expertToken: req.body.inviteToken },
        ],
      });

      if (!invite) {
        sails.config.customLogger.log('warn', 'Login invite attempted with an invalid token.', null, 'message', null);
        return res.status(401).json({ error: 'Invalid invite token' });
      }

      const isExpert = invite.expertToken === req.body.inviteToken;

      passport.authenticate('invite', async (err, user) => {
        if (err || !user) {
          sails.config.customLogger.log('warn', `Failed invitation authentication. ${err?.message || err}`, null, 'server-action', null);
          return res.status(401).json({ err });
        }

        sails.config.customLogger.log('info', `Invitation login: user ${user.id} authenticated successfully.`, null, 'message', user.id);

        try {
          await User.updateOne({ id: user.id }).set({ lastLoginType: 'invite' });
          sails.config.customLogger.log('verbose', `User ${user.id} updated lastLoginType to "invite".`, null, 'server-action', user.id);
        } catch (updateError) {
          sails.config.customLogger.log('error', `Error updating user ${user.id} login type: ${updateError}`, null, 'server-action', user.id);
        }

        req.logIn(user, function(err) {
          req.session.cookie.expires = 7 * 24 * 60 * 50 * 1000;

          if (err) {
            sails.config.customLogger.log('error', `Error during login for user ${user.id}: ${err}`, null, 'server-action', user.id);
            return res.status(500).send();
          }

          const { token, refreshToken } = TokenService.generateToken(user);
          user.token = token;
          user.refreshToken = refreshToken;

          sails.config.customLogger.log('info', `User ${user.id} logged in using invite. isExpert: ${isExpert}.`, null, 'message', user.id);
          return res.json({ user });
        });
      })(req, res, (err) => {
        sails.config.customLogger.log('error', `Error in passport.authenticate callback for login invite: ${err}`, null, 'server-action', null);
      });
    } catch (e) {
      sails.config.customLogger.log('error', `Unexpected error in loginInvite: ${e?.message || e}`, null, 'server-action', null);
      return res.status(500).send();
    }
  },

  async forgotPassword(req, res) {
    try {
      try {
        User.validate("email", req.body.email);
      } catch (error) {
        sails.config.customLogger.log('warn', 'Invalid email provided for forgotPassword.', null, 'message', null);
        return res.status(401).json({ message: "Email is invalid" });
      }
      const db = User.getDatastore().manager;
      const userCollection = db.collection("user");
      const user = (
        await userCollection
          .find({
            email: req.body.email,
            role: { $in: ["admin", "doctor", "nurse"] },
          })
          .collation({ locale: "en", strength: 1 })
          .limit(1)
          .toArray()
      )[0];
      const appSecret = process.env.APP_SECRET || sails.config.globals.APP_SECRET;
      const resetPasswordToken = jwt.sign(
        { email: req.body.email.toLowerCase() },
        appSecret,
        { expiresIn: SMS_CODE_LIFESPAN }
      );
      res.json({ success: true });
      if (user) {
        try {
          await db.collection("user").updateOne(
            { _id: user._id },
            { $set: { resetPasswordToken } }
          );
          sails.config.customLogger.log('info', `User ${user._id} updated with resetPasswordToken.`, null, 'server-action', user?._id);
        } catch (updateError) {
          sails.config.customLogger.log('error', `Error updating user ${user._id} with resetPasswordToken: ${updateError.message}`, null, 'server-action', user?._id);
        }
        const url = `${process.env.DOCTOR_URL}/app/reset-password?token=${resetPasswordToken}`;
        const doctorLanguage = user.preferredLanguage || process.env.DEFAULT_DOCTOR_LOCALE;
        try {
          await sails.helpers.email.with({
            to: user.email,
            subject: sails._t(doctorLanguage, "forgot password email subject", { url }),
            text: sails._t(doctorLanguage, "forgot password email", { url }),
          });
          sails.config.customLogger.log('info', `Forgot password email sent to user ${user._id}.`, null, 'server-action', user?._id);
        } catch (emailError) {
          sails.config.customLogger.log('error', `Error sending forgot password email to user ${user._id}: ${emailError.message}`, null, 'server-action', user?._id);
        }
      } else {
        sails.config.customLogger.log('info', 'Forgot password requested for non-existent user.', null, 'message', null);
      }
    } catch (error) {
      sails.config.customLogger.log('error', `Unexpected error in forgotPassword: ${error?.message || error}`, null, 'server-action', null);
    }
  },

  async resetPassword(req, res) {
    const passwordFormat = new RegExp('^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))(?=.{6,})');
    if (!req.body.token) {
      sails.config.customLogger.log('warn', 'resetPassword attempted without token.', null, 'message', null);
      return res.status(400).json({ message: 'token-missing' });
    }
    if (!passwordFormat.test(req.body.password)) {
      sails.config.customLogger.log('warn', 'resetPassword attempted with weak password.', null, 'message', null);
      return res.status(400).json({ message: 'password-too-weak' });
    }
    try {
      const password = await User.generatePassword(req.body.password);
      const token = validator.escape(req.body.token).trim();
      const user = await User.findOne({ resetPasswordToken: token });
      await User.updateOne({ resetPasswordToken: token }).set({ password, resetPasswordToken: '' });
      sails.config.customLogger.log('info', `Password reset processed for user ${user?._id || user?.id}.`, null, 'server-action', user?._id || user?.id);
      if (!user) {
        throw new Error('token-expired');
      }
    } catch (err) {
      sails.config.customLogger.log('error', `Error in resetPassword: ${err.message}`, null, 'server-action', null);
      if (err.name === 'TokenExpiredError') {
        return res.status(400).json({ message: 'token-expired' });
      } else {
        return res.status(400).json({ message: 'unknown' });
      }
    }
    res.json({ success: true });
  },

  async loginLocal(req, res) {
    const { error: headersErrors, value: headers } = headersSchema.validate(req.headers, { abortEarly: false });
    if (headersErrors) {
      sails.config.customLogger.log('warn', 'Invalid headers in loginLocal.', null, 'message', null);
      return res.status(400).json({ success: false, message: 'Invalid request headers' });
    }
    const locale = headers.locale || i18n.defaultLocale;
    const isLoginLocalAllowed = await canLoginLocal(req);
    if (!isLoginLocalAllowed) {
      sails.config.customLogger.log('warn', 'Password login is disabled.', null, 'message', null);
      return res.status(400).json({ message: sails._t(locale, 'password login is disabled') });
    }
    const isAdmin = await User.count({ email: req.body.email, role: 'admin' });
    if (req.body._version) {
      await User.update({ email: req.body.email, role: { in: ['doctor', 'admin'] } }).set({ doctorClientVersion: req.body._version });
    } else {
      if (!isAdmin) {
        await User.updateOne({ email: req.body.email, role: { in: ['doctor', 'admin'] } }).set({ doctorClientVersion: 'invalid' });
      }
    }
    passport.authenticate('local', async (err, user, info = {}) => {
      if (err) {
        if (err?.message === 'User is not approved') {
          sails.config.customLogger.log('error', 'User not approved in loginLocal.', null, 'message', user?.id);
          return res.status(403).json({ message: sails._t(locale, 'not approved') });
        }
        sails.config.customLogger.log('error', `LoginLocal error: ${err?.message || 'Unknown error'}`, null, 'server-action', null);
        return res.status(500).json({ message: info.message || err?.message || sails._t(locale, 'server error') });
      }
      if (!user) {
        sails.config.customLogger.log('warn', 'LoginLocal failed: user not found.', null, 'message', null);
        return res.status(400).json({ message: info.message, user });
      }
      try {
        await User.updateOne({ id: user.id }).set({ lastLoginType: 'local' });
        sails.config.customLogger.log('verbose', `User ${user.id} updated lastLoginType to local.`, null, 'server-action', user?.id);
      } catch (error) {
        sails.config.customLogger.log('error', `Error updating user ${user?.id} login type: ${error.message}`, null, 'server-action', user?.id);
      }
      if (process.env.NODE_ENV !== 'development' && (user.role === 'doctor' || user.role === 'admin')) {
        const localLoginDetails = { id: user.id, localLoginToken: true, singleFactor: true };
        const localLoginToken = jwt.sign(localLoginDetails, sails.config.globals.APP_SECRET);
        let verificationCode;
        if (user.smsVerificationCode) {
          try {
            const decoded = jwt.verify(user.smsVerificationCode, sails.config.globals.APP_SECRET);
            verificationCode = decoded.code;
          } catch (error) {
            sails.config.customLogger.log('error', `Error verifying smsVerificationCode for user ${user.id}: ${error?.message || error}`, null, 'server-action', user?.id);
          }
        }
        verificationCode = verificationCode || generateVerificationCode();
        const smsToken = jwt.sign({ code: verificationCode }, sails.config.globals.APP_SECRET, { expiresIn: SMS_CODE_LIFESPAN });
        await User.updateOne({ id: user.id }).set({ smsVerificationCode: smsToken, smsAttempts: 0 });
        const doctorLanguage = user?.preferredLanguage || process.env.DEFAULT_DOCTOR_LOCALE;
        try {
          await sails.helpers.sms.with({
            phoneNumber: user.authPhoneNumber,
            message: sails._t(doctorLanguage, 'verification code message', {
              code: verificationCode,
              minutes: SMS_CODE_LIFESPAN / 60,
            }),
            senderEmail: user?.email
          });
          sails.config.customLogger.log('info', `SMS sent to user ${user.id} with verification code.`, null, 'server-action', user.id);
        } catch (err) {
          sails.config.customLogger.log('error', `Error sending SMS to user ${user.id}: ${err.message}`, null, 'server-action', user.id);
          return res.status(500).json({ message: "Echec d'envoi du SMS" });
        }
        return res.status(200).json({ localLoginToken, user: user.id, role: user.role });
      } else {
        if (user.smsVerificationCode) {
          delete user.smsVerificationCode;
        }
        req.logIn(user, function(err) {
          if (err) {
            sails.config.customLogger.log('error', `Error logging in user ${user.id}: ${err.message}`, null, 'server-action', user?.id);
          }
          return res.status(200).send({ message: info.message, user });
        });
      }
    })(req, res, (err) => {
      if (err) {
        sails.config.customLogger.log('error', `Error with LOGIN in loginLocal: ${err.message || 'Unknown error'}`, null, 'server-action', null);
      }
    });
  },

  loginSms(req, res) {
    const { error: headersErrors, value: headers } = headersSchema.validate(req.headers, { abortEarly: false });
    if (headersErrors) {
      sails.config.customLogger.log('warn', 'Invalid headers in loginSms.', null, 'message', null);
      return res.status(400).json({
        success: false,
        message: 'Invalid request headers',
      });
    }
    const locale = headers.locale || i18n.defaultLocale;
    passport.authenticate('sms', async (err, user, info = {}) => {
      if (err) {
        if (err?.message === 'User is not approved') {
          sails.config.customLogger.log('error', 'User not approved in loginSms.', null, 'message', user?.id);
          return res.status(403).json({
            message: sails._t(locale, 'not approved'),
          });
        }
        sails.config.customLogger.log('error', `loginSms error: ${err?.message || 'Unknown error'}`, null, 'server-action', user?.id);
        return res.status(500).json({
          message: info.message || err?.message || 'Server Error',
        });
      }
      if (!user) {
        sails.config.customLogger.log('warn', 'loginSms failed: user not found.', null, 'message', null);
        return res.status(400).json({
          message: info.message,
          user,
        });
      }
      try {
        await User.updateOne({ id: user.id }).set({ smsVerificationCode: '' });
        sails.config.customLogger.log('info', `User ${user.id} smsVerificationCode cleared.`, null, 'server-action', user?.id);
      } catch (updateError) {
        sails.config.customLogger.log('error', `Error updating user ${user.id} in loginSms: ${updateError.message}`, null, 'server-action', user?.id);
      }
      const localLoginDetails = {
        id: user.id,
        smsToken: true,
        singleFactor: true,
      };
      const smsLoginToken = jwt.sign(localLoginDetails, sails.config.globals.APP_SECRET);
      sails.config.customLogger.log('verbose', `User ${user.id} logged in via SMS.`, null, 'message', user?.id);
      return res.status(200).json({
        smsLoginToken,
        user: user.id,
      });
    })(req, res, (err) => {
      if (err) {
        sails.config.customLogger.log('error', `Error with LOGIN in loginSms: ${err?.message || 'Unknown error'}`, null, 'server-action', null);
      }
    });
  },

  login2FA(req, res) {
    const { error: headersErrors, value: headers } = headersSchema.validate(req.headers, { abortEarly: false });
    if (headersErrors) {
      sails.config.customLogger.log('warn', 'Invalid headers in login2FA.', null, 'message', null);
      return res.status(400).json({ success: false, message: 'Invalid request headers' });
    }
    const locale = headers.locale || i18n.defaultLocale;
    passport.authenticate('2FA', (err, user, info = {}) => {
      if (err) {
        if (err?.message === 'User is not approved') {
          sails.config.customLogger.log('error', 'User not approved in login2FA.', null, 'message', user?.id);
          return res.status(403).json({ message: sails._t(locale, 'not approved') });
        }
        sails.config.customLogger.log('error', `login2FA error: ${err?.message || 'Unknown error'}`, null, 'server-action', user?.id);
        return res.status(500).json({ message: info.message || err?.message || 'Server Error' });
      }
      if (!user) {
        sails.config.customLogger.log('warn', 'login2FA failed: user not found.', null, 'message', null);
        return res.status(400).json({ message: info.message, user });
      }
      req.logIn(user, function(err) {
        if (err) {
          sails.config.customLogger.log('error', `Error logging in user ${user.id} in login2FA: ${err?.message}`, null, 'server-action', user?.id);
          return res.status(500).send();
        }
        sails.config.customLogger.log('info', `User ${user.id} logged in via 2FA.`, null, 'message', user?.id);
        return res.status(200).send({ message: info.message, user });
      });
    })(req, res, (err) => {
      if (err) {
        sails.config.customLogger.log('error', `Error with LOGIN in login2FA: ${err?.message || 'Unknown error'}`, null, 'server-action', null);
      }
    });
  },

  refreshToken: async function(req, res) {
    const refreshToken = escapeHtml(req.body.refreshToken);

    if (!refreshToken) {
      sails.config.customLogger.log('warn', 'Refresh token missing in request.', null, 'message', null);
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    try {
      const decoded = await TokenService.verifyToken(refreshToken, true);
      const user = await User.findOne({ id: decoded.id });
      if (!user || user.status !== 'approved') {
        sails.config.customLogger.log('warn', `Refresh token attempt for invalid or unapproved user: ${decoded.id}`, null, 'message', user?.id);
        return res.status(401).json({ error: 'User not found' });
      }
      const tokens = TokenService.generateToken(user);
      sails.config.customLogger.log('info', `Refresh token successful for user ${user.id}.`, null, 'server-action', user?.id);
      return res.json(tokens);
    } catch (error) {
      sails.config.customLogger.log('error', `Error refreshing token: ${error?.message}`, null, 'server-action', null);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
  },

  verifyRefreshToken: async function(req, res) {
    const refreshToken = req.body.refreshToken;
    if (!refreshToken) {
      sails.config.customLogger.log('warn', 'Refresh token missing in verifyRefreshToken.', null, 'message', null);
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    try {
      const decoded = await TokenService.verifyToken(refreshToken, true);
      sails.config.customLogger.log('info', 'Refresh token verified successfully.', null, 'server-action', req.user?.id);
      return res.status(200).json({ message: 'Token is valid' });
    } catch (error) {
      sails.config.customLogger.log('error', `Error verifying refresh token: ${error.message}`, null, 'server-action', req.user?.id);
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      } else if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid refresh token' });
      } else {
        return res.status(500).json({ error: 'Server error' });
      }
    }
  },

  logout(req, res) {
    const performLogout = () => {
      req.logout((err) => {
        if (err) {
          sails.config.customLogger.log('error', `Error during req.logout: ${err.message}`, null, 'server-action', req.user?.id);
          return res.status(500).send();
        }
        req.session.destroy((err) => {
          if (err) {
            sails.config.customLogger.log('error', `Error destroying session: ${err.message}`, null, 'server-action', req.user?.id);
            return res.status(500).send();
          }
          sails.config.customLogger.log('info', 'User session destroyed successfully.', null, 'server-action', req.user?.id);
          res.status(200).send();
        });
      });
    };

    if ((process.env.LOGIN_METHOD === 'saml' || process.env.LOGIN_METHOD === 'both') && process.env.LOGOUT_URL) {
      try {
      } catch (error) {
        sails.config.customLogger.log('error', `Error logging out from SAML: ${error.message}`, null, 'server-action', req.user?.id);
        performLogout();
      }
    } else {
      performLogout();
    }
  },

  async getCurrentUser(req, res) {
    if (!req.user && !req.headers['x-access-token'] && !req.query.token) {
      sails.config.customLogger.log('warn', 'getCurrentUser: No token or user provided.', null, 'message', null);
      return res.status(404).json({
        success: false,
        message: 'Not Found: No token or user provided.'
      });
    }
    if (req.headers['x-access-token'] || req.query.token) {
      const tokenValue = req.headers['x-access-token'] || req.query.token;
      jwt.verify(tokenValue, sails.config.globals.APP_SECRET, async (err, decoded) => {
        if (err) {
          sails.config.customLogger.log('error', `JWT verification error in getCurrentUser: ${err?.message || err}`, null, 'server-action', req.user?.id);
          return res.status(401).json({ error: 'Unauthorized' });
        }
        if (decoded.singleFactor) {
          sails.config.customLogger.log('warn', 'Token indicates single factor, unauthorized.', null, 'message', req.user?.id);
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const version = validator.escape(req.query._version || '');
        try {
          if (version) {
            await User.updateOne({
              id: decoded.id,
              email: decoded.email,
              role: { in: ['doctor', 'admin'] },
            }).set({ doctorClientVersion: version });
            sails.config.customLogger.log('info', `Updated doctorClientVersion for user ${decoded.id} to ${version}.`, null, 'server-action', decoded.id);
          } else {
            await User.updateOne({
              id: decoded.id,
              email: decoded.email,
              role: { in: ['doctor', 'admin'] },
            }).set({ doctorClientVersion: 'invalid' });
            sails.config.customLogger.log('info', `Set doctorClientVersion to invalid for user ${decoded.id}.`, null, 'server-action', decoded.id);
          }
          const user = await User.findOne({ id: decoded.id });
          if (!user) {
            sails.config.customLogger.log('error', 'No user found for valid token.', null, 'message', decoded?.id);
            return res.status(500).json({ message: 'UNKNOWN ERROR' });
          }
          if (user.role === 'doctor' && !user.doctorClientVersion) {
            sails.config.customLogger.log('warn', `Doctor user ${user.id} has no valid client version.`, null, 'message', user.id);
            return res.status(401).json({ error: 'Unauthorized App version needs to be updated' });
          }
          const { token, refreshToken } = TokenService.generateToken(user);
          user.token = token;
          user.refreshToken = refreshToken;
          if (!req.user) {
            req.logIn(user, function(err) {
              if (err) {
                sails.config.customLogger.log('error', `Error logging in user ${user.id} in getCurrentUser: ${err?.message}`, null, 'server-action', user?.id);
                return res.status(500).send();
              }
              sails.config.customLogger.log('info', `User ${user.id} logged in via token in getCurrentUser.`, null, 'message', user?.id);
              res.json({ user });
            });
          } else {
            res.json({ user });
          }
        } catch (error) {
          sails.config.customLogger.log('error', `Error in getCurrentUser: ${error?.message}`, null, 'server-action', req.user?.id);
          res.status(500).json({ message: 'UNKNOWN ERROR' });
        }
      });
    } else {
      const user = Object.assign({}, req.user);
      const { token, refreshToken } = TokenService.generateToken(user);
      user.token = token;
      user.refreshToken = refreshToken;
      sails.config.customLogger.log('info', `getCurrentUser: Returning current user ${user.id}.`, null, 'user-action', user?.id);
      return res.json({ user });
    }
  },

  loginOpenId(req, res, next) {
    if (req.query.redirectUrl) {
      req.session.redirectUrl = req.query.redirectUrl;
      sails.config.customLogger.log('info', `Stored redirectUrl in session: ${req.query.redirectUrl}`, null, 'message', req.user?.id);
    }

    const role = req.query.role;
    if (role === sails.config.globals.ROLE_DOCTOR) {
      sails.config.customLogger.log('info', 'Initiating OpenID Connect authentication for doctor.', null, 'message', req.user?.id);
      return passport.authenticate('openidconnect_doctor')(req, res, next);
    }
    if (role === sails.config.globals.ROLE_ADMIN) {
      sails.config.customLogger.log('info', 'Initiating OpenID Connect authentication for admin.', null, 'message', req.user?.id);
      return passport.authenticate('openidconnect_admin')(req, res, next);
    }
    if (role === sails.config.globals.ROLE_NURSE) {
      sails.config.customLogger.log('info', 'Initiating OpenID Connect authentication for nurse.', null, 'message', req.user?.id);
      return passport.authenticate('openidconnect_nurse')(req, res, next);
    }
    sails.config.customLogger.log('warn', 'loginOpenId: No valid role specified.', null, 'message', req.user?.id);
    return res.status(400).json({ message: 'Invalid role for OpenID Connect authentication.' });
  },

  loginOpenIdReturn(req, res) {
    bodyParser.urlencoded({ extended: false })(req, res, () => {
      if (req.query.role === sails.config.globals.ROLE_ADMIN) {
        passport.authenticate(
          'openidconnect_admin',
          async (err, user, info = {}) => {
            if (err) {
              sails.config.customLogger.log('error', `Error authenticating for admin: ${err?.message || err}`, null, 'server-action', user?.id);
              return res.view('pages/error', { error: err });
            }
            if (!user) {
              sails.config.customLogger.log('warn', 'Admin authentication did not return a user.', null, 'message', null);
              return res.view('pages/error', { error: err });
            }
            if (user.role === sails.config.globals.ROLE_ADMIN) {
              if (process.env.NODE_ENV === 'development') {
                sails.config.customLogger.log('info', `Admin user ${user.id} authenticated; redirecting to development URL.`, null, 'server-action', user?.id);
                return res.redirect(`${process.env['ADMIN_URL']}/login?tk=${user.token}`);
              } else {
                sails.config.customLogger.log('info', `Admin user ${user.id} authenticated; redirecting to production URL.`, null, 'server-action', user?.id);
                return res.redirect(`/login?tk=${user.token}`);
              }
            }
          }
        )(req, res, (err) => {
          if (err) {
            sails.config.customLogger.log('error', `Error in admin callback authentication: ${err?.message || err}`, null, 'server-action', req.user?.id);
            return res.view('pages/error', { error: err });
          }
        });
      }
      if (req.query.role === sails.config.globals.ROLE_NURSE) {
        passport.authenticate(
          'openidconnect_nurse',
          async (err, user, info = {}) => {
            if (err) {
              sails.config.customLogger.log('error', `Error authenticating for nurse: ${err?.message || err}`, null, 'server-action', user?.id);
              return res.view('pages/error', { error: err });
            }
            if (!user) {
              sails.config.customLogger.log('warn', 'Nurse authentication did not return a user.', null, 'message', req.user?.id);
              return res.view('pages/error', { error: err });
            }
            if (user.role === sails.config.globals.ROLE_NURSE || user.role === sails.config.globals.ROLE_ADMIN) {
              if (process.env.NODE_ENV === 'development') {
                sails.config.customLogger.log('info', `Nurse user ${user.id} authenticated; redirecting to development URL.`, null, 'server-action', user.id);
                return res.redirect(`${process.env['PUBLIC_URL']}/requester?tk=${user.token}`);
              } else {
                sails.config.customLogger.log('info', `Nurse user ${user.id} authenticated; redirecting to production URL.`, null, 'server-action', user.id);
                return res.redirect(`/requester?tk=${user.token}`);
              }
            }
          }
        )(req, res, (err) => {
          if (err) {
            sails.config.customLogger.log('error', `Error in nurse callback authentication: ${err?.message || err}`, null, 'server-action', req.user?.id);
            return res.view('pages/error', { error: err });
          }
        });
      }
      if (req.query.role === sails.config.globals.ROLE_DOCTOR) {
        passport.authenticate(
          'openidconnect_doctor',
          async (err, user, info = {}) => {
            if (err) {
              sails.config.customLogger.log('error', `Error authenticating for doctor: ${err?.message || err}`, null, 'server-action', user?.id);
              return res.view('pages/error', { error: err });
            }
            if (!user) {
              sails.config.customLogger.log('warn', 'Doctor authentication did not return a user.', null, 'message', req.user?.id);
              return res.view('pages/error', { error: { message: info.message  } });
            }
            try {
              await User.updateOne({ id: user.id }).set({ lastLoginType: 'openidconnect' });
              sails.config.customLogger.log('verbose', `User ${user.id} lastLoginType updated to 'openidconnect'.`, null, 'server-action', user.id);
            } catch (error) {
              sails.config.customLogger.log('error', `Error updating user ${user.id} login type: ${error?.message}`, null, 'server-action', user?.id);
              return res.view('pages/error', { error: err });
            }
            if (user.role === sails.config.globals.ROLE_DOCTOR || user.role === sails.config.globals.ROLE_ADMIN) {
              const redirectUrl = req.session.redirectUrl;
              if (redirectUrl) {
                delete req.session.redirectUrl;
                sails.config.customLogger.log('info', `Using stored redirectUrl: ${redirectUrl}`, null, 'server-action', user?.id);
              }

              if (process.env.NODE_ENV === 'development') {
                sails.config.customLogger.log('info', `Doctor user ${user.id} authenticated; redirecting to development URL.`, null, 'server-action', user?.id);
                const url = `${process.env['DOCTOR_URL']}/app?tk=${user.token}${redirectUrl ? `&redirectUrl=${encodeURIComponent(redirectUrl)}` : ''}`;
                return res.redirect(url);
              } else {
                sails.config.customLogger.log('info', `Doctor user ${user.id} authenticated; redirecting to production URL.`, null, 'server-action', user?.id);
                const url = `/app?tk=${user.token}${redirectUrl ? `&redirectUrl=${encodeURIComponent(redirectUrl)}` : ''}`;
                return res.redirect(url);
              }
            }
          }
        )(req, res, (err) => {
          if (err) {
            sails.config.customLogger.log('error', `Error in doctor callback authentication: ${err?.message || err}`, null, 'server-action', req.user?.id);
            return res.view('pages/error', { error: err });
          }
        });
      }
    });
  },

  metadata(req, res) {
    res.send(
      samlStrategy.generateServiceProviderMetadata(
        process.env.SAML_CERT,
        process.env.SAML_CERT
      )
    );
  },

  getConfig(req, res) {
    const doctorLanguages = sails.config.globals.i18nDoctorAppLanguages
      ? sails.config.globals.i18nDoctorAppLanguages.split(',')
      : [];
    const patientLanguages = sails.config.globals.i18nPatientAppLanguages
      ? sails.config.globals.i18nPatientAppLanguages.split(',')
      : [];

    const enableFieldsFormDoctor = sails.config.globals.enableFieldsFormDoctor
      ? sails.config.globals.enableFieldsFormDoctor.split(',')
      : [];

    sails.config.customLogger.log('info', `getConfig called from IP: ${req.ip}`, null, 'user-action', req?.user?.id);

    res.json({
      method: process.env.LOGIN_METHOD ? process.env.LOGIN_METHOD : 'both',
      branding: process.env.BRANDING || '@HOME',
      appleStoreUrl: process.env.APPLE_STORE_URL,
      appleStoreTitle: process.env.APPLE_STORE_TITLE,
      androidStoreUrl: process.env.ANDROID_STORE_URL,
      androidStoreTitle: process.env.ANDROID_STORE_TITLE,
      logo: process.env.LOGO,
      doctorAppPrimaryColor: process.env.DOCTOR_APP_PRIMARY_COLOR,
      nurseExternalLink: process.env.NURSE_EXTERNAL_LINK,
      doctorExternalLink: process.env.DOCTOR_EXTERNAL_LINK,
      patientAppPrimaryColor: process.env.PATIENT_APP_PRIMARY_COLOR,
      openIdLogoutUri: process.env.OPENID_LOGOUT_URL,
      accessibilityMode: process.env.ACCESSIBILITY_MODE,
      matomoUrl: sails.config.globals.MATOMO_URL,
      matomoId: sails.config.globals.MATOMO_ID,
      extraMimeTypes: !!sails.config.globals.EXTRA_MIME_TYPES,
      doctorTermsVersion: sails.config.globals.DOCTOR_TERMS_VERSION,
      defaultPatientLocale: sails.config.globals.DEFAULT_PATIENT_LOCALE,
      metadata: process.env.DISPLAY_META
        ? process.env.DISPLAY_META.split(',')
        : '', //! sending metadata to the front in config
      formMeta: process.env.FORM_DOCTOR_META
        ? process.env.FORM_DOCTOR_META.split(',')
        : '',
      formRequesterMeta: process.env.FORM_REQUESTER_META
        ? process.env.FORM_REQUESTER_META.split(',')
        : '',
      hideCallerName: sails.config.globals.hideCallerName,
      hideSchedulerRole: sails.config.globals.HIDE_SCHEDULER_ROLE,
      forcePatientLanguage: sails.config.globals.FORCE_PATIENT_LANGUAGE,
      showDoctorPrivateNote: sails.config.globals.SHOW_DOCTOR_PRIVATE_NOTE,
      doctorLanguages,
      patientLanguages,
      enableFieldsFormDoctor
    });
  },

  externalAuth(req, res) {
    const { token } = req.query;
    if (!token) {
      sails.config.customLogger.log('warn', 'externalAuth: Missing token in query.', null, 'message', null);
      return res.badRequest();
    }
    jwt.verify(
      token,
      process.env.SHARED_EXTERNAL_AUTH_SECRET,
      async (err, decoded) => {
        if (err) {
          sails.config.customLogger.log('error', `externalAuth: JWT verification error: ${err?.message || err}`, null, 'server-action', decoded?.id);
          return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!decoded.timestamp) {
          sails.config.customLogger.log('warn', 'externalAuth: Token missing timestamp.', null, 'message', decoded?.id);
          return res.status(401).json({ error: 'Timestamp is required' });
        }
        try {
          const now = new Date();
          const tokenTimestamp = new Date(decoded.timestamp * 1000);
          const FIVE_MIN = 5 * 60 * 1000;
          if (now - tokenTimestamp > FIVE_MIN) {
            sails.config.customLogger.log('warn', 'externalAuth: Token timestamp is older than 5 minutes.', null, 'message', decoded?.id);
            return res.status(401).json({ error: 'Timestamp is older than 5 minutes' });
          }
        } catch (error) {
          sails.config.customLogger.log('error', `externalAuth: Error processing token timestamp: ${error.message}`, null, 'server-action', decoded?.id);
          return res.status(500).json({ error: 'Unexpected error' });
        }
        if (!decoded.email) {
          sails.config.customLogger.log('warn', 'externalAuth: Token missing email.', null, 'message', decoded?.id);
          return res.status(401).json({ error: 'Email is required' });
        }
        try {
          let user = await User.findOne({ email: decoded.email, role: 'doctor' });
          if (!user) {
            user = await User.create({
              email: decoded.email,
              firstName: decoded.firstName,
              lastName: decoded.lastName,
              phoneNumber: decoded.phoneNumber,
              notifPhoneNumber: decoded.notifPhoneNumber,
              preferredLanguage: decoded.preferredLanguage || process.env.DEFAULT_DOCTOR_LOCALE,
              role: 'doctor',
            }).fetch();
            sails.config.customLogger.log('info', `externalAuth: Created new doctor user with id ${user.id}.`, null, 'server-action', user.id);
          } else {
            sails.config.customLogger.log('info', `externalAuth: Found existing doctor user with id ${user.id}.`, null, 'message', user.id);
          }
          const { token: newToken } = TokenService.generateToken(user);
          const rawReturnUrl = req.query.returnUrl;

          const isSafeReturnUrl =
            typeof rawReturnUrl === 'string' &&
            rawReturnUrl.startsWith('/') &&
            !rawReturnUrl.startsWith('//') &&
            !rawReturnUrl.includes('http');

          const returnUrl = isSafeReturnUrl ? rawReturnUrl : null;

          sails.config.customLogger.log('info', `externalAuth: User ${user.id} authenticated successfully.`, null, 'server-action', user.id);

          return res.redirect(
            `${process.env.DOCTOR_URL}/app?tk=${newToken}${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`
          );
        } catch (error) {
          sails.config.customLogger.log('error', `externalAuth: Error processing external authentication: ${error.message}`, null, 'server-action', null);
          return res.status(500).json({ error: 'Unexpected error' });
        }
      }
    );
  }
};

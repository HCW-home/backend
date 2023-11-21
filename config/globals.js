/**
 * Global Variable Configuration
 * (sails.config.globals)
 *
 * Configure which global variables which will be exposed
 * automatically by Sails.
 *
 * For more information on any of these options, check out:
 * https://sailsjs.com/config/globals
 */
const crypto = require('crypto');

function generateAppSecret() {
  return crypto.randomBytes(32).toString('hex');
}
module.exports.globals = {

  /** **************************************************************************
  *                                                                           *
  * Whether to expose the locally-installed Lodash as a global variable       *
  * (`_`), making  it accessible throughout your app.                         *
  *                                                                           *
  ****************************************************************************/

  _: require('@sailshq/lodash'),

  /** **************************************************************************
  *                                                                           *
  * This app was generated without a dependency on the "async" NPM package.   *
  *                                                                           *
  * > Don't worry!  This is totally unrelated to JavaScript's "async/await".  *
  * > Your code can (and probably should) use `await` as much as possible.    *
  *                                                                           *
  ****************************************************************************/

  async: false,

  /** **************************************************************************
  *                                                                           *
  * Whether to expose each of your app's models as global variables.          *
  * (See the link at the top of this file for more information.)              *
  *                                                                           *
  ****************************************************************************/

  models: true,

  /** **************************************************************************
  *                                                                           *
  * Whether to expose the Sails app instance as a global variable (`sails`),  *
  * making it accessible throughout your app.                                 *
  *                                                                           *
  ****************************************************************************/

  sails: true,

  APP_SECRET: process.env.APP_SECRET || generateAppSecret(),
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || generateAppSecret(),
  ACCESS_TOKEN_LIFE: process.env.ACCESS_TOKEN_LIFE || '15m',
  REFRESH_TOKEN_LIFE: process.env.REFRESH_TOKEN_LIFE || '18h',

  ROLE_DOCTOR: 'doctor',
  ROLE_NURSE: 'nurse',
  ROLE_PATIENT: 'patient',
  ROLE_EXPERT: 'expert',
  ROLE_ADMIN: 'admin',

  attachmentsDir: process.env.ATTACHMENTS_DIR || '/var/lib/hug-home/attachments',

  REDMINE_DOMAIN: process.env.REDMINE_DOMAIN || 'https://projects.iabsis.com',
  REDMINE_API_KEY: process.env.REDMINE_API_KEY

};

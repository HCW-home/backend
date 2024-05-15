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
const crypto = require("crypto");

function generateAppSecret() {
  return crypto.randomBytes(32).toString("hex");
}
module.exports.globals = {
  /** **************************************************************************
   *                                                                           *
   * Whether to expose the locally-installed Lodash as a global variable       *
   * (`_`), making  it accessible throughout your app.                         *
   *                                                                           *
   ****************************************************************************/

  _: require("@sailshq/lodash"),

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
  ACCESS_TOKEN_LIFE: process.env.ACCESS_TOKEN_LIFE || "15m",
  REFRESH_TOKEN_LIFE: process.env.REFRESH_TOKEN_LIFE || "18h",

  SMS_PROVIDER_ORDER:
    process.env.SMS_PROVIDER_ORDER ||
    "TWILIO,OVH,SWISSCOM,CLICKATEL,CLICKATEL_API,ODOO_SMS",

  MATOMO_URL: process.env.MATOMO_URL,
  MATOMO_ID: process.env.MATOMO_ID,

  EXTRA_MIME_TYPES: process.env.EXTRA_MIME_TYPES,
  DEFAULT_MIME_TYPES: "application/pdf,image/jpeg,image/png,image/gif",

  ROLE_DOCTOR: "doctor",
  ROLE_NURSE: "nurse",
  ROLE_PATIENT: "patient",
  ROLE_EXPERT: "expert",
  ROLE_ADMIN: "admin",
  ROLE_SCHEDULER: "scheduler",

  attachmentsDir:
    process.env.ATTACHMENTS_DIR || "/var/lib/hug-home/attachments",

  REDMINE_DOMAIN: process.env.REDMINE_DOMAIN || "https://projects.iabsis.com",
  REDMINE_API_KEY: process.env.REDMINE_API_KEY,
  WHITELISTED_PREFIXES: {
    OVH: process.env.SMS_OVH_WL_PREFIX || '*',
    SWISSCOM: process.env.SMS_SWISSCOM_WL_PREFIX  || '*',
    CLICKATEL: process.env.SMS_CLICKATEL_WL_PREFIX || '*',
    CLICKATEL_API: process.env.SMS_CLICKATEL_API_WL_PREFIX || '*',
    TWILIO: process.env.SMS_TWILLO_WL_PREFIX || '*',
    ODOO_SMS: process.env.SMS_ODOO_WL_PREFIX || '*',
    TWILIO_WHATSAPP: process.env.TWILIO_WHATSAPP_WL_PREFIX,
  }
};

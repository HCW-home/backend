/**
 * app.jvar allowCrossDomain = function (req, res, next) {
 res.header('Access-Control-Allow-Origin', '*')
 res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH')
 res.header('Access-Control-Allow-Headers', 'Content-Type')

 next()
 }
 if (process.env.NODE_ENV === 'development') {
 app.use(allowCrossDomain)
 }s
 *
 * Use `app.js` to run your app without `sails lift`.
 * To start the server, run: `node app.js`.
 *
 * This is handy in situations where the sails CLI is not relevant or useful,
 * such as when you deploy to a server, or a PaaS like Heroku.
 *
 * For example:
 *   => `node app.js`
 *   => `npm start`
 *   => `forever start app.js`
 *   => `node debug app.js`
 *
 * The same command-line arguments and env vars are supported, e.g.:
 * `NODE_ENV=production node app.js --port=80 --verbose`
 *
 * For more information see:
 *   https://sailsjs.com/anatomy/app.js
 */


// Ensure we're in the project directory, so cwd-relative paths work as expected
// no matter where we actually lift from.
// > Note: This is not required in order to lift, but it is a convenient default.
process.chdir(__dirname);

// #6106 Implement proxy settings for backend
require('dotenv').config();
const { bootstrap } = require('global-agent');
bootstrap();

// Attempt to import `sails` dependency, as well as `rc` (for loading `.sailsrc` files).
let sails;
let rc;
try {
  sails = require('sails');
  rc = require('sails/accessible/rc');
} catch (err) {
  console.error(
    `Encountered an error when attempting to require('sails'):
      ${err.stack}
      --
      To run an app using "node app.js", you need to have Sails installed locally ("./node_modules/sails"). Just make sure you're in the same directory as your app and run "npm install".

      If Sails is installed globally (i.e. "npm install -g sails"), you can also run this app with "sails lift". Running with "sails lift" will not run this file ("app.js"), but it will do exactly the same thing.
      (It even uses your app directory's local Sails install, if possible.)`
  );
  return;
}// -•

const path = require('path');
const fs = require('fs');

const locales = fs.readdirSync(path.join(__dirname, './config/locales')).map(f => f.replace('.json', ''));
const i18n = new (require('i18n-2'))({
  locales,
  directory: path.join(__dirname, './config/locales'),
  extension: '.json'

});

const { vsprintf } = require('sprintf-js');


sails._t = function (locale, key, ...args) {
  const safeLocale = locales.includes(locale) ? locale : 'en';

  try {
    let msg = i18n.translate(safeLocale, key);

    if (args.length) {
      msg = vsprintf(msg, args);
    }
    return msg;
  } catch (error) {
    sails.config.customLogger.log(
      'error',
      'Error in translation (_t)',
      {
        key,
        locale: locale,
        safeLocale,
        error: error?.message || error,
      },
      'i18n',
      null
    );

    return `[?? ${key}]`;
  }
};

// Start server
sails.lift(rc('sails'));

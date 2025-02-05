/**
 * Internationalization / Localization Settings
 * (sails.config.i18n)
 *
 * If your app will touch people from all over the world, i18n (or internationalization)
 * may be an important part of your international strategy.
 *
 * For a complete list of options for Sails' built-in i18n support, see:
 * https://sailsjs.com/config/i-18-n
 *
 * For more info on i18n in Sails in general, check out:
 * https://sailsjs.com/docs/concepts/internationalization
 */

const fs = require('fs');
const path = require('path');

const localesDir = path.resolve(process.cwd(), 'config', 'locales');

let supportedLocales = [];

try {
  const files = fs.readdirSync(localesDir);
  supportedLocales = files
    .filter(file => file.endsWith('.json'))
    .map(file => file.split('.')[0]);
} catch (err) {
  sails.config.customLogger.log('error','Error reading locales directory:', err?.message);
  supportedLocales = ['en'];
}

module.exports.i18n = {

  /***************************************************************************
   *                                                                          *
   * Which locales are supported?                                             *
   *                                                                          *
   ***************************************************************************/

  locales: supportedLocales,

  /****************************************************************************
   *                                                                           *
   * What is the default locale for the site? Note that this setting will be   *
   * overridden for any request that sends an "Accept-Language" header (i.e.   *
   * most browsers), but it's still useful if you need to localize the         *
   * response for requests made by non-browser clients (e.g. cURL).            *
   *                                                                           *
   ****************************************************************************/

  defaultLocale: 'en',

  /****************************************************************************
   *                                                                           *
   * Path (relative to app root) of directory to store locale (translation)    *
   * files in.                                                                 *
   *                                                                           *
   ****************************************************************************/

  // localesDirectory: 'config/locales'

};

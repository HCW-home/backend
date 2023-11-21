/**
 * Session Configuration
 * (sails.config.session)
 *
 * Use the settings below to configure session integration in your app.
 * (for additional recommended settings, see `config/env/production.js`)
 *
 * For all available options, see:
 * https://sailsjs.com/config/session
 */
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

let redisUrl;

let host = REDIS_HOST;
let port = REDIS_PORT;
let path = '/hcw';

if (REDIS_PASSWORD) {
  redisUrl = `redis://:${ REDIS_PASSWORD }@${ host }:${ port }${ path }`;
} else {
  redisUrl = `redis://${ host }:${ port }${ path }`;
}

module.exports.session = {

  /** *************************************************************************
   *                                                                          *
   * Session secret is automatically generated when your new app is created   *
   * Replace at your own risk in production-- you will invalidate the cookies *
   * of your users, forcing them to log in again.                             *
   *                                                                          *
   ***************************************************************************/
  secret: '819f0bd67d1e61bd2acfbd067e8975e3',

  adapter: '@sailshq/connect-redis',

  url: redisUrl,

  /** *************************************************************************
   *                                                                          *
   * Customize when built-in session support will be skipped.                 *
   *                                                                          *
   * (Useful for performance tuning; particularly to avoid wasting cycles on  *
   * session management when responding to simple requests for static assets, *
   * like images or stylesheets.)                                             *
   *                                                                          *
   * https://sailsjs.com/config/session                                       *
   *                                                                          *
   ***************************************************************************/
  // isSessionDisabled: function (req){
  //   return !!req.path.match(req._sails.LOOKS_LIKE_ASSET_RX);
  // },
  cookie: {
    httpOnly: process.env.NODE_ENV !== 'development',
    secure: process.env.NODE_ENV !== 'development',
    sameSite: process.env.NODE_ENV === 'development' ? undefined : 'none',
    maxAge: 24 * 60 * 60 * 1000,
  }
};

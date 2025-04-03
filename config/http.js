/**
 * HTTP Server Settings
 * (sails.config.http)
 *
 * Configuration for the underlying HTTP server in Sails.
 * (for additional recommended settings, see `config/env/production.js`)
 *
 * For more information on configuration, check out:
 * https://sailsjs.com/config/http
 */

  module.exports.http = {

  /** **************************************************************************
  *                                                                           *
  * Sails/Express middleware to run for every HTTP request.                   *
  * (Only applies to HTTP requests -- not virtual WebSocket requests.)        *
  *                                                                           *
  * https://sailsjs.com/documentation/concepts/middleware                     *
  *                                                                           *
  ****************************************************************************/

  middleware: {

    /** *************************************************************************
    *                                                                          *
    * The order in which middleware should be run for HTTP requests.           *
    * (This Sails app's routes are handled by the "router" middleware below.)  *
    *                                                                          *
    ***************************************************************************/

    // order: [
    //   'cookieParser',
    //   'session',
    //   'bodyParser',
    //   'compress',
    //   'poweredBy',
    //   'router',
    //   'www',
    //   'favicon',
    // ],

    passportInit: require('passport').initialize(),
    passportSession: require('passport').session(),
    paginate: require('../api/middlewares/count'),
    handleDeserializeUserError: function(err, req, res, next) {
      if (err && err.message === 'Failed to deserialize user out of session') {
        req.logout(function (logoutErr) {
          if (logoutErr) {
            return next(logoutErr)
          }
          req.session.destroy(function(sessionErr) {
            if (sessionErr) {
              return next(sessionErr);
            }
            res.status(200).send();
          });
        });
      } else {
        next();
      }
    },
    hsts: function (req, res, next) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      return next();
    },
    order: [
      'paginate',
      'cookieParser',
      'session',
      'passportInit',
      'passportSession',
      'handleDeserializeUserError',
      'bodyParser',
      'handleBodyParserError',
      'compress',
      'poweredBy',
      'router',
      'hsts',
      'www',
      'favicon'
    ],



    /** *************************************************************************
    *                                                                          *
    * The body parser that will handle incoming multipart HTTP requests.       *
    *                                                                          *
    * https://sailsjs.com/config/http#?customizing-the-body-parser             *
    *                                                                          *
    ***************************************************************************/

    bodyParser: (function _configureBodyParser(){
      var skipper = require('skipper');
      var middlewareFn = skipper({ strict: true });
      return middlewareFn;
    })(),


  },


  trustProxy : true

};

// module.exports.express = {

// };

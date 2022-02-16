/**
 * Blueprint API Configuration
 * (sails.config.blueprints)
 *
 * For background on the blueprint API in Sails, check out:
 * https://sailsjs.com/docs/reference/blueprint-api
 *
 * For details and more available options, see:
 * https://sailsjs.com/config/blueprints
 */

var sanitize = require('mongo-sanitize');

module.exports.blueprints = {

  /** *************************************************************************
  *                                                                          *
  * Automatically expose implicit routes for every action in your app?       *
  *                                                                          *
  ***************************************************************************/

  // actions: false,


  /** *************************************************************************
  *                                                                          *
  * Automatically expose RESTful routes for your models?                     *
  *                                                                          *
  ***************************************************************************/

  // rest: true,


  /** *************************************************************************
  *                                                                          *
  * Automatically expose CRUD "shortcut" routes to GET requests?             *
  * (These are enabled by default in development only.)                      *
  *                                                                          *
  ***************************************************************************/

  // shortcuts: true,

  prefix: '/api/v1',

  populate: false,

  parseBlueprintOptions (req) {
    const queryOptions = req._sails.hooks.blueprints.parseBlueprintOptions(req);

    if(queryOptions.criteria){
      queryOptions.criteria = sanitize(queryOptions.criteria)
    }
    if (!req.param('populate', false) && !queryOptions.alias) {
      queryOptions.populates = {};
    }
    return queryOptions;
  }

};

/* eslint-disable callback-return */
/* eslint-disable prefer-destructuring */
/* eslint-disable func-style */
const package = require('../../package.json');
const DEFAULT_TOTAL_COUNT_HEADER = 'X-Total-Count';
const DEFAULT_PAGINATION_JSON_HEADER = 'X-Pagination-JSON';

const defaults = {
  actions: ['find', 'populate', /^.*\/(find|populate)$/],
  totalCountHeader: true,
  paginationHeader: false,
  paginationJsonHeader: false,
  silentError: false
};

const isRegExp = (value) => {
  return value instanceof RegExp;
};

const isNotRegExp = (value) => {
  return !isRegExp(value);
};

const generate = (options = {}) => {
  options = Object.assign({}, defaults, options);

  const totalCountHeader = options.totalCountHeader === false
        ? null
        : typeof options.totalCountHeader === 'string'
            ? options.totalCountHeader
            : DEFAULT_TOTAL_COUNT_HEADER;

  const paginationJsonHeader = options.paginationJsonHeader === false
        ? null
        : typeof options.paginationJsonHeader === 'string'
            ? options.paginationJsonHeader
            : DEFAULT_PAGINATION_JSON_HEADER;

  options.actions = [].concat(options.actions);

  const actions = {
    map: [...options.actions].filter(isNotRegExp).reduce((hash, key) => { hash[key] = true; return hash; }, {}),
    regexps: [...options.actions].filter(isRegExp)
  };

  const testAction = function (action) {
    if (actions.map[action]) {
      return true;
    }
    if (actions.regexps.some((re) => re.test(action))) {
      return true;
    }
  };

  const silentError = options.silentError;

  const middleware = function (req, res, next) {
    // if(!req.options){
    //   return next();
    // }
    const now = !!(req.options && (req.options.blueprintAction || req.options.action));
    let oldSendOrNext;

    // if we have options, execute now
    if (now) {
      // wrap next with a function so it won't get affected with the .apply calls below
      oldSendOrNext = () => next();
    } else {
      // else, save the req.send to override it, so addHeaderThenOrNext can execute later

      // todo: I really really didn't want to do that
      // but at the time of calling the middleware, req.options.blueprintAction was undefined
      // only after it gets processed by sails that these options are added
      // https://groups.google.com/forum/#!topic/sailsjs/bMZlbWnZRu4
      oldSendOrNext = res.send;
    }

    const addHeaderThenOrNext = function (data) {
      const action = req.options.blueprintAction || req.options.action;
      if (req[`__${package.name}__`] || !req.options || !testAction(action)) {
        return oldSendOrNext.apply(res, arguments);
      }
      req[`__${package.name}__`] = true;

      const sendArgs = Array.from(arguments);

      const parseBlueprintOptions = req.options.parseBlueprintOptions
                || req._sails.config.blueprints.parseBlueprintOptions
                || req._sails.hooks.blueprints.parseBlueprintOptions;

      if (!parseBlueprintOptions) {
        req._sails.log.warn(`[${package.name}] middleware ignored, parseBlueprintOptions function not supported, are you sure you\'re using sails 1.0+`);
        return oldSendOrNext.apply(res, arguments);
      }

      const queryOptions = parseBlueprintOptions(req);
      const Model = req._sails.models[queryOptions.using];

      // todo: pile of sh*t part-1
      // https://gitter.im/balderdashy/sails?at=5a3d24bcba39a53f1a903eef
      let populatingAssociation;
      if (/populate/.test(action) && queryOptions.alias) {
        populatingAssociation = Model.associations.filter(association => association.alias === queryOptions.alias)[0];
      }
      let PopulatingAssociationModel;
      if (populatingAssociation) {
        PopulatingAssociationModel = req._sails.models[populatingAssociation[populatingAssociation.type]];
      }
      let modelAssociation;
      if (PopulatingAssociationModel) {
        modelAssociation = PopulatingAssociationModel.associations.filter(association => association.collection === queryOptions.using || association.model === queryOptions.using)[0];
      }

      const criteria = Object.assign({}, queryOptions.criteria);
      const populates = Object.assign({}, queryOptions.populates);

      const limit = req.param('limit') || criteria.limit || (populates[queryOptions.alias] || {}).limit;
      const skip = req.param('skip') || criteria.skip || (populates[queryOptions.alias] || {}).skip;
      const sort = req.param('sort') || criteria.sort || (populates[queryOptions.alias] || {}).sort;

      // sails will throw an error if I don't do this
      delete criteria.limit;
      delete criteria.skip;
      delete criteria.sort;

      let promise;

      if (PopulatingAssociationModel && criteria.where && criteria.where.id && modelAssociation) {
        // todo: pile of sh*t part-2
        const id = criteria.where.id;
        delete criteria.where.id;
        const associationCriteria = Object.assign({}, criteria);
        associationCriteria.where[modelAssociation.alias] = [id];
        promise = PopulatingAssociationModel.count(associationCriteria);
      } else {
        promise = Model.count(criteria);
      }

      promise.then(
                    (count) => {
                      if (totalCountHeader) {
                        res.set(totalCountHeader, count);
                        res.header('Access-Control-Expose-Headers', totalCountHeader);
                      }
                      if (paginationJsonHeader) {
                        res.set(paginationJsonHeader, JSON.stringify({
                          count,
                          sort,
                          limit: limit !== null ? parseInt(limit) : undefined,
                          skip: skip !== null ? parseInt(skip) : undefined
                        }));
                      }
                      return oldSendOrNext.apply(res, sendArgs);
                    })
                .catch(
                    (err) => {
                      if (! silentError) {
                        req._sails.log.error(`[${package.name}] Was not able to get count for '${req.originalUrl}'\n${err.toString()}`);
                      }
                      return oldSendOrNext.apply(res, sendArgs);
                    }
                );
    };

    if (now) {
      addHeaderThenOrNext();
    } else {
      res.send = addHeaderThenOrNext;
      next();
    }
  };

  middleware.generate = generate;

  return middleware;
};

module.exports = generate();

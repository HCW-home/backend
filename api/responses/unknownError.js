module.exports = function unknownError (err, extraInfo) {

  const { res } = this;
  const newError = new Error('Unknown Error');
  newError.raw = err;
  _.extend(newError, extraInfo);

  return res.serverError(newError);

};

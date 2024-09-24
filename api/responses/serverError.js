module.exports = function serverError(data, options) {
  const req = this.req;
  const res = this.res;
  const sails = req._sails;

  if (data) {
    sails.log.error('500 Error: ', data);
  }

  res.status(500);
  return res.json({
    success: false,
    message: data.message || 'An unexpected error occurred',
    error: data
  });
};

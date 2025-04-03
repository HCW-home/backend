module.exports = function serverError(data, options) {
  const req = this.req;
  const res = this.res;
  const sails = req._sails;

  if (data) {
    sails.config.customLogger.log('error',`500 Error: ${data}`, 'server-action', req.user?.id);
  }

  res.status(500);
  return res.json({
    success: false,
    message: data.message || 'An unexpected error occurred',
    error: data
  });
};

module.exports = function serverError(data, options) {
  const req = this.req;
  const res = this.res;
  const sails = req._sails;

  if (data) {
    const errorMessage = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    sails.config.customLogger.log('error', `500 Error: ${errorMessage}`,null, 'server-action', req.user?.id);
  }

  res.status(500);
  return res.json({
    success: false,
    message: data?.message || 'An unexpected error occurred',
    error: data
  });
};

/**
 * MessageController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */

module.exports = {
  async readMessages(req, res) {
    const consultationId = req.params.consultation;

    if (
      typeof consultationId !== 'string' ||
      consultationId.trim().length === 0
    ) {
      return res.badRequest({ error: 'Invalid consultation ID.' });
    }

    try {
      const msgs = await Message.update({
        consultation: consultationId,
        or: [{ to: req.user.id }, { to: null }],
        read: false,
      }).set({
        read: true,
      });

      return res.status(200).json({ message: 'success', msgs });
    } catch (err) {
      return res.serverError(err.message);
    }
  },

  /**
   * Create a message and returns it in the http response or throw a 400 error if passed data are not in the accepted format
   * The only fields taken from the body are text and consultation
   *
   * @param {*} req
   * @param {*} res
   * @returns {void}
   *
   */
  async create(req, res) {
    const msgBody = {
      text: typeof req.body.text === 'string' && req.body.text.length
        ? req.body.text.trim()
        : null,
      consultation: req.body.consultation,
      to: req.body.to || null,
      type: 'text',
      from: req.user.id,
    };

    try {
      const msg = await Message.create(msgBody).fetch();
      return res.status(200).json(msg);
    } catch (err) {
      if (err.name === 'UsageError') {
        return res.badRequest({
          error: 'Validation failed',
          details: err.message,
        });
      }
      return res.serverError(err.message);
    }
  }
};

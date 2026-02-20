/**
 * MessageController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */

const { escapeHtml } = require('../utils/helpers');

function decryptMessages(messages) {
  if (!messages) {
    return [];
  }
  const hasKey = !!sails.config.globals.ENCRYPTION_KEY;
  const encryption = hasKey ? sails.helpers.encryption() : null;
  return messages.map(msg => {
    if (msg.isEncrypted && msg.text && msg.type === 'text') {
      if (hasKey) {
        return { ...msg, text: encryption.decryptText(msg.text) };
      }
      return { ...msg, text: 'Message cannot be decrypted' };
    }
    return msg;
  });
}

function decryptMessage(message) {
  if (!message || !message.isEncrypted || !message.text || message.type !== 'text') {
    return message;
  }
  if (!sails.config.globals.ENCRYPTION_KEY) {
    return { ...message, text: 'Message cannot be decrypted' };
  }
  const encryption = sails.helpers.encryption();
  return { ...message, text: encryption.decryptText(message.text) };
}

module.exports = {
  async readMessages(req, res) {
    const consultationId = escapeHtml(req.params.consultation);

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
      }).fetch();

      return res.status(200).json({ message: 'success', msgs: decryptMessages(msgs) });
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
    const text = typeof req.body.text === 'string' && req.body.text.length
      ? escapeHtml(req.body.text.trim())
      : null;

    const consultation = typeof req.body.consultation === 'string'
      ? escapeHtml(req.body.consultation)
      : null;

    const to = typeof req.body.to === 'string'
      ? escapeHtml(req.body.to)
      : null;

    const msgBody = {
      text,
      consultation,
      to,
      type: 'text',
      from: req.user.id,
    };

    try {
      const msg = await Message.create(msgBody).fetch();
      return res.status(200).json(decryptMessage(msg));
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

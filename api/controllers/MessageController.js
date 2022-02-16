/**
 * MessageController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */

module.exports = {

  // set all messages belonging to req.params.consultation
  async readMessages (req, res) {

    const msgs = await Message.update({ consultation: req.params.consultation, or: [{ to: req.user.id }, { to: null }], read: false })
    .set({
      read: true
    });

    res.status(200);
    res.json({ message: 'success', msgs });
  }

};


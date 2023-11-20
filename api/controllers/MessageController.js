/**
 * MessageController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */

module.exports = {
  // set all messages belonging to req.params.consultation
  async readMessages(req, res) {
    const msgs = await Message.update({
      consultation: req.params.consultation,
      or: [{ to: req.user.id }, { to: null }],
      read: false,
    }).set({
      read: true,
    });

    res.status(200);
    res.json({ message: "success", msgs });
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
    // Only text and consultation are allowed in the post
    const msgBody = _.pick(req.body, ["text", "consultation", "to"]);

    // Message sent are only textual and "from" is the current authenticated user
    msgBody.type = "text";
    msgBody.from = req.user.id;

    // Handle errors in the posted data
    const errors = {};
    if (!msgBody.text) {
      errors["text"] = "Should not be blank";
    }

    if (Object.keys(errors).length) {
      res.status(400);
      return res.json(errors);
    }

    // Create the message in the database
    const msg = await Message.create(msgBody).fetch();

    // Send back the new message in the api response
    res.status(200);
    res.json(msg);
  },
};

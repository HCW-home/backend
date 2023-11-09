const validator = require('validator');
module.exports = {
  create: async function (req, res) {
    try {
      let data = req.body;
      let server = await sails.models.mediasoupserver.create(data).fetch();
      return res.ok(server);
    } catch (error) {
      return res.serverError(error.message);
    }
  },

  read: async function (req, res) {
    try {
      let servers = await Mediasoupserver.find();
      return res.ok(servers);
    } catch (error) {
      return res.serverError(error.message);
    }
  },

  update: async function (req, res) {
    try {
      const url = validator.escape(req.body.url).trim();
      const username = validator.escape(req.body.username).trim();
      const password = validator.escape(req.body.password).trim();
      const maxNumberOfSessions = validator.escape(req.body.maxNumberOfSessions).trim();
      const active = validator.escape(req.body.active).trim();
      const  data = {
        url,
        username,
        password,
        maxNumberOfSessions,
        active
      }
      const serverId = validator.escape(req.params.id).trim();
      let server = await sails.models.mediasoupserver.updateOne({ id: serverId }).set(data);
      return res.ok(server);
    } catch (error) {
      return res.serverError(error.message);
    }
  },

  delete: async function (req, res) {
    try {
      let serverId = req.params.id;
      await Mediasoupserver.destroyOne({ id: serverId });
      return res.ok({ message: 'Deleted successfully' });
    } catch (error) {
      return res.serverError(error.message);
    }
  }
};

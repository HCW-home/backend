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
      let data = req.body;
      let serverId = req.params.id;
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

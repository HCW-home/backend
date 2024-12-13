const validator = require("validator");


module.exports = {

  list: async function(req, res) {
    try {
      const smsProviders = await SmsProvider.find();
      return res.ok(smsProviders);
    } catch (err) {
      res.serverError(err);
    }
  },
  update: async function(req, res) {
    const id = validator.escape(req.params.id).trim();

    let { order, prefix } = req.body;

    if (!id) {
      return res.badRequest({ message: 'Provider ID is required.' });
    }

    order = validator.escape(order.toString());
    prefix = validator.escape(prefix);

    try {
      const updatedProvider = await SmsProvider.updateOne({ id })
        .set({
          order: order,
          prefix: prefix
        });

      if (updatedProvider.id) {
        return res.ok(updatedProvider);
      } else {
        return res.notFound({ message: 'Provider not found.' });
      }
    } catch (err) {
      return res.serverError(err);
    }
  },
  batchUpdateOrder: async function(req, res) {
    const updates = req.body;

    try {
      const updatePromises = updates.map(update => {
        return SmsProvider.updateOne({ id: update.id })
          .set({
            order: update.order
          });
      });

      await Promise.all(updatePromises);
      return res.ok({ message: 'Orders updated successfully' });
    } catch (err) {
      return res.serverError(err);
    }
  }


};

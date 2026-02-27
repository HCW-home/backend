const validator = require("validator");
const { ObjectId } = require('mongodb');
const { escapeHtml } = require('../utils/helpers');

module.exports = {
  ip: async function (req, res) {
    const ip = escapeHtml(req.ip);
    if (typeof ip !== 'string' || ip.length > 100) {
      return res.badRequest({ error: 'Invalid IP address.' });
    }

    const escapedIp = await sails.helpers.escapeHtmlString(ip);
    return res.json({ ip: escapedIp });
  },

  async addDoctorToQueue(req, res) {
    if (!req.body.queue) {
      return res.status(400).json({ message: "queue is required" });
    }

    await User.addToCollection(
      req.params.user,
      "allowedQueues",
      req.body.queue
    );

    return res.status(200).json({ success: true });
  },

  async removeDoctorFromQueue(req, res) {
    if (!req.body.queue) {
      return res.status(400).json({ message: "queue is required" });
    }

    try {
      const userAndQueueExist = await User.findOne({
        id: req.params.user,
      }).populate("allowedQueues", { id: req.body.queue });

      if (!userAndQueueExist) {
        res.status(404);
        return res.json({ message: "User not found" });
      } else if (userAndQueueExist.allowedQueues.length === 0) {
        res.status(404);
        return res.json({ message: "Queue not found" });
      }

      await User.removeFromCollection(
        req.params.user,
        "allowedQueues",
        req.body.queue
      );

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.badRequest(err);
    }
  },

  async getDoctorQueues(req, res) {
    const userId = escapeHtml(req.params.user);

    if (
      typeof userId !== 'string' ||
      userId.trim().length === 0 ||
      userId.length > 64
    ) {
      return res.badRequest({ error: 'Invalid user ID.' });
    }

    try {
      const user = await User.findOne({ id: userId }).populate('allowedQueues');

      if (!user) {
        return res.notFound({ error: 'User not found.' });
      }

      return res.status(200).json(user.allowedQueues);
    } catch (err) {
      return res.serverError(err.message);
    }
  },

  async getUser(req, res) {
    const userId = escapeHtml(req.params.user);

    if (
      typeof userId !== 'string' ||
      userId.trim().length === 0 ||
      userId.length > 64
    ) {
      return res.badRequest({ error: 'Invalid user ID.' });
    }

    try {
      const user = await User.findOne({ id: userId });

      if (!user) {
        return res.notFound({ error: 'User not found.' });
      }

      return res.status(200).json(user);
    } catch (err) {
      return res.serverError(err.message);
    }
  },

  registerNurse: async function (req, res) {
    try {
      const email = validator.normalizeEmail(req.body.email, {
        gmail_remove_dots: false,
      });
      // const email = validator.normalizeEmail(req.body.email);

      const firstName = validator.escape(req.body.firstName).trim();
      const lastName = validator.escape(req.body.lastName).trim();
      const phoneNumber = validator.escape(req.body.phoneNumber).trim();
      const organization = validator.escape(req.body.organization).trim();
      const country = validator.escape(req.body.country).trim();
      const sex = validator.escape(req.body.sex).trim();

      if (!validator.isEmail(email)) {
        return res.badRequest({ error: "Invalid email address." });
      }

      const existingUser = await User.findOne({
        email,
        role: sails.config.globals.ROLE_NURSE,
      });
      if (existingUser) {
        return res.badRequest({ error: "Email already in use." });
      }

      await User.create({
        email,
        firstName,
        lastName,
        phoneNumber,
        organization,
        country,
        sex,
        role: sails.config.globals.ROLE_NURSE,
        status: "not-approved",
      }).fetch();

      return res.ok({ message: "Nurse registered successfully." });
    } catch (error) {
      return res.serverError(error);
    }
  },

  async updateProfile(req, res) {
    try {
      if (req.params.id !== req.user.id) {
        return res.forbidden({ error: 'You can only update your own profile.' });
      }

      const allowedFields = ['firstName', 'lastName', 'phoneNumber', 'organization', 'country', 'sex'];
      const valuesToUpdate = {};

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          const value = validator.escape(String(req.body[field])).trim();
          if (field === 'sex' && !['male', 'female', 'other'].includes(value)) {
            return res.badRequest({ error: 'Invalid value for the sex field. Allowed: male, female, other.' });
          }
          valuesToUpdate[field] = value;
        }
      }

      if (Object.keys(valuesToUpdate).length === 0) {
        return res.badRequest({ error: 'No valid fields to update.' });
      }

      const updatedUser = await User.updateOne({ id: req.user.id }).set(valuesToUpdate);
      return res.ok(updatedUser);
    } catch (error) {
      return res.serverError(error);
    }
  },

  async updateNotif(req, res) {
    const valuesToUpdate = {};

    if (req.body.enableNotif !== undefined) {
      valuesToUpdate.enableNotif = req.body.enableNotif;
    }

    if (req.body.notifPhoneNumber) {
      valuesToUpdate.notifPhoneNumber = req.body.notifPhoneNumber;
    }

    if (req.body.messageService !== undefined) {
      valuesToUpdate.messageService = req.body.messageService;
    }
    if (req.body.preferredLanguage !== undefined) {
      valuesToUpdate.preferredLanguage = req.body.preferredLanguage;
    }

    await User.updateOne({ id: req.user.id }).set(valuesToUpdate);
    return res.status(200).json({ success: true });
  },

  async updateTerms(req, res) {
    const valuesToUpdate = {};
    if (req.body.doctorTermsVersion !== undefined) {
      valuesToUpdate.doctorTermsVersion = req.body.doctorTermsVersion;
    }
    const user = await User.updateOne({ id: req.user.id }).set(valuesToUpdate);
    return res.status(200).json({ ...user });
  },

  updateStatus: async function(req, res) {
    try {
      const userId = validator.escape(req.param('id')).trim();

      const newStatus = validator.escape(req.body.status).trim();

      const allowedStatuses = ['approved', 'not-approved'];
      if (!allowedStatuses.includes(newStatus)) {
        return res.badRequest({ error: 'Invalid status value.' });
      }

      const user = await User.findOne({ id: userId });
      if (!user) {
        return res.notFound({ error: 'User not found.' });
      }

      const updatedUser = await User.updateOne({ id: userId }).set({
        status: newStatus
      });

      updatedUser.status = validator.escape(updatedUser.status);

      return res.ok(updatedUser);
    } catch (error) {
      return res.serverError(error);
    }
  },

  getPaginatedUsers: async function (req, res) {
    const { pageIndex, pageSize, roles, query, queues } = req.query;

    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.json({ data: [], total: 0 });
    }

    const skip = parseInt(pageIndex, 10) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    const sanitizedQuery = query && typeof query === 'string' ? escapeHtml(query.trim()) : null;
    const hasQueueFilter = queues && Array.isArray(queues) && queues.length > 0;

    try {
      if (hasQueueFilter) {
        const db = User.getDatastore().manager;
        const joinCollection = db.collection('queue_allowedQueues_queue__user_allowedQueues');
        const queueObjectIds = queues.map(q => new ObjectId(q));

        const joinDocs = await joinCollection.find({
          queue_allowedQueues_queue: { $in: queueObjectIds }
        }).toArray();
        const userIdsInQueues = [...new Set(joinDocs.map(d => d.user_allowedQueues.toString()))];

        if (userIdsInQueues.length === 0) {
          return res.json({ data: [], total: 0 });
        }

        const matchStage = {
          _id: { $in: userIdsInQueues.map(id => new ObjectId(id)) },
          role: { $in: roles },
        };

        if (sanitizedQuery) {
          const regex = new RegExp(sanitizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          matchStage.$or = [
            { firstName: regex },
            { lastName: regex },
            { email: regex },
          ];
        }

        const userCollection = db.collection('user');
        const total = await userCollection.countDocuments(matchStage);
        const rawUsers = await userCollection.find(matchStage).skip(skip).limit(limit).toArray();

        const users = await Promise.all(rawUsers.map(async (u) => {
          const user = await User.findOne({ id: u._id.toString() }).populate('allowedQueues');
          return user;
        }));

        return res.json({ data: users.filter(Boolean), total });
      }

      const whereClause = {
        role: { in: roles },
      };

      if (sanitizedQuery) {
        whereClause.or = [
          { firstName: { contains: sanitizedQuery } },
          { lastName: { contains: sanitizedQuery } },
          { email: { contains: sanitizedQuery } },
        ];
      }

      const users = await User.find({
        where: whereClause,
        skip,
        limit,
      }).populate('allowedQueues').meta({ makeLikeModifierCaseInsensitive: true });

      const total = Number(await User.count(whereClause)) || 0;

      return res.json({ data: users, total });
    } catch (error) {
      return res.serverError(error);
    }
  },

};

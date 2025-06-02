/**
 * Queue.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */


const { ObjectId } = require('mongodb');

module.exports = {
  schema: true,
  attributes: {
    name: {
      type: 'string',
      required: true
    },
    disableFeedback: {
      type: 'boolean',
      defaultsTo: false
    },
    disableProvidingTimeEstimate: {
      type: 'boolean',
      defaultsTo: false
    }
  },

  async getQueueUsers (nameOrId) {
    const db = Consultation.getDatastore().manager;
    const queuesUsersCollection = db.collection('queue_allowedQueues_queue__user_allowedQueues');
    const queuesCollection = db.collection('queue');
    const [queue] = await queuesCollection.find({$or:[{name: nameOrId}, {_id: new ObjectId(nameOrId)}]}).toArray();
    if(!queue) return [];


    const results = await queuesUsersCollection.find({ queue_allowedQueues_queue: new ObjectId(queue._id) });
    const queuesUsers = await results.toArray();

    const userCollection = db.collection('user');
    const doctorsAndAdmins = await userCollection.find({
      $or: [
        {
          role: sails.config.globals.ROLE_DOCTOR,
          $or: [
            { viewAllQueues: true },
            { _id: { $in: queuesUsers.map(qu => new ObjectId(qu.user_allowedQueues)) } }
          ]
        },
        {
          role: sails.config.globals.ROLE_ADMIN,
          $or: [
            { viewAllQueues: true },
            { _id: { $in: queuesUsers.map(qu => new ObjectId(qu.user_allowedQueues)) } }
          ]
        }
      ]
    });

    return await doctorsAndAdmins.toArray()
  }



};


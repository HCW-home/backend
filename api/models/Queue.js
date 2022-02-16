/**
 * Queue.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */


 const ObjectId = require('mongodb').ObjectID;

module.exports = {
  schema: true,
  attributes: {


    name: {
      type: 'string',
      required: true
    }
  },


  async getQueueUsers (nameOrId) {

    const db = Consultation.getDatastore().manager;
    const queuesUsersCollection = db.collection('queue_allowedQueues_queue__user_allowedQueues');
    const queuesCollection = db.collection('queue');
    const [queue] = await queuesCollection.find({$or:[{nameOrId}, {_id: new ObjectId(nameOrId)}]}).toArray();
    if(!queue) return [];


    const results = await queuesUsersCollection.find({ queue_allowedQueues_queue: new ObjectId(queue.id) });

    const queuesUsers = await results.toArray();
    const userCollection = db.collection('user');
    const doctorsCurs = await userCollection.find({ role: 'doctor', $or: [{ viewAllQueues: true }, { _id: { $in: queuesUsers.map(qu => new ObjectId(qu.user_allowedQueues)) } }] });

    const doctors = await doctorsCurs.toArray();
    return doctors
  }



};


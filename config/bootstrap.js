/**
 * Seed Function
 * (sails.config.bootstrap)
 *
 * A function that runs just before your Sails app gets lifted.
 * > Need more flexibility?  You can also create a hook.
 *
 * For more information on seeding your app with fake data, check out:
 * https://sailsjs.com/config/bootstrap
 */
const fs = require('fs');
const { promisify } = require('util');

const readdirP = promisify(fs.readdir);

module.exports.bootstrap = async function () {

  // By convention, this is a good place to set up fake data during development.
  //
  // For example:
  // ```
  // // Set up fake development data (or if we already have some, avast)
  // if (await User.count() > 0) {
  //   return;
  // }
  //
  // await User.createEach([
  //   { emailAddress: 'ry@example.com', fullName: 'Ryan Dahl', },
  //   { emailAddress: 'rachael@example.com', fullName: 'Rachael Shaw', },
  //   // etc.
  // ]);
  // ```

  // set ttl index
  const db = Consultation.getDatastore().manager;

  const consultationCollection = db.collection('consultation');
  const messageCollection = db.collection('message');
  const userCollection = db.collection('user');
  const tokenCollection = db.collection('token');
  await consultationCollection.createIndex({ closedAtISO: 1 }, { expireAfterSeconds: 86400 }); // expires after a day
  await messageCollection.createIndex({ consultationClosedAtISO: 1 }, { expireAfterSeconds: 86400 }); // expires after a day
  await userCollection.createIndex({ closedAtISO: 1 }, { expireAfterSeconds: 86400 }); // expires after a day
  await tokenCollection.createIndex({ closedAtISO: 1 }, { expireAfterSeconds: 60*60 }); // expires after an hour

  // check and delete expired files
  setInterval(async () => {

    try {
      const files = await readdirP(sails.config.globals.attachmentsDir);

      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const found = await messageCollection.count({ filePath });

        // if the file message is not found (message was deleted) delete the file
        if (!found) {
          fs.unlink(`${sails.config.globals.attachmentsDir }/${ filePath}`, err => {

            if (err) {
              sails.log.warn('error deleting file ', err);
            }

          });
        }
      }
    } catch (err) {
      sails.log(err);
    }


    // every 5 min
  }, 300000);

};

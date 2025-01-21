require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

async function main() {
  const dbUri = process.env.DB_URI;
  const adminEmail = process.env.FIRST_ADMIN_EMAIL;
  const adminPassword = process.env.FIRST_ADMIN_PASSWORD;

  if (!dbUri || !adminEmail || !adminPassword) {
    console.error('DB_URI, FIRST_ADMIN_EMAIL, and FIRST_ADMIN_PASSWORD must be set in the environment variables.');
    process.exit(1);
  }

  const client = new MongoClient(dbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await client.connect();
    console.log('Connected to the database.');

    const database = client.db();
    const usersCollection = database.collection('user');

    const existingAdmins = await usersCollection.find({ role: 'admin' }).toArray();

    if (existingAdmins.length === 0) {
      try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(adminPassword, salt);

        await usersCollection.insertOne({
          email: adminEmail,
          password: hashedPassword,
          role: 'admin',
        });

        console.log(`Admin user created with email: ${adminEmail}`);
      } catch (creationError) {
        console.error('Error creating admin user:', creationError);
      } finally {
        await client.close();
        console.log('Disconnected from the database.');
        process.exit();
      }
    } else {
      console.log(`Admin user(s) already exist. Count: ${existingAdmins.length}`);
      await client.close();
      console.log('Disconnected from the database.');
      process.exit();
    }
  } catch (error) {
    console.error('Error:', error);
    await client.close();
    process.exit(1);
  }
}

main();

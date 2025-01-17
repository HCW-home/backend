require('dotenv').config();
const sails = require('sails');

sails.lift({
  environment: process.env.NODE_ENV || 'development',
}, async (err) => {
  if (err) {
    console.error('Error lifting Sails app:', err);
    process.exit(1);
  }

  const dbUri = process.env.DB_URI;
  const adminEmail = process.env.FIRST_ADMIN_EMAIL;
  const adminPassword = process.env.FIRST_ADMIN_PASSWORD;

  if (!dbUri || !adminEmail || !adminPassword) {
    console.error('DB_URI, ADMIN_EMAIL, and ADMIN_PASSWORD must be set in the environment variables.');
    return process.exit(1);
  }

  try {
    const existingAdmins = await User.find({ role: 'admin' });

    if (existingAdmins.length === 0) {

      await User.create({
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
      });

      console.log(`Admin user created with email: ${adminEmail}`);
    } else {
      console.log(`Admin user(s) already exist. Count: ${existingAdmins.length}`);
    }

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    sails.lower((lowerErr) => {
      if (lowerErr) {
        console.error('Error lowering Sails app:', lowerErr);
      }
      process.exit();
    });
  }
});

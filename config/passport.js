const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const { Strategy } = require('passport-trusted-header');


const passportCustom = require('passport-custom');

const CustomStrategy = passportCustom.Strategy;

const ActiveDirectory = require('activedirectory');
const config = { url: process.env.AD_URIS,
               baseDN: process.env.AD_BASE,
               username: process.env.AD_USER,
               password: process.env.AD_PASSWORD }
const ad = new ActiveDirectory(config);

function getUserDetails (user) {
  return {
    email: user.email,
    username: user.username,
    id: user.id,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    authPhoneNumber: user.authPhoneNumber,
    viewAllQueues: user.viewAllQueues,
    doctorClientVersion: user.doctorClientVersion,
    notifPhoneNumber: user.notifPhoneNumber,
    enableNotif: user.enableNotif
  };
}

passport.serializeUser((user, cb) => {
  cb(null, user.id);
});
passport.deserializeUser((id, cb) => {
  User.findOne({ id }, (err, user) => {
    if(err){
      console.log('ERROR getting user ', err)
    }
    cb(err, user);
  });
});


passport.use('invite', new CustomStrategy(
  (async (req, callback) => {
    // Do your custom user finding logic here, or set to false based on req object
    const invite = await PublicInvite.findOne({ inviteToken: req.body.inviteToken });

    if (!invite) {
      return callback({ invite: 'not-found' }, null);
    }


    if (invite.type === 'TRANSLATOR_REQUEST') {
      return callback({ invite: 'cannot use this invite for login' }, null);
    }

    if (invite.status === 'ACCEPTED' || invite.status === 'COMPLETED' || invite.status === 'REFUSED') {
      return callback({ invite: 'invite have already been accepted' }, null);
    }

    if (invite.status === 'SENT') {
      await PublicInvite.updateOne({ inviteToken: req.body.inviteToken }).set({ status: 'ACCEPTED' });
    }

    let user = await User.findOne({ username: invite.id });

    if (user) {
      return callback(null, user);
    }

    const newUser = {
      username: invite.id,
      firstName: '',
      lastName: '',
      role: invite.type.toLowerCase(),
      password: '',
      temporaryAccount: true,
      inviteToken: invite.id
    };

    if (invite.emailAddress) {
      newUser.email = invite.emailAddress;
    }
    if (invite.phoneNumber) {

      newUser.phoneNumber = invite.phoneNumber;
    }
    if (req.body.phoneNumber) {

      newUser.phoneNumberEnteredByPatient = req.body.phoneNumber;
    }

    user = await User.create(newUser).fetch();

    if (invite.type === 'GUEST') {
      const patientInvite = await PublicInvite.findOne({ guestInvite: invite.id });
      if (patientInvite) {
        const [consultation] = await Consultation.update({ invite: patientInvite.id }).set({ guest: user.id }).fetch();
        if(consultation){

          Consultation.getConsultationParticipants(consultation).forEach(participant=>{
                sails.sockets.broadcast(participant, 'consultationUpdated', {
                  data: {consultation}
                })
              })
        }

      }
    }


    callback(null, user);
  })
));

passport.use('sms', new CustomStrategy(
  (async (req, cb) => {

    const user = await User.findOne({ id: req.body.user });
    if (!user) { return cb(null, false, { message: 'User not found' }); }
    jwt.verify(user.smsVerificationCode, sails.config.globals.APP_SECRET, async (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return cb(null, false, { message: 'Expired code' });
        }
        console.error('error ', err);
        return cb(null, false, { message: 'Invalid token' });
      }


      if (decoded.code !== req.body.smsVerificationCode) {
        user.smsAttempts++;
        if (user.smsAttempts > 9) {
          await User.updateOne({ id: req.body.user }).set({ smsVerificationCode: '' });
          return cb(null, false, { message: 'MAX_ATTEMPTS' });
        }
        else {
          await User.updateOne({ id: req.body.user }).set({ smsAttempts: user.smsAttempts });
          return cb(null, false, { message: 'Invalid verification code' });
        }

      }

      return cb(null, user, { message: 'SMS Login Successful' });

    });
    // bcrypt.compare(req.body.smsVerificationCode, user.smsVerificationCode, (err, res) => {
    //   if (err) { return cb(err); }

    //   if (!res) { return cb(null, false, { message: 'Invalid token' }); }

    //   return cb(null, user, { message: 'SMS Login Successful' });
    // });
  })
));

passport.use('2FA', new CustomStrategy(
  (async (req, cb) => {

    const user = await User.findOne({ id: req.body.user });
    if (!user) { return cb(null, false, { message: 'User not found' }); }

    jwt.verify(req.body.localLoginToken, sails.config.globals.APP_SECRET, async (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return cb(null, false, { message: 'Expired token' });
        }
        console.error('error ', err);
        return cb(null, false, { message: 'Invalid Token' });
      }


      if (decoded.id !== user.id) {
        return cb(null, false, { message: 'Invalid Token' });
      }

      jwt.verify(req.body.smsLoginToken, sails.config.globals.APP_SECRET, async (err, decoded) => {
        if (err) {
          if (err.name === 'TokenExpiredError') {
            return cb(null, false, { message: 'Expired token' });
          }
          console.error('error ', err);
          return cb(null, false, { message: 'Invalid Token' });
        }


        if (decoded.id !== user.id) {
          return cb(null, false, { message: 'Invalid Token' });
        }

        const userDetails = getUserDetails(user);
        const token = jwt.sign(userDetails, sails.config.globals.APP_SECRET);
        userDetails.token = token;

        return cb(null, userDetails, { message: '2FA Login Successful' });
      });

    });

  })
));
passport.use(new LocalStrategy({
  usernameField: 'email',
  passportField: 'password'
}, ((email, password, cb) => {
  User.findOne({ email: email.toLowerCase(), temporaryAccount: { '!=': true } }, (err, user) => {
    if (err) { return cb(err); }
    if (!user) { return cb(null, false, { message: 'Email ou mot de passe incorrect' }); }
    bcrypt.compare(password, user.password, (err, res) => {
      if (err) { return cb(err); }

      if (!res) { return cb(null, false, { message: 'Email ou mot de passe incorrect' }); }
      if (user.role === 'doctor') {
        if (!user.doctorClientVersion) {
          return cb(null, false, { message: 'Le cache de votre navigateur n\'est pas à jour, vous devez le raffraichir avec CTRL+F5 !' });
        }

      }
      const userDetails = getUserDetails(user);

      const token = jwt.sign(userDetails, sails.config.globals.APP_SECRET);
      userDetails.token = token;
      userDetails.smsVerificationCode = user.smsVerificationCode;
      return cb(null, userDetails, { message: 'Login Successful' });
    });
  });
})));

const options = {
  headers: ['x-ssl-client-s-dn']
};

passport.use(new Strategy(options, (async (requestHeaders, cb) => {

  let user = null;
  const userDn = requestHeaders['x-ssl-client-s-dn'];
  const CNMatch = userDn.match(/CN=([^\/]+)/);
  const emailMatch = userDn.match(/emailAddress=([^\/\s]+)/);
  // let email =  emailMatch? emailMatch[1] : null;
  const login = (CNMatch && CNMatch[1]) ? CNMatch[1].split(/\s+/)[0] : null;
  const firstName = login;
  const email = `${firstName}@imad.ch`;
  const lastName = 'UNKNOWN';
  // let lastName = (CNMatch && CNMatch[1])? CNMatch[1].split(/\s+/)[1] : null;

  sails.log.debug('headers ', userDn, firstName, lastName, email);

  if (!firstName) {
    return cb(new Error('CN field is not present'), null, { message: 'CN field is not present' });
  }
  if (email) {
    user = await User.findOne({ email });
    if (!user) {
      try {
        user = await User.create({
          email,
          firstName,
          lastName,
          role: sails.config.globals.ROLE_NURSE
        }).fetch();
      } catch (error) {
        return cb(error, null, { message: 'Login Unsuccessful' });
      }

    }

    const token = jwt.sign(user, sails.config.globals.APP_SECRET);
    user.token = token;

    return cb(null, user, { message: 'Login Successful' });

  } else {
    return cb(null, null, { message: 'email not found' });
  }

})));



const SamlStrategy = require('passport-saml').Strategy;
let samlStrategy;
console.log('env >>>> ', process.env.NODE_ENV);
// if (process.env.NODE_ENV !== 'development' && process.env.SAML_CALLBACK) {


  samlStrategy = new SamlStrategy(
    {
      callbackUrl: process.env.SAML_CALLBACK || 'https://dev-hug-at-home.oniabsis.com/api/v1/saml-callback',
      path: '/api/v1/login-callback',
      entryPoint: process.env.SAML_ENTRY_POINT || 'https://login.microsoftonline.com/17e1281a-ff7f-4071-9ddd-60a77a0a0fe7/saml2',
      logoutUrl: process.env.LOGOUT_URL,
      issuer: process.env.SAML_ISSUER || 'de2981db-9607-451a-80ca-4a0a886ca206',
      decryptionCert: process.env.SAML_CERT,
      decryptionPvk: fs.readFileSync(process.env.SAML_PATH_KEY, 'utf-8'),
      signingCert: process.env.SAML_CERT,
      privateCert: fs.readFileSync(process.env.SAML_PATH_KEY, 'utf-8'),
      identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'
      //    cert: process.env.SAML_CERT_IDENTITY
    },
    (async (profile, cb) => {



      try {

        console.log('PROFILE ', profile)
        if(!profile[process.env.EMAIL_FIELD] ){
          const err = `Email field ${process.env.EMAIL_FIELD} doesn't exist`
          console.error(err)
          return cb(new Error(err))
        }
          let user = await User.findOne({ email: profile[process.env.EMAIL_FIELD], role:"doctor" }).populate('allowedQueues');

          if(process.env.AD_ENABLE && process.env.AD_ENABLE !== 'false'){

            console.log('Sending AD request with filter: ',`${process.env.AD_ATTR_LOGIN}=${profile[process.env.EMAIL_FIELD]}`)
            console.log('AD_URIS',process.env.AD_URIS)
            var opts = {
              filter: `${process.env.AD_ATTR_LOGIN}=${profile[process.env.EMAIL_FIELD]}`,
              includeMembership : ['user'],
              includeDeleted : false,
              attributes: []
            };
            ad.find(opts, async function(err, results) {
              if (err) {
                console.error('ERROR: ' +JSON.stringify(err));
                return;
              }

              if(results.users && results.users.length){

                const adUser = results.users[0]
                console.log('AD USER ', adUser);

                const isHugMember = adUser.groups.find(g=> g.cn === process.env.AD_DOCTOR_GROUP)
                if(!isHugMember){
                  console.log(`user is not a member of ${process.env.AD_DOCTOR_GROUP} group `)
                  return cb(new Error('User not member of Doctors group'));
                }

                if(!user){

                  user = await User.create({
                    email: adUser[process.env.AD_ATTR_EMAIL],
                    firstName: adUser[process.env.AD_ATTR_FIRSTNAME],
                    lastName: adUser[process.env.AD_ATTR_LASTNAME],
                    role: sails.config.globals.ROLE_DOCTOR,
                    _function: adUser[process.env.AD_ATTR_FUNCTION],
                    department: adUser[process.env.AD_ATTR_DEPARTMENT]
                  }).fetch();
                }else{
                  await User.update({id: user.id}).set({
                    // email: adUser[process.env.AD_ATTR_EMAIL],
                    firstName: adUser[process.env.AD_ATTR_FIRSTNAME],
                    lastName: adUser[process.env.AD_ATTR_LASTNAME],
                    role: sails.config.globals.ROLE_DOCTOR,
                    _function: adUser[process.env.AD_ATTR_FUNCTION],
                    department: adUser[process.env.AD_ATTR_DEPARTMENT]
                  })
                }

                // remove user from all queues
                if(user.allowedQueues && user.allowedQueues.length){
                  await Promise.all(user.allowedQueues.map(queue =>  User.removeFromCollection(user.id, 'allowedQueues', queue.id)))
                }

                // if queues
                const queueNameRgx = new RegExp(process.env.AD_QUEUE_MAP)

                const queueNames = adUser.groups.map(g=>g.cn.match(queueNameRgx)?g.cn.match(queueNameRgx)[1]:null).filter(q=>q)

                console.log('Queues matched from ad ', queueNames)
                if(queueNames.length){

                  const db = Consultation.getDatastore().manager;
                  const queuesCollection = db.collection('queue');

                  // get queues by names regardless of case
                  const queuesCurs = await queuesCollection.find({name:{$in:queueNames.map(qn=> new RegExp(qn, 'i'))}})

                  const queues = await queuesCurs.toArray();

                  console.log("Got queues from db", queues)
                   await Promise.all(queues.map(queue=>{
                    return  User.addToCollection(user.id, 'allowedQueues', queue._id.toString());
                   }))
                }

                const token = jwt.sign(user, sails.config.globals.APP_SECRET);
                user.token = token;
                return cb(null, user, { message: 'Login Successful' });

              }else{
                console.log('%cpassport.js line:366 couldnt find user in AD', 'color: #007acc;', `${process.env.AD_ATTR_LOGIN}=${profile[process.env.AD_ATTR_EMAIL]}`);
                return cb(new Error('User not found'));

              }
            })

          }else{

            if(!user){

              return cb(new Error('User not found'));
            }
            const token = jwt.sign(user, sails.config.globals.APP_SECRET);
            user.token = token;

            return cb(null, user, { message: 'Login Successful' });
          }



      } catch (error) {
        sails.log('error cerating user ', error);
        return cb(error);
      }

    })

  );

  passport.use(samlStrategy);


// }


exports.samlStrategy = samlStrategy;

/**
 * PublicInviteController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */
function determineStatus(phoneNumber, smsProviders) {
  let canSendSMS = false;
  let canSendWhatsApp = false;

  smsProviders.forEach(provider => {
    if (!provider.isDisabled && provider.prefix) {
      const prefixList = provider.prefix.split(',');
      if (prefixList.includes('*') || prefixList.some(prefix => prefix && phoneNumber.startsWith(prefix))) {
        if (provider.provider.includes('WHATSAPP')) {
          canSendWhatsApp = true;
        } else {
          canSendSMS = true;
        }
      }
    }
  });

  if (canSendSMS && canSendWhatsApp) {
    return { code: 1, message: "You have to choose Whatsapp or SMS for sending this invite." };
  } else if (!canSendSMS && canSendWhatsApp) {
    return { code: 2, message: "Invite will be send by WhatsApp." };
  } else if (canSendSMS && !canSendWhatsApp) {
    return { code: 3, message: "Invite will be send by SMS." };
  } else {
    return { code: 0, message: "This phone number is not permitted to be used on this platform." };
  }
}


module.exports = {

  async update(req, res) {
    const inviteId = req.params.id;

    const invite = await PublicInvite.findOne({id:inviteId});

    if(!invite) {
      return res.notFound();
    }

    try {
      const updatedInvite = await PublicInvite.updateOne({id:inviteId}).set(req.body);


      // TODO: update respective guest and translator invites
      if(invite.type === 'PATIENT'){
        await PublicInvite.sendPatientInvite(invite)
        if(invite.scheduledFor){
          await PublicInvite.setPatientOrGuestInviteReminders(invite)
        }
      }
      res.json(updatedInvite)

    } catch (error) {
      res.serverError(error.message);
    }

  },

  checkPrefix: async function (req, res) {
    const phoneNumber = req.param('phoneNumber');
    if (!phoneNumber) {
      return res.badRequest({ message: 'Phone number is required.' });
    }

    const providers = await SmsProvider.find({});
    const status = determineStatus(phoneNumber, providers);

    return res.ok({
      phoneNumber: phoneNumber,
      status: status.code,
      message: status.message
    });
  }


// async find (req, res) {
  //   console.log('getting public invites');
  //   const publicInviteCollection = db.collection('publicInvite');



  //   const parseBlueprintOptions = req.options.parseBlueprintOptions
  //   || req._sails.config.blueprints.parseBlueprintOptions
  //   || req._sails.hooks.blueprints.parseBlueprintOptions;
  //   const queryOptions = parseBlueprintOptions(req);
  //   console.log('query opetions ', queryOptions);
  //   let queues = [];
  //   if (req.user.allowedQueues && req.user.allowedQueues.length > 0) {
  //     queues = req.user.allowedQueues.map(q => q.id);
  //   } else if (req.user.viewAllQueues) {
  //     queues = await Queue.find({});
  //     queues = queues.map(q => q.id);
  //   }


  //   const publicInvites = await PublicInvite.find({
  //     where: {
  //       or: [
  //         {
  //           doctor: req.user.id
  //         }, {
  //           queue: queues
  //         }
  //       ]
  //     }
  //   });


  //   return res.json(publicInvites);
  // }


};

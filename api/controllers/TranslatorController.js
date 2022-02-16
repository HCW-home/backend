/**
 * TranslatorController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */


module.exports = {


  async acceptRequest (req, res) {

    const locale = req.headers.locale || process.env.DEFAULT_PATIENT_LOCALE;
    try {

      const translatorRequestInvite = await PublicInvite.findOne({ type: 'TRANSLATOR_REQUEST', inviteToken: req.params.translationRequestToken }).populate('translationOrganization');;

      if (!translatorRequestInvite) {
        return res.status(404).json({
          success: false,
          error: {
            name: 'ERROR_NO_INVITE',
            message: 'invite doesn\'t exist',
            userMessage: sails._t(locale, 'invalid invite')
          }
        });

      }

      // if it has been accepted return error
      if (translatorRequestInvite.status === 'ACCEPTED') {
        return res.status(400).json({
          success: false,
          error: {
            name: 'ERROR_INVITE_ACCEPTED',
            message: 'invite have already been accepted',
            userMessage: sails._t(locale, 'invite have been accepted')
          }
        });
      }

      // if it has been accepted return error
      if (translatorRequestInvite.status === 'REFUSED') {
        return res.status(400).json({
          success: false,
          error: {
            name: 'ERROR_INVITE_REFUSED',
            message: 'invite have already been REFUSED',
            userMessage: sails._t(locale, 'invite have been refused')
          }
        });
      }



      try {
        // set invite as accepted
        await PublicInvite.updateOne({ type: 'TRANSLATOR_REQUEST', inviteToken: req.params.translationRequestToken }).set({ status: 'ACCEPTED' });

        const translatorInviteData = {
          patientInvite: translatorRequestInvite.patientInvite,
          organization: translatorRequestInvite.organization,
          doctor: translatorRequestInvite.doctor,
          scheduledFor: translatorRequestInvite.scheduledFor,
          patientLanguage: translatorRequestInvite.patientLanguage,
          doctorLanguage: translatorRequestInvite.doctorLanguage,
          type: 'TRANSLATOR',
          translatorRequestInvite: translatorRequestInvite.id
        };

        const translatorInvite = await PublicInvite.create(translatorInviteData).fetch();
        await PublicInvite.updateOne({ id: translatorRequestInvite.patientInvite }).set({ translatorInvite: translatorInvite.id });

        const newUser = {
          username: translatorInvite.id,
          firstName: '',
          lastName: '',
          role: 'translator',
          password: '',
          temporaryAccount: true,
          inviteToken: translatorInvite.id
        };

        newUser.firstName = req.body.name;
        newUser.direct = req.body.direct;
        newUser.email = req.body.email;


        await User.create(newUser);


        const patientInvite = await PublicInvite.findOne({ id: translatorRequestInvite.patientInvite }).populate('guestInvite').populate('doctor');
        await PublicInvite.sendTranslatorInvite(translatorInvite, newUser.email);

        // send patient invite
        patientInvite.translatorInvite.doctor = patientInvite.doctor

        if (patientInvite.emailAddress || patientInvite.phoneNumber) {

          await PublicInvite.sendPatientInvite(patientInvite);
        }
        if (patientInvite.guestInvite) {
          patientInvite.guestInvite.doctor = patientInvite.doctor
          await PublicInvite.sendGuestInvite(patientInvite.guestInvite);
        }

        const docLocal = patientInvite.doctor.preferredLanguage || process.env.DEFAULT_DOCTOR_LOCALE
        // send mail notification to doctor
        await sails.helpers.email.with({
          to: patientInvite.doctor.email,
          subject: sails._t(docLocal, 'translator is ready subject'),
          text: sails._t(docLocal, 'translator is ready',{branding:process.env.BRANDING})
        });

        if (patientInvite.scheduledFor) {
          if (patientInvite.emailAddress || patientInvite.phoneNumber) {
            await PublicInvite.setPatientOrGuestInviteReminders(patientInvite);
          }

          if (patientInvite.guestInvite) {
            patientInvite.guestInvite.doctor = patientInvite.doctor
            await PublicInvite.setPatientOrGuestInviteReminders(patientInvite.guestInvite);
          }
        }

        if(translatorRequestInvite.translationOrganization && translatorRequestInvite.translationOrganization.reportEmail){
          await TranslationOrganization.sendTranslationAcceptedReport(translatorRequestInvite.translationOrganization, newUser, translatorRequestInvite, patientInvite.doctor)
        }
      } catch (err) {
        console.error('Error accepting translation request', err);
        await PublicInvite.updateOne({ type: 'TRANSLATOR_REQUEST', inviteToken: req.params.translationRequestToken }).set({ status: 'SENT' });

        return res.status(500).send();
      }



      return res.status(200).json({
        success: true
      });

    } catch (err) {
      console.error('Error accepting translation request', err);

      return res.status(500).send();
    }


  },
  async findConsultation (req, res) {
    const consultation = await Consultation.findOne({ translator: req.user.id });

    if (!consultation) {
      return res.status(404).send();
    }

    return res.status(200).json(consultation);
  },

  async refuseRequest (req, res) {

    const translatorRequestInvite = await PublicInvite.findOne({ type: 'TRANSLATOR_REQUEST',
      inviteToken: req.params.translationRequestToken }).populate('doctor').populate('patientInvite').populate('translationOrganization');

    const locale = req.headers.locale || process.env.DEFAULT_PATIENT_LOCALE;

    if (!translatorRequestInvite.translationOrganization.canRefuse) {
      return res.status(400).json({
        success: false,
        error: {
          name: 'ERROR_CANT_REFUSE',
          message: 'You can\'n refuse this request',
          userMessage: sails._t(locale, 'can\'t refuse')
        }
      });
    }
    if (!translatorRequestInvite) {
      return res.status(404).json({
        success: false,
        error: {
          name: 'ERROR_NO_INVITE',
          message: 'invite doesn\'t exist',
          userMessage: sails._t(locale, 'invalid invite')
        }
      });

    }
    // if it has been accepted return error
    if (translatorRequestInvite.status === 'ACCEPTED') {
      return res.status(400).json({
        success: false,
        error: {
          name: 'ERROR_INVITE_ACCEPTED',
          message: 'invite have already been accepted',
          userMessage: sails._t(locale, 'invite have been accepted')
        }
      });
    }

    // if it has been accepted return error
    if (translatorRequestInvite.status === 'REFUSED') {
      return res.status(400).json({
        success: false,
        error: {
          name: 'ERROR_INVITE_REFUSED',
          message: 'invite have already been REFUSED',
          userMessage: sails._t(locale, 'invite have been refused')
        }
      });
    }


    await PublicInvite.refuseTranslatorRequest(translatorRequestInvite);

    res.status(200).send();
  }
};


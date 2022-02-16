/**
 * TranslationOrganization.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

const moment = require('moment');

module.exports = {

  attributes: {


    name: {
      type: 'string',
      required: true
    },
    mainEmail: {
      type: 'string',
      isEmail: true
    },
    languages: {
      type: 'json'
    },
    canRefuse: {
      type: 'boolean'
    },
    reportEmail:{
      type:'string',
      isEmail: true
    }

  },
  sendTranslationAcceptedReport(organization, translator, invite, doctor){

    return sails.helpers.email.with({
      to: organization.reportEmail,
      subject: `Une demande d'interprétariat a été acceptée par ${organization.name} :`,
      text: `
      Une demande d'interprétariat a été acceptée par ${organization.name}  :

      - Nom de l'interprète : ${translator.firstName}
      - Email de l'interprète : ${translator.email}
      - Téléphone de l'interprète : ${translator.direct}
      - Langues demandées : ${sails._t('fr',invite.patientLanguage)} et ${sails._t('fr',invite.doctorLanguage)}.${invite.scheduledFor?`
      - Date planifiée : ${moment(invite.scheduledFor).tz(moment.tz.guess()).locale('fr').format('D MMMM HH:mm zz')}.`:''}
      - Soignant demandant : ${doctor.name || doctor.firstName} ${doctor.email}
      - Contact du soignant : ${doctor.email}`
    });
   }
};


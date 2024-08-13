const Fhir = require('fhir').Fhir;
const fhir = new Fhir();
const moment = require("moment-timezone");
const uuid = require('uuid');

const statusMap = {
  SENT: 'pending',
  ACCEPTED: 'booked',
  COMPLETE: 'fulfilled',
  REFUSED: 'cancelled',
  CANCELED: 'cancelled',
};

module.exports = {

  validateAppointmentData: function(appointmentData) {
    const validationResult = fhir.validate(appointmentData, {
      errorOnUnexpected: true,
    });

    if (validationResult?.length > 0) {
      const error = new Error('Invalid FHIR data');
      error.details = validationResult;
      throw error;
    }

    return true;
  },

  serializeAppointmentToInvite: function(appointmentData) {
    return {
      firstName: appointmentData.participant[0]?.actor?.display || 'Unknown',
      lastName: appointmentData.participant[0]?.actor?.reference || 'Unknown',
      emailAddress: appointmentData.participant[0]?.actor?.email || 'example@example.com',
      scheduledFor: new Date(appointmentData.start).getTime() || undefined,
      fhirData: appointmentData,
      type: 'PATIENT',
    };
  },

};

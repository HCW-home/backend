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

  validateAppointmentData: function (appointmentData) {
    const validationResult = fhir.validate(appointmentData, {
      errorOnUnexpected: true,
    });

    if (validationResult?.length > 0) {
      const error = new Error('Invalid FHIR data');
      error.details = validationResult;
      throw error;
    }

    /** start (when consultation start - optionnal): check date is in future. **/
    if (appointmentData?.start) {
      const startDate = new Date(appointmentData.start);

      if (isNaN(startDate)) {
        throw new Error('Invalid start date format');
      }

      const now = new Date();
      if (startDate <= now) {
        throw new Error('Start date must be in the future');
      }
    }

    /** recurrenceTemplate: must return error if defined **/
    if (appointmentData?.recurrenceTemplate) {
      throw new Error('Field "recurrenceTemplate" is not allowed');
    }
    /** occurrenceChanged: must return error if defined **/
    if (appointmentData?.occurrenceChanged) {
      throw new Error('Field "occurrenceChanged" is not allowed');
    }

    /** basedOn: must return error if defined **/
    if (appointmentData?.basedOn) {
      throw new Error('Field "basedOn" is not allowed');
    }

    /** patientInstruction: must return error if defined **/
    if (appointmentData?.patientInstruction) {
      throw new Error('Field "patientInstruction" is not allowed');
    }

    /** cancellationDate: must return error if defined **/
    if (appointmentData?.cancellationDate) {
      throw new Error('Field "cancellationDate" is not allowed');
    }

    if (!appointmentData?.participant || !Array.isArray(appointmentData.participant) || appointmentData?.participant?.length === 0) {
      throw new Error('Field "participant" is mandatory and must be a non-empty list');
    }

    let patientCount = 0;
    let hasPractitioner = false;

    appointmentData.participant.forEach((participant) => {
      const actor = participant?.actor;

      if (actor?.code === 'PAT') {
        patientCount++;

        if (patientCount > 1) {
          throw new Error('Only 0 or 1 patient (code: PAT) is allowed');
        }

        if (!actor.name || !Array.isArray(actor.name) || actor.name.length === 0) {
          throw new Error('Patient must have a name (HumanName)');
        }

        const name = actor.name.find((el)=> el.use === 'usual');

        if(!name){
          throw new Error('Patient must have a name');
        }

        if (!name?.family) {
          throw new Error('Patient must have a family name (lastName)');
        }

        if (!name?.given || !Array.isArray(name.given) || name.given.length === 0) {
          throw new Error('Patient must have given names (firstName)');
        }

        if (!actor?.telecom || !Array.isArray(actor.telecom)) {
          throw new Error('Patient must have telecom with at least email or SMS');
        }

        const hasEmailOrSms = actor.telecom.some(
          (contact) => contact.system === 'email' || contact.system === 'sms'
        );

        if (!hasEmailOrSms) {
          throw new Error('Patient telecom must include at least email or SMS');
        }
      }


      if (actor?.code === 'PPRF') {
        if (hasPractitioner) {
          throw new Error('Only 1 practitioner (code: PPRF) is allowed');
        }

        hasPractitioner = true;

        if (!actor?.telecom || !Array.isArray(actor.telecom)) {
          throw new Error('Practitioner must have telecom with at least email');
        }

        const hasEmail = actor.telecom.some((contact) => contact.system === 'email');

        if (!hasEmail) {
          throw new Error('Practitioner telecom must include at least email');
        }
      }
    });



    return true;
  },

  serializeAppointmentToInvite: function (appointmentData, metadata = null) {
    return {
      firstName: appointmentData.participant[0]?.actor?.display || 'Unknown',
      lastName: appointmentData.participant[0]?.actor?.reference || 'Unknown',
      emailAddress: appointmentData.participant[0]?.actor?.email || 'example@example.com',
      scheduledFor: new Date(appointmentData.start).getTime() || undefined,
      fhirData: appointmentData,
      type: 'PATIENT',
      metadata: metadata
    };
  },

  createAppointmentMetadata: function (appointmentData) {
    if(!appointmentData){
      return null
    }

    const metadata = {}

    if(appointmentData?.minutesDuration){
      metadata.minutesDuration = appointmentData.minutesDuration;
    }

    if(appointmentData?.end){
      metadata.end = appointmentData.end;
    }

    if(appointmentData?.description){
      metadata.description = appointmentData.description
    }

    if(appointmentData?.reason){
      metadata.reason = appointmentData.reason
    }

    if(appointmentData?.identifier){
      metadata.identifier = appointmentData.identifier
    }

    return metadata
  }

};

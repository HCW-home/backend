const Fhir = require('fhir').Fhir;
const fhir = new Fhir();
const moment = require("moment-timezone");
const uuid = require('uuid');

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

  serializePatientToFhir(invite) {
    const fhirData = {
      resourceType: 'Patient',
      name: [{ given: [invite.firstName], family: invite.lastName }],
      telecom: [
        { system: 'phone', value: invite.phoneNumber, use: 'home' },
        { system: 'email', value: invite.emailAddress, use: 'home' },
      ],
      gender: invite.gender,
      birthDate: invite.birthDate,
      address: invite.address ? [{ line: [invite.address] }] : undefined,
    };

    const fhir = new Fhir();
    const validationResult = fhir.validate(fhirData);
    console.log(validationResult, 'validationResult');
    if (!validationResult.valid) {
      throw new Error('Invalid FHIR data');
    }

    return fhirData;
  },

  serializeInviteToFhir(invite) {
    const start = moment(invite.scheduledFor).toISOString();

    const id = invite.inviteToken
    const statusMap = {
      SENT: 'pending',
      ACCEPTED: 'booked',
      COMPLETE: 'fulfilled',
      REFUSED: 'cancelled',
      CANCELED: 'cancelled',
    };
    const fhirStatus = statusMap[invite.status] || 'unknown';

    const fhirAppointment = {
      resourceType: 'Appointment',
      id: id,
      status: fhirStatus,

      description: `Appointment for ${invite.firstName} ${invite.lastName}`,
      start: start,
      participant: [
        {
          actor: {
            reference: `Practitioner/${invite.doctor}`,
            display: invite.doctorData?.email,
          },
          status: 'accepted'
        },
        {
          actor: {
            reference: `Patient/${id}`,
            display: `${invite.firstName} ${invite.lastName}`
          },
          status: 'accepted'
        }
      ],
      created: moment(invite.createdAt).toISOString(),
    };

    const fhir = new Fhir();
    const validationResult = fhir.validate(fhirAppointment);
    if (!validationResult.valid) {
      console.log(validationResult, 'validationResult');
      throw new Error('Invalid FHIR data');
    }

    return fhirAppointment;
  }


};

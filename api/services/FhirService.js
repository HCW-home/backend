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

  findParticipantsByCode: function (data, code) {
    return data?.filter(participant => participant.type?.some(typeObj => typeObj.coding?.some(coding => coding.code === code)));
  },


  findParticipantsExcludingCodes: function (data, codes) {
    return data.filter(participant => {
      return participant?.type !== undefined && !participant?.type?.some(typeObj => typeObj.coding?.some(coding => codes.includes(coding.code)))
    });
  },

  validateAppointmentData: async function (appointmentData) {
    const validationResult = fhir.validate(appointmentData, {
      errorOnUnexpected: true,
    });

    if (validationResult?.messages?.length > 0) {
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

    /** basedOn: must return error if defined  ✅**/
    if (appointmentData?.basedOn) {
      throw new Error('Field "basedOn" is not allowed');
    }

    /** patientInstruction: must return error if defined ✅**/
    if (appointmentData?.patientInstruction) {
      throw new Error('Field "patientInstruction" is not allowed');
    }

    /** cancellationDate: must return error if defined **/
    if (appointmentData?.cancellationDate) {
      throw new Error('Field "cancellationDate" is not allowed');
    }

    /** note: must return error if defined **/
    if (appointmentData?.note?.length > 1) {
      throw new Error('Field "note" is not allowed');
    }

    /** reason: must return error if defined **/
    if (appointmentData?.reason?.length > 1) {
      throw new Error('Field "cancellationDate" is not allowed');
    }


    if (!appointmentData?.participant || !Array.isArray(appointmentData.participant) || appointmentData?.participant?.length === 0) {
      throw new Error('Field "participant" is mandatory and must be a non-empty list');
    }

    const foundedDoctors = this.findParticipantsByCode(appointmentData.participant, "PPRF");
    const foundedPatients = this.findParticipantsByCode(appointmentData.participant, "BEN");
    const foundedDoctor = foundedDoctors[0];
    const foundedPatient = foundedPatients[0];
    const foundedPatientActor = foundedPatient?.actor;
    const foundedParticipantsExcludingCodes = this.findParticipantsExcludingCodes(appointmentData.participant, ['BEN', 'PPRF'])

    /** PPRF **/
    if (!foundedDoctors.length) {
      throw new Error('Primary performer not founded');
    }
    if (!foundedDoctors.length > 1) {
      throw new Error('Only 1 Primary performer is allowed');
    }

    /** BEN **/
    if (!foundedPatients.length) {
      throw new Error('Beneficiary not founded');
    }
    if (!foundedPatients.length > 1) {
      throw new Error('Only 1 beneficiary is allowed');
    }

    // ✅
    if (foundedParticipantsExcludingCodes.length > 0) {
      throw new Error('We are supporting only Primary performer and Beneficiary participant types');
    }


    /** PPRF  ✅**/
    if (!foundedDoctor?.actor?.telecom || !Array.isArray(foundedDoctor?.actor?.telecom)) {
      throw new Error('Practitioner must have telecom with at least email');
    }

    // ✅
    const hasEmail = foundedDoctor?.actor?.telecom.some((contact) => contact.system === 'email');
    if (!hasEmail) {
      throw new Error('Practitioner telecom must include at least email');
    }

    console.log('foundedPatientActor', foundedPatientActor)
    /** BEN ✅**/
    if (!foundedPatientActor?.name || !Array.isArray(foundedPatientActor?.name) || foundedPatientActor?.name?.length === 0) {
      throw new Error('Patient must have a name (HumanName)');
    }

    // ✅
    if (!foundedPatientActor?.identifier?.length) {
      throw new Error('Missing identifier');
    }

    // ✅
    if (foundedPatientActor?.identifier.length > 1) {
      throw new Error('We not supported many identifiers');
    }

    const name = foundedPatientActor?.name?.find((el) => el?.use === 'usual');
    // ✅
    if (!name) {
      throw new Error('Patient must have a usual name');
    }

    // ✅
    if (!name?.family) {
      throw new Error('Patient must have a family name');
    }

    // ✅
    if (!name?.given || !Array.isArray(name?.given) || name?.given?.length === 0) {
      throw new Error('Patient must have given names');
    }

    // ✅
    if (!foundedPatientActor?.telecom || !Array.isArray(foundedPatientActor?.telecom)) {
      throw new Error('Patient must have telecom with at least email or SMS');
    }

    const hasEmailOrSms = foundedPatientActor?.telecom?.some((contact) => contact?.system === 'email' || contact?.system === 'sms');
    // ✅
    if (!hasEmailOrSms) {
      throw new Error('Patient telecom must include at least email or SMS');
    }

    /** PPRF **/
    const foundedDoctorEmailObject = foundedDoctor?.actor?.telecom?.find((contact) => contact.system === 'email');
    const emailDoctor = foundedDoctorEmailObject?.value

    const foundedDoctorWithSameEmail = await User.findOne({role: 'doctor', email: emailDoctor});

    if (!foundedDoctorWithSameEmail) {
      throw new Error('Doctor not found');
    }

    return {
      firstName: name?.given?.[0],
      lastName: name?.family,
      email: emailDoctor,
    };
  },

  serializeAppointmentPatientToUser: async function ({firstName, lastName, email, username, inviteToken}) {
    return {
      username: username,
      firstName: firstName,
      lastName: lastName,
      role: "patient",
      password: '',
      temporaryAccount: true,
      email: email,
      inviteToken: inviteToken,
      direct: "",
    }
  },

  serializeAppointmentToInvite: function ({firstName, lastName, email, appointmentData, metadata}) {
    return {
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Unknown',
      emailAddress: email || 'example@example.com',
      scheduledFor: new Date(appointmentData.start).getTime() || undefined,
      fhirData: appointmentData,
      type: 'PATIENT',
      metadata: metadata || null,
    }
  },

  createAppointmentMetadata: function (appointmentData) {
    if (!appointmentData) {
      return null
    }

    const metadata = {}

    if (appointmentData?.minutesDuration) {
      metadata.minutesDuration = appointmentData.minutesDuration;
    }

    if (appointmentData?.end) {
      metadata.end = appointmentData.end;
    }

    if (appointmentData?.description) {
      metadata.description = appointmentData.description
    }

    if (appointmentData?.reason?.length > 0 && appointmentData?.reason[0]?.reference?.display) {
      metadata.reason = appointmentData.reason[0]?.reference?.display
    }

    if (appointmentData?.identifier?.length > 0 && appointmentData?.identifier?.[0]?.value) {
      metadata.identifier = appointmentData?.identifier?.[0]?.value
    }

    return metadata
  }

};

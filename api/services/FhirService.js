const Fhir = require('fhir').Fhir;
const fhir = new Fhir();

const statusMap = {
  PENDING: "proposed",
  SENT: "pending",
  ACCEPTED: "booked",
  ACKNOWLEDGED: "booked",
  COMPLETE: "fulfilled",
  REFUSED: "cancelled",
  CANCELED: "cancelled",
  SCHEDULED_FOR_INVITE: "booked",
  SCHEDULED: "booked",

  QUEUED: "pending",
  SENDING: "pending",
  FAILED: "cancelled",
  DELIVERED: "booked",
  PARTIALLY_DELIVERED: "booked",
  UNDELIVERED: "cancelled",
  RECEIVING: "booked",
  RECEIVED: "booked",
  READ: "arrived"
};

const reverseStatusMap = {
  "proposed": "PENDING",
  "pending": "SENT",
  "booked": "DELIVERED",
  "arrived": "READ",
  "fulfilled": "COMPLETE",
  "cancelled": "CANCELED",
  "noshow": "REFUSED",
  "entered-in-error": "CANCELED",
  "checked-in": "ACKNOWLEDGED",
  "waitlist": "QUEUED"
};

module.exports = {
  statusMap,
  reverseStatusMap,
  findParticipantsByResourceType: function(data, containedResources, resourceType) {
    return data?.filter(participant => {
      const ref = participant?.actor?.reference;
      const refId = (typeof ref === 'string' && ref.startsWith('#')) ? ref.slice(1) : null;
      const matchedResource = containedResources?.find(res => res.id === refId);
      return matchedResource?.resourceType === resourceType;
    });
  },

  findContainedResourcesByType(participants, contained, resourceType) {
    return participants
      .map(participant => {
        const ref = participant?.actor?.reference;
        const refId = (typeof ref === 'string' && ref.startsWith('#'))
          ? ref.slice(1)
          : null;

        return contained?.find(resource => resource.id === refId && resource.resourceType === resourceType);
      })
      .filter(Boolean);
  },


  findParticipantsExcludingResourceTypes: function(participants, contained, resourceTypes) {
    return participants?.filter(participant => {
      const ref = participant?.actor?.reference;
      const refId = (typeof ref === 'string' && ref.startsWith('#'))
        ? ref.slice(1)
        : null;

      const matchedResource = contained?.find(resource => resource.id === refId);
      return matchedResource ? !resourceTypes.includes(matchedResource.resourceType) : true;
    });
  },

  validateAppointmentData: async function(appointmentData) {
    const validationResult = fhir.validate(appointmentData, {
      errorOnUnexpected: false,
      skipCodeValidation: true,
    });

    if (!validationResult.valid) {
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

    /** note: must return error if defined more than one **/
    if (appointmentData?.note?.length > 1) {
      throw new Error('Allowed only 1 "note"');
    }

    /** reason: must return error if defined more than one **/
    if (appointmentData?.reason?.length > 1) {
      throw new Error('Only 1 "reason" is allowed');
    }


    if (!appointmentData?.participant || !Array.isArray(appointmentData.participant) || appointmentData?.participant?.length === 0) {
      throw new Error('Field "participant" is mandatory and must be a non-empty list');
    }

    for (const participant of appointmentData.participant) {
      if (!participant.actor) {
        throw new Error('Each participant must have an "actor" field');
      }
      if (!participant.actor.reference || typeof participant.actor.reference !== 'string') {
        throw new Error('Each participant.actor must have a "reference" field of type string');
      }
    }

    const foundedDoctors = this.findContainedResourcesByType(
      appointmentData.participant,
      appointmentData.contained,
      'Practitioner'
    );

    const foundedPatients = this.findContainedResourcesByType(
      appointmentData.participant,
      appointmentData.contained,
      'Patient'
    );

    const foundedDoctor = foundedDoctors[0];
    const foundedPatient = foundedPatients[0];
    const foundedDoctorActor = foundedDoctor;
    const foundedPatientActor = foundedPatient;
    const foundedParticipantsExcludingCodes = this.findParticipantsExcludingResourceTypes(appointmentData.participant,
      appointmentData.contained,
      ['Patient', 'Practitioner']);

    /** Practitioner **/
    if (!foundedDoctors.length) {
      throw new Error('Primary performer not founded');
    }
    if (foundedDoctors.length > 1) {
      throw new Error('Only 1 Primary performer is allowed');
    }

    /** Patient **/
    if (!foundedPatients.length) {
      throw new Error('Patient not founded');
    }

    if (foundedPatients.length > 1) {
      throw new Error('Only 1 patient is allowed');
    }

    // ✅
    if (foundedParticipantsExcludingCodes.length > 0) {
      throw new Error('We are supporting only Primary performer and Patient participant types');
    }


    /** Practitioner  ✅**/
    if (!foundedDoctorActor?.telecom || !Array.isArray(foundedDoctorActor?.telecom)) {
      throw new Error('Practitioner must have telecom with at least email');
    }

    // ✅
    const hasEmail = foundedDoctorActor?.telecom.some((contact) => contact.system === 'email');
    if (!hasEmail) {
      throw new Error('Practitioner telecom must include at least email');
    }

    /** Patient ✅**/
    if (!foundedPatientActor?.name || !Array.isArray(foundedPatientActor?.name) || foundedPatientActor?.name?.length === 0) {
      throw new Error('Patient must have a name (HumanName)');
    }

    // // // ✅
    // if (!foundedPatientActor?.identifier?.length) {
    //   throw new Error('Missing identifier');
    // }

    // // ✅
    // if (foundedPatientActor?.identifier.length > 1) {
    //   throw new Error('We not supported many identifiers');
    // }

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
    const patientTelecomEmail = foundedPatientActor?.telecom?.find((contact) => contact?.system === 'email');
    const patientTelecomSms = foundedPatientActor?.telecom?.find((contact) => contact?.system === 'sms');

    /** Practitioner **/
    const foundedDoctorEmailObject = foundedDoctorActor?.telecom?.find((contact) => contact.system === 'email');
    const emailDoctor = foundedDoctorEmailObject?.value;

    const foundedDoctorWithSameEmail = await User.find({
      email: emailDoctor,
      role: { in: [sails.config.globals.ROLE_DOCTOR, sails.config.globals.ROLE_ADMIN] }
    });

    if (!foundedDoctorWithSameEmail.length) {
      throw new Error('Doctor not found');
    }

    let note = ''
    if (appointmentData?.note?.[0]?.text) {
      note = appointmentData.note[0].text;
    }

    return {
      firstName: name?.given?.[0],
      lastName: name?.family,
      emailAddress: patientTelecomEmail?.value,
      phoneNumber: patientTelecomSms?.value,
      doctor: foundedDoctorWithSameEmail[0].id,
      gender: foundedPatientActor?.gender,
      doctorEmail: emailDoctor,
      note
    };
  },

  serializeAppointmentPatientToUser: async function({
                                                      firstName,
                                                      lastName,
                                                      email,
                                                      phoneNumber,
                                                      username,
                                                      inviteToken,
                                                      gender
                                                    }) {
    return {
      username: username,
      firstName: firstName,
      lastName: lastName,
      role: 'patient',
      password: '',
      temporaryAccount: true,
      email: email,
      phoneNumber: phoneNumber,
      inviteToken: inviteToken,
      gender: gender,
      direct: '',
    };
  },

  serializeAppointmentToInvite: function({
                                           firstName,
                                           lastName,
                                           appointmentData,
                                           metadata,
                                           doctor,
                                           emailAddress,
                                           phoneNumber,
                                           gender,
                                           doctorEmail,
                                           note
                                         }) {
    return {
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Unknown',
      scheduledFor: new Date(appointmentData.start).getTime() || undefined,
      fhirData: appointmentData,
      type: 'PATIENT',
      metadata: metadata || null,
      doctor,
      emailAddress,
      phoneNumber,
      gender,
      isPatientInvite: true,
      doctorEmail,
      note
    };
  },

  createAppointmentMetadata: function(appointmentData) {
    if (!appointmentData) {
      return null;
    }

    const metadata = {};

    if (appointmentData?.minutesDuration) {
      metadata.minutesDuration = appointmentData.minutesDuration;
    }

    if (appointmentData?.end) {
      metadata.end = appointmentData.end;
    }

    if (appointmentData?.description) {
      metadata.description = appointmentData.description;
    }

    if (appointmentData?.reason?.length > 0 && appointmentData?.reason[0]?.reference?.display) {
      metadata.reason = appointmentData.reason[0]?.reference?.display;
    }

    if (appointmentData?.identifier?.length > 0) {
      const firstIdentifier = appointmentData.identifier[0];
      if (firstIdentifier?.value) {
        metadata.identifier = firstIdentifier.value;
        if (firstIdentifier?.system) {
          metadata.identifierSystem = firstIdentifier.system;
        }
      }
    }

    return metadata;
  },

  consultationStatusToEncounterStatus: function(status) {
    const encounterStatusMap = {
      'pending': 'planned',
      'active': 'in-progress',
      'closed': 'finished'
    };
    return encounterStatusMap[status] || 'unknown';
  },

  serializeConsultationToEncounter: function(consultation) {
    const consultationId = consultation.id || (consultation._id ? consultation._id.toString() : null);

    const encounter = {
      resourceType: 'Encounter',
      id: consultationId,
      status: this.consultationStatusToEncounterStatus(consultation.status),
      class: {
        code: 'VR',
        display: 'virtual'
      }
    };

    if (consultation.metadata?.identifier) {
      encounter.identifier = [{ value: consultation.metadata.identifier }];
    }

    if (consultation.createdAt || consultation.closedAt) {
      encounter.period = {};
      if (consultation.createdAt) {
        encounter.period.start = new Date(consultation.createdAt).toISOString();
      }
      if (consultation.closedAt) {
        encounter.period.end = new Date(consultation.closedAt).toISOString();
      }
    }

    if (consultation.invite) {
      const inviteId = consultation.invite.toString ? consultation.invite.toString() : consultation.invite;
      encounter.appointment = [{
        reference: `Appointment/${inviteId}`
      }];
    }

    const notes = [];

    const doctorId = consultation.acceptedBy ?
      (consultation.acceptedBy.toString ? consultation.acceptedBy.toString() : consultation.acceptedBy) :
      null;

    if (consultation.clinicalNotes) {
      const clinicalNote = {
        text: consultation.clinicalNotes
      };

      if (doctorId) {
        clinicalNote.authorReference = {
          reference: `Practitioner/${doctorId}`,
          display: 'Doctor'
        };
      }

      if (consultation.closedAt) {
        clinicalNote.time = new Date(consultation.closedAt).toISOString();
      }

      notes.push(clinicalNote);
    }

    if (consultation.doctorComment) {
      const doctorNote = {
        text: consultation.doctorComment,
        extension: [{ url: 'category', valueString: 'rating' }]
      };

      if (doctorId) {
        doctorNote.authorReference = {
          reference: `Practitioner/${doctorId}`,
          display: 'Doctor'
        };
      }

      if (consultation.closedAt) {
        doctorNote.time = new Date(consultation.closedAt).toISOString();
      }

      notes.push(doctorNote);
    }

    if (consultation.patientComment) {
      const patientId = consultation.owner ?
        (consultation.owner.toString ? consultation.owner.toString() : consultation.owner) :
        null;

      const patientNote = {
        text: consultation.patientComment,
        extension: [{ url: 'category', valueString: 'rating' }]
      };

      if (patientId) {
        patientNote.authorReference = {
          reference: `Patient/${patientId}`,
          display: 'Patient'
        };
      }

      if (consultation.closedAt) {
        patientNote.time = new Date(consultation.closedAt).toISOString();
      }

      notes.push(patientNote);
    }

    if (notes.length > 0) {
      encounter.note = notes;
    }

    return encounter;
  }

};

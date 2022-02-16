/**
 * AnonymousConsultation.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

module.exports = {
  attributes: {
    IMADTeam: {
      type: 'string'
    },
    queue: {
      model: 'queue',
      required: false
    },
    acceptedBy: {
      model: 'user'
    },
    owner: {
      model: 'user',
      required: false
    },
    acceptedAt: {
      type: 'number'
    },
    closedAt: {
      type: 'number'
    },
    patientRating: {
      type: 'string',
      required: false
    },
    patientComment: {
      type: 'string',
      required: false
    },
    doctorRating: {
      type: 'string',
      required: false
    },
    doctorComment: {
      type: 'string',
      required: false
    },
    consultationCreatedAt: {
      type: 'number'
    },
    consultationId: {
      type: 'string'
    },
    doctorTextMessagesCount: {
      type: 'number'
    },
    patientTextMessagesCount: {
      type: 'number'
    },
    successfulCallsCount: {
      type: 'number'
    },
    missedCallsCount: {
      type: 'number'
    },
    averageCallDuration: {
      type: 'number'
    },
    inviteScheduledFor: {
      type: 'number'
    },
    doctor: {
      model: 'user',
      required: false
    },
    inviteCreatedAt: {
      type: 'number'
    },
    invitedBy: {
      model: 'user',
      required: false
    },
    invite: {
      model: 'PublicInvite',
      required: false
    },
    numberOfEffectiveParticipants: {
      type: 'number'
    },
    numberOfPlannedParticipants: {
      type: 'number'
    },
    languages: {
      type: 'string'
    },
    translationOrganization: {
      type: 'string',
    },
    interpreterName: {
      type: 'string',
    },
    consultationEstimatedAt: {
      type: 'number'
    },
    firstCallAt: {
      type: 'number'
    }
  }

};

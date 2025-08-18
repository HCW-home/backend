/**
 * Policy Mappings
 * (sails.config.policies)
 *
 * Policies are simple functions which run **before** your actions.
 *
 * For more information on configuring policies, check out:
 * https://sailsjs.com/docs/concepts/policies
 */

module.exports.policies = {
  /** *************************************************************************
   *                                                                          *
   * Default policy for all controllers and actions, unless overridden.       *
   * (`true` allows public access)                                            *
   *                                                                          *
   ***************************************************************************/

  "*": false,
  DashboardController: {
    get: true,
  },
  HealthCheckController: {
    "*": true,
  },
  LocaleController: {
    "*": true,
  },
  SubscribeToSocketController: {
    subscribe: ["isLoggedIn"],
  },
  SubscribeToDoctorsController: {
    subscribe: ["isLoggedIn", "isDoctorOrAdmin"],
  },
  MediasoupserverController: {
    "*": ["isLoggedIn", "isAdmin"],
    read: ["isLoggedIn", "isAdmin"],
    create: ["isLoggedIn", "isAdmin"],
  },
  SmsProviderController: {
    list: ["isLoggedIn"],
    update: ["isLoggedIn"],
    batchUpdateOrder: ["isLoggedIn"],
  },
  // '/api/v1/subscribe-to-socket':['isLoggedIn'],
  UserController: {
    "*": false,
    ip: ["isLoggedIn"],
    find: ["isLoggedIn", "isAdmin"],
    getPaginatedUsers: ["isLoggedIn", "isAdmin"],
    findOne: ["isLoggedIn", "isAdmin"],
    populate: ["isLoggedIn", "isAdmin"],
    create: ["isLoggedIn", "isAdmin"],
    update: ["isLoggedIn", "isAdmin"],
    addDoctorToQueue: ["isLoggedIn", "isAdmin"],
    removeDoctorFromQueue: ["isLoggedIn", "isAdmin"],
    getDoctorQueues: ["isLoggedIn", "isAdmin"],
    add: ["isLoggedIn", "isAdmin"],
    destroy: ["isLoggedIn", "isAdmin"],
    remove: ["isLoggedIn", "isAdmin"],
    replace: ["isLoggedIn", "isAdmin"],
    getUser: ["isLoggedIn", "isDoctorOrAdminOrNurse"],
    updateNotif: ["isLoggedIn", "isDoctorOrAdmin"],
    updateTerms: ["isLoggedIn", "isDoctorOrAdmin"],
    registerNurse: true,
    updateStatus: ["isLoggedIn", "isDoctorOrAdmin"],
  },
  countController: {
    count: ["isLoggedIn", "isAdmin"],
  },
  MessageController: {
    "*": false,
    create: ["isLoggedIn", "setMessageDestination"],
    find: ["isLoggedIn", "isConsultationOwner"],
    readMessages: ["isLoggedIn", "isConsultationOwner"],
  },
  ConsultationController: {
    "*": false,
    consultationOverview: ["isLoggedIn"],
    acceptConsultation: ["isLoggedIn", "isDoctorOrAdmin"],
    closeConsultation: ["isLoggedIn", "isDoctorOrAdmin"],
    create: ["isLoggedIn", "setConsultationOwner"],
    destroy: ["isLoggedIn", "isNurseOrPatientOrAdmin"],
    uploadFile: ["isLoggedIn", "setMessageDestination"],
    attachment: ["isLoggedIn", "isConsultationOwner"],
    call: ["isLoggedIn", "isConsultationOwner"],
    rejectCall: ["isLoggedIn", "isConsultationParticipant"],
    acceptCall: ["isLoggedIn", "isConsultationParticipant"],
    patientFeedback: ["isLoggedIn", "isNurseOrPatientOrAdmin"],
    doctorFeedback: ["isLoggedIn", "isConsultationOwner"],
    updateConsultationNote: ["isLoggedIn", "isConsultationOwner"],
    consultationsCSV: ["isLoggedIn", "isAdmin"],
    testCall: true,
    getCurrentCall: ["isLoggedIn", "isConsultationParticipant"],
    getConsultationFromToken: true,
    planConsultation: true,
    // findOne: ['isLoggedIn', 'isConsultationOwnerOrTranslator']
  },
  AuthController: {
    loginLocal: true,
    loginSaml: true,
    loginOpenId: true,
    loginOpenIdReturn: true,
    loginInvite: true,
    loginSms: true,
    login2FA: true,
    metadata: true,
    forgotPassword: true,
    resetPassword: true,
    getCurrentUser: true,
    samlCallback: true,
    getConfig: true,
    logout: true,
    externalAuth: true,
    refreshToken: true,
    verifyRefreshToken: true,
  },
  ExpertController: {
    sendExpertLink: ["isLoggedIn"],
  },
  InviteController: {
    "*": false,
    invite: ["isLoggedIn", "canInvite", "setPublicInviteOwner"],
    resend: ["isLoggedIn", "canInvite"],
    revoke: ["isLoggedIn", "canInvite"],
    findByConsultation: ["isLoggedIn", "isConsultationOwner"],
    getConsultation: ["isLoggedIn", "isInviteOwner"],
    getInvite: ["isLoggedIn", "canInvite", "isInviteOwner"],
    update: ["isLoggedIn", "canInvite", "isInviteOwner"],
    closeConsultation: [
      "isLoggedIn",
      "canInvite",
      "isSchedulerOrAdmin",
      "isInviteOwner",
    ],
    findByToken: true,
    checkInviteStatus: true,
    acknowledgeInvite: true,
  },

  PublicInviteController: {
    "*": false,
    find: ["isLoggedIn", "canInvite", "isInviteOwner"],
    checkPrefix: ["isLoggedIn", "canInvite", "isInviteOwner"],
    destroy: ["isLoggedIn", "canInvite", "isInviteOwner"],
    findOne: ["isLoggedIn", "canInvite", "isInviteOwner"],
    createFhirAppointment: ["isLoggedIn", "canInvite", "isInviteOwner"],
    getFhirAppointment: ["isLoggedIn", "canInvite", "isInviteOwner"],
    updateFhirAppointment: ["isLoggedIn", "canInvite", "isInviteOwner"],
    getAllFhirAppointments: ["isLoggedIn", "canInvite", "isInviteOwner"],
    deleteFhirAppointment: ["isLoggedIn", "canInvite", "isInviteOwner"],
  },
  WhatsappTemplateController: {
    "*": false,
    refreshStatus: ["isLoggedIn", "isAdmin"],
    fetchTemplates: ["isLoggedIn", "isAdmin"],
    deleteTemplate: ["isLoggedIn", "isAdmin"],
    submitTemplate: ["isLoggedIn", "isAdmin"],
    updateTemplateBody: ["isLoggedIn", "isAdmin"],
    bulkSubmitTemplates: ["isLoggedIn", "isAdmin"],
  },
  QueueController: {
    "*": false,
    find: ["isLoggedIn", "isDoctorOrAdminOrNurseOrScheduler"],
    create: ["isLoggedIn", "isAdmin"],
    destroy: ["isLoggedIn", "isAdmin"],
    update: ["isLoggedIn", "isAdmin"],
  },

  TranslationOrganizationController: {
    "*": false,
    find: ["isLoggedIn", "isDoctorOrAdmin"],
    create: ["isLoggedIn", "isAdmin"],
    destroy: ["isLoggedIn", "isAdmin"],
    update: ["isLoggedIn", "isAdmin"],
  },

  Translator: {
    "*": ["isLoggedIn", "isDoctorOrAdmin"],
  },
  TwilioController: {
    "*": false,
    statusCallback: true,
  },
  TranslatorController: {
    "*": false,
    acceptRequest: true,
    refuseRequest: true,
    findConsultation: ["isLoggedIn"],
    find: ["isLoggedIn", "isAdmin"],
    findOne: ["isLoggedIn", "isAdmin"],
    update: ["isLoggedIn", "isAdmin"],
    create: ["isLoggedIn", "isAdmin"],
    destroy: ["isLoggedIn", "isAdmin"],
  },
  Language: {
    "*": false,
    find: ["isLoggedIn", "isDoctorOrAdmin"],
    create: ["isLoggedIn", "isAdmin"],
    destroy: ["isLoggedIn", "isAdmin"],
    update: ["isLoggedIn", "isAdmin"],
  },
};

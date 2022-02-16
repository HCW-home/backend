/**
 * Route Mappings
 * (sails.config.routes)
 *
 * Your routes tell Sails what to do each time it receives a request.
 *
 * For more information on configuring custom routes, check out:
 * https://sailsjs.com/anatomy/config/routes-js
 */

module.exports.routes = {

  /** *************************************************************************
  *                                                                          *
  * Make the view located at `views/homepage.ejs` your home page.            *
  *                                                                          *
  * (Alternatively, remove this and add an `index.html` file in your         *
  * `assets` directory)                                                      *
  *                                                                          *
  ***************************************************************************/
  'get /app/*': {
    skipAssets: true,
    controller: 'DashboardController',
    action: 'get'
  },
  'get /app': '/app/dashboard',
  'get /': '/app/dashboard',
  // '/dashboard': { view: 'pages/homepage' },
  'get /api/v1/subscribe-to-socket': 'SubscribeToSocketController.subscribe',
  'get /api/v1/subscribe-to-doctors': 'SubscribeToDoctorsController.subscribe',
  'post /api/v1/consultation/:consultation/read-messages': 'MessageController.readMessages',
  'get /api/v1/consultations-overview': 'ConsultationController.consultationOverview',
  'get /api/v1/consultations-from-token': 'ConsultationController.getConsultationFromToken',
  'get /api/v1/consultations-csv': 'ConsultationController.consultationsCSV',
  'post /api/v1/plan-consultation': 'ConsultationController.planConsultation',
  'post /api/v1/consultation': 'ConsultationController.create',
  'GET /api/v1/consultation/test-call': 'ConsultationController.testCall',
  'post /api/v1/consultation/:consultation/accept': 'ConsultationController.acceptConsultation',
  // 'delete /api/v1/consultation/:consultation': 'ConsultationController.destroy',
  'post /api/v1/consultation/:consultation/close': 'ConsultationController.closeConsultation',
  'post /api/v1/consultation/:consultation/call': 'ConsultationController.call',
  'GET /api/v1/consultation/:consultation/current-call': 'ConsultationController.getCurrentCall',
  'post /api/v1/consultation/:consultation/:message/reject-call': 'ConsultationController.rejectCall',
  'post /api/v1/consultation/:consultation/:message/accept-call': 'ConsultationController.acceptCall',
  'post /api/v1/consultation/:consultation/upload-file': 'ConsultationController.uploadFile',
  'post /api/v1/consultation/:consultation/send-report': 'ConsultationController.sendReport',
  'get /api/v1/consultation/:consultation/attachment/:attachment': 'ConsultationController.attachment',
  'POST /api/v1/consultation/:consultation/patientFeedback': 'ConsultationController.patientFeedback',
  'POST /api/v1/consultation/:consultation/doctorFeedback': 'ConsultationController.doctorFeedback',
  'GET /api/v1/consultation/:consultation/invite': 'InviteController.findByConsultation',
  'POST /api/v1/login-local': 'AuthController.loginLocal',
  'POST /api/v1/forgot-password': 'AuthController.forgotPassword',
  'POST /api/v1/reset-password': 'AuthController.resetPassword',
  'GET /api/v1/login-cert': 'AuthController.loginCert',
  'POST /api/v1/login-invite': 'AuthController.loginInvite',
  'GET /api/v1/login-saml': 'AuthController.loginSaml',
  'POST /api/v1/login-sms': 'AuthController.loginSms',
  'POST /api/v1/login-2fa': 'AuthController.login2FA',
  'GET /api/v1/current-user': 'AuthController.getCurrentUser',
  'GET /api/v1/config': 'AuthController.getConfig',
  'POST /api/v1/external-auth-callback': 'AuthController.externalAuth',
  'GET /api/v1/external-auth-callback': 'AuthController.externalAuth',
  'GET /api/v1/user/ip': 'UserController.ip',
  'POST /api/v1/user/notif': 'UserController.updateNotif',

  'POST /api/v1/user/:user/allowed-queues': 'UserController.addDoctorToQueue',
  'DELETE /api/v1/user/:user/allowed-queues': 'UserController.removeDoctorFromQueue',
  'GET /api/v1/user/:user/allowed-queues': 'UserController.getDoctorQueues',
  'GET /api/v1/user/:user': 'UserController.getUser',
  'GET /api/v1/metadata': 'AuthController.metadata',
  'POST /api/v1/saml-callback': 'AuthController.samlCallback',
  'POST /api/v1/support': 'SupportController.supportRequest',
  'POST /api/v1/invite': 'InviteController.invite',
  'GET /api/v1/invite': 'PublicInviteController.find',
  'GET /api/v1/invite/:id': 'InviteController.getInvite',
  'DELETE /api/v1/invite/:id': 'PublicInviteController.destroy',
  'PATCH /api/v1/invite/:id': 'InviteController.update',
  'POST /api/v1/invite/:invite/resend': 'InviteController.resend',
  'POST /api/v1/invite/:invite/revoke': 'InviteController.revoke',
  'GET /api/v1/invite/:invite/consultation': 'InviteController.getConsultation',
  'POST /api/v1/invite/:invite/consultation/close': 'InviteController.closeConsultation',
  'GET /api/v1/invite/by-token/:invitationToken': 'InviteController.findByToken',

  'POST /api/v1/translator/accept/:translationRequestToken': 'TranslatorController.acceptRequest',
  'POST /api/v1/translator/refuse/:translationRequestToken': 'TranslatorController.refuseRequest',
  'GET /api/v1/translator/consultation': 'TranslatorController.findConsultation',

  'GET /api/v1/logout': 'AuthController.logout'

  /** *************************************************************************
  *                                                                          *
  * More custom routes here...                                               *
  * (See https://sailsjs.com/config/routes for examples.)                    *
  *                                                                          *
  * If a request to a URL doesn't match any of the routes in this file, it   *
  * is matched against "shadow routes" (e.g. blueprint routes).  If it does  *
  * not match any of those, it is matched against static assets.             *
  *                                                                          *
  ***************************************************************************/
  //

};

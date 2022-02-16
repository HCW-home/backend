/**
 * support controller
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */

module.exports = {


  async supportRequest (req, res) {

    const description =
    `
    - Version de votre navigateur: ${req.body.userAgent}
    - Votre adresse IP: ${req.ip}
    - Votre email: ${req.user.email}

    ##Description du problème rencontré:
    ${req.body.description}

    ##Quelle était votre action en cours avant l'incident ?:
    ${req.body.lastActivity}
    `

    await sails.helpers.redmine('New issue reported from support form', description, req.body.userAgent)
    console.log('support request ', req.body)
    res.json({success: true})
  }

};


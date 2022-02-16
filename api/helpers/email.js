const nodemailer = require('nodemailer');

const mailerConfig = {
  host: process.env.MAIL_SMTP_HOST,
  port: parseInt(process.env.MAIL_SMTP_PORT),
  secure: Boolean('MAIL_SMTP_SECURE' in process.env && process.env.MAIL_SMTP_SECURE === 'true'),
  auth: {}
};
if (process.env.MAIL_SMTP_USER) {
  mailerConfig.auth.user = process.env.MAIL_SMTP_USER;
}
if (process.env.MAIL_SMTP_PASSWORD) {
  mailerConfig.auth.pass = process.env.MAIL_SMTP_PASSWORD;
}
const transporter = nodemailer.createTransport(mailerConfig);
module.exports = {


  friendlyName: 'Email',

  description: 'Sends Emails.',


  inputs: {
    to: {
      type: 'string',
      required: true
    },
    subject: {
      type: 'string',

      required: true
    },
    text: {
      type: 'string',
      required: true
    },
    attachments: {
      type: 'ref'
    }

  },


  exits: {

    success: {
      description: 'All done.'
    }

  },


  // eslint-disable-next-line require-await
  async fn (inputs, exits) {


    if (process.env.NODE_ENV === 'development') {
      console.log('Email not sent because of development env', inputs);
      console.log('Sending email>', inputs.text);
      return exits.success();
    }


    const options = {
      from: process.env.MAIL_SMTP_SENDER,
      to: inputs.to,
      subject: inputs.subject,
      text: inputs.text

    };

    if (inputs.attachments) {
      options.attachments = [{
        fileName: 'Report.pdf',
        path: uploadedFiles[0].fd
      }];
    }

    transporter.sendMail(options, (error, info) => {
      if (error) {
        // ...

        sails.log('error sending email ', error);
        exits.error(error);
      } else {
        // ...
        sails.log('email send successfully ');
        exits.success();
      }

      // fs.unlinkSync(uploadedFiles[0].fd);
    });
  }


};


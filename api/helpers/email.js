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

const emailQueue = [];
let isProcessingQueue = false;

function processQueue() {
  if (isProcessingQueue) {
    return;
  }

  const task = emailQueue.shift();
  if (!task) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  transporter.sendMail(task.options, (error, info) => {
    task.callback(error, info);
    isProcessingQueue = false;
    processQueue();
  });
}

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

  async fn(inputs, exits) {
    if (process.env.NODE_ENV === 'development') {
      console.log('Email not sent because of development env', inputs);
      console.log('Sending email>', inputs.text);
      return exits.success();
    }

    const html = "<p>".concat(inputs.text.replace(/(http[s]?\:\/\/[^ ]*)/, '<a href="$1">$1</a>'));

    const emailTask = {
      options: {
        from: process.env.MAIL_SMTP_SENDER,
        to: inputs.to,
        subject: inputs.subject,
        text: inputs.text,
        html: html,
        attachments: inputs.attachments || []
      },
      callback: (error, info) => {
        if (error) {
          sails.log('error sending email ', error);
          exits.error(error);
        } else {
          sails.log('email sent successfully ');
          exits.success();
        }
      }
    };

    emailQueue.push(emailTask);
    processQueue();
  }
};

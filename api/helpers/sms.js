/**
 * Sends an SMS through the OVH SMS API.
 *
 * @param {string} phoneNumber
 * @param {string} message
 * @returns {void}
 */
function sendSmsWithOvh(phoneNumber, message) {
  phoneNumber = phoneNumber.replace(/^00/, '+');
  const ovhConfig = {
    endpoint: process.env.SMS_OVH_ENDPOINT,
    appKey: process.env.SMS_OVH_APP_KEY,
    appSecret: process.env.SMS_OVH_APP_SECRET,
    consumerKey: process.env.SMS_OVH_APP_CONSUMER_KEY,
  };
  console.log(ovhConfig);
  const ovh = require('ovh')(ovhConfig);

  console.log('Sending SMS...');

  return new Promise((resolve, reject) => {
    ovh.request('GET', '/sms', (err, serviceName) => {
      if (err) {
        console.log(err, serviceName);
        return reject(err);
      }

      // Send a simple SMS with a short number using your serviceName
      ovh.request(
        'POST',
        `/sms/${serviceName}/jobs/`,
        {
          sender: process.env.SMS_OVH_SENDER,
          message,
          senderForResponse: false,
          receivers: [phoneNumber],
        },
        (errsend, result) => {
          console.error(errsend, result);
          if (errsend) {
            return reject(errsend);
          }
          return resolve();
        }
      );
    });
  });
}

/**
 * Sends an SMS through the Swisscom REST plateform.
 *
 * @param {string} phoneNumber - The phone number to send the SMS to.
 * @param {string} message - The short message to send.
 * @returns {void}
 */
function sendSmsWithSwisscom(phoneNumber, message) {
  const https = require('https');

  sender = process.env.SMS_SWISSCOM_SENDER;
  if (sender.match(/^[0-9+ ]*$/)) {
    sourceAddrTon = 1;
  } else {
    sourceAddrTon = 5;
  }

  const payload = {
    destination_addr: phoneNumber.replace(/[^0-9\+]/g, ''),
    dest_addr_ton: 1,
    dest_addr_npi: 1,
    source_addr: process.env.SMS_SWISSCOM_SENDER,
    source_addr_ton: sourceAddrTon,
    source_addr_npi: 1,
    data_coding: 'utf8',
    short_message: message.concat(' '),
  };

  return new Promise((resolve, reject) => {
    const request = https.request(
      `https://messagingproxy.swisscom.ch:4300/rest/1.0.0/submit_sm/${process.env.SMS_SWISSCOM_ACCOUNT}`,
      {
        method: 'POST',
        auth: `${process.env.SMS_SWISSCOM_ACCOUNT}:${process.env.SMS_SWISSCOM_PASSWORD}`,
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let rawData = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          console.log('Will get raw data');
          console.log('raw data', rawData);
          try {
            const parsedData = JSON.parse(rawData);
            console.log('GOT SWISSCOM DATA', parsedData);
            if ('message_ids' in parsedData || 'message_id' in parsedData) {
              return resolve();
            }
            console.error(parsedData);
            return reject(parsedData);
          } catch (e) {
            console.error(e.message);
            return reject(e);
          }
        });
      }
    );

    try {
      request.on('error', (e) => {
        console.error('ERROR', e.message);
        return reject(e);
      });
      console.log(
        'Siss come auth header  ',
        `${process.env.SMS_SWISSCOM_ACCOUNT}:${process.env.SMS_SWISSCOM_PASSWORD}`
      );
      console.log(
        'SISSCOME URI',
        `https://messagingproxy.swisscom.ch:4300/rest/1.0.0/submit_sm/${process.env.SMS_SWISSCOM_ACCOUNT}`
      );
      console.log('SWISSCOM JSON PAYLOAD..............');
      console.log(JSON.stringify(payload));
      request.write(JSON.stringify(payload));
      request.end();
    } catch (error) {
      console.log('error write to request ', error);
      return reject(error);
    }
  });
}

/**
 * Sends an SMS Logs
 *
 * @param {string} phoneNumber
 * @param {string} message
 * @returns {void}
 */
function sendSmsWithInLog(phoneNumber, message) {
  console.log('SMS LOG - Message:', message);
  phoneNumber = phoneNumber.replace(/^00/, '+');
  console.log('SMS LOG - Phone Number:', phoneNumber);
  return new Promise((resolve) => {
    return resolve();
  });
}

/**
 * Sends an SMS through the Twillo SMS Gateway API
 *
 * @param {string} message
 * @param {string} phoneNumber
 * @returns {void}
 */

function sendSmsWithTwilio(phoneNumber, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const client = require('twilio')(accountSid, authToken);

  return new Promise((resolve, reject) => {
    client.messages
      .create({
        body: message,
        from: twilioPhoneNumber,
        to: phoneNumber,
      })
      .then((message) => {
        console.log('Twilio SMS sent:', message.sid);
        resolve(message.sid);
      })
      .catch((error) => {
        console.error('Error sending Twilio SMS:', error);
        reject(error);
      });
  });
}

/**
 * Sends an SMS through the Twillo WhatsApp API
 *
 * @param {string} message
 * @param {string} phoneNumber
 * @returns {void}
 */

function sendSmsWithTwilioWhatsapp(phoneNumber, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_WHATSAPP_PHONE_NUMBER;
  const client = require('twilio')(accountSid, authToken);

  return new Promise((resolve, reject) => {
    client.messages
      .create({
        body: message,
        from: `whatsapp:${twilioPhoneNumber}`,
        to: `whatsapp:${phoneNumber}`,
      })
      .then((message) => {
        console.log('Twilio whatsapp SMS sent:', message.sid);
        resolve(message.sid);
      })
      .catch((error) => {
        console.error('Error sending Twilio SMS:', error);
        reject(error);
      });
  });
}

/**
 * Sends an SMS through Odoo API
 *
 * @param {string} phoneNumber
 * @param {string} message
 * @param {string} senderEmail
 * @returns {void}
 */
function sendSmsWithOdoo(phoneNumber, message, senderEmail) {
  const https = require('https');

  phoneNumber = phoneNumber.replace(/^00/, '+');
  const OdooAPI = {
    appKey: process.env.ODOO_SMS_KEY,
  };
  console.log('Sending SMS...');

  const data = JSON.stringify({
    body: message,
    from: senderEmail,
    to: [phoneNumber],
  });

  const options = {
    hostname: 'https://' + process.env.ODOO_SMS_HOST,
    port: 443,
    path: '/sendsms',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-API': OdooAPI.appKey,
      host: process.env.ODOO_SMS_HOST
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {

        try {
          const parsedData = JSON.parse(rawData);
          if (parsedData?.result?.error) {
            return reject(new Error(parsedData.result.error));
          } else {
            return resolve();
          }
        } catch (e) {
          return reject(e);
        }
      });
      console.log(`statusCode: ${res.statusCode}`);
    });

    try {
      req.on('error', (e) => {
        console.error('ERROR', e.message);
        return reject(e);
      });
      req.write(data);
      req.end();
    } catch (error) {
      console.log('error write to request ', error);
      return reject(error);
    }
  });
}

/**
 * Sends an SMS through the Clickatel SMS Gateway API
 *
 * @param {string} phoneNumber
 * @param {string} message
 * @returns {void}
 */
function sendSmsWithClickatel(phoneNumber, message) {
  const https = require('https');

  phoneNumber = phoneNumber.replace(/^00/, '+');
  const clickATel = {
    appKey: process.env.SMS_CLICKATEL,
  };
  console.log(clickATel);
  console.log('Sending SMS...');

  const data = JSON.stringify({
    content: message,
    to: [phoneNumber],
  });

  const options = {
    hostname: 'platform.clickatell.com',
    port: 443,
    path: '/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: clickATel.appKey,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        console.log('Will get raw data');
        console.log('raw data', rawData);
        try {
          const parsedData = JSON.parse(rawData);
          console.log('GOT CLICKATEL DATA', parsedData);
          if (parsedData.messages[0]?.accepted) {
            return resolve();
          }
          console.error(parsedData);
          return reject(parsedData);
        } catch (e) {
          console.error(e.message);
          return reject(e);
        }
      });
      console.log(`statusCode: ${res.statusCode}`);
    });

    try {
      req.on('error', (e) => {
        console.error('ERROR', e.message);
        return reject(e);
      });
      req.write(data);
      req.end();
    } catch (error) {
      console.log('error write to request ', error);
      return reject(error);
    }
  });
}

/**
 * Sends an SMS through the Clickatel SMS New API
 *
 * @param {string} phoneNumber
 * @param {string} message
 * @returns {void}
 */
function sendSmsWithClickatelAPI(phoneNumber, message) {
  const https = require('https');

  phoneNumber = phoneNumber.replace(/^00/, '');
  const clickATel = {
    appKey: process.env.SMS_CLICKATEL_API,
  };
  console.log(clickATel);
  console.log('Sending SMS...');

  const data = JSON.stringify({
    text: message,
    to: [phoneNumber],
  });

  const options = {
    hostname: 'api.clickatell.com',
    port: 443,
    path: '/rest/message',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'bearer ' + clickATel.appKey,
      'X-Version': 1,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        console.log('Will get raw data');
        console.log('raw data', rawData);
        try {
          const parsedData = JSON.parse(rawData);
          console.log('GOT CLICKATEL DATA', parsedData);
          if (parsedData.data.message[0]?.accepted) {
            return resolve();
          }
          console.error(parsedData);
          return reject(parsedData);
        } catch (e) {
          console.error(e.message);
          return reject(e);
        }
      });
      console.log(`statusCode: ${res.statusCode}`);
    });

    try {
      req.on('error', (e) => {
        console.error('ERROR', e.message);
        return reject(e);
      });
      req.write(data);
      req.end();
    } catch (error) {
      console.log('error write to request ', error);
      return reject(error);
    }
  });
}

module.exports = {
  friendlyName: 'SMS',
  description: 'Send SMS.',
  inputs: {
    phoneNumber: {
      type: 'string',
      required: true,
    },
    message: {
      type: 'string',
      required: true,
    },
    senderEmail: {
      type: 'string',
      required: false,
    },
    whatsApp: {
      type: 'boolean',
      required: false,
    },
  },
  exits: {
    success: {
      description: 'All done.',
    },
  },

  async fn(inputs, exits) {
    try {
      const { message, phoneNumber, senderEmail, whatsApp } = inputs;

      if (process.env.NODE_ENV === "development") {
        await sendSmsWithInLog(phoneNumber, message);
        return exits.success();
      }

      if (whatsApp) {
        sendSmsWithTwilioWhatsapp(phoneNumber, message);
        return exits.success();
      } else {
        const providers = await SmsProvider.find({
          where: { isDisabled: false, isWhatsapp: false },
          sort: 'order ASC'
        });

        for (const provider of providers) {
          try {
            console.log(`Sending an SMS to ${phoneNumber} through ${provider.provider}`);

            switch (provider.provider) {
              case 'TWILIO':
                await sendSmsWithTwilio(phoneNumber, message);
                break;
              case 'OVH':
                await sendSmsWithOvh(phoneNumber, message);
                break;
              case 'SWISSCOM':
                await sendSmsWithSwisscom(phoneNumber, message);
                break;
              case 'CLICKATEL':
                await sendSmsWithClickatel(phoneNumber, message);
                break;
              case 'CLICKATEL_API':
                await sendSmsWithClickatelAPI(phoneNumber, message);
                break;
              case 'ODOO_SMS':
                try {
                  await sendSmsWithOdoo(phoneNumber, message, senderEmail);
                } catch (odooError) {
                  console.error(`Failed to send SMS through Odoo:`, odooError.message);
                  return exits.error(new Error(odooError.message));
                }
                break;
              default:
                console.error(`Provider ${provider.provider} not recognized`);
                continue;
            }

            return exits.success();
          } catch (error) {
            console.error(`Failed to send SMS through ${provider.provider}:`, error);
          }
        }

      }
      console.error(
        'No SMS provider succeeded or phone number not whitelisted'
      );
      exits.error(new Error('SMS sending failed'));
    } catch (error) {
      exits.error(error);
    }
  },
};

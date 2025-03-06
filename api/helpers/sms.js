const https = require('https');

function sendSmsWithOvh(phoneNumber, message) {
  phoneNumber = phoneNumber.replace(/^00/, '+');
  const ovhConfig = {
    endpoint: process.env.SMS_OVH_ENDPOINT,
    appKey: process.env.SMS_OVH_APP_KEY,
    appSecret: process.env.SMS_OVH_APP_SECRET,
    consumerKey: process.env.SMS_OVH_APP_CONSUMER_KEY,
  };

  sails.config.customLogger.log('verbose', `OVH config loaded endpoint ${ovhConfig.endpoint}`, null, 'message', null);

  const ovh = require('ovh')(ovhConfig);

  sails.config.customLogger.log('info', 'Sending SMS via provider OVH', null, 'server-action', null);

  return new Promise((resolve, reject) => {
    ovh.request('GET', '/sms', (err, serviceName) => {
      if (err) {
        sails.config.customLogger.log('error', 'OVH SMS API error retrieving service name', { error: err?.message || err }, 'server-action');
        return reject(err);
      }
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
          sails.config.customLogger.log('verbose', 'OVH SMS API response', { result }, 'message');
          if (errsend) {
            sails.config.customLogger.log('error', 'OVH SMS API error sending SMS', { error: errsend.message }, 'server-action');
            return reject(errsend);
          }
          sails.config.customLogger.log('info', 'SMS sent via provider OVH', null, 'server-action');
          return resolve();
        }
      );
    });
  });
}

function sendSmsWithSwisscom(phoneNumber, message) {
  let sender = process.env.SMS_SWISSCOM_SENDER;
  let sourceAddrTon = sender.match(/^[0-9+ ]*$/) ? 1 : 5;

  const payload = {
    destination_addr: phoneNumber.replace(/[^0-9\+]/g, ''),
    dest_addr_ton: 1,
    dest_addr_npi: 1,
    source_addr: sender,
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
          sails.config.customLogger.log('verbose', 'Swisscom response raw data', { rawData }, 'message', null);
          try {
            const parsedData = JSON.parse(rawData);
            if ('message_ids' in parsedData || 'message_id' in parsedData) {
              sails.config.customLogger.log('info', 'SMS sent via provider Swisscom', null, 'server-action', null);
              return resolve();
            }
            sails.config.customLogger.log('error', `Swisscom SMS response indicates failure response ${parsedData}`, null, 'message', null);
            return reject(parsedData);
          } catch (e) {
            sails.config.customLogger.log('error', 'Error parsing Swisscom response', { error: e?.message || e }, 'server-action', null);
            return reject(e);
          }
        });
      }
    );

    try {
      request.on('error', (e) => {
        sails.config.customLogger.log('error', 'Swisscom SMS request error', { error: e?.message || e }, 'server-action', null);
        return reject(e);
      });
      sails.config.customLogger.log('info', 'Sending SMS via provider Swisscom', null, 'server-action', null);
      request.write(JSON.stringify(payload));
      request.end();
    } catch (error) {
      sails.config.customLogger.log('error', 'Error writing Swisscom request', { error: error.message }, 'server-action', null);
      return reject(error);
    }
  });
}

function sendSmsWithInLog(phoneNumber, message) {
  sails.config.customLogger.log('info', 'SMS LOG - Message sent via LOG', null, 'message', null);
  return new Promise((resolve) => resolve());
}

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
      .then((msg) => {
        sails.config.customLogger.log('info', `Twilio SMS sent messageSid is ${msg.sid} `, null, 'server-action',null);
        resolve(msg.sid);
      })
      .catch((error) => {
        sails.config.customLogger.log('error', 'Error sending Twilio SMS', { error: error.message }, 'server-action', null);
        reject(error);
      });
  });
}

async function sendSmsWithTwilioWhatsapp(phoneNumber, message, contentSid, contentVariables, statusCallback) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_WHATSAPP_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioPhoneNumber) {
    throw new Error('Twilio environment variables are not properly configured.');
  }

  const client = require('twilio')(accountSid, authToken);

  try {
    const payload = {
      from: `whatsapp:${twilioPhoneNumber}`,
      to: `whatsapp:${phoneNumber}`,
    };

    if (contentSid) {
      payload.contentSid = contentSid;
    }
    if (statusCallback) {
      payload.statusCallback = statusCallback;
    }
    if (contentVariables) {
      payload.contentVariables = JSON.stringify(contentVariables);
    }

    sails.config.customLogger.log('info', 'Sending TWILIO_WHATSAPP message', null, 'message', null);
    const messageResponse = await client.messages.create(payload);
    sails.config.customLogger.log('info', `TWILIO_WHATSAPP message sent messageSid is ${messageResponse.sid}`, null, 'server-action', null);
    return messageResponse.sid;
  } catch (error) {
    sails.config.customLogger.log('error', 'Error sending TWILIO_WHATSAPP message', { error: error.message }, 'server-action', null);
    throw error;
  }
}

function sendSmsWithOdoo(phoneNumber, message, senderEmail) {
  phoneNumber = phoneNumber.replace(/^00/, '+');
  const OdooAPI = {
    appKey: process.env.ODOO_SMS_KEY,
  };
  sails.config.customLogger.log('info', 'Sending SMS via ODOO_SMS', null, 'message', null);

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
      host: process.env.ODOO_SMS_HOST,
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
            sails.config.customLogger.log('error', 'Odoo SMS API error', { error: parsedData.result.error }, 'server-action', null);
            return reject(new Error(parsedData.result.error));
          } else {
            sails.config.customLogger.log('info', 'SMS sent via ODOO_SMS', null, 'server-action', null);
            return resolve();
          }
        } catch (e) {
          sails.config.customLogger.log('error', 'Error parsing ODOO_SMS API response', { error: e?.message || e }, 'server-action', null);
          return reject(e);
        }
      });
      sails.config.customLogger.log('verbose', `ODOO_SMS API response status code ${res.statusCode}`, null, 'message', null);
    });

    try {
      req.on('error', (e) => {
        sails.config.customLogger.log('error', 'ODOO_SMS API request error', { error: e.message }, 'server-action', null);
        return reject(e);
      });
      sails.config.customLogger.log('info', 'Sending SMS via ODOO_SMS', null, 'message', null);
      req.write(data);
      req.end();
    } catch (error) {
      sails.config.customLogger.log('error', 'Error writing to ODOO_SMS API request', { error: error?.message || error }, 'server-action', null);
      return reject(error);
    }
  });
}

function sendSmsWithClickatel(phoneNumber, message) {
  phoneNumber = phoneNumber.replace(/^00/, '+');
  const clickATel = {
    appKey: process.env.SMS_CLICKATEL,
  };
  sails.config.customLogger.log('verbose', 'CLICKATEL config loaded', null, 'message', null);
  sails.config.customLogger.log('info', 'Sending SMS via CLICKATEL', null, 'server-action', null);

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
        sails.config.customLogger.log('verbose', `CLICKATEL raw response data ${rawData}`, null, 'message', null);
        try {
          const parsedData = JSON.parse(rawData);
          if (parsedData?.messages?.[0]?.accepted) {
            sails.config.customLogger.log('info', 'SMS sent via CLICKATEL', null, 'message', null);
            return resolve();
          }
          sails.config.customLogger.log('error', 'CLICKATEL SMS API error', { response: parsedData }, 'message', null);
          return reject(parsedData);
        } catch (e) {
          sails.config.customLogger.log('error', 'Error parsing CLICKATEL SMS API response', { error: e?.message || e }, 'server-action', null);
          return reject(e);
        }
      });
      sails.config.customLogger.log('verbose', `CLICKATEL SMS API response status code ${res?.statusCode}`, null, 'message', null);
    });

    try {
      req.on('error', (e) => {
        sails.config.customLogger.log('error', 'CLICKATEL SMS API request error', { error: e?.message || e }, 'server-action', null);
        return reject(e);
      });
      sails.config.customLogger.log('info', 'Sending SMS via CLICKATEL', null, 'message', null);
      req.write(data);
      req.end();
    } catch (error) {
      sails.config.customLogger.log('error', 'Error writing to CLICKATEL SMS API request', { error: error?.message || error }, 'server-action', null);
      return reject(error);
    }
  });
}

function sendSmsWithClickatelAPI(phoneNumber, message) {
  phoneNumber = phoneNumber.replace(/^00/, '');
  const clickATel = {
    appKey: process.env.SMS_CLICKATEL_API,
  };
  sails.config.customLogger.log('verbose', 'CLICKATEL_API config loaded', null, 'message', null);
  sails.config.customLogger.log('info', 'Sending SMS via CLICKATEL_API', null, 'message', null);

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
        sails.config.customLogger.log('verbose', `CLICKATEL_API raw response ${rawData}`, null, 'message', null);
        try {
          const parsedData = JSON.parse(rawData);
          if (parsedData.data?.message?.[0]?.accepted || parsedData.data?.messages?.[0]?.accepted) {
            sails.config.customLogger.log('info', 'SMS sent via CLICKATEL_API', null, 'server-action', null);
            return resolve();
          }
          sails.config.customLogger.log('error', 'CLICKATEL_API SMS error', { response: parsedData }, 'server-action', null);
          return reject(parsedData);
        } catch (e) {
          sails.config.customLogger.log('error', 'Error parsing CLICKATEL_API response', { error: e.message }, 'message', null);
          return reject(e);
        }
      });
      sails.config.customLogger.log('verbose', `CLICKATEL_API SMS response status code ${res.statusCode}`, null, 'message', null);
    });

    try {
      req.on('error', (e) => {
        sails.config.customLogger.log('error', 'CLICKATEL_API request error', { error: e.message }, 'server-action', null);
        return reject(e);
      });
      sails.config.customLogger.log('info', 'Sending SMS via CLICKATEL_API', null, 'message', null);
      req.write(data);
      req.end();
    } catch (error) {
      sails.config.customLogger.log('error', 'Error writing to CLICKATEL_API request', { error: error?.message || error }, 'server-action', null);
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
    params: {
      type: {},
      required: false,
    },
    twilioTemplatedId: {
      type: 'string',
      required: false,
    },
    statusCallback: {
      type: 'string',
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
      const { message, phoneNumber, senderEmail, whatsApp, twilioTemplatedId, params, statusCallback } = inputs || {};

      if (process.env.NODE_ENV === 'development') {
        await sendSmsWithInLog(phoneNumber, message);
        return exits.success();
      }

      if (whatsApp) {
        const result = await sendSmsWithTwilioWhatsapp(phoneNumber, message, twilioTemplatedId, params, statusCallback);
        return exits.success(result);
      } else {
        const providers = await SmsProvider.find({
          where: { isDisabled: false, isWhatsapp: false },
          sort: 'order ASC'
        });

        for (const provider of providers) {
          const prefixes = provider.prefix?.split(',');
          const matchesPrefix = prefixes?.some((prefix) =>
            prefix === '*' || (phoneNumber && phoneNumber.startsWith(prefix))
          );

          if (!matchesPrefix) {
            sails.config.customLogger.log('info', `Skipping provider ${provider.provider} - no matching prefix.`, { provider: provider.provider }, 'message');
            continue;
          }

          const excludedPrefixes = prefixes?.filter(prefix => prefix.startsWith('!'));
          const isExcluded = excludedPrefixes?.some(excludedPrefix =>
            phoneNumber && phoneNumber.startsWith(excludedPrefix.substring(1))
          );

          if (isExcluded) {
            sails.config.customLogger.log('info', `Skipping provider ${provider.provider} - phone number matches excluded prefix.`, { provider: provider.provider }, 'message');
            continue;
          }

          try {
            sails.config.customLogger.log('info', `Attempting to send SMS through ${provider.provider}`, { provider: provider.provider }, 'message');
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
                  sails.config.customLogger.log('error', 'Failed to send SMS through Odoo', { error: odooError.message }, 'server-action');
                  return exits.error(new Error(odooError.message));
                }
                break;
              default:
                sails.config.customLogger.log('error', `Provider ${provider.provider} not recognized`, { provider: provider.provider }, 'server-action');
                continue;
            }
            sails.config.customLogger.log('info', `SMS sent via ${provider.provider}`, { provider: provider.provider }, 'server-action');
            return exits.success();
          } catch (error) {
            sails.config.customLogger.log('error', `Failed to send SMS through ${provider.provider}`, {
              provider: provider.provider,
              error: error?.message || error
            },
              'server-action'
            );
          }
        }
      }
      sails.config.customLogger.log('error', 'No SMS provider succeeded or phone number not whitelisted', null, 'message');
      return exits.error(new Error('SMS sending failed'));
    } catch (error) {
      sails.config.customLogger.log('error', 'Unexpected error in SMS action', { error: error?.message || error }, 'server-action');
      return exits.error(error);
    }
  },
};

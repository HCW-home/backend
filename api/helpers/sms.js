const https = require('https');

function sendSmsWithOvh(phoneNumber, message) {
  phoneNumber = phoneNumber.replace(/^00/, '+');
  const ovhConfig = {
    endpoint: process.env.SMS_OVH_ENDPOINT,
    appKey: process.env.SMS_OVH_APP_KEY,
    appSecret: process.env.SMS_OVH_APP_SECRET,
    consumerKey: process.env.SMS_OVH_APP_CONSUMER_KEY,
  };

  sails.config.customLogger.log('verbose', 'OVH config loaded', { endpoint: ovhConfig.endpoint });

  const ovh = require('ovh')(ovhConfig);

  sails.config.customLogger.log('info', 'Sending SMS via OVH', { provider: 'OVH' });

  return new Promise((resolve, reject) => {
    ovh.request('GET', '/sms', (err, serviceName) => {
      if (err) {
        sails.config.customLogger.log('error', 'OVH SMS API error retrieving service name', { error: err.message });
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
          sails.config.customLogger.log('verbose', 'OVH SMS API response', { result });
          if (errsend) {
            sails.config.customLogger.log('error', 'OVH SMS API error sending SMS', { error: errsend.message });
            return reject(errsend);
          }
          sails.config.customLogger.log('info', 'SMS sent via OVH', { provider: 'OVH' });
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
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          sails.config.customLogger.log('verbose', 'Swisscom response raw data', { rawData });
          try {
            const parsedData = JSON.parse(rawData);
            if ('message_ids' in parsedData || 'message_id' in parsedData) {
              sails.config.customLogger.log('info', 'SMS sent via Swisscom', { provider: 'SWISSCOM' });
              return resolve();
            }
            sails.config.customLogger.log('error', 'Swisscom SMS response indicates failure', { response: parsedData });
            return reject(parsedData);
          } catch (e) {
            sails.config.customLogger.log('error', 'Error parsing Swisscom response', { error: e?.message || e});
            return reject(e);
          }
        });
      }
    );

    try {
      request.on('error', (e) => {
        sails.config.customLogger.log('error', 'Swisscom SMS request error', { error: e?.message || e });
        return reject(e);
      });
      sails.config.customLogger.log('info', 'Sending SMS via Swisscom', { provider: 'SWISSCOM' });
      request.write(JSON.stringify(payload));
      request.end();
    } catch (error) {
      sails.config.customLogger.log('error', 'Error writing Swisscom request', { error: error.message });
      return reject(error);
    }
  });
}

function sendSmsWithInLog(phoneNumber, message) {
  sails.config.customLogger.log('info', 'SMS LOG - Message sent via LOG', { provider: 'LOG' });
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
        sails.config.customLogger.log('info', 'Twilio SMS sent', { provider: 'TWILIO', messageSid: msg.sid });
        resolve(msg.sid);
      })
      .catch((error) => {
        sails.config.customLogger.log('error', 'Error sending Twilio SMS', { provider: 'TWILIO', error: error.message });
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

    sails.config.customLogger.log('info', 'Sending Twilio WhatsApp message', { provider: 'TWILIO_WHATSAPP' });
    const messageResponse = await client.messages.create(payload);
    sails.config.customLogger.log('info', 'Twilio WhatsApp message sent', { provider: 'TWILIO_WHATSAPP', messageSid: messageResponse.sid });
    return messageResponse.sid;
  } catch (error) {
    sails.config.customLogger.log('error', 'Error sending Twilio WhatsApp message', { provider: 'TWILIO_WHATSAPP', error: error.message });
    throw error;
  }
}

function sendSmsWithOdoo(phoneNumber, message, senderEmail) {
  phoneNumber = phoneNumber.replace(/^00/, '+');
  const OdooAPI = {
    appKey: process.env.ODOO_SMS_KEY,
  };
  sails.config.customLogger.log('info', 'Sending SMS via Odoo', { provider: 'ODOO_SMS' });

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
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(rawData);
          if (parsedData?.result?.error) {
            sails.config.customLogger.log('error', 'Odoo SMS API error', { error: parsedData.result.error });
            return reject(new Error(parsedData.result.error));
          } else {
            sails.config.customLogger.log('info', 'SMS sent via Odoo', { provider: 'ODOO_SMS' });
            return resolve();
          }
        } catch (e) {
          sails.config.customLogger.log('error', 'Error parsing Odoo SMS API response', { error: e.message });
          return reject(e);
        }
      });
      sails.config.customLogger.log('verbose', 'Odoo SMS API response status code', { statusCode: res.statusCode });
    });

    try {
      req.on('error', (e) => {
        sails.config.customLogger.log('error', 'Odoo SMS API request error', { error: e.message });
        return reject(e);
      });
      sails.config.customLogger.log('info', 'Sending SMS via Odoo', { provider: 'ODOO_SMS' });
      req.write(data);
      req.end();
    } catch (error) {
      sails.config.customLogger.log('error', 'Error writing to Odoo SMS API request', { error: error.message });
      return reject(error);
    }
  });
}

function sendSmsWithClickatel(phoneNumber, message) {
  phoneNumber = phoneNumber.replace(/^00/, '+');
  const clickATel = {
    appKey: process.env.SMS_CLICKATEL,
  };
  sails.config.customLogger.log('verbose', 'Clickatell config loaded', { provider: 'CLICKATEL' });
  sails.config.customLogger.log('info', 'Sending SMS via Clickatell', { provider: 'CLICKATEL' });

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
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        sails.config.customLogger.log('verbose', 'Clickatell raw response data', { rawData });
        try {
          const parsedData = JSON.parse(rawData);
          if (parsedData.messages[0]?.accepted) {
            sails.config.customLogger.log('info', 'SMS sent via Clickatell', { provider: 'CLICKATEL' });
            return resolve();
          }
          sails.config.customLogger.log('error', 'Clickatell SMS API error', { response: parsedData });
          return reject(parsedData);
        } catch (e) {
          sails.config.customLogger.log('error', 'Error parsing Clickatell SMS API response', { error: e.message });
          return reject(e);
        }
      });
      sails.config.customLogger.log('verbose', 'Clickatell SMS API response status code', { statusCode: res.statusCode });
    });

    try {
      req.on('error', (e) => {
        sails.config.customLogger.log('error', 'Clickatell SMS API request error', { error: e.message });
        return reject(e);
      });
      sails.config.customLogger.log('info', 'Sending SMS via Clickatell', { provider: 'CLICKATEL' });
      req.write(data);
      req.end();
    } catch (error) {
      sails.config.customLogger.log('error', 'Error writing to Clickatell SMS API request', { error: error.message });
      return reject(error);
    }
  });
}

function sendSmsWithClickatelAPI(phoneNumber, message) {
  phoneNumber = phoneNumber.replace(/^00/, '');
  const clickATel = {
    appKey: process.env.SMS_CLICKATEL_API,
  };
  sails.config.customLogger.log('verbose', 'Clickatell API config loaded', { provider: 'CLICKATEL_API' });
  sails.config.customLogger.log('info', 'Sending SMS via Clickatell API', { provider: 'CLICKATEL_API' });

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
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        sails.config.customLogger.log('verbose', 'Clickatell API raw response', { rawData });
        try {
          const parsedData = JSON.parse(rawData);
          if (parsedData.data.message[0]?.accepted) {
            sails.config.customLogger.log('info', 'SMS sent via Clickatell API', { provider: 'CLICKATEL_API' });
            return resolve();
          }
          sails.config.customLogger.log('error', 'Clickatell API SMS error', { response: parsedData });
          return reject(parsedData);
        } catch (e) {
          sails.config.customLogger.log('error', 'Error parsing Clickatell API response', { error: e.message });
          return reject(e);
        }
      });
      sails.config.customLogger.log('verbose', 'Clickatell API SMS response status code', { statusCode: res.statusCode });
    });

    try {
      req.on('error', (e) => {
        sails.config.customLogger.log('error', 'Clickatell API request error', { error: e.message });
        return reject(e);
      });
      sails.config.customLogger.log('info', 'Sending SMS via Clickatell API', { provider: 'CLICKATEL_API' });
      req.write(data);
      req.end();
    } catch (error) {
      sails.config.customLogger.log('error', 'Error writing to Clickatell API request', { error: error.message });
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

      if (process.env.NODE_ENV === "development") {
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
          const prefixes = provider.prefix?.split(",");
          const matchesPrefix = prefixes?.some((prefix) =>
            prefix === "*" || (phoneNumber && phoneNumber.startsWith(prefix))
          );

          if (!matchesPrefix) {
            sails.config.customLogger.log('info', `Skipping provider ${provider.provider} - no matching prefix.`, { provider: provider.provider });
            continue;
          }

          const excludedPrefixes = prefixes?.filter(prefix => prefix.startsWith("!"));
          const isExcluded = excludedPrefixes?.some(excludedPrefix =>
            phoneNumber && phoneNumber.startsWith(excludedPrefix.substring(1))
          );

          if (isExcluded) {
            sails.config.customLogger.log('info', `Skipping provider ${provider.provider} - phone number matches excluded prefix.`, { provider: provider.provider });
            continue;
          }

          try {
            sails.config.customLogger.log('info', `Attempting to send SMS through ${provider.provider}`, { provider: provider.provider });
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
                  sails.config.customLogger.log('error', 'Failed to send SMS through Odoo', { error: odooError.message });
                  return exits.error(new Error(odooError.message));
                }
                break;
              default:
                sails.config.customLogger.log('error', `Provider ${provider.provider} not recognized`, { provider: provider.provider });
                continue;
            }
            sails.config.customLogger.log('info', `SMS sent via ${provider.provider}`, { provider: provider.provider });
            return exits.success();
          } catch (error) {
            sails.config.customLogger.log('error', `Failed to send SMS through ${provider.provider}`, { provider: provider.provider, error: error?.message || error });
          }
        }
      }
      sails.config.customLogger.log('error', 'No SMS provider succeeded or phone number not whitelisted');
      return exits.error(new Error('SMS sending failed'));
    } catch (error) {
      sails.config.customLogger.log('error', 'Unexpected error in SMS action', { error: error?.message || error });
      return exits.error(error);
    }
  },
};

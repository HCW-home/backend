const axios = require('axios');
const FETCH_TIMEOUT = 3000;
const fallbackMediasoup = {
  url: process.env.MEDIASOUP_URL,
  password: process.env.MEDIASOUP_SECRET,
  username: process.env.MEDIASOUP_USER
};
module.exports = {
  friendlyName: 'Get mediasoup servers',
  description: '',
  inputs: {},
  exits: {
    success: {
      outputFriendlyName: 'Mediasoup servers',
    },
  },


  fn: async function(inputs, exits) {
    const allServers = await MediasoupServer.find();
    const servers = allServers.filter(server =>
      server.active === true || !server.hasOwnProperty('active')
    );

    sails.config.customLogger.log('verbose',  'servers', servers, 'server-action');

    try {
      const serversStatues = await Promise.all(servers.map(async server => {
        try {
          await timeoutPromise(FETCH_TIMEOUT, getRoomsCount(server));
          return server;
        } catch (error) {
          sails.config.customLogger.log('error', `Server ${server.url} is Not reachable`, error, 'server-action');
          return Promise.resolve({ reachable: false });
        }
      }));

      const availableServers = serversStatues.filter(server => {
        return (server.activeSessions < server.maxNumberOfSessions) && server.reachable;
      });

      sails.config.customLogger.log('verbose', `AVAILABLE SERVERS:: ${JSON.stringify(availableServers)}`, 'message');

      if (!availableServers.length) {
        sails.config.customLogger.log(
          'info',
          'NO AVAILABLE SERVER USING FALLBACK ' + fallbackMediasoup.url,
          null,
          'server-action'
        );
        return exits.success([fallbackMediasoup]);
      }

      exits.success(availableServers);
    } catch (error) {
      sails.config.customLogger.log(
        'error',
        'Error with getting Mediasoup server',
        error,
        'server-action',
      );
    }
  }


};

function timeoutPromise(ms, promise) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('promise timeout'));
    }, ms);
    promise.then(
      (res) => {
        clearTimeout(timeoutId);
        resolve(res);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
}


async function getRoomsCount(server) {
  const response = await axios.get(
    server.url + '/rooms-count',
    {
      headers: {
        'Content-Type': 'application/json'
      },
      auth: {
        username: server.username,
        password: server.password
      }
    }
  );

  server.activeSessions = response.data.count;
  server.reachable = true;
}

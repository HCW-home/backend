
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


  inputs: {

  },


  exits: {

    success: {
      outputFriendlyName: 'Mediasoup servers',
    },

  },


  fn: async function (inputs, exits) {

    const servers = await MediasoupServer.find();

    try {
      const serversStatues = await Promise.all(servers.map(async server => {

        try {


          await timeoutPromise(FETCH_TIMEOUT, getRoomsCount(server));

          return server;

        } catch (error) {
          console.log(error);
          console.log('Server ', server.url, ' is Not reachable');
          return Promise.resolve({ reachable: false });
        }

      }));




      const availableServers = serversStatues.filter(server => {
        return (server.activeSessions < server.maxNumberOfSessions) && server.reachable;
      });

      console.log('AVAILABLE SERVERS:: ', JSON.stringify(availableServers));
      if (!availableServers.length) {
        return exits.success([fallbackMediasoup]);
      }

      exits.success(availableServers);
    }catch(error){
      console.log('Error with getting Mediasoup server ', error);

    }
  }


};

function timeoutPromise (ms, promise) {
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


async function getRoomsCount(server){
  const response = await axios.get(
    server.url+'/rooms-count',
    {
      headers: {
        'Content-Type': 'application/json'
      },
      auth:{
        username: server.username,
        password: server.password
      }
    }
  );

  server.activeSessions = response.data.count
  server.reachable = true;
  return
}

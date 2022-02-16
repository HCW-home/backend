const {
  OpenVidu
} = require('openvidu-node-client');
const FETCH_TIMEOUT = 3000;

const fallbackOpenvidu = {
  url: sails.config.OPENVIDU_URL,
  password: sails.config.OPENVIDU_SECRET
};


module.exports = {


  friendlyName: 'Openvidu server',


  description: '',


  inputs: {

  },


  exits: {

    success: {
      description: 'All done.'
    }

  },


  async fn (inputs, exits) {
    // TODO

    const servers = await OpenviduServer.find();

    try {
      const serversStatues = await Promise.all(servers.map(async server => {
        const start = Date.now();
        try {

          const openvidu = new OpenVidu(server.url, server.password);
          console.log('getting server info ', server.url);
          await timeoutPromise(FETCH_TIMEOUT, openvidu.fetch());
          console.log('got server info ', server.url, Date.now() - start);

          server.activeSessions = openvidu.activeSessions.length;
          server.reachable = true;
          return server;

        } catch (error) {
          console.log(error);
          console.log('Server ', server.url, ' is Not reachable', Date.now() - start);
          return Promise.resolve({ reachable: false });
        }

      }));




      const availableServers = serversStatues.filter(server => {
        return (server.activeSessions < server.maxNumberOfSessions) && server.reachable;
      });

      console.log('AVAILABLE SERVERS:: ', JSON.stringify(availableServers));
      if (!availableServers.length) {
        return exits.success([fallbackOpenvidu]);
      }

      exits.success(availableServers);
    } catch (error) {
      console.log('Error with getting openvidu server ', error);
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

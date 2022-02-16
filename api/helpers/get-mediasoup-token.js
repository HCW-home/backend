const axios = require('axios');
var Buffer = require('buffer/').Buffer
module.exports = {


  friendlyName: 'Get mediasoup token',


  description: '',


  inputs: {
    peerId: {
      type: 'string',
      required: true
    },
    roomId: {
      type: 'string',

      required: true
    },
    server: {
      type: {},
      required: true
    }
  },


  exits: {

    success: {
      outputFriendlyName: 'Mediasoup token',
    },

  },


  fn: async function (inputs, exists) {



    const response = await axios.post(
      inputs.server.url+'/session',
      {
        roomId:inputs.roomId,
        peerId: inputs.peerId
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        auth:{
          username: inputs.server.username,
          password: inputs.server.password
        }
      }
    );

    return inputs.server.url.replace(/^.+?\:/,'wss:') + `?token=${response.data.token}`

  }


};


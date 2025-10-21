module.exports = {
  requiredTemplates: [
    {
      key: "patient invite",
      category: "UTILITY",
      contentType: 'twilio/call-to-action',
      actions: [
        {
          title: "join",
          // url: `https://hcw-athome.dev.oniabsis.com/inv/?invite={{2}}`,
          url: `${process.env.PUBLIC_URL}/inv/?invite={{2}}`,
          type: "URL"
        }
      ],
      variables: {
        1: process.env.BRANDING,
        2: '4de79ed9f310f959cfeb283d99756248872637a1'
      },
    },
    {
      key: "guest invite",
      category: "UTILITY",
      contentType: 'twilio/call-to-action',
      actions: [
        {
          title: "join",
          // url: `https://hcw-athome.dev.oniabsis.com/inv/?invite={{2}}`,
          url: `${process.env.PUBLIC_URL}/inv/?invite={{2}}`,
          type: "URL"
        }
      ],
      variables: {
        1: process.env.BRANDING,
        2: '4de79ed9f310f959cfeb283d99756248872637a1'
      },
    },
    {
      key: "scheduled patient invite",
      category: "UTILITY",
      contentType: 'twilio/call-to-action',
      actions: [
        {
          title: "acknowledge invite",
          // url: `https://hcw-athome.dev.oniabsis.com/acknowledge-invite/{{3}}`,
          url: `${process.env.PUBLIC_URL}/acknowledge-invite/{{3}}`,
          type: "URL"
        }
      ],
      variables: {
        1: process.env.BRANDING,
        2: '31 January 16:00 Europe/Paris',
        3: '4de79ed9f310f959cfeb283d99756248872637a1'
      },
    },
    {
      key: "scheduled guest invite",
      category: "UTILITY",
      contentType: 'twilio/call-to-action',
      actions: [
        {
          title: "join",
          // url: `https://hcw-athome.dev.oniabsis.com/inv/?invite={{3}}`,
          url: `${process.env.PUBLIC_URL}/inv/?invite={{3}}`,
          type: "URL"
        }
      ],
      variables: {
        1: process.env.BRANDING,
        2: '31 January 16:00 Europe/Paris',
        3: '4de79ed9f310f959cfeb283d99756248872637a1'
      },
    },
    {
      key: "first invite reminder",
      category: "UTILITY",
      contentType: 'twilio/text',
      variables: {
        1: process.env.BRANDING,
        2: '5 minutes',
        3: '23 January 15:13 Europe/Paris'
      },
    },
    {
      key: "notification for offline action text for doctor",
      category: "UTILITY",
      contentType: 'twilio/call-to-action',
      actions: [
        {
          title: "visit",
          // url: `https://hcw-athome.dev.oniabsis.com/app/consultation/{{1}}`,
          url: `${process.env.DOCTOR_URL}/app/consultation/{{1}}`,
          type: "URL"
        }
      ],
      variables: {
        1: '68653202db1941a1f85e9497',
      },
    },
    {
      key: "first guest invite reminder",
      category: "UTILITY",
      contentType: 'twilio/text',
      variables: {
        1: process.env.BRANDING,
        2: '5 minutes',
        3: '23 January 15:13 Europe/Paris'
      },
    },
    {
      key: "second invite reminder",
      category: "UTILITY",
      contentType: 'twilio/call-to-action',
      actions: [
        {
          title: "join",
          // url: `https://hcw-athome.dev.oniabsis.com/inv/?invite={{2}}`,
          url: `${process.env.PUBLIC_URL}/inv/?invite={{2}}`,
          type: "URL"
        }
      ],
      variables: {
        1: '5 minutes',
        2: '4de79ed9f310f959cfeb283d99756248872637a1'
      },
    },
    {
      key: "second guest invite reminder",
      category: "UTILITY",
      contentType: 'twilio/call-to-action',
      actions: [
        {
          title: "join",
          // url: `https://hcw-athome.dev.oniabsis.com/inv/?invite={{2}}`,
          url: `${process.env.PUBLIC_URL}/inv/?invite={{2}}`,
          type: "URL"
        }
      ],
      variables: {
        1: '5 minutes',
        2: '4de79ed9f310f959cfeb283d99756248872637a1'
      },
    },
    {
      key: "patient is ready",
      category: "UTILITY",
      contentType: 'twilio/call-to-action',
      actions: [
        {
          title: "visit",
          // url: `https://hcw-athome.dev.oniabsis.com/app/consultation/{{1}}`,
          url: `${process.env.DOCTOR_URL}/app/consultation/{{1}}`,
          type: "URL"
        }
      ],
      variables: {
        1: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      },
    },
    {
      key: "please use this link",
      category: "UTILITY",
      contentType: 'twilio/call-to-action',
      actions: [
        {
          title: "join",
          // url: `https://hcw-athome.dev.oniabsis.com/inv/?invite={{1}}`,
          url: `${process.env.PUBLIC_URL}/inv/?invite={{1}}`,
          type: "URL"
        }
      ],
      variables: {
        1: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      },
    },
  ],
};

module.exports = {
  requiredTemplates: [
    {
      key: "notification for offline action text for doctor",
      category: "MARKETING",
      contentType: 'twilio/text',
      variables: [],
    },
    {
      key: "second guest invite reminder",
      category: "MARKETING",
      contentType: 'twilio/call-to-action',
      actions: [
        {
          "title": "Join consultation",
          "url": "https://hcw-athome.dev.oniabsis.com/inv/?invite={{1}}",
          "type": "URL"
        }
      ],
      types: {
        "twilio/call-to-action": {
          "body": "Your consultation will start {{1}}.",
          "actions": ''
        }
      },
      variables: ['%(url)s', ' %(timePhrase)s']
    },
    {
      key: "patient is ready",
      category: "MARKETING",
      contentType: 'twilio/call-to-action',
      actions: [
        {
          "title": "patient_is_ready_button_title",
          "url": 'https://hcw-athome.dev.oniabsis.com/app/plan-consultation?token={{1}}',
          "type": "URL"
        }
      ],
      variables: {1: 'e'},
    },
  ],
};

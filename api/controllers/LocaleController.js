const fs = require('fs');
const path = require('path');

module.exports = {
  supportedLanguages: function (req, res) {
    const localesDir = path.resolve(sails.config.appPath, 'config/locales');

    fs.readdir(localesDir, (err, files) => {
      if (err) {
        return res.serverError(err);
      }

      const languages = files.map(file => file.split('.').shift());
      return res.json(languages);
    });
  }
};

/**
 * `tasks/register/default.js`
 *
 * ---------------------------------------------------------------
 *
 * This is the default Grunt tasklist that will be executed if you
 * run `grunt` in the top level directory of your app.  It is also
 * called automatically when you start Sails in development mode using
 * `sails lift` or `node app` in a development environment.
 *
 * For more information see:
 *   https://sailsjs.com/anatomy/tasks/register/default.js
 *
 */
const fs = require('fs');
const path = require('path');

module.exports = function (grunt) {

  grunt.registerTask('updateIndex', function () {

    const done = this.async();
    if(process.env.NODE_ENV !== 'development') {
      return done(true)
    }
    const writeStream = fs.createWriteStream(path.join(__dirname, '../../views/pages/homepage.ejs'));
    fs.createReadStream(path.join(__dirname, '../../assets/index.html')).pipe(writeStream);

    writeStream.on('finish', (e) => {
      console.log('file copied ');
      done(true);
    });
  });

  grunt.registerTask('default', [
    'updateIndex',
    // 'polyfill:dev', //« uncomment to ALSO transpile during development (for broader browser compat.)
    'compileAssets',
    // 'babel',        //« uncomment to ALSO transpile during development (for broader browser compat.)
    'linkAssets',
    'watch'

  ]);


};



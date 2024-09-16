const fs = require('fs');
const path = require('path');

function importFileIfExists(filePath, defaultValue) {
  try {
    const resolvedPath = path.resolve(filePath);

    if (fs.existsSync(resolvedPath)) {
      return require(resolvedPath);
    } else {
      return defaultValue || null;
    }
  } catch (error) {
    return defaultValue || null;
  }
}

module.exports = {
  importFileIfExists
}

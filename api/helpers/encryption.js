const crypto = require('crypto');
const fs = require('fs');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

module.exports = {
  friendlyName: 'Encryption',
  description: 'Provides encryption and decryption utilities for files and text.',

  inputs: {},

  exits: {
    success: {
      description: 'All done.'
    }
  },

  sync: true,

  fn (inputs, exits) {
    const ENCRYPTED_HEADER = Buffer.from(sails.config.globals.ENCRYPTION_HEADER || 'HCWENC01');

    const helper = {
      isEncryptionEnabled () {
        return sails.config.globals.ENCRYPTION_ENABLED === true;
      },

      getEncryptedHeader () {
        return ENCRYPTED_HEADER;
      },

      getEncryptionKey () {
        const keyHex = sails.config.globals.ENCRYPTION_KEY;
        if (!keyHex || keyHex.length !== 64) {
          throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
        }
        return Buffer.from(keyHex, 'hex');
      },

      encryptText (text) {
        if (!text || typeof text !== 'string') {
          return text;
        }
        const key = this.getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const encrypted = Buffer.concat([
          cipher.update(text, 'utf8'),
          cipher.final()
        ]);
        const authTag = cipher.getAuthTag();

        const combined = Buffer.concat([iv, authTag, encrypted]);
        return combined.toString('base64');
      },

      decryptText (encryptedText) {
        if (!encryptedText || typeof encryptedText !== 'string') {
          return encryptedText;
        }

        const MIN_ENCRYPTED_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH;
        const base64Regex = /^[A-Za-z0-9+/]+=*$/;
        if (!base64Regex.test(encryptedText)) {
          return encryptedText;
        }

        let combined;
        try {
          combined = Buffer.from(encryptedText, 'base64');
        } catch (unused) {
          return encryptedText;
        }

        if (combined.length < MIN_ENCRYPTED_LENGTH) {
          return encryptedText;
        }

        try {
          const key = this.getEncryptionKey();

          const iv = combined.slice(0, IV_LENGTH);
          const authTag = combined.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
          const encrypted = combined.slice(IV_LENGTH + AUTH_TAG_LENGTH);

          const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
          decipher.setAuthTag(authTag);

          return Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
          ]).toString('utf8');
        } catch (unused) {
          return '[Encrypted]';
        }
      },

      isFileEncrypted (filePath) {
        try {
          const fd = fs.openSync(filePath, 'r');
          const headerBuffer = Buffer.alloc(ENCRYPTED_HEADER.length);
          fs.readSync(fd, headerBuffer, 0, ENCRYPTED_HEADER.length, 0);
          fs.closeSync(fd);
          return headerBuffer.equals(ENCRYPTED_HEADER);
        } catch (unused) {
          return false;
        }
      },

      encryptBuffer (buffer) {
        const key = this.getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return Buffer.concat([
          ENCRYPTED_HEADER,
          iv,
          authTag,
          encrypted
        ]);
      },

      decryptBuffer (encryptedBuffer) {
        const key = this.getEncryptionKey();

        const header = encryptedBuffer.slice(0, ENCRYPTED_HEADER.length);
        if (!header.equals(ENCRYPTED_HEADER)) {
          throw new Error('File is not encrypted or has invalid header');
        }

        const iv = encryptedBuffer.slice(ENCRYPTED_HEADER.length, ENCRYPTED_HEADER.length + IV_LENGTH);
        const authTag = encryptedBuffer.slice(
          ENCRYPTED_HEADER.length + IV_LENGTH,
          ENCRYPTED_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH
        );
        const encrypted = encryptedBuffer.slice(ENCRYPTED_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
      },

      decryptFile (filePath) {
        const fileContent = fs.readFileSync(filePath);
        return this.decryptBuffer(fileContent);
      },

      createDecryptStream (filePath) {
        const key = this.getEncryptionKey();
        const fd = fs.openSync(filePath, 'r');

        const metaBuffer = Buffer.alloc(ENCRYPTED_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH);
        fs.readSync(fd, metaBuffer, 0, metaBuffer.length, 0);
        fs.closeSync(fd);

        const iv = metaBuffer.slice(ENCRYPTED_HEADER.length, ENCRYPTED_HEADER.length + IV_LENGTH);
        const authTag = metaBuffer.slice(
          ENCRYPTED_HEADER.length + IV_LENGTH,
          ENCRYPTED_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH
        );

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        const readStream = fs.createReadStream(filePath, {
          start: ENCRYPTED_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH
        });

        return readStream.pipe(decipher);
      }
    };

    return exits.success(helper);
  }
};
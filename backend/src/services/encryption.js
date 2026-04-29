/**
 * AES-256-GCM 加密/解密模块
 * 密钥存储: /etc/ssl/private/zhuiai-encryption.key (600权限)
 */

const crypto = require('crypto');
const fs = require('fs');

const KEY_PATH = '/etc/ssl/private/zhuiai-encryption.key';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96bit
const AUTH_TAG_LENGTH = 16; // 128bit

let _encryptionKey = null;

function getKey() {
  if (!_encryptionKey) {
    _encryptionKey = fs.readFileSync(KEY_PATH, 'hex');
    if (_encryptionKey.length !== 64) {
      throw new Error(`Invalid key length: expected 64 hex chars (32 bytes), got ${_encryptionKey.length}`);
    }
  }
  return _encryptionKey;
}

/**
 * 加密文件 buffer
 * @param {Buffer} plaintext - 原始文件内容
 * @returns {Buffer} - 加密后内容 (IV + 密文 + AuthTag)
 */
function encrypt(plaintext) {
  const key = Buffer.from(getKey(), 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 格式: IV(12) + Ciphertext + AuthTag(16)
  return Buffer.concat([iv, ciphertext, authTag]);
}

/**
 * 解密文件 buffer
 * @param {Buffer} encrypted - 加密后内容 (IV + 密文 + AuthTag)
 * @returns {Buffer} - 解密后明文
 */
function decrypt(encrypted) {
  const key = Buffer.from(getKey(), 'hex');

  if (encrypted.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted data too short');
  }

  const iv = encrypted.subarray(0, IV_LENGTH);
  const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(IV_LENGTH, encrypted.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = { encrypt, decrypt };

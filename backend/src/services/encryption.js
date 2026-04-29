/**
 * AES-256-GCM 加密/解密模块
 * 密钥存储: /etc/ssl/private/zhuiai-encryption.key (600权限)
 */

const crypto = require('crypto');
const fs = require('fs');

const KEY_PATH = process.env.ENCRYPTION_KEY_PATH || '/etc/ssl/private/zhuiai-encryption.key';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96bit
const AUTH_TAG_LENGTH = 16; // 128bit

let _encryptionKey = null;

function getKey() {
  if (!_encryptionKey) {
    // 密钥文件内容是64字符hex字符串（32字节），读作utf8
    const hexKey = fs.readFileSync(KEY_PATH, 'utf8').trim();
    if (hexKey.length !== 64) {
      throw new Error(`Invalid key length: expected 64 hex chars (32 bytes), got ${hexKey.length}`);
    }
    _encryptionKey = Buffer.from(hexKey, 'hex');
  }
  return _encryptionKey;
}

/**
 * 加密文件 buffer
 * @param {Buffer} plaintext - 原始文件内容
 * @returns {Buffer} - 加密后内容 (IV + 密文 + AuthTag)
 */
function encrypt(plaintext) {
  const key = getKey();
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
  const key = getKey();

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

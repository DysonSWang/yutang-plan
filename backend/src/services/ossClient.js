/**
 * 阿里云 OSS 客户端
 * 使用环境变量配置，不需要硬编码密钥
 */
const OSS = require('ali-oss');

const client = new OSS({
  region: process.env.OSS_REGION || 'oss-cn-hangzhou',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET || 'zhuiai-media',
});

const MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5MB 以上用分片上传

/**
 * 上传 Buffer 到 OSS（小文件单次 PUT，大文件分片并发上传）
 */
async function uploadBuffer(key, buffer, options = {}) {
  if (buffer.length > MULTIPART_THRESHOLD) {
    return await client.multipartUpload(key, buffer, {
      partSize: 1024 * 1024, // 每片 1MB
      ...options,
    });
  }
  return await client.put(key, buffer, options);
}

/**
 * 下载文件为 Buffer
 */
async function downloadBuffer(key) {
  const result = await client.get(key);
  return Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content);
}

/**
 * 删除 OSS 文件
 */
async function deleteFile(key) {
  return await client.delete(key);
}

/**
 * 获取签名 URL（用于私有Bucket访问）
 */
async function signatureUrl(key, expires = 3600) {
  return client.signatureUrl(key, { expires });
}

module.exports = {
  client,
  uploadBuffer,
  downloadBuffer,
  deleteFile,
  signatureUrl,
};

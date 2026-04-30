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

/**
 * 上传 Buffer 到 OSS
 */
async function uploadBuffer(key, buffer, options = {}) {
  return await client.put(key, buffer, options);
}

/**
 * 下载文件为 Buffer
 */
async function downloadBuffer(key) {
  const result = await client.get(key);
  const chunks = [];
  for await (const chunk of result.content) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
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

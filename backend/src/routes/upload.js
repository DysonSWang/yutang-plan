/**
 * 文件上传路由 - 聊天消息图片/视频/音频
 * 敏感内容(isBurnAfterRead/isFlashImage) AES-256-GCM加密后存OSS /encrypted/
 * 普通内容直传OSS /public/
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { JWT_SECRET } = require('../config');
const { encrypt } = require('../services/encryption');
const { uploadBuffer } = require('../services/ossClient');

const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const asyncHandler = require('../middleware/asyncHandler');
const { success } = require('../utils/response');

// Auth middleware
const authMiddleware = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded;
});

// OSS路径生成
function generateOssPath(subDir, filename, isSensitive) {
  const ext = path.extname(filename);
  const randomId = crypto.randomBytes(16).toString('hex');
  const prefix = isSensitive ? 'encrypted' : 'public';
  return `${prefix}/${subDir}/${randomId}${ext}`;
}

const router = express.Router();

// POST /api/upload/image
router.post('/image', authMiddleware, multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只支持图片文件'));
  }
}).single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(ErrorCodes.VALIDATION_ERROR);

  const isBurnAfterRead = req.body.isBurnAfterRead === 'true' || req.body.isBurnAfterRead === true;
  const isFlashImage = req.body.isFlashImage === 'true' || req.body.isFlashImage === true;
  const isSensitive = isBurnAfterRead || isFlashImage;

  const ossPath = generateOssPath('images', req.file.originalname, isSensitive);
  let finalBuffer = req.file.buffer;
  let finalSize = finalBuffer.length;
  let encryptionIv = null;

  if (isSensitive) {
    const encrypted = encrypt(req.file.buffer);
    finalBuffer = encrypted;
    finalSize = encrypted.length;
    // IV内嵌在加密内容头部(前12字节)，提取存储用于解密时引用
    encryptionIv = encrypted.subarray(0, 12).toString('hex');
  }

  await uploadBuffer(finalBuffer, ossPath, isSensitive);

  return success(res, {
    url: `/${ossPath}`,
    filename: path.basename(ossPath),
    size: finalSize,
    mimetype: req.file.mimetype,
    isEncrypted: isSensitive,
    encryptionIv
  });
}));

// POST /api/upload/video
router.post('/video', authMiddleware, multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('只支持视频文件'));
  }
}).single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(ErrorCodes.VALIDATION_ERROR);

  const isBurnAfterRead = req.body.isBurnAfterRead === 'true' || req.body.isBurnAfterRead === true;
  const isFlashImage = req.body.isFlashImage === 'true' || req.body.isFlashImage === true;
  const isSensitive = isBurnAfterRead || isFlashImage;

  const ossPath = generateOssPath('videos', req.file.originalname, isSensitive);
  let finalBuffer = req.file.buffer;
  let finalSize = finalBuffer.length;
  let encryptionIv = null;

  if (isSensitive) {
    const encrypted = encrypt(req.file.buffer);
    finalBuffer = encrypted;
    finalSize = encrypted.length;
    encryptionIv = encrypted.subarray(0, 12).toString('hex');
  }

  await uploadBuffer(finalBuffer, ossPath, isSensitive);

  return success(res, {
    url: `/${ossPath}`,
    filename: path.basename(ossPath),
    size: finalSize,
    mimetype: req.file.mimetype,
    isEncrypted: isSensitive,
    encryptionIv
  });
}));

// POST /api/upload/audio
router.post('/audio', authMiddleware, multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('只支持音频文件'));
  }
}).single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(ErrorCodes.VALIDATION_ERROR);

  // 音频暂不加密（聊天文字记录本身就是明文，音频加密意义不大）
  const ossPath = generateOssPath('audio', req.file.originalname, false);
  await uploadBuffer(req.file.buffer, ossPath, false);

  return success(res, {
    url: `/${ossPath}`,
    filename: path.basename(ossPath),
    size: req.file.size,
    mimetype: req.file.mimetype,
    isEncrypted: false
  });
}));

// 错误处理
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    throw new AppError(ErrorCodes.UPLOAD_FILE_TOO_LARGE);
  }
  if (err) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }
  next();
});

module.exports = router;

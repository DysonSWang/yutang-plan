/**
 * 文件上传路由 - 聊天消息图片/视频/音频
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');

// 上传根目录
const UPLOAD_DIR = path.join(__dirname, '../../uploads/chat-media');
['images', 'videos', 'audio'].forEach(sub => {
  const dir = path.join(UPLOAD_DIR, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// multer 配置工厂
const createStorage = (subDir) => multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_DIR, subDir)),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'token无效' });
  }
};

const router = express.Router();

// POST /api/upload/image
router.post('/image', authMiddleware, multer({
  storage: createStorage('images'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只支持图片文件'));
  }
}).single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  const url = `/uploads/chat-media/images/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
});

// POST /api/upload/video
router.post('/video', authMiddleware, multer({
  storage: createStorage('videos'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('只支持视频文件'));
  }
}).single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  const url = `/uploads/chat-media/videos/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
});

// POST /api/upload/audio
router.post('/audio', authMiddleware, multer({
  storage: createStorage('audio'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('只支持音频文件'));
  }
}).single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  const url = `/uploads/chat-media/audio/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
});

// 错误处理
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

module.exports = router;

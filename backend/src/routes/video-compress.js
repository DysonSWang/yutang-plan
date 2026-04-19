/**
 * 视频压缩路由 - 使用 FFmpeg server-side 压缩
 * 策略：超过阈值(10MB)的视频压缩到 ~1.5MB；小文件直接原样返回
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const util = require('util');
const execPromise = util.promisify(execFile);
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');

// 上传临时目录（压缩完成后删除）
const TEMP_DIR = path.join(__dirname, '../../uploads/_temp');
// 最终存放目录
const VIDEO_DIR = path.join(__dirname, '../../uploads/chat-media/videos');

[TEMP_DIR, VIDEO_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const router = express.Router();

const VIDEO_SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB 以下不压缩

// 音频限制（与 upload.js 保持一致）
const MAX_AUDIO_SIZE = 10 * 1024 * 1024;
// 图片限制（用于判断）
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

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

// Multer 接收原始视频（先存临时文件）
const upload = multer({
  storage: multer.diskStorage({
    destination: TEMP_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.mp4';
      cb(null, `orig-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 放宽到 100MB，后续压缩会减小
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('只支持视频文件'));
  }
});

// POST /api/upload/compress-video
// 接收视频文件，自动判断是否需要压缩，返回最终可访问的 URL
router.post('/compress-video', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });

  const inputPath = req.file.path;
  const originalSize = req.file.size;
  const outputFilename = `vid-${Date.now()}-${Math.round(Math.random() * 1E9)}.mp4`;
  const outputPath = path.join(VIDEO_DIR, outputFilename);

  try {
    // 判断是否需要压缩
    if (originalSize <= VIDEO_SIZE_THRESHOLD) {
      // 小文件直接移动到最终目录
      fs.copyFileSync(inputPath, outputPath);
      fs.unlinkSync(inputPath);
      const url = `/uploads/chat-media/videos/${outputFilename}`;
      return res.json({
        url,
        filename: outputFilename,
        size: originalSize,
        compressed: false,
        originalSize
      });
    }

    // 大文件用 FFmpeg 压缩
    // 使用数组参数避免 shell 注入（execFile 不经过 shell）
    const ffmpegArgs = [
      '-y',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-crf', '28',
      '-preset', 'fast',
      '-vf', 'scale=-2:720',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-threads', '4',
      outputPath
    ];

    const { stderr } = await execPromise('ffmpeg', ffmpegArgs, { timeout: 120000 });

    // 删除原始临时文件
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);

    // 检查压缩结果
    if (!fs.existsSync(outputPath)) {
      throw new Error('FFmpeg 压缩失败，输出文件未生成');
    }

    const compressedSize = fs.statSync(outputPath).size;

    res.json({
      url: `/uploads/chat-media/videos/${outputFilename}`,
      filename: outputFilename,
      size: compressedSize,
      compressed: true,
      originalSize,
      reduction: `${((1 - compressedSize / originalSize) * 100).toFixed(1)}%`
    });

  } catch (err) {
    // 清理失败时的临时文件
    if (fs.existsSync(inputPath)) {
      try { fs.unlinkSync(inputPath); } catch {}
    }
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }

    console.error('视频压缩失败:', err.message);
    res.status(500).json({ error: '视频压缩失败: ' + err.message });
  }
});

module.exports = router;

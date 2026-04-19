/**
 * 聊天截图路由 - 上传在其他平台上的代聊截图
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const { JWT_SECRET, BASE_URL } = require('../config');
const { extractFromNotes, extractFromImage, applyAnalysisToGirl } = require('../services/signalExtractor');

// 上传目录
const UPLOAD_DIR = path.join(__dirname, '../../uploads/chat-screenshots');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// multer 配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片格式：jpeg/jpg/png/gif/webp'));
    }
  }
});

const router = express.Router();

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'token无效' });
  }
};

// 获取女生的截图记录列表
router.get('/girl/:girlId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId } = req.params;
    const { limit = 50 } = req.query;

    const screenshots = await prisma.chatScreenshot.findMany({
      where: { girlId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json({ success: true, screenshots });
  } catch (error) {
    console.error('[ChatScreenshot] 获取截图记录失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 上传截图
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    upload.single('image')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: '请上传图片' });
      }

      const { girlId, clientId, notes } = req.body;

      if (!girlId || !clientId) {
        return res.status(400).json({ error: '参数不完整' });
      }

      // 自动从女生获取平台信息
      const girl = await prisma.girl.findUnique({
        where: { id: girlId },
        select: { sourcePlatform: true, clientId: true }
      });

      if (!girl) {
        return res.status(404).json({ error: '女生不存在' });
      }

      const imageUrl = `/uploads/chat-screenshots/${req.file.filename}`;

      const screenshot = await prisma.chatScreenshot.create({
        data: {
          girlId,
          clientId: girl.clientId,
          operatorId: req.user.id,
          imageUrl,
          platform: girl.platform || null,
          notes
        }
      });

      // 自动提取信号（异步，不阻塞响应）
      if (notes) {
        extractFromNotes(girlId, notes).catch(err => {
          console.error('[ChatScreenshot] 自动提取信号失败:', err);
        });
      }

      // AI 分析截图（不自动入库，返回待确认字段）
      let extractedFields = {};
      let analysisData = null;
      try {
        const result = await extractFromImage(girlId, imageUrl, BASE_URL);
        if (result.error) {
          // JSON 解析失败或图片无法识别，仍返回截图（已上传），但告知前端错误原因
          console.warn('[ChatScreenshot] AI分析失败:', result.error, result.rawContent || '');
        } else if (result.analysis) {
          analysisData = result.analysis;

          // 提取待确认的档案字段（key-value 形式返回前端）
          const profileUpdates = result.analysis.profileUpdates || {};
          const fieldLabels = {
            age: '年龄', occupation: '职业', education: '学历', major: '专业',
            hometown: '籍贯', residence: '现居城市', workplace: '工作地点',
            height: '身高(cm)', bodyType: '体型',
            appearance: '外貌', styleTags: '风格', familyBackground: '家庭背景',
            workSchedule: '工作时间', interests: '兴趣爱好', dietPreferences: '饮食偏好', dietRestrictions: '饮食禁忌',
            personality: '性格', communicationStyle: '沟通风格', emotionalTriggers: '情绪触发点',
            talkingTopics: '喜欢话题', thingsToAvoid: '禁忌话题',
            relationshipAttitude: '婚恋态度', attachmentStyle: '依恋类型', responsePattern: '回复规律',
            chatPartnerId: '谙世角色ID'
          };
          for (const [key, label] of Object.entries(fieldLabels)) {
            const val = profileUpdates[key];
            if (val && val !== null && val !== '') {
              extractedFields[key] = { label, value: String(val) };
            }
          }

          // 备注和对话文本仍保存到截图（不需确认）
          await prisma.chatScreenshot.update({
            where: { id: screenshot.id },
            data: {
              notes: result.aiNotes,
              chatText: result.chatText || null
            }
          });
        }
      } catch (err) {
        console.error('[ChatScreenshot] AI分析失败:', err);
      }

      res.json({ success: true, screenshot, extractedFields });
    });
  } catch (error) {
    console.error('[ChatScreenshot] 上传截图失败:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// 确认并应用提取的档案字段
router.post('/confirm-fields', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId, selectedFields } = req.body;
    if (!girlId || !selectedFields || typeof selectedFields !== 'object') {
      return res.status(400).json({ error: '参数不完整' });
    }

    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return res.status(404).json({ error: '女生不存在' });
    }

    // 构建 analysis 对象，只包含用户选中的字段
    const profileUpdates = {};
    for (const [key, val] of Object.entries(selectedFields)) {
      if (val !== null && val !== undefined && val !== '') {
        profileUpdates[key] = val;
      }
    }

    const analysis = { profileUpdates };

    // 解析现有信号
    let existingSignals = [];
    if (girl.signals) {
      try { existingSignals = JSON.parse(girl.signals); } catch (e) {}
    }

    await applyAnalysisToGirl(girlId, analysis, existingSignals, girl);

    res.json({ success: true });
  } catch (error) {
    console.error('[ChatScreenshot] 确认字段失败:', error);
    res.status(500).json({ error: '确认失败' });
  }
});

// 更新截图备注
router.patch('/:id/notes', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { id } = req.params;
    const { notes } = req.body;

    const screenshot = await prisma.chatScreenshot.update({
      where: { id },
      data: { notes }
    });

    res.json({ success: true, screenshot });
  } catch (error) {
    console.error('[ChatScreenshot] 更新备注失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// AI生成备注（基于截图分析）
router.post('/:id/ai-notes', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const screenshot = await prisma.chatScreenshot.findUnique({
      where: { id: req.params.id },
      include: { girl: true }
    });

    if (!screenshot) {
      return res.status(404).json({ error: '截图不存在' });
    }

    // 调用 AI 分析截图图片
    const baseUrl = BASE_URL;
    const result = await extractFromImage(screenshot.girlId, screenshot.imageUrl, baseUrl);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    // 更新截图备注和对话文本
    const updated = await prisma.chatScreenshot.update({
      where: { id: req.params.id },
      data: {
        notes: result.aiNotes,
        chatText: result.chatText || null
      }
    });

    res.json({
      success: true,
      screenshot: updated,
      aiNotes: result.aiNotes,
      chatText: result.chatText,
      analysis: result.analysis
    });
  } catch (error) {
    console.error('[ChatScreenshot] AI生成备注失败:', error);
    res.status(500).json({ error: 'AI生成失败' });
  }
});

// 删除截图
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const screenshot = await prisma.chatScreenshot.findUnique({
      where: { id: req.params.id }
    });

    if (!screenshot) {
      return res.status(404).json({ error: '截图不存在' });
    }

    // 删除文件
    const filePath = path.join(__dirname, '../..', screenshot.imageUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.chatScreenshot.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[ChatScreenshot] 删除截图失败:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 客户的截图记录（双方共享）
router.get('/client/me', authMiddleware, async (req, res) => {
  try {
    const { girlId, limit = 50 } = req.query;

    const where = { clientId: req.user.id };
    if (girlId) {
      where.girlId = girlId;
    }

    const screenshots = await prisma.chatScreenshot.findMany({
      where,
      include: {
        girl: {
          select: {
            id: true,
            name: true,
            stage: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json({ success: true, screenshots });
  } catch (error) {
    console.error('[ChatScreenshot] 获取客户截图记录失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

module.exports = router;

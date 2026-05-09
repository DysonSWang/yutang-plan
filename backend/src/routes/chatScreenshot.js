/**
 * 聊天截图路由 - 上传在其他平台上的代聊截图
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const { JWT_SECRET, BASE_URL } = require('../config');
const prisma = require('../prisma');
const { extractFromNotes, extractFromImage, confirmAnalysis } = require('../services/signalExtractor');
const { runAsyncAnalysis } = require('../services/asyncAnalysis');

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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId } = req.params;
    const { limit = 50 } = req.query;

    // 安全：验证操盘手拥有此女生（admin 跳过）
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) return res.status(404).json({ error: '女生不存在' });
    if (req.user.role !== 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) return res.status(403).json({ error: '无权限访问此女生数据' });
    }

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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    upload.single('image')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: '请上传图片' });
      }

      const { girlId, clientId, notes, isMomentScreenshot } = req.body;

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

      // 安全：操盘手只能为自己负责的客户的女生上传截图（admin 跳过）
      if (req.user.role !== 'admin') {
        const session = await prisma.chatSession.findFirst({
          where: { operatorId: req.user.id, clientId: girl.clientId }
        });
        if (!session) {
          return res.status(403).json({ error: '无权限为该客户上传截图' });
        }
      }

      const imageUrl = `/uploads/chat-screenshots/${req.file.filename}`;

      const screenshot = await prisma.chatScreenshot.create({
        data: {
          girlId,
          clientId: girl.clientId,
          operatorId: req.user.id,
          imageUrl,
          platform: girl.platform || null,
          notes,
          analysisStatus: 'pending'
        }
      });

      // 异步 AI 分析截图（后台处理，不阻塞响应）
      const io = req.app.get('io');
      setImmediate(() => {
        runAsyncAnalysis({
          screenshotId: screenshot.id,
          girlId,
          imageUrl,
          operatorId: req.user.id,
          io,
          notes,
          isMomentScreenshot: isMomentScreenshot === 'true',
          baseUrl: BASE_URL
        }).catch(err => {
          console.error('[ChatScreenshot] 后台分析异常:', err);
        });
      });

      // 备注分析（异步，不阻塞响应）
      if (notes) {
        extractFromNotes(girlId, notes, req.user.id).catch(err => {
          console.error('[ChatScreenshot] 备注提取信号失败:', err);
        });
      }

      // 立即返回，前端显示"后台分析中"
      res.json({
        success: true,
        screenshot: { ...screenshot, analysisStatus: 'pending' },
        message: '上传成功，AI 正在后台分析中...'
      });
    });
  } catch (error) {
    console.error('[ChatScreenshot] 上传截图失败:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// 确认并应用提取的档案字段
router.post('/confirm-fields', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId, pendingId, selectedFields } = req.body;
    if (!girlId || !pendingId) {
      return res.status(400).json({ error: '参数不完整，需要 girlId 和 pendingId' });
    }

    // 安全：操盘手只能操作自己负责的客户的女生（admin 跳过）
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) return res.status(404).json({ error: '女生不存在' });
    if (req.user.role !== 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) return res.status(403).json({ error: '无权限操作此女生数据' });
    }

    // 调用新的确认接口
    const result = await confirmAnalysis(girlId, pendingId, selectedFields);

    if (!result.success) {
      return res.status(404).json({ error: result.reason });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[ChatScreenshot] 确认字段失败:', error);
    res.status(500).json({ error: '确认失败' });
  }
});

// 更新截图备注
router.patch('/:id/notes', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { id } = req.params;
    const { notes } = req.body;

    const screenshot = await prisma.chatScreenshot.findUnique({ where: { id } });
    if (!screenshot) return res.status(404).json({ error: '截图不存在' });
    // 安全：操盘手只能操作自己负责的客户的截图（admin 跳过）
    if (req.user.role !== 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: screenshot.clientId }
      });
      if (!session) return res.status(403).json({ error: '无权限操作此截图' });
    }

    const updated = await prisma.chatScreenshot.update({
      where: { id },
      data: { notes }
    });

    res.json({ success: true, screenshot: updated });
  } catch (error) {
    console.error('[ChatScreenshot] 更新备注失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// AI生成备注（基于截图分析）— 异步版本
router.post('/:id/ai-notes', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const screenshot = await prisma.chatScreenshot.findUnique({
      where: { id: req.params.id },
      include: {
        girl: {
          select: {
            id: true,
            name: true,
            stage: true,
            sourcePlatform: true
          }
        }
      }
    });

    if (!screenshot) {
      return res.status(404).json({ error: '截图不存在' });
    }

    // 安全：操盘手只能操作自己负责的客户的截图（admin 跳过）
    if (req.user.role !== 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: screenshot.clientId }
      });
      if (!session) return res.status(403).json({ error: '无权限操作此截图' });
    }

    // 标记为 pending，后台分析
    await prisma.chatScreenshot.update({
      where: { id: screenshot.id },
      data: { analysisStatus: 'pending' }
    });

    const io = req.app.get('io');
    setImmediate(() => {
      runAsyncAnalysis({
        screenshotId: screenshot.id,
        girlId: screenshot.girlId,
        imageUrl: screenshot.imageUrl,
        operatorId: req.user.id,
        io,
        baseUrl: BASE_URL
      }).catch(err => {
        console.error('[ChatScreenshot] AI备注后台分析异常:', err);
      });
    });

    res.json({
      success: true,
      message: 'AI 正在后台分析中...'
    });
  } catch (error) {
    console.error('[ChatScreenshot] AI生成备注失败:', error);
    res.status(500).json({ error: 'AI生成失败' });
  }
});

// 删除截图
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const screenshot = await prisma.chatScreenshot.findUnique({
      where: { id: req.params.id }
    });

    if (!screenshot) {
      return res.status(404).json({ error: '截图不存在' });
    }

    // 安全：操盘手只能删除自己负责的客户的截图（admin 跳过）
    if (req.user.role !== 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: screenshot.clientId }
      });
      if (!session) return res.status(403).json({ error: '无权限删除此截图' });
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

// 客户的截图记录（仅客户本人可见）
router.get('/client/me', authMiddleware, async (req, res) => {
  try {
    // 客户才能查自己的截图
    if (req.user.role !== 'client') {
      return res.status(403).json({ error: '只有客户可以访问此接口' });
    }

    const { girlId, limit = 50 } = req.query;

    // 客户只能查自己名下的截图，不允许跨客户查询
    const where = { clientId: req.user.id };

    // 如果指定了 girlId，额外校验该女生是否属于此客户
    if (girlId) {
      const girl = await prisma.girl.findFirst({
        where: { id: girlId, clientId: req.user.id }
      });
      if (!girl) {
        return res.status(403).json({ error: '无权查看此女生的截图' });
      }
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

// 客户截图提取：上传截图并AI分析，返回识别到的客户档案字段
router.post('/client-extract', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传截图' });
    }

    const { clientId } = req.body;
    if (!clientId) {
      return res.status(400).json({ error: '缺少 clientId' });
    }

    // 验证客户存在
    const client = await prisma.user.findUnique({
      where: { id: clientId }
    });
    if (!client) {
      return res.status(404).json({ error: '客户不存在' });
    }

    // 保存截图到数据库（关联到客户但不关联到女生）
    const imageUrl = `/uploads/chat-screenshots/${req.file.filename}`;
    const screenshot = await prisma.chatScreenshot.create({
      data: {
        clientId,
        operatorId: req.user.id,
        imageUrl,
        notes: '客户档案截图提取'
      }
    });

    // 调用 AI 分析截图（使用女生截图分析服务，但传入虚假的 girlId 来触发分析）
    // 注意：这里复用了女生的AI分析，但返回的是截图中的文本内容
    let pendingFields = {};
    try {
      const imageResult = await extractFromImage('fake-girl-id', imageUrl, BASE_URL, req.user.id, false);
      if (imageResult?.pendingFields) {
        // 重映射字段名：从女生字段映射到客户字段
        const fieldMapping = {
          age: 'age',
          occupation: 'occupation',
          education: 'education',
          hometown: 'hometown',
          residence: 'residence',
          appearance: 'appearance',
          personality: 'personality',
          relationshipAttitude: 'relationshipAttitude',
          interests: 'interests',
          height: 'height'
        };
        for (const [girlKey, value] of Object.entries(imageResult.pendingFields)) {
          const clientKey = fieldMapping[girlKey];
          if (clientKey) {
            pendingFields[clientKey] = { label: getClientFieldLabel(clientKey), value };
          }
        }
      }
    } catch (aiError) {
      console.warn('[ChatScreenshot] AI分析失败:', aiError.message);
    }

    res.json({
      success: true,
      screenshotId: screenshot.id,
      pendingFields,
      message: Object.keys(pendingFields).length > 0 ? '识别到客户信息' : '未识别到客户信息'
    });
  } catch (error) {
    console.error('[ChatScreenshot] 客户截图提取失败:', error);
    res.status(500).json({ error: '提取失败' });
  }
});

// 获取客户字段的中文标签
function getClientFieldLabel(field) {
  const labels = {
    age: '年龄',
    occupation: '职业',
    education: '学历',
    hometown: '籍贯',
    residence: '所在地',
    appearance: '外貌描述',
    personality: '性格',
    relationshipAttitude: '婚恋态度',
    interests: '兴趣爱好',
    height: '身高'
  };
  return labels[field] || field;
}

// 查询截图分析状态（用于 polling fallback）
router.get('/:id/analysis-status', authMiddleware, async (req, res) => {
  try {
    const screenshot = await prisma.chatScreenshot.findUnique({
      where: { id: req.params.id }
    });

    if (!screenshot) {
      return res.status(404).json({ error: '截图不存在' });
    }

    res.json({
      success: true,
      screenshotId: screenshot.id,
      analysisStatus: screenshot.analysisStatus,
      analysisResult: screenshot.analysisResult ? JSON.parse(screenshot.analysisResult) : null,
      analysisError: screenshot.analysisError,
      analyzedAt: screenshot.analyzedAt
    });
  } catch (error) {
    console.error('[ChatScreenshot] 查询分析状态失败:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

module.exports = router;

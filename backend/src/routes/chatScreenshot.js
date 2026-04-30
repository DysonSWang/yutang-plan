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

const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const asyncHandler = require('../middleware/asyncHandler');
const { success } = require('../utils/response');

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
const authMiddleware = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
  }

  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded;
});

// 获取女生的截图记录列表
router.get('/girl/:girlId', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const { girlId } = req.params;
  const { limit = 50 } = req.query;

  // 安全：验证操盘手拥有此女生（admin 跳过）
  const girl = await prisma.girl.findUnique({ where: { id: girlId } });
  if (!girl) throw new AppError(ErrorCodes.GIRL_NOT_FOUND);
  if (req.user.role !== 'admin') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: girl.clientId }
    });
    if (!session) throw new AppError(ErrorCodes.GIRL_ACCESS_DENIED);
  }

  const screenshots = await prisma.chatScreenshot.findMany({
    where: { girlId },
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit)
  });

  return success(res, { screenshots });
}));

// 上传截图
router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  upload.single('image')(req, res, async (err) => {
    if (err) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR);
    }

    if (!req.file) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR);
    }

    const { girlId, clientId, notes, isMomentScreenshot } = req.body;

    if (!girlId || !clientId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR);
    }

    // 自动从女生获取平台信息
    const girl = await prisma.girl.findUnique({
      where: { id: girlId },
      select: { sourcePlatform: true, clientId: true }
    });

    if (!girl) {
      throw new AppError(ErrorCodes.GIRL_NOT_FOUND);
    }

    // 安全：操盘手只能为自己负责的客户的女生上传截图（admin 跳过）
    if (req.user.role !== 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) {
        throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
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
        notes
      }
    });

    // AI 分析截图 + 备注提取（均返回待确认，不自动入库）
    let pendingFields = {};
    let pendingId = null;
    let analysisData = null;

    // 截图分析
    try {
      const imageResult = await extractFromImage(girlId, imageUrl, BASE_URL, req.user.id, isMomentScreenshot === 'true');
      if (imageResult?.error) {
        console.warn('[ChatScreenshot] AI分析失败:', imageResult.error);
      } else if (imageResult?.analysis) {
        analysisData = imageResult.analysis;
        pendingFields = imageResult.pendingFields || {};
        pendingId = imageResult.pendingId;

        // 备注和对话文本保存到截图
        await prisma.chatScreenshot.update({
          where: { id: screenshot.id },
          data: {
            notes: imageResult.aiNotes,
            chatText: imageResult.chatText || null
          }
        });
      }
    } catch (err) {
      console.error('[ChatScreenshot] AI分析失败:', err);
    }

    // 备注分析（异步，不阻塞响应）
    if (notes) {
      extractFromNotes(girlId, notes, req.user.id).catch(err => {
        console.error('[ChatScreenshot] 备注提取信号失败:', err);
      });
    }

    return success(res, { screenshot, pendingFields, pendingId });
  });
}));

// 确认并应用提取的档案字段
router.post('/confirm-fields', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const { girlId, pendingId, selectedFields } = req.body;
  if (!girlId || !pendingId) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }

  // 安全：操盘手只能操作自己负责的客户的女生（admin 跳过）
  const girl = await prisma.girl.findUnique({ where: { id: girlId } });
  if (!girl) throw new AppError(ErrorCodes.GIRL_NOT_FOUND);
  if (req.user.role !== 'admin') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: girl.clientId }
    });
    if (!session) throw new AppError(ErrorCodes.GIRL_ACCESS_DENIED);
  }

  // 调用新的确认接口
  const result = await confirmAnalysis(girlId, pendingId, selectedFields);

  if (!result.success) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
  }

  return success(res, result);
}));

// 更新截图备注
router.patch('/:id/notes', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const { id } = req.params;
  const { notes } = req.body;

  const screenshot = await prisma.chatScreenshot.findUnique({ where: { id } });
  if (!screenshot) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
  // 安全：操盘手只能操作自己负责的客户的截图（admin 跳过）
  if (req.user.role !== 'admin') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: screenshot.clientId }
    });
    if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const updated = await prisma.chatScreenshot.update({
    where: { id },
    data: { notes }
  });

  return success(res, { screenshot: updated });
}));

// AI生成备注（基于截图分析）
router.post('/:id/ai-notes', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
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
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
  }

  // 安全：操盘手只能操作自己负责的客户的截图（admin 跳过）
  if (req.user.role !== 'admin') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: screenshot.clientId }
    });
    if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  // 调用 AI 分析截图图片
  const baseUrl = BASE_URL;
  const result = await extractFromImage(screenshot.girlId, screenshot.imageUrl, baseUrl);

  if (result.error) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }

  // 更新截图备注和对话文本
  const updated = await prisma.chatScreenshot.update({
    where: { id: req.params.id },
    data: {
      notes: result.aiNotes,
      chatText: result.chatText || null
    }
  });

  return success(res, {
    screenshot: updated,
    pendingId: result.pendingId,
    pendingFields: result.pendingFields,
    aiNotes: result.aiNotes,
    chatText: result.chatText,
    analysis: result.analysis
  });
}));

// 删除截图
router.delete('/:id', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const screenshot = await prisma.chatScreenshot.findUnique({
    where: { id: req.params.id }
  });

  if (!screenshot) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
  }

  // 安全：操盘手只能删除自己负责的客户的截图（admin 跳过）
  if (req.user.role !== 'admin') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: screenshot.clientId }
    });
    if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  // 删除文件
  const filePath = path.join(__dirname, '../..', screenshot.imageUrl);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await prisma.chatScreenshot.delete({
    where: { id: req.params.id }
  });

  return success(res, { success: true });
}));

// 客户的截图记录（仅客户本人可见）
router.get('/client/me', authMiddleware, asyncHandler(async (req, res) => {
  // 客户才能查自己的截图
  if (req.user.role !== 'client') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
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
      throw new AppError(ErrorCodes.GIRL_ACCESS_DENIED);
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

  return success(res, { screenshots });
}));

// 客户截图提取：上传截图并AI分析，返回识别到的客户档案字段
router.post('/client-extract', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  if (!req.file) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }

  const { clientId } = req.body;
  if (!clientId) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }

  // 验证客户存在
  const client = await prisma.user.findUnique({
    where: { id: clientId }
  });
  if (!client) {
    throw new AppError(ErrorCodes.CLIENT_NOT_FOUND);
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

  return success(res, {
    screenshotId: screenshot.id,
    pendingFields,
    message: Object.keys(pendingFields).length > 0 ? '识别到客户信息' : '未识别到客户信息'
  });
}));

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

module.exports = router;

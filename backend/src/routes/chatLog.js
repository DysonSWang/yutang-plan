/**
 * 代聊记录路由 - 操盘手帮客户发消息给女生
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');

const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const asyncHandler = require('../middleware/asyncHandler');
const { success } = require('../utils/response');

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

// 获取女生的代聊记录
router.get('/girl/:girlId', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const { girlId } = req.params;
  const { limit = 50 } = req.query;

  // 安全：验证女生存在且属于操盘手负责的客户
  const girl = await prisma.girl.findUnique({ where: { id: girlId } });
  if (!girl) {
    throw new AppError(ErrorCodes.GIRL_NOT_FOUND);
  }
  const session = await prisma.chatSession.findFirst({
    where: { operatorId: req.user.id, clientId: girl.clientId }
  });
  if (!session) {
    throw new AppError(ErrorCodes.GIRL_ACCESS_DENIED);
  }

  const logs = await prisma.chatLog.findMany({
    where: { girlId },
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit)
  });

  return success(res, { logs });
}));

// 更新代聊记录的可见性（推送给客户）
router.patch('/:id/visibility', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const { id } = req.params;
  const { isVisibleToClient } = req.body;

  // 安全：验证记录存在且属于操盘手负责的客户
  const existing = await prisma.chatLog.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
  }
  const session = await prisma.chatSession.findFirst({
    where: { operatorId: req.user.id, clientId: existing.clientId }
  });
  if (!session) {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const log = await prisma.chatLog.update({
    where: { id },
    data: { isVisibleToClient }
  });

  return success(res, { log });
}));

// 获取客户的代聊记录（客户只能看到已推送的）
router.get('/client/me', authMiddleware, asyncHandler(async (req, res) => {
  const { girlId, limit = 50 } = req.query;

  const where = { clientId: req.user.id, isVisibleToClient: true };
  if (girlId) {
    where.girlId = girlId;
  }

  const logs = await prisma.chatLog.findMany({
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

  return success(res, { logs });
}));

// 创建代聊记录
router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const { girlId, receiverName, content, type = 'text', aiAnalysis, aiSuggestions, aiAdopted = false } = req.body;

  if (!girlId || !content) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }

  // 安全：验证女生存在并获取其 clientId，防止操作不属于自己的客户数据
  const girl = await prisma.girl.findUnique({ where: { id: girlId } });
  if (!girl) {
    throw new AppError(ErrorCodes.GIRL_NOT_FOUND);
  }
  const clientId = girl.clientId;

  const log = await prisma.chatLog.create({
    data: {
      girlId,
      clientId,
      operatorId: req.user.id,
      receiverName,
      content,
      type,
      aiAnalysis,
      aiSuggestions,
      aiAdopted
    }
  });

  // 通过 Socket.io 通知客户有新代聊记录
  const io = req.app.get('io');
  if (io) {
    io.to(`client:${clientId}`).emit('chat-log:new', log);
  }

  return success(res, { log });
}));

module.exports = router;

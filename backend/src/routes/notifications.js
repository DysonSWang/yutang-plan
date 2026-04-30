/**
 * 通知路由
 */

const express = require('express');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');

const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const asyncHandler = require('../middleware/asyncHandler');
const { success } = require('../utils/response');

module.exports = function(io) {
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

	// 获取通知列表
	router.get('/', authMiddleware, asyncHandler(async (req, res) => {
	  const { unreadOnly } = req.query;

	  const where = { userId: req.user.id };
	  if (unreadOnly === 'true') {
	    where.isRead = false;
	  }

	  const notifications = await prisma.notification.findMany({
	    where,
	    orderBy: { createdAt: 'desc' },
	    take: 50
	  });

	  const unreadCount = await prisma.notification.count({
	    where: { userId: req.user.id, isRead: false }
	  });

	  return success(res, { notifications, unreadCount });
	}));

	// 创建通知
	router.post('/', authMiddleware, asyncHandler(async (req, res) => {
	  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
	    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
	  }

	  const { userId, type, title, content, metadata } = req.body;

	  if (!userId || !type || !title || !content) {
	    throw new AppError(ErrorCodes.VALIDATION_ERROR);
	  }

	  // 安全：操盘手只能给其负责的客户发送通知
	  const session = await prisma.chatSession.findFirst({
	    where: { operatorId: req.user.id, clientId: userId }
	  });
	  if (!session) {
	    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
	  }

	  const notification = await prisma.notification.create({
	    data: {
	      userId,
	      type,
	      title,
	      content,
	      metadata: metadata ? JSON.stringify(metadata) : null
	    }
	  });

	  // 通过 Socket.io 推送通知
	  if (io) {
	    io.to(`client:${userId}`).emit('notification:new', notification);
	  }

	  return success(res, { notification });
	}));

	// 标记已读
	router.post('/:id/read', authMiddleware, asyncHandler(async (req, res) => {
	  // 安全：验证通知属于当前用户（防止操作他人通知）
	  const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
	  if (!existing) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
	  if (existing.userId !== req.user.id) {
	    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
	  }

	  const notification = await prisma.notification.update({
	    where: { id: req.params.id },
	    data: { isRead: true }
	  });

	  return success(res, { notification });
	}));

	// 标记全部已读
	router.post('/read-all', authMiddleware, asyncHandler(async (req, res) => {
	  await prisma.notification.updateMany({
	    where: { userId: req.user.id, isRead: false },
	    data: { isRead: true }
	  });

	  return success(res, { success: true });
	}));

	  return router;
	};

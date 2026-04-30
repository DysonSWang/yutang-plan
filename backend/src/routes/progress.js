/**
 * 服务进度路由
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

	// 获取服务进度
	router.get('/', authMiddleware, asyncHandler(async (req, res) => {
	  const { clientId } = req.query;

	  let where = {};
	  if (req.user.role === 'client') {
	    where.userId = req.user.id;
	  } else if (clientId) {
	    // 安全：操盘手只能查询自己负责的客户
	    const session = await prisma.chatSession.findFirst({
	      where: { operatorId: req.user.id, clientId }
	    });
	    if (!session) {
	      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
	    }
	    where.userId = clientId;
	  }

	  const progress = await prisma.serviceProgress.findMany({
	    where,
	    orderBy: { stage: 'asc' }
	  });

	  return success(res, { progress });
	}));

	// 创建/更新服务进度
	router.post('/', authMiddleware, asyncHandler(async (req, res) => {
	  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
	    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
	  }

	  const { clientId, stage, stageName, status = 'in_progress', amountPaid } = req.body;

	  if (!clientId || stage === undefined || !stageName) {
	    throw new AppError(ErrorCodes.VALIDATION_ERROR);
	  }

	  // 安全：操盘手只能为自己的客户创建进度
	  const session = await prisma.chatSession.findFirst({
	    where: { operatorId: req.user.id, clientId }
	  });
	  if (!session) {
	    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
	  }

	  // 查找是否已存在该阶段
	  const existing = await prisma.serviceProgress.findFirst({
	    where: { userId: clientId, stage }
	  });

	  let progress;
	  if (existing) {
	    progress = await prisma.serviceProgress.update({
	      where: { id: existing.id },
	      data: {
	        status,
	        amountPaid,
	        paidAt: amountPaid ? new Date() : undefined,
	        completedAt: status === 'completed' ? new Date() : undefined
	      }
	    });
	  } else {
	    progress = await prisma.serviceProgress.create({
	      data: {
	        userId: clientId,
	        stage,
	        stageName,
	        status,
	        amountPaid,
	        paidAt: amountPaid ? new Date() : undefined,
	        completedAt: status === 'completed' ? new Date() : undefined
	      }
	    });
	  }

	  // 更新用户服务阶段
	  await prisma.user.update({
	    where: { id: clientId },
	    data: { serviceStage: stageName }
	  });

	  // 发送通知给客户
	  try {
	    const notification = await prisma.notification.create({
	      data: {
	        userId: clientId,
	        type: 'progress',
	        title: '服务进度更新',
	        content: `您的服务已进入【${stageName}】阶段`,
	        metadata: JSON.stringify({ stage, stageName })
	      }
	    });
	    // 通过 Socket.io 推送通知
	    if (io) {
	      io.to(`client:${clientId}`).emit('notification:new', notification);
	    }
	  } catch (notifErr) {
	    console.error('[Progress] 创建通知失败:', notifErr);
	  }

	  return success(res, { progress });
	}));

	// 获取客户完整进度报告
	router.get('/report/:clientId', authMiddleware, asyncHandler(async (req, res) => {
	  const { clientId } = req.params;

	  // 安全：操盘手只能查询自己负责的客户
	  if (req.user.role !== 'client' && req.user.role !== 'admin') {
	    const session = await prisma.chatSession.findFirst({
	      where: { operatorId: req.user.id, clientId }
	    });
	    if (!session) {
	      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
	    }
	  }

	  // 获取进度记录
	  const progress = await prisma.serviceProgress.findMany({
	    where: { userId: clientId },
	    orderBy: { stage: 'asc' }
	  });

	  // 获取女生统计
	  const girls = await prisma.girl.findMany({
	    where: { clientId }
	  });

	  const girlCount = girls.length;
	  const intimacyCount = girls.filter(g => g.stage === '暧昧').length;
	  const longTermCount = girls.filter(g => g.stage === '长期').length;

	  // 获取约会统计
	  const dates = await prisma.date.findMany({
	    where: { userId: clientId }
	  });
	  const dateCount = dates.filter(d => d.status === 'completed').length;

	  return success(res, {
	    progress,
	    stats: {
	      girlCount,
	      intimacyCount,
	      longTermCount,
	      dateCount
	    }
	  });
	}));

	  return router;
	};

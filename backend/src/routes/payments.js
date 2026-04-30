/**
 * 阶段付款路由
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

// 获取付款记录
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

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  return success(res, { payments });
}));

// 创建付款记录
router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const { clientId, stage, amount } = req.body;

  if (!clientId || stage === undefined || !amount) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }

  // 安全：操盘手只能为自己的客户创建付款记录
  const session = await prisma.chatSession.findFirst({
    where: { operatorId: req.user.id, clientId }
  });
  if (!session) {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const payment = await prisma.payment.create({
    data: {
      userId: clientId,
      stage,
      amount,
      status: 'paid',
      paidAt: new Date()
    }
  });

  // 更新用户余额
  await prisma.user.update({
    where: { id: clientId },
    data: { balance: { increment: amount } }
  });

  return success(res, { payment });
}));

module.exports = router;

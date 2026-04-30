/**
 * 每周复盘报告路由 - M007 S04
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { JWT_SECRET } = require('../config');
const { generateWeeklyReview, getWeeklyReviewHistory } = require('../services/weeklyReview');
const prisma = require('../prisma');

const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const asyncHandler = require('../middleware/asyncHandler');
const { success } = require('../utils/response');

// Auth middleware
const authenticate = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded;
});

const requireRole = (...roles) => asyncHandler(async (req, res) => {
  if (!roles.includes(req.user.role)) {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
});

/**
 * GET /api/clients/:clientId/weekly-review
 * 获取本周周报
 */
router.get('/:clientId/weekly-review', authenticate, requireRole('operator', 'admin'), asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const operatorId = req.user.id;

  // 操盘手所有权校验
  if (req.user.role === 'operator') {
    const session = await prisma.chatSession.findUnique({
      where: { operatorId_clientId: { operatorId, clientId } }
    });
    if (!session) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
  }

  const review = await generateWeeklyReview(clientId);
  return success(res, { data: review });
}));

/**
 * GET /api/clients/:clientId/weekly-review/history
 * 获取历史周报列表
 */
router.get('/:clientId/weekly-review/history', authenticate, requireRole('operator', 'admin'), asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const { limit = 8 } = req.query;
  const operatorId = req.user.id;

  if (req.user.role === 'operator') {
    const session = await prisma.chatSession.findUnique({
      where: { operatorId_clientId: { operatorId, clientId } }
    });
    if (!session) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
  }

  const history = await getWeeklyReviewHistory(clientId, parseInt(limit, 10));
  return success(res, { data: history });
}));

/**
 * POST /api/clients/:clientId/weekly-review/generate
 * 手动触发周报生成
 */
router.post('/:clientId/weekly-review/generate', authenticate, requireRole('operator', 'admin'), asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const operatorId = req.user.id;

  if (req.user.role === 'operator') {
    const session = await prisma.chatSession.findUnique({
      where: { operatorId_clientId: { operatorId, clientId } }
    });
    if (!session) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
  }

  const review = await generateWeeklyReview(clientId, { save: true });
  return success(res, { data: review });
}));

module.exports = router;

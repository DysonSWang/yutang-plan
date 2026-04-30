/**
 * 反撇检测路由 - M007 S03
 */

const express = require('express');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');
const { analyzeGirlOverall, getReversalRisk } = require('../services/reversalDetector');

const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const asyncHandler = require('../middleware/asyncHandler');
const { success } = require('../utils/response');

module.exports = function(io) {
  const router = express.Router();

  const authMiddleware = asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  });

  const operatorOnly = asyncHandler(async (req, res) => {
    if (!['operator', 'admin'].includes(req.user.role)) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
  });

  /**
   * 校验操盘手对女生的所有权
   */
  const validateGirlAccess = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const girl = await prisma.girl.findUnique({ where: { id } });
    if (!girl) throw new AppError(ErrorCodes.GIRL_NOT_FOUND);

    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: girl.clientId }
    });
    if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);

    req.girl = girl;
  });

  /**
   * POST /api/girls/:id/analyze-reversal
   * AI 综合分析女生反撇风险
   */
  router.post('/:id/analyze-reversal', authMiddleware, operatorOnly, validateGirlAccess, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await analyzeGirlOverall(id);

    if (!result.success) {
      throw new AppError(ErrorCodes.AI_SERVICE_UNAVAILABLE);
    }

    return success(res, result);
  }));

  /**
   * GET /api/girls/:id/reversal-risk
   * 快速规则判断反撇风险（不调用 AI）
   */
  router.get('/:id/reversal-risk', authMiddleware, operatorOnly, validateGirlAccess, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const risk = await getReversalRisk(id);
    return success(res, risk);
  }));

  return router;
};

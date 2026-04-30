/**
 * 预警路由 - 操盘手主动预警
 */

const express = require('express');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');
const {
  evaluateAllGirls,
  getActiveAlerts,
  getAlertStats,
  acknowledgeAlert,
  dismissAlert,
  resolveAlert,
  saveAlerts,
} = require('../services/alertEngine');

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
    if (!token) throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  });

  // 仅 operator 和 admin 可访问
  const operatorOnly = asyncHandler(async (req, res) => {
    if (!['operator', 'admin'].includes(req.user.role)) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
  });

  /**
   * 校验操盘手对客户的所有权
   */
  const validateClientAccess = asyncHandler(async (req, res) => {
    const { clientId } = req.query;
    if (!clientId) return;

    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  });

  // ===== 端点 =====

  /**
   * GET /api/alerts
   * 获取预警列表
   * Query: clientId?, status?, severity?, girlId?
   */
  router.get('/', authMiddleware, operatorOnly, validateClientAccess, asyncHandler(async (req, res) => {
    const { clientId, status, severity, girlId } = req.query;

    const filters = {};
    if (clientId) filters.clientId = clientId;
    if (status) filters.status = status;
    if (severity) filters.severity = severity;
    if (girlId) filters.girlId = girlId;

    const alerts = await getActiveAlerts(req.user.id, filters);

    // 获取未读（active）数量
    const unreadCount = await prisma.alert.count({
      where: { operatorId: req.user.id, status: 'active' }
    });

    return success(res, { alerts, unreadCount, total: alerts.length });
  }));

  /**
   * GET /api/alerts/stats
   * 获取预警统计
   * Query: clientId?
   */
  router.get('/stats', authMiddleware, operatorOnly, validateClientAccess, asyncHandler(async (req, res) => {
    const { clientId } = req.query;
    const stats = await getAlertStats(req.user.id, clientId || null);
    return success(res, { stats });
  }));

  /**
   * POST /api/alerts/evaluate
   * 手动触发预警评估（操盘手刷新预警）
   * Query: clientId?
   */
  router.post('/evaluate', authMiddleware, operatorOnly, validateClientAccess, asyncHandler(async (req, res) => {
    const { clientId } = req.query;

    // 检查权限（如果是指定客户）
    if (clientId) {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId }
      });
      if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }

    // 评估所有女生
    const newAlerts = await evaluateAllGirls(req.user.id, clientId || null);

    // 保存新预警
    const saved = await saveAlerts(newAlerts);

    // 获取更新后的活跃预警列表
    const alerts = await getActiveAlerts(req.user.id, {});
    const stats = await getAlertStats(req.user.id, clientId || null);

    return success(res, {
      newCount: newAlerts.length,
      alerts,
      stats,
    });
  }));

  /**
   * POST /api/alerts/:id/acknowledge
   * 标记已读
   */
  router.post('/:id/acknowledge', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
    try {
      const alert = await acknowledgeAlert(req.params.id, req.user.id);
      return success(res, { alert });
    } catch (error) {
      if (error.message === '预警不存在') {
        throw new AppError(ErrorCodes.ALERT_NOT_FOUND || ErrorCodes.RESOURCE_NOT_FOUND);
      }
      if (error.message === '无权操作此预警') {
        throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
      }
      throw error;
    }
  }));

  /**
   * POST /api/alerts/:id/dismiss
   * 关闭预警
   */
  router.post('/:id/dismiss', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
    try {
      const alert = await dismissAlert(req.params.id, req.user.id);
      return success(res, { alert });
    } catch (error) {
      if (error.message === '预警不存在') {
        throw new AppError(ErrorCodes.ALERT_NOT_FOUND || ErrorCodes.RESOURCE_NOT_FOUND);
      }
      if (error.message === '无权操作此预警') {
        throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
      }
      throw error;
    }
  }));

  /**
   * POST /api/alerts/:id/resolve
   * 标记已处理
   * Body: { reason?: string }
   */
  router.post('/:id/resolve', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
    try {
      const { reason } = req.body;
      const alert = await resolveAlert(req.params.id, req.user.id, reason);
      return success(res, { alert });
    } catch (error) {
      if (error.message === '预警不存在') {
        throw new AppError(ErrorCodes.ALERT_NOT_FOUND || ErrorCodes.RESOURCE_NOT_FOUND);
      }
      if (error.message === '无权操作此预警') {
        throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
      }
      throw error;
    }
  }));

  return router;
};

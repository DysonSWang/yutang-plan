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

module.exports = function(io) {
  const router = express.Router();

  // Auth middleware
  const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未登录' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'token无效' });
    }
  };

  // 仅 admin 可访问
  const operatorOnly = (req, res, next) => {
    if (!['admin'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }
    next();
  };

  /**
   * 校验操盘手对客户的所有权
   */
  const validateClientAccess = async (req, res, next) => {
    const { clientId } = req.query;
    if (!clientId) return next();

    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) return res.status(403).json({ error: '无权访问此客户的预警' });
    next();
  };

  // ===== 端点 =====

  /**
   * GET /api/alerts
   * 获取预警列表
   * Query: clientId?, status?, severity?, girlId?
   */
  router.get('/', authMiddleware, operatorOnly, validateClientAccess, async (req, res) => {
    try {
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

      res.json({ success: true, alerts, unreadCount, total: alerts.length });
    } catch (error) {
      console.error('[Alerts] 获取预警列表失败:', error);
      res.status(500).json({ error: '获取失败' });
    }
  });

  /**
   * GET /api/alerts/stats
   * 获取预警统计
   * Query: clientId?
   */
  router.get('/stats', authMiddleware, operatorOnly, validateClientAccess, async (req, res) => {
    try {
      const { clientId } = req.query;
      const stats = await getAlertStats(req.user.id, clientId || null);
      res.json({ success: true, stats });
    } catch (error) {
      console.error('[Alerts] 获取统计失败:', error);
      res.status(500).json({ error: '获取失败' });
    }
  });

  /**
   * POST /api/alerts/evaluate
   * 手动触发预警评估（操盘手刷新预警）
   * Query: clientId?
   */
  router.post('/evaluate', authMiddleware, operatorOnly, validateClientAccess, async (req, res) => {
    try {
      const { clientId } = req.query;

      // 检查权限（如果是指定客户）
      if (clientId) {
        const session = await prisma.chatSession.findFirst({
          where: { operatorId: req.user.id, clientId }
        });
        if (!session) return res.status(403).json({ error: '无权访问此客户的预警' });
      }

      // 评估所有女生
      const newAlerts = await evaluateAllGirls(req.user.id, clientId || null);

      // 保存新预警
      const saved = await saveAlerts(newAlerts);

      // 获取更新后的活跃预警列表
      const alerts = await getActiveAlerts(req.user.id, {});
      const stats = await getAlertStats(req.user.id, clientId || null);

      res.json({
        success: true,
        newCount: newAlerts.length,
        alerts,
        stats,
      });
    } catch (error) {
      console.error('[Alerts] 评估失败:', error);
      res.status(500).json({ error: '评估失败' });
    }
  });

  /**
   * POST /api/alerts/:id/acknowledge
   * 标记已读
   */
  router.post('/:id/acknowledge', authMiddleware, operatorOnly, async (req, res) => {
    try {
      const alert = await acknowledgeAlert(req.params.id, req.user.id);
      res.json({ success: true, alert });
    } catch (error) {
      if (error.message === '预警不存在') {
        return res.status(404).json({ error: '预警不存在' });
      }
      if (error.message === '无权操作此预警') {
        return res.status(403).json({ error: '无权操作此预警' });
      }
      console.error('[Alerts] 标记已读失败:', error);
      res.status(500).json({ error: '操作失败' });
    }
  });

  /**
   * POST /api/alerts/:id/dismiss
   * 关闭预警
   */
  router.post('/:id/dismiss', authMiddleware, operatorOnly, async (req, res) => {
    try {
      const alert = await dismissAlert(req.params.id, req.user.id);
      res.json({ success: true, alert });
    } catch (error) {
      if (error.message === '预警不存在') {
        return res.status(404).json({ error: '预警不存在' });
      }
      if (error.message === '无权操作此预警') {
        return res.status(403).json({ error: '无权操作此预警' });
      }
      console.error('[Alerts] 关闭预警失败:', error);
      res.status(500).json({ error: '操作失败' });
    }
  });

  /**
   * POST /api/alerts/:id/resolve
   * 标记已处理
   * Body: { reason?: string }
   */
  router.post('/:id/resolve', authMiddleware, operatorOnly, async (req, res) => {
    try {
      const { reason } = req.body;
      const alert = await resolveAlert(req.params.id, req.user.id, reason);
      res.json({ success: true, alert });
    } catch (error) {
      if (error.message === '预警不存在') {
        return res.status(404).json({ error: '预警不存在' });
      }
      if (error.message === '无权操作此预警') {
        return res.status(403).json({ error: '无权操作此预警' });
      }
      console.error('[Alerts] 标记已处理失败:', error);
      res.status(500).json({ error: '操作失败' });
    }
  });

  return router;
};

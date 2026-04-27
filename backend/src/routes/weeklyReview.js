/**
 * 每周复盘报告路由 - M007 S04
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { JWT_SECRET } = require('../config');
const { generateWeeklyReview, getWeeklyReviewHistory } = require('../services/weeklyReview');
const prisma = require('../prisma');

// Auth middleware
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, error: '未登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, error: '未登录' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: '无权限' });
  }
  next();
};

/**
 * GET /api/clients/:clientId/weekly-review
 * 获取本周周报
 */
router.get('/:clientId/weekly-review', authenticate, requireRole('operator', 'admin'), async (req, res) => {
  try {
    const { clientId } = req.params;
    const operatorId = req.user.id;

    // 操盘手所有权校验
    if (req.user.role === 'operator') {
      const session = await prisma.chatSession.findUnique({
        where: { operatorId_clientId: { operatorId, clientId } }
      });
      if (!session) {
        return res.status(403).json({ success: false, error: '无权限访问该客户的周报' });
      }
    }

    const review = await generateWeeklyReview(clientId);
    res.json({ success: true, data: review });
  } catch (err) {
    console.error('[WeeklyReview] 获取周报失败:', err);
    res.status(500).json({ success: false, error: '获取周报失败' });
  }
});

/**
 * GET /api/clients/:clientId/weekly-review/history
 * 获取历史周报列表
 */
router.get('/:clientId/weekly-review/history', authenticate, requireRole('operator', 'admin'), async (req, res) => {
  try {
    const { clientId } = req.params;
    const { limit = 8 } = req.query;
    const operatorId = req.user.id;

    if (req.user.role === 'operator') {
      const session = await prisma.chatSession.findUnique({
        where: { operatorId_clientId: { operatorId, clientId } }
      });
      if (!session) {
        return res.status(403).json({ success: false, error: '无权限访问该客户的周报' });
      }
    }

    const history = await getWeeklyReviewHistory(clientId, parseInt(limit, 10));
    res.json({ success: true, data: history });
  } catch (err) {
    console.error('[WeeklyReview] 获取历史周报失败:', err);
    res.status(500).json({ success: false, error: '获取历史周报失败' });
  }
});

/**
 * POST /api/clients/:clientId/weekly-review/generate
 * 手动触发周报生成
 */
router.post('/:clientId/weekly-review/generate', authenticate, requireRole('operator', 'admin'), async (req, res) => {
  try {
    const { clientId } = req.params;
    const operatorId = req.user.id;

    if (req.user.role === 'operator') {
      const session = await prisma.chatSession.findUnique({
        where: { operatorId_clientId: { operatorId, clientId } }
      });
      if (!session) {
        return res.status(403).json({ success: false, error: '无权限访问该客户的周报' });
      }
    }

    const review = await generateWeeklyReview(clientId, { save: true });
    res.json({ success: true, data: review });
  } catch (err) {
    console.error('[WeeklyReview] 生成周报失败:', err);
    res.status(500).json({ success: false, error: '生成周报失败' });
  }
});

module.exports = router;

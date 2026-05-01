/**
 * 管理端活跃度追踪 API
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');
const activityService = require('../services/activityService');

// 认证中间件
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch { res.status(401).json({ error: 'token无效' }); }
};

// 管理员权限校验中间件
function operatorOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// 获取所有客户汇总活跃数据
router.get('/clients', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { level } = req.query;
    let clients = await activityService.getAllClientsActivity();

    // 按活跃度排序：高 > 中 > 低 > 沉睡
    const levelOrder = { high: 0, medium: 1, low: 2, dormant: 3 };
    clients.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

    // 按level过滤
    if (level && level !== 'all') {
      clients = clients.filter(c => c.level === level);
    }

    res.json({
      success: true,
      clients,
      total: clients.length,
    });
  } catch (error) {
    console.error('[Activity] 获取客户活跃数据失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// 获取单个客户活跃详情
router.get('/clients/:id', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.query;

    const activityLevel = await activityService.getActivityLevel(id);
    const dailyTrend = await activityService.getDailyTrend(id, parseInt(days));
    const featureUsage = await activityService.getFeatureUsage(id);

    // 获取用户基本信息
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        nickname: true,
        username: true,
        lastLogin: true,
        loginCount: true,
        lastActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({
      success: true,
      client: {
        userId: user.id,
        nickname: user.nickname || user.username,
        lastLogin: user.lastLogin,
        loginCount: user.loginCount || 0,
        lastActive: user.lastActive,
        weeklyScore: activityLevel.score,
        level: activityLevel.level,
        isDormant: activityLevel.isDormant,
        featureUsage,
        registeredAt: user.createdAt,
        dailyTrend,
      },
    });
  } catch (error) {
    console.error('[Activity] 获取客户活跃详情失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// 获取全局看板数据
router.get('/dashboard', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const stats = await activityService.getDashboardStats();
    const trend = await activityService.getGlobalDailyTrend(30);

    res.json({
      success: true,
      ...stats,
      dailyTrend: trend,
    });
  } catch (error) {
    console.error('[Activity] 获取看板数据失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// 获取沉睡用户列表
router.get('/dormant-users', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const dormantUsers = await activityService.getDormantUsers();

    res.json({
      success: true,
      dormantUsers,
      total: dormantUsers.length,
    });
  } catch (error) {
    console.error('[Activity] 获取沉睡用户列表失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// 获取每日活跃趋势
router.get('/trend', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const trend = await activityService.getGlobalDailyTrend(parseInt(days));

    res.json({
      success: true,
      trend,
    });
  } catch (error) {
    console.error('[Activity] 获取活跃趋势失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// 获取用户增长趋势（新用户、累计、DAU、MAU）
router.get('/growth', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { days = 90 } = req.query;
    const growth = await activityService.getGrowthTrend(parseInt(days));

    res.json({
      success: true,
      growth,
    });
  } catch (error) {
    console.error('[Activity] 获取增长趋势失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

module.exports = router;

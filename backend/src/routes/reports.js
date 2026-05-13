/**
 * 综合报表 API — 日/周/月报
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const os = require('os');
const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ error: { code: 'A0101', message: '未登录' } });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch { res.status(401).json({ error: { code: 'A0102', message: '认证令牌无效' } }); }
};

function operatorOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: { code: 'A0108', message: '需要管理员权限' } });
  next();
}

// 根据 range 返回起始时间
function getRangeStart(range) {
  const now = new Date();
  if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === 'month') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }
  // day — 今天 0 点
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// GET /api/reports/overview?range=day|week|month
router.get('/overview', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const range = req.query.range || 'day';
    const start = getRangeStart(range);
    const now = new Date();

    // ─── 用户 ───
    const [totalUsers, newUsers, totalClients] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: start } } }),
      prisma.user.count({ where: { role: 'client' } }),
    ]);

    // 活跃用户（有 lastActive 记录且在范围内）
    const activeUsers = await prisma.user.count({
      where: { role: 'client', lastActive: { gte: start } },
    });

    // 沉睡用户（14天未活跃）
    const dormantDate = new Date();
    dormantDate.setDate(dormantDate.getDate() - 14);
    const dormantUsers = await prisma.user.count({
      where: { role: 'client', lastActive: { lt: dormantDate } },
    });

    // ─── 聊天 ───
    const [totalMessages, periodMessages, chatLogs] = await Promise.all([
      prisma.message.count(),
      prisma.message.count({ where: { createdAt: { gte: start } } }),
      prisma.chatLog.count({ where: { createdAt: { gte: start } } }),
    ]);

    const aiCalls = await prisma.conversationMemory.count({
      where: { updatedAt: { gte: start } },
    });

    const adoptedLogs = await prisma.chatLog.count({
      where: { createdAt: { gte: start }, aiAdopted: true },
    });

    // ─── 营收 ───
    const allPayments = await prisma.payment.findMany({
      where: { status: 'paid' },
      select: { amount: true, paidAt: true, createdAt: true },
    });
    const totalRevenue = allPayments.reduce((s, p) => s + (p.amount || 0), 0);

    const periodPayments = allPayments.filter(p => {
      const t = new Date(p.paidAt || p.createdAt);
      return t >= start;
    });
    const periodRevenue = periodPayments.reduce((s, p) => s + (p.amount || 0), 0);

    const paidUsers = await prisma.payment.findMany({
      where: { status: 'paid', paidAt: { gte: start } },
      select: { userId: true },
      distinct: ['userId'],
    });

    // 会员类型分布
    const memberships = await prisma.membership.findMany({
      where: { status: 'active' },
      select: { type: true },
    });
    const memberBreakdown = {};
    memberships.forEach(m => {
      memberBreakdown[m.type] = (memberBreakdown[m.type] || 0) + 1;
    });

    // ─── AI 教练 ───
    const totalCoachCalls = await prisma.conversationMemory.count();

    // 教练满意度
    const feedbacks = await prisma.coachFeedback.findMany({
      where: { createdAt: { gte: start } },
      select: { type: true },
    });
    const helpful = feedbacks.filter(f => f.type === 'helpful').length;
    const totalFeedback = feedbacks.length;

    // ─── 服务器 ───
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const loadAvg = os.loadavg();

    // 磁盘（通过 prisma 数据库文件大小近似）
    const dbPath = require('path').join(__dirname, '../../prisma/data/database.db');
    let dbSize = 0;
    try { dbSize = require('fs').statSync(dbPath).size; } catch {}

    // ─── 趋势（最近 30 天每日数据）───
    const trendDays = 30;
    const trendStart = new Date();
    trendStart.setDate(trendStart.getDate() - trendDays);

    const dailyMessages = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COUNT(*) as count
      FROM messages
      WHERE createdAt >= ${trendStart}
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `;

    const dailyUsers = await prisma.$queryRaw`
      SELECT DATE(lastActive) as date, COUNT(DISTINCT id) as count
      FROM users
      WHERE lastActive >= ${trendStart} AND role = 'client'
      GROUP BY DATE(lastActive)
      ORDER BY date ASC
    `;

    const dailyNewUsers = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COUNT(*) as count
      FROM users
      WHERE createdAt >= ${trendStart}
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `;

    res.json({
      success: true,
      range,
      period: { start: start.toISOString(), end: now.toISOString() },
      users: {
        total: totalUsers,
        clients: totalClients,
        new: newUsers,
        active: activeUsers,
        dormant: dormantUsers,
      },
      chat: {
        totalMessages,
        periodMessages,
        chatLogs,
        aiCalls,
        adoptRate: periodMessages > 0 ? Math.round((adoptedLogs / Math.max(chatLogs, 1)) * 100) : 0,
      },
      revenue: {
        total: totalRevenue,
        period: periodRevenue,
        paidUsers: paidUsers.length,
        arpu: paidUsers.length > 0 ? Math.round(periodRevenue / paidUsers.length) : 0,
        memberBreakdown,
      },
      ai: {
        totalCoachCalls,
        periodFeedbacks: totalFeedback,
        satisfaction: totalFeedback > 0 ? Math.round((helpful / totalFeedback) * 100) : 0,
      },
      server: {
        cpuCores: os.cpus().length,
        loadAvg1m: loadAvg[0].toFixed(2),
        memTotalMB: Math.round(memTotal / 1024 / 1024),
        memUsedMB: Math.round((memTotal - memFree) / 1024 / 1024),
        memPercent: Math.round(((memTotal - memFree) / memTotal) * 100),
        dbSizeMB: (dbSize / 1024 / 1024).toFixed(1),
        uptimeDays: Math.floor(os.uptime() / 86400),
      },
      trend: {
        messages: dailyMessages.map(r => ({ date: r.date, count: Number(r.count) })),
        activeUsers: dailyUsers.map(r => ({ date: r.date, count: Number(r.count) })),
        newUsers: dailyNewUsers.map(r => ({ date: r.date, count: Number(r.count) })),
      },
    });
  } catch (error) {
    console.error('[Reports] 获取报表失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '获取报表失败，请稍后重试' } });
  }
});

module.exports = router;

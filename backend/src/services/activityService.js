/**
 * 活跃度追踪服务
 *
 * 评分算法：
 * - 登录天数得分（0-30分）：每周登录1天=10分，2天=20分，≥3天=30分
 * - 功能使用得分（0-70分）：AI教练10分/次上限30，约会方案15分/次上限30，聊天消息2分/条上限20，添加女生10分/次上限10
 *
 * 活跃度分级：高(≥70)、中(40-69)、低(10-39)、沉睡(<10或14天无登录)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ACTIVITY_WEIGHTS = {
  login: 0,        // 登录只记时间，不记分数
  ai_coach: 10,    // 10分/次
  date_plan: 15,   // 15分/次
  chat_message: 2, // 2分/条
  girl_add: 10,    // 10分/次
};

const ACTIVITY_MAX_SCORES = {
  ai_coach: 30,
  date_plan: 30,
  chat_message: 20,
  girl_add: 10,
};

/**
 * 记录用户活动
 */
async function recordActivity(userId, type, metadata = null) {
  const activity = await prisma.userActivity.create({
    data: {
      userId,
      type,
      metadata: metadata ? JSON.stringify(metadata) : null,
      date: new Date(),
    },
  });

  // 更新用户的 lastActive
  await prisma.user.update({
    where: { id: userId },
    data: { lastActive: new Date() },
  });

  return activity;
}

/**
 * 登录时记录
 */
async function recordLogin(userId) {
  const now = new Date();

  // 更新用户汇总字段
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLogin: now,
      loginCount: { increment: 1 },
      lastActive: now,
    },
  });

  // 记录登录活动
  return recordActivity(userId, 'login');
}

/**
 * 计算用户某周的活跃得分
 * @param {string} userId
 * @param {Date} weekStart - 周起始日期
 * @returns {Promise<{score: number, loginDays: number, featureScore: number, breakdown: object}>}
 */
async function calculateWeeklyScore(userId, weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // 获取本周所有活动
  const activities = await prisma.userActivity.findMany({
    where: {
      userId,
      date: {
        gte: weekStart,
        lt: weekEnd,
      },
    },
  });

  // 计算登录天数（去重）
  const loginDaysSet = new Set();
  const featureUsage = {
    ai_coach: 0,
    date_plan: 0,
    chat_message: 0,
    girl_add: 0,
  };

  for (const activity of activities) {
    const dateKey = activity.date.toISOString().split('T')[0];
    if (activity.type === 'login') {
      loginDaysSet.add(dateKey);
    } else if (featureUsage.hasOwnProperty(activity.type)) {
      featureUsage[activity.type]++;
    }
  }

  const loginDays = loginDaysSet.size;

  // 登录天数得分（0-30分）
  let loginScore = 0;
  if (loginDays >= 3) loginScore = 30;
  else if (loginDays === 2) loginScore = 20;
  else if (loginDays === 1) loginScore = 10;

  // 功能使用得分（0-70分）
  let featureScore = 0;
  const breakdown = {};

  for (const [type, count] of Object.entries(featureUsage)) {
    const weight = ACTIVITY_WEIGHTS[type];
    const maxScore = ACTIVITY_MAX_SCORES[type];
    const earned = Math.min(count * weight, maxScore);
    breakdown[type] = { count, weight, earned, max: maxScore };
    featureScore += earned;
  }

  const totalScore = loginScore + featureScore;

  return {
    score: totalScore,
    loginDays,
    loginScore,
    featureScore,
    breakdown,
  };
}

/**
 * 获取用户活跃等级
 * @param {string} userId
 * @returns {Promise<{level: string, score: number, isDormant: boolean}>}
 */
async function getActivityLevel(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastActive: true },
  });

  if (!user) {
    return { level: 'unknown', score: 0, isDormant: true };
  }

  // 检查是否沉睡（14天无操作）
  const now = new Date();
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // lastActive 为 null 表示从未活跃过，应视为沉睡
  const isDormantByTime = !user.lastActive || user.lastActive < fourteenDaysAgo;

  // 计算本周得分
  const weekStart = getWeekStart(now);
  const { score } = await calculateWeeklyScore(userId, weekStart);

  // 沉睡用户无论得分多少都标记为沉睡
  if (isDormantByTime) {
    return { level: 'dormant', score, isDormant: true };
  }

  // 活跃等级判定
  let level;
  if (score >= 70) level = 'high';
  else if (score >= 40) level = 'medium';
  else if (score >= 10) level = 'low';
  else level = 'dormant';

  return { level, score, isDormant: false };
}

/**
 * 获取本周起始日期（周一）
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 获取用户每日活跃得分趋势
 * @param {string} userId
 * @param {number} days - 天数
 */
async function getDailyTrend(userId, days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const activities = await prisma.userActivity.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: 'asc' },
  });

  // 按天聚合
  const dailyScores = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split('T')[0];
    dailyScores[key] = { date: key, score: 0, login: false };
  }

  for (const activity of activities) {
    const key = activity.date.toISOString().split('T')[0];
    if (dailyScores[key]) {
      if (activity.type === 'login') {
        dailyScores[key].login = true;
      } else {
        const weight = ACTIVITY_WEIGHTS[activity.type] || 0;
        dailyScores[key].score += weight;
      }
    }
  }

  return Object.values(dailyScores);
}

/**
 * 获取用户各功能使用统计
 */
async function getFeatureUsage(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const activities = await prisma.userActivity.findMany({
    where: {
      userId,
      date: { gte: thirtyDaysAgo },
    },
  });

  const usage = {
    aiCoachCalls: 0,
    datePlans: 0,
    chatMessages: 0,
    girlsAdded: 0,
  };

  for (const activity of activities) {
    switch (activity.type) {
      case 'ai_coach':
        usage.aiCoachCalls++;
        break;
      case 'date_plan':
        usage.datePlans++;
        break;
      case 'chat_message':
        usage.chatMessages++;
        break;
      case 'girl_add':
        usage.girlsAdded++;
        break;
    }
  }

  return usage;
}

/**
 * 获取所有客户的汇总活跃数据
 */
async function getAllClientsActivity() {
  const users = await prisma.user.findMany({
    where: { role: 'client' },
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

  const weekStart = getWeekStart(new Date());
  const results = [];

  for (const user of users) {
    const { level, score, isDormant } = await getActivityLevel(user.id);
    const featureUsage = await getFeatureUsage(user.id);

    results.push({
      userId: user.id,
      nickname: user.nickname || user.username,
      lastLogin: user.lastLogin,
      loginCount: user.loginCount || 0,
      lastActive: user.lastActive,
      weeklyScore: score,
      level,
      isDormant,
      featureUsage,
      registeredAt: user.createdAt,
    });
  }

  return results;
}

/**
 * 获取全局看板数据
 */
async function getDashboardStats() {
  const users = await prisma.user.findMany({
    where: { role: 'client' },
    select: {
      id: true,
      createdAt: true,
      lastActive: true,
    },
  });

  const totalUsers = users.length;

  // 计算本周新增
  const weekStart = getWeekStart(new Date());
  const weekNew = users.filter(u => u.createdAt >= weekStart).length;

  // 计算各项数据
  const stats = await Promise.all(
    users.map(async (u) => {
      const { level, isDormant } = await getActivityLevel(u.id);
      return { level, isDormant };
    })
  );

  const weeklyActive = stats.filter(s => !s.isDormant).length;
  const dormantUsers = stats.filter(s => s.isDormant).length;

  // 活跃度分布
  const levelDistribution = {
    high: stats.filter(s => s.level === 'high').length,
    medium: stats.filter(s => s.level === 'medium').length,
    low: stats.filter(s => s.level === 'low').length,
    dormant: dormantUsers,
  };

  // 本周功能使用统计
  const weekActivities = await prisma.userActivity.findMany({
    where: {
      date: { gte: weekStart },
    },
  });

  const weeklyFeatureUsage = {
    aiCoachCalls: weekActivities.filter(a => a.type === 'ai_coach').length,
    datePlans: weekActivities.filter(a => a.type === 'date_plan').length,
    chatMessages: weekActivities.filter(a => a.type === 'chat_message').length,
    girlsAdded: weekActivities.filter(a => a.type === 'girl_add').length,
  };

  return {
    totalUsers,
    weeklyActive,
    weeklyNew: weekNew,
    dormantUsers,
    levelDistribution,
    weeklyFeatureUsage,
  };
}

/**
 * 获取沉睡用户列表
 */
async function getDormantUsers() {
  const users = await prisma.user.findMany({
    where: { role: 'client' },
    select: {
      id: true,
      nickname: true,
      username: true,
      lastActive: true,
      createdAt: true,
    },
  });

  const dormantUsers = [];

  for (const user of users) {
    const { isDormant } = await getActivityLevel(user.id);
    if (isDormant) {
      const daysSinceActive = user.lastActive
        ? Math.floor((Date.now() - user.lastActive.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      dormantUsers.push({
        userId: user.id,
        nickname: user.nickname || user.username,
        lastActive: user.lastActive,
        dormantDays: daysSinceActive,
        registeredAt: user.createdAt,
      });
    }
  }

  // 按沉睡天数降序排列
  dormantUsers.sort((a, b) => (b.dormantDays || 0) - (a.dormantDays || 0));

  return dormantUsers;
}

/**
 * 获取每日全局活跃趋势
 */
async function getGlobalDailyTrend(days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const activities = await prisma.userActivity.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: 'asc' },
  });

  // 按天聚合
  const dailyStats = {};
  for (let i = 0; i <= days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split('T')[0];
    dailyStats[key] = {
      date: key,
      activeUsers: new Set(),
      totalScore: 0,
    };
  }

  for (const activity of activities) {
    const key = activity.date.toISOString().split('T')[0];
    if (dailyStats[key]) {
      dailyStats[key].activeUsers.add(activity.userId);
      if (activity.type !== 'login') {
        const weight = ACTIVITY_WEIGHTS[activity.type] || 0;
        dailyStats[key].totalScore += weight;
      }
    }
  }

  return Object.values(dailyStats).map(d => ({
    date: d.date,
    activeUsers: d.activeUsers.size,
    totalScore: d.totalScore,
  }));
}

module.exports = {
  recordActivity,
  recordLogin,
  calculateWeeklyScore,
  getActivityLevel,
  getDailyTrend,
  getFeatureUsage,
  getAllClientsActivity,
  getDashboardStats,
  getDormantUsers,
  getGlobalDailyTrend,
  ACTIVITY_WEIGHTS,
};

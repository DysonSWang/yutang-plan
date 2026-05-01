/**
 * 活跃度追踪服务（性能优化版）
 *
 * 评分算法：
 * - 登录天数得分（0-30分）：每周登录1天=10分，2天=20分，≥3天=30分
 * - 功能使用得分（0-70分）：AI教练10分/次上限30，约会方案15分/次上限30，聊天消息2分/条上限20，添加女生10分/次上限10
 *
 * 活跃度分级：高(≥70)、中(40-69)、低(10-39)、沉睡(<10或14天无登录)
 *
 * 性能优化策略：
 * - 批量查询替代 N+1：一次性加载所有用户 + 所有活动，内存计算
 * - getGrowthTrend MAU 使用滑动窗口（O(n) 替代 O(n²)）
 * - 分析看板响应缓存 60 秒
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ACTIVITY_WEIGHTS = {
  login: 0,
  ai_coach: 10,
  date_plan: 15,
  chat_message: 2,
  girl_add: 10,
  learning: 5,
  mo_chat: 8,
};

const ACTIVITY_MAX_SCORES = {
  ai_coach: 30,
  date_plan: 30,
  chat_message: 20,
  girl_add: 10,
  learning: 15,
  mo_chat: 24,
};

// ========== 简单内存缓存 ==========

const cache = new Map();
const CACHE_TTL = 60_000; // 60 秒

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

function clearCache() {
  cache.clear();
}

// ========== 批量计算核心 ==========

/**
 * 批量计算所有用户本周得分（纯内存，不查库）
 * @param {Map<string, Array>} weeklyActivitiesByUser - userId → 本周活动数组
 * @returns {Map<string, {score:number, loginDays:number, level:string}>}
 */
function batchCalculateWeeklyScores(weeklyActivitiesByUser) {
  const results = new Map();

  for (const [userId, activities] of weeklyActivitiesByUser) {
    const loginDaysSet = new Set();
    const featureUsage = { ai_coach: 0, date_plan: 0, chat_message: 0, girl_add: 0, learning: 0, mo_chat: 0 };

    for (const a of activities) {
      if (a.type === 'login') {
        loginDaysSet.add(a.dateKey);
      } else if (featureUsage.hasOwnProperty(a.type)) {
        featureUsage[a.type]++;
      }
    }

    const loginDays = loginDaysSet.size;
    let loginScore = 0;
    if (loginDays >= 3) loginScore = 30;
    else if (loginDays === 2) loginScore = 20;
    else if (loginDays === 1) loginScore = 10;

    let featureScore = 0;
    for (const [type, count] of Object.entries(featureUsage)) {
      const earned = Math.min(count * ACTIVITY_WEIGHTS[type], ACTIVITY_MAX_SCORES[type]);
      featureScore += earned;
    }

    const score = loginScore + featureScore;
    let level;
    if (score >= 70) level = 'high';
    else if (score >= 40) level = 'medium';
    else if (score >= 10) level = 'low';
    else level = 'dormant';

    results.set(userId, { score, loginDays, level, featureUsage });
  }
  return results;
}

/**
 * 批量计算用户近30天功能使用（纯内存）
 * @param {Map<string, Array>} monthActivitiesByUser - userId → 近30天活动数组
 */
function batchCalculateFeatureUsage(monthActivitiesByUser) {
  const results = new Map();
  const featureTypes = ['ai_coach', 'date_plan', 'chat_message', 'girl_add', 'learning', 'mo_chat'];
  const keyMap = {
    ai_coach: 'aiCoachCalls', date_plan: 'datePlans', chat_message: 'chatMessages',
    girl_add: 'girlsAdded', learning: 'learningActions', mo_chat: 'moChats',
  };

  for (const [userId, activities] of monthActivitiesByUser) {
    const usage = { aiCoachCalls: 0, datePlans: 0, chatMessages: 0, girlsAdded: 0, learningActions: 0, moChats: 0 };
    for (const a of activities) {
      const k = keyMap[a.type];
      if (k) usage[k]++;
    }
    results.set(userId, usage);
  }
  return results;
}

/**
 * 批量加载所有用户 + 所有相关活动（核心性能优化）
 * 替代原来的 N+1 逐用户查询
 */
async function loadBatchUserStats() {
  const cached = getCached('batchUserStats');
  if (cached) return cached;

  const now = new Date();
  const weekStart = getWeekStart(now);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 一次查询加载所有用户
  const users = await prisma.user.findMany({
    where: { role: 'client' },
    select: { id: true, nickname: true, username: true, lastLogin: true, loginCount: true, lastActive: true, createdAt: true },
  });

  // 一次查询加载本周所有活动
  const weekActivities = await prisma.userActivity.findMany({
    where: { date: { gte: weekStart } },
    select: { userId: true, type: true, date: true },
  });

  // 一次查询加载近30天所有活动
  const monthActivities = await prisma.userActivity.findMany({
    where: { date: { gte: thirtyDaysAgo } },
    select: { userId: true, type: true, date: true },
  });

  // 按 userId 分组（附带 dateKey 避免重复计算）
  const weekByUser = new Map();
  const monthByUser = new Map();
  for (const u of users) {
    weekByUser.set(u.id, []);
    monthByUser.set(u.id, []);
  }
  for (const a of weekActivities) {
    const arr = weekByUser.get(a.userId);
    if (arr) arr.push({ type: a.type, dateKey: a.date.toISOString().split('T')[0] });
  }
  for (const a of monthActivities) {
    const arr = monthByUser.get(a.userId);
    if (arr) arr.push({ type: a.type, dateKey: a.date.toISOString().split('T')[0] });
  }

  // 内存计算所有用户得分和功能使用
  const weeklyScores = batchCalculateWeeklyScores(weekByUser);
  const featureUsages = batchCalculateFeatureUsage(monthByUser);

  // 计算本周活跃、活跃度分布、本周功能使用汇总
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const result = {
    users,
    weeklyScores,
    featureUsages,
    weekStart,
    fourteenDaysAgo,
    now,
    // 本周功能使用汇总
    weeklyFeatureUsage: computeWeeklyFeatureTotals(weekActivities),
  };

  setCache('batchUserStats', result);
  return result;
}

function computeWeeklyFeatureTotals(weekActivities) {
  const totals = { aiCoachCalls: 0, datePlans: 0, chatMessages: 0, girlsAdded: 0, learningActions: 0, moChats: 0 };
  const map = { ai_coach: 'aiCoachCalls', date_plan: 'datePlans', chat_message: 'chatMessages', girl_add: 'girlsAdded', learning: 'learningActions', mo_chat: 'moChats' };
  for (const a of weekActivities) {
    const k = map[a.type];
    if (k) totals[k]++;
  }
  return totals;
}

// ========== 公共 API（接口不变，内部批量计算） ==========

/**
 * 记录用户活动
 */
async function recordActivity(userId, type, metadata = null) {
  clearCache(); // 活动写入时清除缓存
  const activity = await prisma.userActivity.create({
    data: {
      userId,
      type,
      metadata: metadata ? JSON.stringify(metadata) : null,
      date: new Date(),
    },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { lastActive: new Date() },
  });
  return activity;
}

async function recordLogin(userId) {
  clearCache();
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { lastLogin: now, loginCount: { increment: 1 }, lastActive: now },
  });
  return recordActivity(userId, 'login');
}

async function calculateWeeklyScore(userId, weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const activities = await prisma.userActivity.findMany({
    where: { userId, date: { gte: weekStart, lt: weekEnd } },
  });
  const map = new Map();
  map.set(userId, activities.map(a => ({ type: a.type, dateKey: a.date.toISOString().split('T')[0] })));
  const scores = batchCalculateWeeklyScores(map);
  const s = scores.get(userId);
  return { score: s?.score || 0, loginDays: s?.loginDays || 0, loginScore: 0, featureScore: 0, breakdown: {} };
}

async function getActivityLevel(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastActive: true } });
  if (!user) return { level: 'unknown', score: 0, isDormant: true };
  const now = new Date();
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const isDormantByTime = !user.lastActive || user.lastActive < fourteenDaysAgo;
  const weekStart = getWeekStart(now);
  const { score } = await calculateWeeklyScore(userId, weekStart);
  if (isDormantByTime) return { level: 'dormant', score, isDormant: true };
  let level;
  if (score >= 70) level = 'high';
  else if (score >= 40) level = 'medium';
  else if (score >= 10) level = 'low';
  else level = 'dormant';
  return { level, score, isDormant: false };
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getDailyTrend(userId, days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const activities = await prisma.userActivity.findMany({
    where: { userId, date: { gte: startDate, lte: endDate } },
    orderBy: { date: 'asc' },
  });
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
        dailyScores[key].score += ACTIVITY_WEIGHTS[activity.type] || 0;
      }
    }
  }
  return Object.values(dailyScores);
}

async function getFeatureUsage(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const activities = await prisma.userActivity.findMany({
    where: { userId, date: { gte: thirtyDaysAgo } },
  });
  const usage = { aiCoachCalls: 0, datePlans: 0, chatMessages: 0, girlsAdded: 0, learningActions: 0, moChats: 0 };
  for (const a of activities) {
    const map = { ai_coach: 'aiCoachCalls', date_plan: 'datePlans', chat_message: 'chatMessages', girl_add: 'girlsAdded', learning: 'learningActions', mo_chat: 'moChats' };
    const k = map[a.type];
    if (k) usage[k]++;
  }
  return usage;
}

// ===== 分析看板核心 API（批量计算版） =====

async function getAllClientsActivity() {
  const { users, weeklyScores, featureUsages } = await loadBatchUserStats();
  const levelOrder = { high: 0, medium: 1, low: 2, dormant: 3 };

  const results = users.map(user => {
    const scoreInfo = weeklyScores.get(user.id) || { score: 0, level: 'dormant' };
    let level = scoreInfo.level;
    // 检查沉睡
    const now = new Date();
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const isDormant = !user.lastActive || user.lastActive < fourteenDaysAgo;
    if (isDormant) level = 'dormant';

    return {
      userId: user.id,
      nickname: user.nickname || user.username,
      lastLogin: user.lastLogin,
      loginCount: user.loginCount || 0,
      lastActive: user.lastActive,
      weeklyScore: scoreInfo.score,
      level,
      isDormant,
      featureUsage: featureUsages.get(user.id) || { aiCoachCalls: 0, datePlans: 0, chatMessages: 0, girlsAdded: 0, learningActions: 0, moChats: 0 },
      registeredAt: user.createdAt,
    };
  });

  results.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
  return results;
}

async function getDashboardStats() {
  const { users, weeklyScores, featureUsages, weekStart, weeklyFeatureUsage } = await loadBatchUserStats();

  const totalUsers = users.length;
  const weekNew = users.filter(u => u.createdAt >= weekStart).length;

  let weeklyActive = 0;
  let dormantUsersCount = 0;
  const levelDistribution = { high: 0, medium: 0, low: 0, dormant: 0 };

  const now = new Date();
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  for (const user of users) {
    const isDormant = !user.lastActive || user.lastActive < fourteenDaysAgo;
    if (isDormant) {
      dormantUsersCount++;
      levelDistribution.dormant++;
    } else {
      weeklyActive++;
      const si = weeklyScores.get(user.id);
      const lvl = si?.level || 'low';
      levelDistribution[lvl]++;
    }
  }

  // DAU / MAU 单独查询（需要精确的日期边界）
  const [dau, mau] = await Promise.all([getDAU(), getMAU()]);

  return {
    totalUsers,
    weeklyActive,
    weeklyNew: weekNew,
    dormantUsers: dormantUsersCount,
    dau,
    mau,
    levelDistribution,
    weeklyFeatureUsage,
  };
}

async function getDormantUsers() {
  const { users } = await loadBatchUserStats();

  const now = new Date();
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const dormantUsers = [];
  for (const user of users) {
    const isDormant = !user.lastActive || user.lastActive < fourteenDaysAgo;
    if (isDormant) {
      const daysSinceActive = user.lastActive
        ? Math.floor((now - user.lastActive.getTime()) / (1000 * 60 * 60 * 24))
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

  dormantUsers.sort((a, b) => (b.dormantDays || 0) - (a.dormantDays || 0));
  return dormantUsers;
}

async function getDAU() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const result = await prisma.userActivity.findMany({
    where: { date: { gte: today, lt: tomorrow } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return result.length;
}

async function getMAU() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const result = await prisma.userActivity.findMany({
    where: { date: { gte: thirtyDaysAgo } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return result.length;
}

async function getGlobalDailyTrend(days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const activities = await prisma.userActivity.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    orderBy: { date: 'asc' },
  });
  const dailyStats = {};
  for (let i = 0; i <= days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split('T')[0];
    dailyStats[key] = { date: key, activeUsers: new Set(), totalScore: 0 };
  }
  for (const a of activities) {
    const key = a.date.toISOString().split('T')[0];
    if (dailyStats[key]) {
      dailyStats[key].activeUsers.add(a.userId);
      if (a.type !== 'login') dailyStats[key].totalScore += ACTIVITY_WEIGHTS[a.type] || 0;
    }
  }
  return Object.values(dailyStats).map(d => ({
    date: d.date,
    activeUsers: d.activeUsers.size,
    totalScore: d.totalScore,
  }));
}

/**
 * 获取增长趋势（滑动窗口优化版）
 * MAU 计算从 O(n² * m) 优化到 O(n * m)，其中 n = 天数, m = 日均活动数
 */
async function getGrowthTrend(days = 90) {
  const cached = getCached(`growthTrend_${days}`);
  if (cached) return cached;

  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  // 一次查询加载所有用户
  const users = await prisma.user.findMany({
    where: { role: 'client' },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // 一次查询加载所有活动
  const activities = await prisma.userActivity.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    select: { userId: true, date: true },
    orderBy: { date: 'asc' },
  });

  // 构建每日数据结构
  const sortedDates = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    sortedDates.push(d.toISOString().split('T')[0]);
  }

  const dailyMap = {};
  for (const key of sortedDates) {
    dailyMap[key] = {
      date: key, newUsers: 0, cumulativeUsers: 0, activeUsers: 0, mau: 0, _activeSet: new Set(),
    };
  }

  // 每日新增用户
  for (const user of users) {
    const key = user.createdAt.toISOString().split('T')[0];
    if (dailyMap[key]) dailyMap[key].newUsers++;
  }

  // 累计用户
  let cumulative = 0;
  for (const key of sortedDates) {
    cumulative += dailyMap[key].newUsers;
    dailyMap[key].cumulativeUsers = cumulative;
  }

  // 每日活跃用户（按日期预分组）
  const activitiesByDate = new Map();
  for (const key of sortedDates) activitiesByDate.set(key, new Set());
  for (const a of activities) {
    const key = a.date.toISOString().split('T')[0];
    const set = activitiesByDate.get(key);
    if (set) set.add(a.userId);
  }
  for (const key of sortedDates) {
    dailyMap[key].activeUsers = activitiesByDate.get(key)?.size || 0;
  }

  // MAU 滑动窗口计算（O(n) 替代原来的 O(n² * m)）
  const mauWindow = new Map(); // userId → count（滑动窗口内出现次数）
  for (let i = 0; i < sortedDates.length; i++) {
    const currentKey = sortedDates[i];
    // 加入新一天的活跃用户
    const newUsers = activitiesByDate.get(currentKey);
    if (newUsers) {
      for (const uid of newUsers) {
        mauWindow.set(uid, (mauWindow.get(uid) || 0) + 1);
      }
    }
    // 移除超出30天窗口的旧数据
    if (i >= 30) {
      const expireKey = sortedDates[i - 30];
      const oldUsers = activitiesByDate.get(expireKey);
      if (oldUsers) {
        for (const uid of oldUsers) {
          const count = mauWindow.get(uid) - 1;
          if (count <= 0) mauWindow.delete(uid);
          else mauWindow.set(uid, count);
        }
      }
    }
    dailyMap[currentKey].mau = mauWindow.size;
  }

  // 清理内部字段
  const result = sortedDates.map(key => {
    const { _activeSet, ...rest } = dailyMap[key];
    return rest;
  });

  setCache(`growthTrend_${days}`, result);
  return result;
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
  getGrowthTrend,
  getDAU,
  getMAU,
  ACTIVITY_WEIGHTS,
};

/**
 * GirlSummary 缓存服务
 *
 * 三路分支缓存策略：
 * - hash 都匹配 → 直接返回缓存内容
 * - 任一不匹配 → 重新生成（附 changeReason）→ 写缓存
 *
 * dailyKey = YYYYMMDD，每日自动过期
 */

const prisma = require('../prisma');

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

// ============================================================
// GirlSummary 缓存（女生专项，按 clientId + girlId 缓存）
// ============================================================

/**
 * 构建 girl-summary 的缓存 key
 * daily:{clientId}:{girlId}:{YYYYMMDD}
 */
function buildDailyCacheKey(clientId, girlId) {
  return `daily:${clientId}:${girlId}:${today()}`;
}

/**
 * 从 DB 读取女生专项缓存记录
 */
async function getCache(clientId, girlId) {
  const cacheKey = buildDailyCacheKey(clientId, girlId);
  return prisma.girlSummaryCache.findUnique({ where: { cacheKey } });
}

/**
 * 写入/更新女生专项缓存记录
 */
async function setCache(clientId, girlId, { content, girlDataHash, userDataHash, prevSnapshot }) {
  const cacheKey = buildDailyCacheKey(clientId, girlId);
  await prisma.girlSummaryCache.upsert({
    where: { cacheKey },
    create: {
      cacheKey, clientId, girlId, content, girlDataHash, userDataHash,
      prevSnapshot: prevSnapshot ? JSON.stringify(prevSnapshot) : null,
      dailyKey: today()
    },
    update: { content, girlDataHash, userDataHash, prevSnapshot: prevSnapshot ? JSON.stringify(prevSnapshot) : null }
  });
}

// ============================================================
// Overview 缓存（operator 全局视图，按 operatorId 缓存）
// ============================================================

/**
 * 构建 overview 的缓存 key
 * overview:{operatorId}:{YYYYMMDD}
 */
function buildOverviewCacheKey(operatorId) {
  return `overview:${operatorId}:${today()}`;
}

/**
 * 读取 overview 缓存
 */
async function getOverviewCache(operatorId) {
  const cacheKey = buildOverviewCacheKey(operatorId);
  return prisma.girlSummaryCache.findUnique({ where: { cacheKey } });
}

/**
 * 写入 overview 缓存（overview 没有 girlId，存为空字符串）
 */
async function setOverviewCache(operatorId, { content, userDataHash, prevSnapshot }) {
  const cacheKey = buildOverviewCacheKey(operatorId);
  await prisma.girlSummaryCache.upsert({
    where: { cacheKey },
    create: {
      cacheKey, clientId: operatorId, girlId: '', content,
      girlDataHash: '', userDataHash,
      prevSnapshot: prevSnapshot ? JSON.stringify(prevSnapshot) : null,
      dailyKey: today()
    },
    update: { content, userDataHash, prevSnapshot: prevSnapshot ? JSON.stringify(prevSnapshot) : null }
  });
}

module.exports = {
  getCache, setCache,
  getOverviewCache, setOverviewCache,
  buildDailyCacheKey, buildOverviewCacheKey
};

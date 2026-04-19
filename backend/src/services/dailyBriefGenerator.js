/**
 * 每日简报生成服务 - Mo哥 + 童锦程分析
 * 用于操盘手工作台的今日待办、重要提醒、本周待办
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getAIConfig } = require('../config');

// 简报缓存（5分钟TTL）
const briefCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

function getCachedBrief(key) {
  const cached = briefCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { data: cached.data, timestamp: cached.timestamp };
  }
  return null;
}

function setCachedBrief(key, data) {
  briefCache.set(key, { data, timestamp: Date.now() });
}

// Mo哥 + 童锦程 分析 prompt
const DAILY_BRIEF_PROMPT = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验。
同时你也具备Mo哥的底层逻辑分析能力，直接犀利。

作为操盘手，你需要分析以下女生的状态，生成今日待办和重要提醒。

【女生列表】
{girlsList}

请根据以上信息，输出今日待办和重要提醒：

{
  "todayTasks": [
    {
      "girlId": "女生ID",
      "girlName": "女生名",
      "stage": "当前阶段",
      "tensionScore": 热度评分,
      "tensionTrend": "up/down/stable",
      "action": "今天应该做的事情",
      "priority": "P0/P1",
      "reason": "为什么今天要做这件事"
    }
  ],
  "alerts": [
    {
      "girlId": "女生ID",
      "girlName": "女生名",
      "type": "warning/danger/info",
      "message": "提醒内容"
    }
  ],
  "weekTasks": [
    {
      "girlId": "女生ID",
      "girlName": "女生名",
      "stage": "当前阶段",
      "targetStage": "目标阶段（如果计划升级）",
      "action": "本周计划做的事情",
      "type": "约会/升级/补充资源"
    }
  ]
}

只输出 JSON，不要其他内容。`;

/**
 * 生成每日简报
 * @param {string} clientId - 可选，筛选特定客户的女生
 */
async function generateDailyBrief(clientId) {
  const cacheKey = clientId || 'all';
  const cached = getCachedBrief(cacheKey);
  if (cached) {
    return cached.data;
  }

  try {
    // 获取所有女生
    const where = clientId ? { clientId } : {};
    const girls = await prisma.girl.findMany({ where });

    if (girls.length === 0) {
      return { todayTasks: [], alerts: [], weekTasks: [] };
    }

    // 准备女生信息摘要
    const girlsList = girls.map(g => {
      let signals = [];
      let pendingActions = [];
      let observations = [];

      if (g.signals) {
        try { signals = JSON.parse(g.signals); } catch (e) {}
      }
      if (g.pendingActions) {
        try { pendingActions = JSON.parse(g.pendingActions); } catch (e) {}
      }
      if (g.observations) {
        try { observations = JSON.parse(g.observations); } catch (e) {}
      }

      return {
        id: g.id,
        name: g.name,
        stage: g.stage || '未知',
        tensionScore: g.tensionScore || 5.0,
        intimacyLevel: g.intimacyLevel || 1,
        platform: g.platform || '未知',
        recentSignals: signals.slice(-5),
        pendingActions,
        observations,
        notes: g.notes
      };
    });

    // 调用 AI 分析
    const aiConfig = getAIConfig();
    if (!aiConfig) {
      console.warn('[DailyBriefGenerator] AI 未配置，跳过 AI 分析');
      return generateFallbackBrief(girls);
    }
    const prompt = DAILY_BRIEF_PROMPT.replace('{girlsList}', JSON.stringify(girlsList, null, 2));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error('[DailyBriefGenerator] AI 调用失败:', response.status);
      return generateFallbackBrief(girls);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    let analysis;
    try {
      analysis = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch (e) {
      console.error('[DailyBriefGenerator] 解析失败，使用降级方案:', content);
      return generateFallbackBrief(girls);
    }

    // 缓存结果
    setCachedBrief(cacheKey, analysis);
    return analysis;
  } catch (error) {
    console.error('[DailyBriefGenerator] 生成失败:', error);
    return { todayTasks: [], alerts: [], weekTasks: [] };
  }
}

// 导出缓存方法供外部使用（如清理缓存）
function clearBriefCache() {
  briefCache.clear();
}

/**
 * 降级方案：基于规则生成简报
 */
function generateFallbackBrief(girls) {
  const todayTasks = [];
  const alerts = [];
  const weekTasks = [];

  const today = new Date();
  const todayStr = today.toLocaleDateString('zh-CN');

  girls.forEach(girl => {
    let signals = [];
    let pendingActions = [];

    if (girl.signals) {
      try { signals = JSON.parse(girl.signals); } catch (e) {}
    }
    if (girl.pendingActions) {
      try { pendingActions = JSON.parse(girl.pendingActions); } catch (e) {}
    }

    // 检查3天无互动
    if (signals.length > 0) {
      const lastSignal = signals[signals.length - 1];
      const lastDate = new Date(lastSignal.date);
      const daysSince = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

      if (daysSince >= 3) {
        alerts.push({
          girlId: girl.id,
          girlName: girl.name,
          type: 'warning',
          message: `已${daysSince}天无新互动，需要破冰或重新定位`
        });
      }
    }

    // 低温警告
    if (girl.tensionScore < 4) {
      alerts.push({
        girlId: girl.id,
        girlName: girl.name,
        type: 'danger',
        message: '关系热度偏低，建议补充能量或重新定位'
      });
    }

    // 生成今日待办
    pendingActions.forEach(action => {
      todayTasks.push({
        girlId: girl.id,
        girlName: girl.name,
        stage: girl.stage || '未知',
        tensionScore: girl.tensionScore || 5.0,
        tensionTrend: 'stable',
        action,
        priority: 'P0',
        reason: '待推进事项'
      });
    });

    // 本周待办：检查约会阶段需要推进的
    if (girl.stage === '暧昧') {
      weekTasks.push({
        girlId: girl.id,
        girlName: girl.name,
        stage: girl.stage,
        targetStage: '约会',
        action: '推进关系，争取约出来见面',
        type: '约会'
      });
    }
  });

  // 按热度排序今日待办
  todayTasks.sort((a, b) => b.tensionScore - a.tensionScore);

  return { todayTasks, alerts, weekTasks };
}

/**
 * 获取统计数据
 */
async function getDashboardStats(clientId) {
  try {
    // 客户统计
    const clientCount = await prisma.user.count({
      where: { role: 'client' }
    });

    // 客户阶段分布
    const clients = await prisma.user.findMany({
      where: { role: 'client' },
      select: { serviceStage: true }
    });

    const clientStageStats = {};
    clients.forEach(c => {
      const stage = c.serviceStage || '未知';
      clientStageStats[stage] = (clientStageStats[stage] || 0) + 1;
    });

    // 女生统计
    const girlWhere = clientId ? { clientId } : {};
    const girlCount = await prisma.girl.count({ where: girlWhere });

    // 女生阶段分布
    const girls = await prisma.girl.findMany({
      where: girlWhere,
      select: { stage: true, tensionScore: true }
    });

    const girlStageStats = {};
    girls.forEach(g => {
      const stage = g.stage || '未知';
      girlStageStats[stage] = (girlStageStats[stage] || 0) + 1;
    });

    // 平均热度
    const avgTension = girls.length > 0
      ? girls.reduce((sum, g) => sum + (g.tensionScore || 5), 0) / girls.length
      : 5;

    return {
      clientCount,
      clientStageStats,
      girlCount,
      girlStageStats,
      avgTension: avgTension.toFixed(1)
    };
  } catch (error) {
    console.error('[DailyBriefGenerator] 统计失败:', error);
    return {
      clientCount: 0,
      clientStageStats: {},
      girlCount: 0,
      girlStageStats: {},
      avgTension: '5.0'
    };
  }
}

module.exports = {
  generateDailyBrief,
  getDashboardStats,
  clearBriefCache
};

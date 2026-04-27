/**
 * 每周复盘报告服务 - M007 S04
 *
 * 聚合本周数据生成复盘报告：
 * 1. 本周数据总览（新增女生/约会次数/聊天频率/热度变化）
 * 2. 预警回顾（产生/已处理/活跃）
 * 3. 关系进展（阶段升级/降级）
 * 4. 待办完成情况
 * 5. 下周行动建议（AI生成）
 * 6. 整体评估（AI生成）
 */

const prisma = require('../prisma');
const { getAIConfig } = require('../config');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 获取本周的起始和结束时间
 */
function getWeekRange(date = new Date()) {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // 周一
  const weekStart = new Date(date);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  return { weekStart, weekEnd };
}

/**
 * 获取上一周的起始时间
 */
function getLastWeekRange() {
  const { weekStart } = getWeekRange();
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(weekStart.getDate() - 7);
  return { weekStart: lastWeekStart, weekEnd: weekStart };
}

/**
 * 数据聚合（不调用AI）
 */
async function aggregateWeekData(clientId) {
  const { weekStart, weekEnd } = getWeekRange();
  const { weekStart: lastWeekStart } = getLastWeekRange();

  const girlWhere = clientId ? { clientId } : {};
  const allGirls = await prisma.girl.findMany({ where: girlWhere });
  const girlIds = allGirls.map(g => g.id);

  // 本周新增女生
  const newGirlsThisWeek = allGirls.filter(g =>
    g.createdAt >= weekStart && g.createdAt < weekEnd
  );

  // 本周约会
  const datesThisWeek = await prisma.date.findMany({
    where: {
      userId: clientId || undefined,
      createdAt: { gte: weekStart, lt: weekEnd }
    }
  });

  // 本周聊天记录数
  const chatLogsThisWeek = await prisma.chatLog.count({
    where: {
      girlId: { in: girlIds.length > 0 ? girlIds : ['none'] },
      createdAt: { gte: weekStart, lt: weekEnd }
    }
  });

  // 上周聊天记录数（用于对比）
  const chatLogsLastWeek = await prisma.chatLog.count({
    where: {
      girlId: { in: girlIds.length > 0 ? girlIds : ['none'] },
      createdAt: { gte: lastWeekStart, lt: weekStart }
    }
  });

  // 本周热度变化
  const avgTension = allGirls.length > 0
    ? allGirls.reduce((sum, g) => sum + (g.tensionScore || 5), 0) / allGirls.length
    : 5;

  // 本周预警统计
  const alertStats = await prisma.alert.findMany({
    where: {
      clientId: clientId || undefined,
      createdAt: { gte: weekStart, lt: weekEnd }
    }
  });

  const activeAlerts = await prisma.alert.count({
    where: {
      clientId: clientId || undefined,
      status: { in: ['active', 'acknowledged'] }
    }
  });

  // 本周阶段变更
  const stageChanges = await prisma.relationshipStageHistory.findMany({
    where: {
      girlId: { in: girlIds.length > 0 ? girlIds : ['none'] },
      createdAt: { gte: weekStart, lt: weekEnd }
    }
  });

  const upgrades = stageChanges.filter(h => {
    if (!h.fromStage || !h.toStage) return false;
    const levels = { EXPLORATION: 1, FLIRTING: 2, ADVANCEMENT: 3, CONFIRMATION: 4, STABLE: 5 };
    return (levels[h.toStage] || 0) > (levels[h.fromStage] || 0);
  });

  const downgrades = stageChanges.filter(h => {
    if (!h.fromStage || !h.toStage) return false;
    const levels = { EXPLORATION: 1, FLIRTING: 2, ADVANCEMENT: 3, CONFIRMATION: 4, STABLE: 5 };
    return (levels[h.toStage] || 0) < (levels[h.fromStage] || 0);
  });

  // 本周完成约会
  const completedDates = datesThisWeek.filter(d => d.status === 'completed');

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    totalGirls: allGirls.length,
    newGirlsThisWeek: newGirlsThisWeek.length,
    datesThisWeek: datesThisWeek.length,
    completedDates: completedDates.length,
    chatLogsThisWeek,
    chatLogsLastWeek,
    chatTrend: chatLogsLastWeek > 0
      ? Math.round((chatLogsThisWeek - chatLogsLastWeek) / chatLogsLastWeek * 100)
      : chatLogsThisWeek > 0 ? 100 : 0,
    avgTension: avgTension.toFixed(1),
    alertStats: {
      total: alertStats.length,
      byType: alertStats.reduce((acc, a) => {
        acc[a.severity] = (acc[a.severity] || 0) + 1;
        return acc;
      }, {}),
    },
    activeAlerts,
    stageChanges: {
      total: stageChanges.length,
      upgrades: upgrades.length,
      downgrades: downgrades.length,
      details: [
        ...upgrades.map(h => ({ girlId: h.girlId, from: h.fromStage, to: h.toStage, type: 'upgrade' })),
        ...downgrades.map(h => ({ girlId: h.girlId, from: h.fromStage, to: h.toStage, type: 'downgrade' })),
      ]
    }
  };
}

/**
 * 生成 AI 评估和建议
 */
async function generateAIInsights(data, girls) {
  const aiConfig = getAIConfig();
  if (!aiConfig) {
    return {
      overallScore: null,
      overallComment: null,
      nextWeekPriorities: null,
      generated: false,
    };
  }

  const girlsList = girls.map(g => ({
    name: g.name,
    stage: g.relationshipStage || '未知',
    tension: g.tensionScore || 5,
  }));

  const prompt = `你是两性关系运营顾问，负责对本周的鱼塘运营数据进行复盘，并给出下周建议。

【本周数据】
- 女生总数：${data.totalGirls}，新增：${data.newGirlsThisWeek}
- 本周约会：${data.datesThisWeek}次，完成：${data.completedDates}次
- 本周聊天：${data.chatLogsThisWeek}条（上週${data.chatLogsLastWeek}条，${data.chatTrend > 0 ? '↑' : '↓'}${Math.abs(data.chatTrend)}%）
- 平均热度：${data.avgTension}/10
- 预警：共${data.alertStats.total}条（P0:${data.alertStats.byType.P0||0} P1:${data.alertStats.byType.P1||0} P2:${data.alertStats.byType.P2||0}），活跃${data.activeAlerts}条
- 阶段变更：升级${data.stageChanges.upgrades}次，降级${data.stageChanges.downgrades}次

【女生列表】
${JSON.stringify(girlsList, null, 2)}

请输出 JSON：
{
  "overallScore": 1-10的评分,
  "overallComment": "一句话总结本周运营情况",
  "strengths": ["本周做得好的1-2点"],
  "concerns": ["需要关注的1-2点"],
  "nextWeekPriorities": [
    { "girlName": "女生名或ALL", "priority": "优先级描述", "reason": "原因" }
  ]
}

只输出 JSON。`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

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
        max_tokens: 1000
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) {
      console.warn('[WeeklyReview] AI 调用失败:', response.status);
      return { overallScore: null, overallComment: null, nextWeekPriorities: null, generated: false };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';

    try {
      const insights = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      return { ...insights, generated: true };
    } catch {
      console.warn('[WeeklyReview] AI 响应解析失败:', content.slice(0, 100));
      return { overallScore: null, overallComment: null, nextWeekPriorities: null, generated: false };
    }
  } catch (e) {
    console.warn('[WeeklyReview] AI 生成失败:', e.message);
    return { overallScore: null, overallComment: null, nextWeekPriorities: null, generated: false };
  }
}

/**
 * 生成周报
 */
async function generateWeeklyReview(clientId, options = {}) {
  const { weekStart } = getWeekRange();
  const girlsWhere = clientId ? { clientId } : {};
  const girls = await prisma.girl.findMany({ where: girlsWhere });

  // 聚合数据
  const data = await aggregateWeekData(clientId);

  // AI 增强
  const insights = await generateAIInsights(data, girls);

  const review = {
    clientId: clientId || 'all',
    weekOf: weekStart.toISOString(),
    ...data,
    ...insights,
    generatedAt: new Date().toISOString(),
  };

  // 保存到 WeeklyReview 表
  if (options.save !== false) {
    try {
      const { weekOf } = getWeekRange();
      await prisma.weeklyReview.upsert({
        where: {
          clientId_weekOf: {
            clientId: clientId || 'system',
            weekOf,
          }
        },
        create: {
          clientId: clientId || 'system',
          weekOf,
          weekStart: data.weekStart,
          weekEnd: data.weekEnd,
          totalGirls: data.totalGirls,
          newGirlsThisWeek: data.newGirlsThisWeek,
          datesThisWeek: data.datesThisWeek,
          completedDates: data.completedDates,
          chatLogsThisWeek: data.chatLogsThisWeek,
          chatLogsLastWeek: data.chatLogsLastWeek,
          chatTrend: data.chatTrend,
          avgTension: parseFloat(data.avgTension) || 5.0,
          alertTotal: data.alertStats.total,
          alertP0: data.alertStats.byType.P0 || 0,
          alertP1: data.alertStats.byType.P1 || 0,
          alertP2: data.alertStats.byType.P2 || 0,
          activeAlerts: data.activeAlerts,
          stageChangesTotal: data.stageChanges.total,
          stageUpgrades: data.stageChanges.upgrades,
          stageDowngrades: data.stageChanges.downgrades,
          overallScore: insights.overallScore || null,
          overallComment: insights.overallComment || null,
          strengths: insights.strengths ? JSON.stringify(insights.strengths) : null,
          concerns: insights.concerns ? JSON.stringify(insights.concerns) : null,
          nextWeekPriorities: insights.nextWeekPriorities ? JSON.stringify(insights.nextWeekPriorities) : null,
          aiAvailable: insights.generated || false,
        },
        update: {
          totalGirls: data.totalGirls,
          newGirlsThisWeek: data.newGirlsThisWeek,
          datesThisWeek: data.datesThisWeek,
          completedDates: data.completedDates,
          chatLogsThisWeek: data.chatLogsThisWeek,
          chatLogsLastWeek: data.chatLogsLastWeek,
          chatTrend: data.chatTrend,
          avgTension: parseFloat(data.avgTension) || 5.0,
          alertTotal: data.alertStats.total,
          alertP0: data.alertStats.byType.P0 || 0,
          alertP1: data.alertStats.byType.P1 || 0,
          alertP2: data.alertStats.byType.P2 || 0,
          activeAlerts: data.activeAlerts,
          stageChangesTotal: data.stageChanges.total,
          stageUpgrades: data.stageChanges.upgrades,
          stageDowngrades: data.stageChanges.downgrades,
          overallScore: insights.overallScore || null,
          overallComment: insights.overallComment || null,
          strengths: insights.strengths ? JSON.stringify(insights.strengths) : null,
          concerns: insights.concerns ? JSON.stringify(insights.concerns) : null,
          nextWeekPriorities: insights.nextWeekPriorities ? JSON.stringify(insights.nextWeekPriorities) : null,
          aiAvailable: insights.generated || false,
        }
      });
    } catch {
      // 保存失败不阻塞
    }
  }

  return review;
}

/**
 * 获取历史周报
 */
async function getWeeklyReviewHistory(clientId, limit = 8) {
  const records = await prisma.weeklyReview.findMany({
    where: {
      clientId: clientId || undefined,
    },
    orderBy: { generatedAt: 'desc' },
    take: limit,
  });

  return records;
}

module.exports = {
  generateWeeklyReview,
  getWeeklyReviewHistory,
  aggregateWeekData,
  getWeekRange,
};

/**
 * EpisodicMemory - 情景记忆层
 *
 * 存储历史对话的压缩摘要：
 * - compactionChain: 历史摘要链
 * - keyDecisions: 关键决策节点
 * - 当前会话状态
 */

const prisma = require('../prisma');

/**
 * 获取情景记忆
 * @param {string} memoryId - conversationMemory ID
 */
async function getEpisodicMemory(memoryId) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });

  if (!memory) return null;

  let chain = [];
  try { const parsed = memory.compactionChain ? JSON.parse(memory.compactionChain) : null; chain = Array.isArray(parsed) ? parsed : []; } catch (e) { console.warn('[EpisodicMemory] compactionChain parse failed:', e.message); chain = []; }

  return {
    memoryId: memory.id,
    clientId: memory.clientId,
    girlId: memory.girlId,
    coachId: memory.coachId,
    // 压缩状态
    isCompressed: !!memory.summary,
    compactionCount: memory.compactionCount,
    removedMessageCount: memory.removedMessageCount,
    tokenCount: memory.tokenCount,
    // 压缩链
    compactionChain: chain,
    currentSummary: memory.summary,
    // 关键决策（从摘要提取）
    keyDecisions: extractKeyDecisions(memory.summary, chain),
    // 时间信息
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    duration: memory.updatedAt - memory.createdAt,
  };
}

/**
 * 从摘要中提取关键决策节点
 * 这是轻量级提取，不需要 AI
 */
function extractKeyDecisions(currentSummary, compactionChain) {
  const allSummaries = [currentSummary, ...compactionChain.map(c => c.summary)].filter(Boolean);

  const decisions = [];

  // 关键模式匹配
  const keyPatterns = [
    /阶段[切换调整到]+([^\s，。]+)/,
    /确定[策略方向计划]+[为是]?([^\s，。]+)/,
    /采取[行动策略]+([^\s，。]+)/,
    /结论[为是]+([^\s，。]+)/,
    /判断[为是]+([^\s，。]+)/,
  ];

  for (const summary of allSummaries) {
    for (const pattern of keyPatterns) {
      const match = summary.match(pattern);
      if (match) {
        decisions.push({
          decision: match[0],
          detail: match[1] || '',
          source: summary.slice(0, 100),
        });
      }
    }
  }

  // 去重，返回最近5条
  const seen = new Set();
  const unique = decisions.filter(d => {
    const key = d.decision.slice(0, 20);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(-5);
}

/**
 * 追加关键事件到情景记忆
 * @param {string} memoryId - conversationMemory ID
 * @param {Object} event - { type, content, timestamp }
 */
async function addKeyEvent(memoryId, event) {
  // 轻量实现：存储在 extendedField 或 signals 中
  // 实际项目中可扩展 Prisma schema 添加 keyEvents 字段
  const memory = await prisma.conversationMemory.findUnique({ where: { id: memoryId } });
  if (!memory) return null;

  let events = [];
  try {
    const parsed = memory.extended ? JSON.parse(memory.extended) : null;
    events = (parsed && Array.isArray(parsed.keyEvents)) ? parsed.keyEvents : [];
  } catch (e) { console.warn('[EpisodicMemory] extended parse failed:', e.message); events = []; }

  events.push({
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  });

  // 限制最多50条事件
  if (events.length > 50) {
    events = events.slice(-50);
  }

  const updated = await prisma.conversationMemory.update({
    where: { id: memoryId },
    data: {
      extended: JSON.stringify({ keyEvents: events })
    }
  });

  return events;
}

/**
 * 获取会话的压缩历史（用于展示）
 * @param {string} memoryId - conversationMemory ID
 */
async function getCompactionHistory(memoryId) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });

  if (!memory) return null;

  let chain = [];
  try { const parsed = memory.compactionChain ? JSON.parse(memory.compactionChain) : null; chain = Array.isArray(parsed) ? parsed : []; } catch (e) { console.warn('[EpisodicMemory] compactionChain parse failed:', e.message); chain = []; }

  return {
    memoryId,
    compactionCount: memory.compactionCount,
    removedMessageCount: memory.removedMessageCount,
    currentSummary: memory.summary,
    chain: chain.map(c => {
      if (!c || !c.summary) return null;
      return {
        seq: c.seq,
        summary: c.summary,
        timestamp: c.timestamp,
        summaryPreview: c.summary.slice(0, 60) + (c.summary.length > 60 ? '...' : ''),
      };
    }).filter(Boolean),
  };
}

/**
 * 获取跨会话的情景记忆（女生视角）
 * 聚合该女生所有历史会话的关键信息
 */
async function getCrossSessionEpisodicMemory(girlId) {
  const sessions = await prisma.conversationMemory.findMany({
    where: { girlId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      compactionCount: true,
      removedMessageCount: true,
      summary: true,
      compactionChain: true,
      createdAt: true,
      updatedAt: true,
    }
  });

  // 聚合所有摘要
  const allSummaries = [];
  for (const s of sessions) {
    if (s.summary) allSummaries.push({ summary: s.summary, timestamp: s.updatedAt });
    if (s.compactionChain) {
      try {
        const parsedChain = s.compactionChain ? JSON.parse(s.compactionChain) : null;
        const chain = Array.isArray(parsedChain) ? parsedChain : [];
        for (const c of chain) {
          if (c && typeof c === 'object' && c.summary) {
            allSummaries.push({ summary: c.summary, timestamp: c.timestamp });
          }
        }
      } catch (e) { console.warn('[EpisodicMemory] compactionChain parse failed:', e.message); }
    }
  }

  // 提取关键信息
  const keyInfo = extractKeyInfoFromSummaries(allSummaries);

  return {
    girlId,
    sessionCount: sessions.length,
    totalCompactions: sessions.reduce((sum, s) => sum + s.compactionCount, 0),
    totalRemoved: sessions.reduce((sum, s) => sum + s.removedMessageCount, 0),
    keyInfo,
    latestSession: sessions[0]?.id || null,
  };
}

/**
 * 从多个摘要中提取关键信息（轻量）
 */
function extractKeyInfoFromSummaries(summaries) {
  const info = {
    stages: [],
    actions: [],
    insights: [],
  };

  for (const { summary } of summaries) {
    if (!summary) continue;

    // 提取阶段信息
    const stageMatches = summary.match(/阶段[：:][^\n]+/g);
    if (stageMatches) info.stages.push(...stageMatches.slice(0, 2));

    // 提取关键行动
    const actionMatches = summary.match(/[待将]?[做处]?理[的事]?[为是]?[^\n，,。]+/g);
    if (actionMatches) info.actions.push(...actionMatches.slice(0, 2));

    // 提取洞见
    const insightMatches = summary.match(/[关键核心重要]?[发现洞察判断结论][为是]?[^\n，,。]+/g);
    if (insightMatches) info.insights.push(...insightMatches.slice(0, 2));
  }

  // 去重
  const dedup = arr => [...new Set(arr)].slice(0, 5);
  return {
    stages: dedup(info.stages),
    actions: dedup(info.actions),
    insights: dedup(info.insights),
  };
}

module.exports = {
  getEpisodicMemory,
  addKeyEvent,
  getCompactionHistory,
  getCrossSessionEpisodicMemory,
  extractKeyDecisions,
  extractKeyInfoFromSummaries,
};
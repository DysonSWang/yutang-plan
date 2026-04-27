/**
 * Memory Service - 多轮对话记忆管理
 *
 * CC风格会话管理：
 * 1. Token预算驱动压缩（而非固定消息数截断）
 * 2. 递归压缩链（Previously/Newly compacted context）
 * 3. Summary压缩（优先级行选择 + 硬限制）
 * 4. 保留最近消息verbatim
 * 5. Signal pruning（30天滚动窗口）
 */

const prisma = require('../prisma');
const compaction = require('./compaction');

// ---- 内部配置 ----
const MAX_STORED_MESSAGES = 50; // 硬上限（防止极端情况）

// ---- 内部工具 ----

/**
 * 解析messages JSON
 */
function parseMessages(memory) {
  try {
    return JSON.parse(memory.messages || '[]');
  } catch (e) {
    console.warn(`[Memory] parseMessages 失败 id=${memory.id}:`, e.message);
    return [];
  }
}

/**
 * 序列化messages为JSON字符串
 */
function serializeMessages(messages) {
  return JSON.stringify(messages);
}

/**
 * 获取会话（允许null girlId）
 */
async function getOrCreateMemory(clientId, coachId, girlId = null) {
  // 必须加 take:1 —— orderBy + findFirst 在多条记录匹配时会返回排序后的第一条，
  // 而在并发创建时可能返回刚插入的那条之前就存在的记录，导致跨 girlId 串会话。
  // exact match (clientId + coachId + girlId) 确保每个组合唯一。
  let memory = await prisma.conversationMemory.findFirst({
    where: {
      clientId,
      coachId,
      girlId: girlId || null,
      summary: null  // 没有摘要的才是活跃会话
    },
    orderBy: { updatedAt: 'desc' },
    take: 1
  });

  if (!memory) {
    memory = await prisma.conversationMemory.create({
      data: {
        clientId,
        coachId,
        girlId: girlId || null,
        messages: '[]',
        summary: null,
        signals: null,
        stageChanged: false,
        compactionCount: 0,
        removedMessageCount: 0,
        compactionChain: null,
        tokenCount: 0
      }
    });
    console.log(`[Memory] Created new session: ${memory.id}`);
  }

  return memory;
}

/**
 * 执行压缩
 */
async function runCompaction(memory) {
  const messages = parseMessages(memory);
  const compactedPrefixLen = compaction.getCompactedPrefixLen(memory);

  // 需要压缩的消息范围（跳过已有的summary）
  const toCompact = messages.slice(compactedPrefixLen, -compaction.PRESERVE_RECENT_MESSAGES);

  if (toCompact.length === 0) {
    return null;
  }

  // 提取历史压缩摘要链
  let existingChain = null;
  try {
    existingChain = memory.compactionChain ? JSON.parse(memory.compactionChain) : null;
  } catch (e) {
    console.warn(`[Memory] compactionChain 解析失败 memory.id=${memory.id}:`, e.message);
    existingChain = null;
  }

  // 获取历史摘要（如果有）
  let existingSummary = null;
  if (memory.summary) {
    existingSummary = memory.summary;
  } else if (existingChain && existingChain.length > 0) {
    // 从chain最后一个条目提取摘要
    existingSummary = existingChain[existingChain.length - 1].summary;
  }

  // 生成新摘要
  const newSummary = await compaction.generateSummary(toCompact, existingSummary);

  // 合并新旧摘要（递归链）
  const mergedSummary = compaction.mergeCompactSummaries(existingSummary, newSummary);

  // 追加到chain
  const newChain = compaction.appendToCompactionChain(memory.compactionChain, mergedSummary);

  // 提取或更新硬约束（女生禁忌等信息）
  let hardConstraints = memory.hardConstraints ? JSON.parse(memory.hardConstraints) : null;
  if (!hardConstraints && memory.girlId) {
    // 首次压缩：从女生档案提取硬约束
    const girl = await prisma.girl.findUnique({
      where: { id: memory.girlId },
      select: {
        personality: true,
        thingsToAvoid: true,
        dealbreakers: true,
        stage: true,
        emotionalWounds: true
      }
    });
    if (girl) {
      let personality = {};
      try { personality = girl.personality ? JSON.parse(girl.personality) : {}; } catch (e) { /* ignore */ }
      hardConstraints = {
        taboos: personality.thingsToAvoid || [],
        emotionalTriggers: personality.emotionalTriggers || [],
        thingsToAvoid: girl.thingsToAvoid ? girl.thingsToAvoid.split(',').map(s => s.trim()).filter(Boolean) : [],
        dealbreakers: girl.dealbreakers ? girl.dealbreakers.split(',').map(s => s.trim()).filter(Boolean) : [],
        stage: girl.stage || null
      };
    }
  }

  // 保留消息：压缩后的continuation + 最近的N条
  const recentMessages = messages.slice(-compaction.PRESERVE_RECENT_MESSAGES);
  const continuationText = compaction.buildCompactContinuationMessage(
    {
      summary: mergedSummary,
      removedCount: toCompact.length,
      chain: newChain ? JSON.parse(newChain) : []
    },
    compaction.PRESERVE_RECENT_MESSAGES > 0,
    hardConstraints
  );

  // 构建压缩后的消息列表
  const compactedMessages = [
    {
      role: 'system',
      content: continuationText,
      timestamp: new Date().toISOString()
    },
    ...recentMessages
  ];

  // 计算新的token数（只统计未压缩的）
  const remainingTokens = compaction.estimateTotalTokens(recentMessages);

  // 更新数据库（原子操作）
  await prisma.conversationMemory.update({
    where: { id: memory.id },
    data: {
      messages: serializeMessages(compactedMessages),
      summary: mergedSummary, // 标记为已压缩
      compactionCount: memory.compactionCount + 1,
      removedMessageCount: memory.removedMessageCount + toCompact.length,
      compactionChain: newChain,
      tokenCount: remainingTokens,
      hardConstraints: hardConstraints ? JSON.stringify(hardConstraints) : memory.hardConstraints
    }
  });

  console.log(`[Memory] Compacted session ${memory.id}: removed ${toCompact.length} messages, ` +
    `chain length: ${newChain ? JSON.parse(newChain).length : 0}, ` +
    `remaining tokens: ~${remainingTokens}`);

  return {
    removedCount: toCompact.length,
    summary: mergedSummary,
    chainLength: newChain ? JSON.parse(newChain).length : 0
  };
}

// ---- 公开 API ----

/**
 * 创建或获取会话记忆
 */
async function getOrCreateMemorySession(clientId, coachId, girlId = null) {
  return getOrCreateMemory(clientId, coachId, girlId);
}

/**
 * 添加消息到会话记忆
 */
async function addMessage(memoryId, role, content) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });

  if (!memory) return null;

  const messages = parseMessages(memory);

  const newMsg = {
    role,
    content,
    timestamp: new Date().toISOString()
  };

  const estimatedTokens = compaction.estimateMessageTokens(newMsg);

  // 构建新消息列表
  const newMessages = [...messages, newMsg];

  // 软上限：超过MAX_STORED_MESSAGES时移除最早的（非压缩）
  if (newMessages.length > MAX_STORED_MESSAGES) {
    const compactedPrefix = compaction.getCompactedPrefixLen(memory);
    // 只在极端情况下强制截断（保留至少2条 + continuation）
    if (newMessages.length > compactedPrefix + compaction.PRESERVE_RECENT_MESSAGES + 5) {
      const removeCount = newMessages.length - (compactedPrefix + compaction.PRESERVE_RECENT_MESSAGES + 5);
      newMessages.splice(compactedPrefix, removeCount);
    }
  }

  // 更新token计数（如果会话未压缩，才累加）
  const newTokenCount = memory.summary
    ? memory.tokenCount
    : memory.tokenCount + estimatedTokens;

  await prisma.conversationMemory.update({
    where: { id: memoryId },
    data: {
      messages: serializeMessages(newMessages),
      tokenCount: newTokenCount
    }
  });

  // 检查是否需要压缩
  const updated = { ...memory, messages: serializeMessages(newMessages), tokenCount: newTokenCount };
  if (compaction.shouldCompact(updated)) {
    console.log(`[Memory] Token count ${newTokenCount} >= threshold ${compaction.MAX_ESTIMATED_TOKENS}, running compaction...`);
    await runCompaction(updated);
  }

  return newMessages.length;
}

/**
 * 检查是否需要压缩
 */
async function shouldSummarize(memoryId) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });
  if (!memory) return false;
  return compaction.shouldCompact(memory);
}

/**
 * 获取对话历史（带压缩链）
 * 返回: [compaction chain summaries] + [continuation system msg] + [recent messages]
 */
async function getConversationHistory(memoryId) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });

  if (!memory) return [];

  const messages = parseMessages(memory);

  if (!memory.summary) {
    // 未压缩：返回所有消息
    return messages;
  }

  // 已压缩：构建包含chain的上下文
  const result = [];

  // 1. 压缩链中的历史摘要（最多展示最近2个）
  let chain = null;
  try {
    chain = memory.compactionChain ? JSON.parse(memory.compactionChain) : null;
  } catch (e) {
    console.warn(`[Memory] compactionChain 解析失败 memoryId=${memory?.id || memoryId}:`, e.message);
    chain = null;
  }

  if (chain && chain.length > 0) {
    // 展示chain中的摘要作为参考上下文
    const recentChainEntries = chain.slice(-2);
    for (const entry of recentChainEntries) {
      result.push({
        role: 'system',
        content: `[历史摘要 #${entry.seq}] ${entry.summary}`,
        timestamp: entry.timestamp
      });
    }
  }

  // 2. 消息列表中已存的continuation system消息
  // （第一条应该是system continuation）
  if (messages.length > 0 && messages[0].role === 'system') {
    result.push(messages[0]);
    result.push(...messages.slice(1));
  } else {
    result.push(...messages);
  }

  return result;
}

/**
 * 获取会话摘要信息（用于调试/展示）
 */
async function getSessionStats(memoryId) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });

  if (!memory) return null;

  let chain = null;
  try {
    chain = memory.compactionChain ? JSON.parse(memory.compactionChain) : null;
  } catch (e) {
    console.warn(`[Memory] compactionChain 解析失败 memoryId=${memory?.id || memoryId}:`, e.message);
    chain = null;
  }

  return {
    messageCount: parseMessages(memory).length,
    tokenCount: memory.tokenCount,
    compactionCount: memory.compactionCount,
    removedMessageCount: memory.removedMessageCount,
    chainLength: chain ? chain.length : 0,
    isCompressed: !!memory.summary,
    currentSummary: memory.summary
  };
}

/**
 * 获取或创建会话并返回对话历史
 */
async function getOrCreateSession(clientId, coachId, girlId = null) {
  const memory = await getOrCreateMemory(clientId, coachId, girlId);
  const history = await getConversationHistory(memory.id);
  return { memory, history };
}

/**
 * 结束会话（生成最终摘要）
 */
async function endSession(memoryId, finalSummary = null) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });

  if (!memory) return;

  let summary = finalSummary;
  if (!summary && !memory.summary) {
    // 生成最终摘要
    const messages = parseMessages(memory);
    summary = await compaction.generateSummary(messages, null);
  } else if (!summary) {
    summary = memory.summary;
  }

  await prisma.conversationMemory.update({
    where: { id: memoryId },
    data: { summary }
  });

  console.log(`[Memory] Ended session ${memoryId}`);
}

/**
 * 手动触发压缩（用于测试或管理员操作）
 */
async function forceCompaction(memoryId) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });

  if (!memory) return null;
  return runCompaction(memory);
}

/**
 * 记录AI教练反馈（thumbs up/down）
 * 用于分析路由准确度和教练效果
 */
async function addFeedback(memoryId, feedbackType, meta = {}) {
  const { routedType, coachesUsed, reason, messageContent } = meta;

  const feedback = await prisma.coachFeedback.create({
    data: {
      memoryId,
      type: feedbackType, // 'helpful' | 'not_helpful'
      routedType: routedType || null,
      coachesUsed: coachesUsed ? JSON.stringify(coachesUsed) : null,
      reason: reason || null,
      messageContent: messageContent || null
    }
  });

  console.log(`[Memory] Coach feedback: ${feedbackType} for memory ${memoryId}`);
  return feedback;
}

/**
 * 获取反馈统计（用于分析路由和教练效果）
 */
async function getFeedbackStats(opts = {}) {
  const { clientId, startDate, endDate } = opts;

  const where = {};
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const feedbacks = await prisma.coachFeedback.findMany({
    where,
    select: {
      type: true,
      routedType: true,
      coachesUsed: true,
      reason: true,
      createdAt: true
    }
  });

  if (feedbacks.length === 0) {
    return { total: 0, helpful: 0, notHelpful: 0, rate: 0, byType: {}, byCoach: {} };
  }

  const total = feedbacks.length;
  const helpful = feedbacks.filter(f => f.type === 'helpful').length;
  const notHelpful = feedbacks.filter(f => f.type === 'not_helpful').length;

  // 按路由类型统计
  const byType = {};
  for (const f of feedbacks) {
    const type = f.routedType || 'unknown';
    if (!byType[type]) byType[type] = { total: 0, helpful: 0, rate: 0 };
    byType[type].total++;
    if (f.type === 'helpful') byType[type].helpful++;
  }
  for (const type of Object.keys(byType)) {
    byType[type].rate = byType[type].total > 0
      ? Math.round((byType[type].helpful / byType[type].total) * 100)
      : 0;
  }

  // 按教练统计
  const byCoach = {};
  for (const f of feedbacks) {
    if (!f.coachesUsed) continue;
    try {
      const coaches = JSON.parse(f.coachesUsed);
      for (const coach of coaches) {
        if (!byCoach[coach]) byCoach[coach] = { total: 0, helpful: 0, rate: 0 };
        byCoach[coach].total++;
        if (f.type === 'helpful') byCoach[coach].helpful++;
      }
    } catch (e) { /* ignore */ }
  }
  for (const coach of Object.keys(byCoach)) {
    byCoach[coach].rate = byCoach[coach].total > 0
      ? Math.round((byCoach[coach].helpful / byCoach[coach].total) * 100)
      : 0;
  }

  return {
    total,
    helpful,
    notHelpful,
    rate: Math.round((helpful / total) * 100),
    byType,
    byCoach
  };
}

// ---- 监控 API ----

/**
 * 列出所有会话（支持分页和过滤）
 * @param {Object} opts
 * @param {string} opts.clientId - 按客户过滤（可选）
 * @param {string} opts.girlId - 按女生过滤（可选）
 * @param {string} opts.coachId - 按教练过滤（可选）
 * @param {boolean} opts.activeOnly - 只看活跃会话（未压缩）
 * @param {boolean} opts.compressedOnly - 只看已压缩会话
 * @param {number} opts.page - 页码（从1开始）
 * @param {number} opts.pageSize - 每页数量
 */
async function listSessions({ clientId, girlId, coachId, activeOnly, compressedOnly, page = 1, pageSize = 20 } = {}) {
  const where = {};

  if (clientId) where.clientId = clientId;
  if (girlId) where.girlId = girlId;
  if (coachId) where.coachId = coachId;
  if (activeOnly) where.summary = null;
  if (compressedOnly) where.summary = { not: null };

  const skip = (page - 1) * pageSize;

  const [sessions, total] = await Promise.all([
    prisma.conversationMemory.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        clientId: true,
        girlId: true,
        coachId: true,
        summary: true,
        compactionCount: true,
        removedMessageCount: true,
        compactionChain: true,
        tokenCount: true,
        createdAt: true,
        updatedAt: true,
        messages: true
      }
    }),
    prisma.conversationMemory.count({ where })
  ]);

  const items = sessions.map(s => {
    let chainLength = 0;
    if (s.compactionChain) {
      try { chainLength = JSON.parse(s.compactionChain).length; } catch (e) { console.warn(`[Memory] listSessions chainLength 解析失败 id=${s.id}:`, e.message); }
    }
    return {
      id: s.id,
      clientId: s.clientId,
      girlId: s.girlId,
      coachId: s.coachId,
      isCompressed: !!s.summary,
      compactionCount: s.compactionCount,
      removedMessageCount: s.removedMessageCount,
      chainLength,
      tokenCount: s.tokenCount,
      messageCount: (() => {
        try { return JSON.parse(s.messages || '[]').length; } catch (e) { console.warn(`[Memory] listSessions messageCount 解析失败 id=${s.id}:`, e.message); return 0; }
      })(),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

/**
 * 获取某客户所有会话（按女生分组）
 */
async function getClientSessions(clientId) {
  const sessions = await prisma.conversationMemory.findMany({
    where: { clientId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      girlId: true,
      coachId: true,
      summary: true,
      compactionCount: true,
      removedMessageCount: true,
      compactionChain: true,
      tokenCount: true,
      createdAt: true,
      updatedAt: true,
      messages: true
    }
  });

  // 提取女生信息
  const girlIds = [...new Set(sessions.map(s => s.girlId).filter(Boolean))];
  const girls = await prisma.girl.findMany({
    where: { id: { in: girlIds } },
    select: { id: true, name: true, stage: true, tensionScore: true }
  });
  const girlMap = new Map(girls.map(g => [g.id, g]));

  // 按女生分组
  const byGirl = new Map();
  for (const s of sessions) {
    const key = s.girlId || '_global_';
    if (!byGirl.has(key)) {
      byGirl.set(key, []);
    }
    let chainLength = 0;
    if (s.compactionChain) {
      try { chainLength = JSON.parse(s.compactionChain).length; } catch (e) { console.warn(`[Memory] getClientSessions chainLength 解析失败 id=${s.id}:`, e.message); }
    }
    byGirl.get(key).push({
      id: s.id,
      coachId: s.coachId,
      isCompressed: !!s.summary,
      compactionCount: s.compactionCount,
      removedMessageCount: s.removedMessageCount,
      chainLength,
      tokenCount: s.tokenCount,
      messageCount: (() => {
        try { return JSON.parse(s.messages || '[]').length; } catch (e) { console.warn(`[Memory] getClientSessions messageCount 解析失败 id=${s.id}:`, e.message); return 0; }
      })(),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    });
  }

  // 构建按女生的聚合视图
  const result = [];
  for (const [girlId, sessionsOfGirl] of byGirl) {
    const girl = girlMap.get(girlId);
    const totalMessages = sessionsOfGirl.reduce((sum, s) => sum + s.messageCount, 0);
    const totalCompactions = sessionsOfGirl.reduce((sum, s) => sum + s.compactionCount, 0);
    const activeCount = sessionsOfGirl.filter(s => !s.isCompressed).length;
    result.push({
      girlId: girlId === '_global_' ? null : girlId,
      girlName: girl ? girl.name : null,
      girlStage: girl ? girl.stage : null,
      girlTensionScore: girl ? girl.tensionScore : null,
      sessionCount: sessionsOfGirl.length,
      activeSessionCount: activeCount,
      totalMessages,
      totalCompactions,
      sessions: sessionsOfGirl,
      latestActivity: sessionsOfGirl[0]?.updatedAt || null
    });
  }

  return {
    clientId,
    totalSessions: sessions.length,
    activeSessions: sessions.filter(s => !s.summary).length,
    byGirl: result
  };
}

/**
 * 获取系统级监控统计
 */
async function getSystemStats() {
  const [
    totalSessions,
    activeSessions,
    compressedSessions,
    allSessions
  ] = await Promise.all([
    prisma.conversationMemory.count(),
    prisma.conversationMemory.count({ where: { summary: null } }),
    prisma.conversationMemory.count({ where: { summary: { not: null } } }),
    prisma.conversationMemory.findMany({
      select: {
        compactionCount: true,
        removedMessageCount: true,
        tokenCount: true,
        messages: true
      }
    })
  ]);

  const totalMessagesRemoved = allSessions.reduce((sum, s) => sum + s.removedMessageCount, 0);
  const totalCompactions = allSessions.reduce((sum, s) => sum + s.compactionCount, 0);
  const totalTokens = allSessions.reduce((sum, s) => sum + s.tokenCount, 0);

  // 最近7天新建的会话
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentSessions = await prisma.conversationMemory.count({
    where: { createdAt: { gte: sevenDaysAgo } }
  });

  // Token使用分布（桶）
  const tokenBuckets = { low: 0, medium: 0, high: 0 };
  for (const s of allSessions) {
    if (s.tokenCount < 2000) tokenBuckets.low++;
    else if (s.tokenCount < 6000) tokenBuckets.medium++;
    else tokenBuckets.high++;
  }

  return {
    totalSessions,
    activeSessions,
    compressedSessions,
    compressionRate: totalSessions > 0
      ? Math.round((compressedSessions / totalSessions) * 100) / 100
      : 0,
    totalCompactions,
    totalMessagesRemoved,
    totalTokens,
    recentSessions,
    tokenDistribution: tokenBuckets,
    avgMessagesPerSession: totalSessions > 0
      ? Math.round((totalMessagesRemoved + allSessions.reduce((sum, s) => {
          try { return sum + JSON.parse(s.messages || '[]').length; } catch (e) { console.warn(`[Memory] getSystemStats messages 解析失败 id=${s?.id}:`, e.message); return sum; }
        }, 0)) / totalSessions)
      : 0
  };
}

/**
 * 获取单个会话的完整详情
 */
async function getSessionDetail(memoryId) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });

  if (!memory) return null;

  let chain = null;
  if (memory.compactionChain) {
    try { chain = JSON.parse(memory.compactionChain); } catch (e) { console.warn(`[Memory] getSessionDetail chain 解析失败 memoryId=${memoryId}:`, e.message); chain = []; }
  }

  const messages = (() => {
    try { return JSON.parse(memory.messages || '[]'); } catch (e) { console.warn(`[Memory] getSessionDetail messages 解析失败 memoryId=${memoryId}:`, e.message); return []; }
  })();

  return {
    id: memory.id,
    clientId: memory.clientId,
    girlId: memory.girlId,
    coachId: memory.coachId,
    isCompressed: !!memory.summary,
    compactionCount: memory.compactionCount,
    removedMessageCount: memory.removedMessageCount,
    chainLength: chain ? chain.length : 0,
    compactionChain: chain,
    currentSummary: memory.summary,
    tokenCount: memory.tokenCount,
    messageCount: messages.length,
    messages: messages.slice(-10), // 只返回最近10条（完整历史太长）
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt
  };
}

module.exports = {
  getOrCreateMemorySession: getOrCreateMemorySession,
  addMessage,
  shouldSummarize,
  getConversationHistory,
  getSessionStats,
  getOrCreateSession,
  endSession,
  forceCompaction,

  // 反馈 API
  addFeedback,
  getFeedbackStats,
  // 监控 API
  listSessions,
  getClientSessions,
  getSystemStats,
  getSessionDetail
};

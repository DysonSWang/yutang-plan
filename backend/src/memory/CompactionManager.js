/**
 * CompactionManager - Token预算感知压缩管理器
 *
 * 封装 services/compaction.js 的压缩逻辑，提供：
 * 1. 预算监控（实时 token 估算）
 * 2. 自动压缩触发
 * 3. 压缩状态查询
 */

const compaction = require('../services/compaction');

const MAX_ESTIMATED_TOKENS = compaction.MAX_ESTIMATED_TOKENS;

/**
 * 获取预算状态
 * @param {number} tokenCount - 当前token数
 * @returns {object} { level, label, color, remaining, percentage }
 */
function getBudgetStatus(tokenCount) {
  const percentage = Math.round((tokenCount / MAX_ESTIMATED_TOKENS) * 100);

  let level, label, color;
  if (tokenCount < 6000) {
    level = 'safe'; label = '安全'; color = 'green';
  } else if (tokenCount < MAX_ESTIMATED_TOKENS) {
    level = 'warning'; label = '预警'; color = 'yellow';
  } else {
    level = 'danger'; label = '危险'; color = 'red';
  }

  return {
    level,
    label,
    color,
    tokenCount,
    remaining: MAX_ESTIMATED_TOKENS - tokenCount,
    percentage: Math.min(percentage, 100),
    threshold: MAX_ESTIMATED_TOKENS,
  };
}

/**
 * 判断是否需要压缩
 */
function shouldCompact(memory) {
  return compaction.shouldCompact(memory);
}

/**
 * 执行压缩
 * @param {Object} memory - Prisma conversationMemory record
 * @param {Object} opts - { onProgress, dryRun }
 * @returns {Promise<{ removedCount, summary, chainLength }>}
 */
async function runCompaction(memory, opts = {}) {
  const { dryRun } = opts;

  const messages = (() => {
    try {
      const parsed = JSON.parse(memory.messages || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();

  const compactedPrefixLen = compaction.getCompactedPrefixLen(memory);
  const toCompact = messages.slice(compactedPrefixLen, -compaction.PRESERVE_RECENT_MESSAGES);

  if (toCompact.length === 0) {
    return { removedCount: 0, summary: null, chainLength: 0, skipped: true };
  }

  if (dryRun) {
    return {
      removedCount: toCompact.length,
      estimatedTokens: compaction.estimateTotalTokens(toCompact),
      chainLength: (() => { try { return memory.compactionChain ? JSON.parse(memory.compactionChain).length : 0; } catch { return 0; } })(),
      skipped: false,
      dryRun: true,
    };
  }

  // 构建现有链和摘要
  let existingChain = null;
  try { existingChain = memory.compactionChain ? JSON.parse(memory.compactionChain) : null; } catch (e) { console.warn('[CompactionManager] compactionChain parse failed:', e.message); existingChain = null; }

  let existingSummary = null;
  if (memory.summary) {
    existingSummary = memory.summary;
  } else if (existingChain && existingChain.length > 0) {
    existingSummary = existingChain[existingChain.length - 1].summary;
  }

  // 生成新摘要
  const newSummary = await compaction.generateSummary(toCompact, existingSummary);

  // 合并新旧摘要
  const mergedSummary = compaction.mergeCompactSummaries(existingSummary, newSummary);

  // 追加到chain
  const newChain = compaction.appendToCompactionChain(memory.compactionChain, mergedSummary);

  // 提取硬约束
  let hardConstraints = null;
  if (memory.hardConstraints) {
    try { hardConstraints = JSON.parse(memory.hardConstraints); } catch (e) { console.warn('[CompactionManager] hardConstraints parse failed:', e.message); hardConstraints = null; }
  }

  // 构建压缩后的消息列表
  const recentMessages = messages.slice(-compaction.PRESERVE_RECENT_MESSAGES);
  const continuationText = compaction.buildCompactContinuationMessage(
    { summary: mergedSummary, removedCount: toCompact.length, chain: (() => { try { return newChain ? JSON.parse(newChain) : []; } catch { return []; } })() },
    compaction.PRESERVE_RECENT_MESSAGES > 0,
    hardConstraints
  );

  const compactedMessages = [
    { role: 'system', content: continuationText, timestamp: new Date().toISOString() },
    ...recentMessages
  ];

  const remainingTokens = compaction.estimateTotalTokens(recentMessages);

  return {
    removedCount: toCompact.length,
    summary: mergedSummary,
    chainLength: (() => { try { return newChain ? JSON.parse(newChain).length : 0; } catch { return 0; } })(),
    remainingTokens,
    compactedMessages,
    newChain,
    skipped: false,
  };
}

/**
 * 压缩提示生成（用于 AI 调用的系统提示）
 */
function buildCompactionHint(memory) {
  if (!memory.compactionChain) return null;

  try {
    const chain = JSON.parse(memory.compactionChain);
    if (!chain || chain.length === 0) return null;

    const recent = chain.slice(-2);
    return `【历史压缩】本会话已压缩${chain.length}次。` +
      recent.map(c => `(#${c.seq}) ${c.summary}`).join(' | ');
  } catch {
    return null;
  }
}

module.exports = {
  MAX_ESTIMATED_TOKENS,
  getBudgetStatus,
  shouldCompact,
  runCompaction,
  buildCompactionHint,
  PRESERVE_RECENT_MESSAGES: compaction.PRESERVE_RECENT_MESSAGES,
};
/**
 * Handoff System - Agent 间交接机制
 *
 * 参照 airline/agents.py 的 on_handoff 模式：
 * - 在 Agent 切换时执行回调函数
 * - 回调负责预加载目标 Agent 所需的上下文
 * - 在 conversationHistory 中记录 handoff 事件
 *
 * 在 Express（非 Agent SDK）环境下，通过函数闭包实现类似效果。
 */

const prisma = require('../prisma');
const { getOrCreateSession, getConversationHistory, addMessage } = require('../services/memory');

/**
 * Handoff 回调：Situation Agent
 * 在切换到 Situation Agent 时执行
 */
async function onSituationHandoff(ctx) {
  ctx.logEvent('handoff', { from: ctx.previousAgent, to: 'situation', reason: ctx.handoffReason });

  // 确保有 memory session
  if (!ctx.memorySessionId) {
    const unifiedCoachId = 'unified';
    const { memory } = await getOrCreateSession(ctx.userId, unifiedCoachId, ctx.girlId);
    ctx.memorySessionId = memory.id;
  }

  // 预加载对话历史
  if (ctx.memorySessionId) {
    const history = await getConversationHistory(ctx.memorySessionId);
    ctx.conversationHistory = history;
    ctx.turnCount = history.filter(m => m.role === 'user' || m.role === 'assistant').length;
  }
}

/**
 * Handoff 回调：ChatAnalysis Agent
 */
async function onChatAnalysisHandoff(ctx) {
  ctx.logEvent('handoff', { from: ctx.previousAgent, to: 'chat_analysis', reason: ctx.handoffReason });
  // ChatAnalysis 需要聊天记录上下文，由调用方在 execute 时传入
  ctx.analysisMode = 'deep';
}

/**
 * Handoff 回调：Reply Agent
 */
async function onReplyHandoff(ctx) {
  ctx.logEvent('handoff', { from: ctx.previousAgent, to: 'reply', reason: ctx.handoffReason });
  // Reply Agent 需要女生人格上下文（已在 ctx.girlProfile 中）
}

/**
 * Handoff 回调：Moment Agent
 */
async function onMomentHandoff(ctx) {
  ctx.logEvent('handoff', { from: ctx.previousAgent, to: 'moment', reason: ctx.handoffReason });
  // Moment Agent 需要朋友圈内容（由调用方传入）
}

/**
 * Handoff 回调：Overview Agent
 */
async function onOverviewHandoff(ctx) {
  ctx.logEvent('handoff', { from: ctx.previousAgent, to: 'overview', reason: ctx.handoffReason });
  // Overview Agent 需要操盘手的客户池（由调用方加载）
  if (ctx.userId) {
    const sessions = await prisma.chatSession.findMany({
      where: { operatorId: ctx.userId },
      select: { clientId: true }
    });
    ctx.clientIds = sessions.map(s => s.clientId);
  }
}

/**
 * 执行 Handoff：切换 Agent 并运行回调
 * @param {UnifiedContext} ctx - 统一上下文
 * @param {string} targetAgent - 目标 Agent 名称
 * @param {string} reason - 切换原因
 */
async function executeHandoff(ctx, targetAgent, reason = null) {
  const fromAgent = ctx.currentAgent;
  ctx.previousAgent = fromAgent;
  ctx.currentAgent = targetAgent;
  ctx.handoffReason = reason || `${fromAgent} -> ${targetAgent}`;

  // 追加 handoff 记录到对话历史（供 Agent 感知上下文切换）
  if (ctx.memorySessionId) {
    await addMessage(ctx.memorySessionId, 'system', `[Agent切换] ${fromAgent} → ${targetAgent}${reason ? ` (${reason})` : ''}`);
  }

  // 执行对应回调
  const handoffCallbacks = {
    situation: onSituationHandoff,
    chat_analysis: onChatAnalysisHandoff,
    reply: onReplyHandoff,
    moment: onMomentHandoff,
    overview: onOverviewHandoff,
  };

  const callback = handoffCallbacks[targetAgent];
  if (callback) {
    await callback(ctx);
  }

  return ctx;
}

/**
 * 获取 handoff 回调映射（用于 Agent 定义）
 */
function getHandoffCallbacks() {
  return {
    situation: onSituationHandoff,
    chat_analysis: onChatAnalysisHandoff,
    reply: onReplyHandoff,
    moment: onMomentHandoff,
    overview: onOverviewHandoff,
  };
}

module.exports = {
  executeHandoff,
  onSituationHandoff,
  onChatAnalysisHandoff,
  onReplyHandoff,
  onMomentHandoff,
  onOverviewHandoff,
  getHandoffCallbacks,
};

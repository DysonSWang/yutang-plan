/**
 * UnifiedContext - Agent 间共享的上下文结构
 *
 * 参照 airline/context.py 的设计：所有 Agent 共享同一个上下文对象，
 * 通过 handoff 回调在 Agent 间传递状态。
 *
 * 三层记忆：
 * - Semantic Memory: 女生画像、客户偏好、学习要点 (prisma)
 * - Working Memory: 当前对话上下文、Token 预算 (this object)
 * - Episodic Memory: 历史对话压缩摘要 (conversationMemory.compactionChain)
 */

const prisma = require('../prisma');

// ---- Agent 路由类型 ----
const ROUTE_TYPES = {
  SITUATION: 'situation',       // 情况咨询
  CHAT_ANALYSIS: 'chat_analysis', // 聊天分析
  REPLY: 'reply',               // 回复建议
  MOMENT: 'moment',             // 朋友圈分析
  OVERVIEW: 'overview',         // 全局概览
  OPTIMIZE_REPLY: 'optimize_reply', // 话术优化
  GENERAL: 'general',           // 通用教练
};

// ---- Token 预算配置 ----
const MAX_CONTEXT_TOKENS = 28000;
const GUARDRAIL_RESERVE = 200;  // guardrail 输出预留
const RESPONSE_RESERVE = 600;    // AI 响应预留
const SYSTEM_PROMPT_BASE = 800;  // system prompt 开销

class UnifiedContext {
  constructor(userId) {
    // 身份
    this.userId = userId;
    this.operatorId = null;
    this.girlId = null;
    this.clientId = null;

    // 业务状态
    this.girlProfile = null;       // 女生档案
    this.clientProfile = null;    // 客户档案
    this.conversationHistory = []; // 对话历史（压缩后的）
    this.recentSignals = [];       // 近期信号
    this.pendingActions = [];      // 待推进事项
    this.observations = [];        // 观察记录

    // Agent 执行状态
    this.currentAgent = 'triage';
    this.previousAgent = null;
    this.handoffReason = null;
    this.currentRouteType = ROUTE_TYPES.GENERAL;

    // 记忆元数据
    this.turnCount = 0;
    this.compactionCount = 0;
    this.compactionChain = [];    // 压缩链（历史摘要）
    this.tokenBudget = MAX_CONTEXT_TOKENS - GUARDRAIL_RESERVE - RESPONSE_RESERVE - SYSTEM_PROMPT_BASE;

    // 内存会话引用
    this.memorySessionId = null;

    // 原始输入（用于 guardrail）
    this.originalInput = null;
    this.inputType = null;  // 'text' | 'image' | 'mixed'

    // 事件历史（用于调试/追踪）
    this.eventLog = [];

    // guardrail 结果
    this.guardrailResults = [];

    // 渲染时的原始上下文对象（避免循环引用）
    this._raw = {};
  }

  /**
   * 记录事件（handoff / tool_call / message）
   */
  logEvent(type, data) {
    this.eventLog.push({
      type,
      data,
      timestamp: Date.now(),
      agent: this.currentAgent
    });
  }

  /**
   * 设置当前路由类型
   */
  setRouteType(routeType) {
    this.currentRouteType = routeType;
    this.logEvent('route_decided', { routeType });
  }

  /**
   * 获取剩余 token 预算（字符数，中文约 1.5 chars/token）
   */
  getRemainingBudget() {
    return Math.max(0, this.tokenBudget);
  }

  /**
   * 获取公开的上下文摘要（用于注入 system prompt）
   * 不包含敏感内部状态
   */
  toPromptContext() {
    return {
      userId: this.userId,
      girlId: this.girlId,
      girlProfile: this.girlProfile,
      clientProfile: this.clientProfile,
      recentSignals: this.recentSignals,
      pendingActions: this.pendingActions,
      observations: this.observations,
      currentRouteType: this.currentRouteType,
      relationshipStage: this.girlProfile?.relationshipStage || null,
      relationshipStageLabel: this.girlProfile?.relationshipStage
        ? { EXPLORATION: '探索期', FLIRTING: '暧昧期', ADVANCEMENT: '推进期', CONFIRMATION: '确认期', STABLE: '稳定期' }[this.girlProfile.relationshipStage] || this.girlProfile.relationshipStage
        : null,
      turnCount: this.turnCount,
      compactionCount: this.compactionCount,
      conversationSummary: this.conversationSummary || null,
    };
  }

  /**
   * 获取安全的元数据（暴露给前端）
   */
  toMeta() {
    return {
      currentAgent: this.currentAgent,
      previousAgent: this.previousAgent,
      routeType: this.currentRouteType,
      turnCount: this.turnCount,
      compactionCount: this.compactionCount,
      eventCount: this.eventLog.length,
    };
  }

  /**
   * 计算当前上下文的估算 token 数
   */
  estimateTokens() {
    const ctx = this.toPromptContext();
    const text = JSON.stringify(ctx);
    // 简化估算：中文 1.5 chars/token
    return Math.ceil(text.length / 1.5);
  }
}

/**
 * 工厂函数：从请求构建 UnifiedContext
 * @param {string} userId - 用户ID
 * @param {Object} opts - { girlId, clientId, memorySessionId, originalInput }
 */
async function createUnifiedContext(userId, opts = {}) {
  const ctx = new UnifiedContext(userId);
  const { girlId, clientId, memorySessionId, originalInput } = opts;

  ctx.girlId = girlId || null;
  ctx.clientId = clientId || userId;
  ctx.memorySessionId = memorySessionId;
  ctx.originalInput = originalInput;

  // 并行加载语义记忆（女生档案 + 客户档案）
  const loadPromises = [];

  if (girlId) {
    loadPromises.push(loadGirlProfile(ctx));
  }

  if (ctx.clientId) {
    loadPromises.push(loadClientProfile(ctx));
  }

  await Promise.all(loadPromises);

  // 加载对话历史（如果存在 memorySessionId）
  if (memorySessionId) {
    const memory = require('../services/memory');
    const history = await memory.getConversationHistory(memorySessionId);
    ctx.conversationHistory = history;
    ctx.turnCount = history.filter(m => m.role === 'user' || m.role === 'assistant').length;

    // 加载 compaction chain
    const stats = await memory.getSessionStats(memorySessionId);
    if (stats) {
      ctx.compactionCount = stats.compactionCount || 0;
    }
  }

  return ctx;
}

/**
 * 加载女生档案到上下文
 */
async function loadGirlProfile(ctx) {
  if (!ctx.girlId) return;

  const girl = await prisma.girl.findUnique({ where: { id: ctx.girlId } });
  if (!girl) return;

  // 安全：验证归属权（由调用方验证）

  let personality = {};
  if (girl.personality) {
    try { personality = typeof girl.personality === 'string' ? JSON.parse(girl.personality) : girl.personality; } catch (e) {}
  }

  ctx.girlProfile = {
    id: girl.id,
    name: girl.name,
    stage: girl.stage,
    sourcePlatform: girl.sourcePlatform,
    intimacyLevel: girl.intimacyLevel,
    intimacyLevelUpdatedAt: girl.intimacyLevelUpdatedAt,
    tensionScore: girl.tensionScore || 5.0,
    tensionScoreUpdatedAt: girl.tensionScoreUpdatedAt,
    age: girl.age,
    occupation: girl.occupation,
    personality,
    notes: girl.notes,
    updatedAt: girl.updatedAt,
    lastContact: girl.lastContact,
    relationshipStage: girl.relationshipStage,
    relationshipStageUpdatedAt: girl.relationshipStageUpdatedAt,
    // 战略字段
    relationshipAttitude: girl.relationshipAttitude,
    bestApproach: girl.bestApproach,
    recommendedTopics: girl.recommendedTopics,
    upgradeConditions: girl.upgradeConditions,
    riskFactors: girl.riskFactors,
    strategicNotes: girl.strategicNotes,
    responsePattern: girl.responsePattern,
  };

  // 解析 signals（近期30天）
  if (girl.signals) {
    try {
      const allSignals = JSON.parse(girl.signals);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      ctx.recentSignals = allSignals.filter(s => new Date(s.date) >= thirtyDaysAgo);
    } catch (e) {
      ctx.recentSignals = [];
    }
  }

  // 解析 pendingActions
  if (girl.pendingActions) {
    try { ctx.pendingActions = JSON.parse(girl.pendingActions); } catch (e) { ctx.pendingActions = []; }
  }

  // 解析 observations
  if (girl.observations) {
    try { ctx.observations = JSON.parse(girl.observations); } catch (e) { ctx.observations = []; }
  }

  // 对话摘要
  ctx.conversationSummary = girl.conversationSummary || null;
}

/**
 * 加载客户档案到上下文
 */
async function loadClientProfile(ctx) {
  const client = await prisma.user.findUnique({
    where: { id: ctx.clientId },
    select: {
      emotionalMaturity: true, emotionalMaturityLevel: true,
      antiFrustrationLevel: true, pacePreference: true,
      clientType: true, coachCooperation: true, coachCooperationLevel: true,
      emotionalStable: true, eqLevel: true, learningAbility: true,
      attachmentStyle: true, loveStyle: true,
      loveLanguage1: true, loveLanguage2: true, loveLanguage3: true,
      loveLanguage4: true, loveLanguage5: true,
      clientBestApproach: true, clientRiskFactors: true,
      clientRecommendedTopics: true, clientStrategicNotes: true,
      familyBackground: true, familyStructure: true,
      familyAtmosphere: true, familyBurden: true,
      relationshipAttitude: true, serviceStage: true,
    }
  });

  if (client) {
    ctx.clientProfile = client;
  }
}

module.exports = {
  UnifiedContext,
  createUnifiedContext,
  ROUTE_TYPES,
  MAX_CONTEXT_TOKENS,
};

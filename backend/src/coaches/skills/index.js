/**
 * Tool Registry - 工具注册表
 * 定义所有可用的工具及其处理函数
 */

const prisma = require('../../prisma');

const tools = {};

// ============ Tool Definitions (for AI) ============

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_girl_context',
      description: '获取女生的完整上下文信息，包括档案、信号、待推进事项等',
      parameters: {
        type: 'object',
        properties: {
          girlId: { type: 'string', description: '女生ID' }
        },
        required: ['girlId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_tension',
      description: '调整女生的热度评分',
      parameters: {
        type: 'object',
        properties: {
          girlId: { type: 'string', description: '女生ID' },
          adjustment: { type: 'number', description: '调整值 (-2 到 +2)' },
          reason: { type: 'string', description: '调整原因' }
        },
        required: ['girlId', 'adjustment', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_signal',
      description: '为女生添加一个新的信号记录',
      parameters: {
        type: 'object',
        properties: {
          girlId: { type: 'string', description: '女生ID' },
          type: { type: 'string', enum: ['positive', 'negative', 'neutral'], description: '信号类型' },
          event: { type: 'string', description: '事件描述' }
        },
        required: ['girlId', 'type', 'event']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'record_learning',
      description: '记录一条经验教训到学习库',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: '客户ID' },
          girlId: { type: 'string', description: '女生ID（可选）' },
          type: { type: 'string', description: '类型：技巧/心态/案例' },
          scene: { type: 'string', description: '场景描述' },
          content: { type: 'string', description: '具体学习内容' }
        },
        required: ['clientId', 'type', 'scene', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_history',
      description: '搜索历史经验记录',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: '客户ID' },
          query: { type: 'string', description: '搜索关键词' },
          limit: { type: 'number', description: '返回数量（默认5）' }
        },
        required: ['clientId', 'query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'evaluate_reply',
      description: '评估用户已有回复的质量，给出改进建议',
      parameters: {
        type: 'object',
        properties: {
          girlId: { type: 'string', description: '女生ID' },
          originalReply: { type: 'string', description: '原始回复内容' },
          goal: { type: 'string', description: '优化目标（如：增加暧昧感/更自然/更真诚）' }
        },
        required: ['girlId', 'originalReply']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recommend_coach',
      description: '基于当前问题类型和客户画像推荐最合适的教练',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: '客户ID' },
          question: { type: 'string', description: '当前问题描述' },
          girlId: { type: 'string', description: '女生ID（可选）' }
        },
        required: ['clientId', 'question']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'daily_review',
      description: '生成客户当天的学习进度和行动回顾',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: '客户ID' }
        },
        required: ['clientId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'synthesize_signals',
      description: '综合女生所有信号，生成战略分析和行动建议',
      parameters: {
        type: 'object',
        properties: {
          girlId: { type: 'string', description: '女生ID' }
        },
        required: ['girlId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'summarize_conversation',
      description: '总结对话的关键要点和待行动项',
      parameters: {
        type: 'object',
        properties: {
          memoryId: { type: 'string', description: '会话记忆ID' },
          clientId: { type: 'string', description: '客户ID' }
        },
        required: ['memoryId', 'clientId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'diagnose_stage',
      description: '诊断女生当前所处阶段（Phase 0-6），返回阶段名、置信度、跳步警告',
      parameters: {
        type: 'object',
        properties: {
          girlId: { type: 'string', description: '女生ID' },
          question: { type: 'string', description: '用户当前问题（用于关键词推断，可选）' }
        },
        required: ['girlId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'diagnostic_report',
      description: '生成完整的阶段诊断报告，包含阶段定位、路由大师、行动建议',
      parameters: {
        type: 'object',
        properties: {
          girlId: { type: 'string', description: '女生ID' },
          question: { type: 'string', description: '用户当前问题' },
          clientId: { type: 'string', description: '客户ID' }
        },
        required: ['clientId', 'question']
      }
    }
  }
];

// ============ Tool Handlers ============

// get_girl_context
async function getGirlContext({ girlId }) {
  try {
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return { error: '女生不存在' };
    }

    let signals = [];
    let pendingActions = [];
    let observations = [];

    try { signals = JSON.parse(girl.signals || '[]'); } catch (e) { console.warn(`[CoachSkills] signals 解析失败 girlId=${girl.id}:`, e.message); }
    try { pendingActions = JSON.parse(girl.pendingActions || '[]'); } catch (e) { console.warn(`[CoachSkills] pendingActions 解析失败 girlId=${girl.id}:`, e.message); }
    try { observations = JSON.parse(girl.observations || '[]'); } catch (e) { console.warn(`[CoachSkills] observations 解析失败 girlId=${girl.id}:`, e.message); }

    let personality = {};
    try { personality = JSON.parse(girl.personality || '{}'); } catch (e) { console.warn(`[CoachSkills] personality 解析失败 girlId=${girl.id}:`, e.message); }

    return {
      name: girl.name,
      stage: girl.stage,
      tensionScore: girl.tensionScore,
      intimacyLevel: girl.intimacyLevel,
      personality,
      signals: signals.slice(-10),
      pendingActions,
      observations,
      notes: girl.notes
    };
  } catch (error) {
    console.error('[Tools] get_girl_context error:', error);
    return { error: '获取女生上下文失败' };
  }
}
tools.get_girl_context = getGirlContext;

// update_tension
async function updateTension({ girlId, adjustment, reason }) {
  try {
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return { error: '女生不存在' };
    }

    const newScore = Math.max(1, Math.min(10, (girl.tensionScore || 5) + adjustment));

    await prisma.girl.update({
      where: { id: girlId },
      data: { tensionScore: newScore }
    });

    console.log(`[Tools] tension updated: ${girl.name} ${girl.tensionScore} -> ${newScore} (${reason})`);

    return {
      success: true,
      girlId,
      oldScore: girl.tensionScore,
      newScore,
      reason
    };
  } catch (error) {
    console.error('[Tools] update_tension error:', error);
    return { error: '更新热度失败' };
  }
}
tools.update_tension = updateTension;

// add_signal
async function addSignal({ girlId, type, event }) {
  try {
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return { error: '女生不存在' };
    }

    let signals = [];
    try { signals = JSON.parse(girl.signals || '[]'); } catch (e) { console.warn(`[CoachSkills] signals 解析失败 addSignal girlId=${girl.id}:`, e.message); }

    signals.push({
      date: new Date().toLocaleDateString('zh-CN'),
      type,
      event
    });

    // 保留最近30天
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    signals = signals.filter(s => new Date(s.date) >= thirtyDaysAgo);

    await prisma.girl.update({
      where: { id: girlId },
      data: { signals: JSON.stringify(signals) }
    });

    console.log(`[Tools] signal added: ${girl.name} [${type}] ${event}`);

    return { success: true, signalCount: signals.length };
  } catch (error) {
    console.error('[Tools] add_signal error:', error);
    return { error: '添加信号失败' };
  }
}
tools.add_signal = addSignal;

// record_learning
async function recordLearning({ clientId, girlId, type, scene, content }) {
  try {
    const learning = await prisma.clientLearning.create({
      data: {
        clientId,
        girlId: girlId || null,
        type,
        scene,
        content
      }
    });

    console.log(`[Tools] learning recorded: ${type} - ${scene}`);

    return { success: true, id: learning.id };
  } catch (error) {
    console.error('[Tools] record_learning error:', error);
    return { error: '记录经验失败' };
  }
}
tools.record_learning = recordLearning;

// search_history
async function searchHistory({ clientId, query, limit = 5 }) {
  try {
    const learnings = await prisma.clientLearning.findMany({
      where: {
        clientId,
        OR: [
          { content: { contains: query } },
          { scene: { contains: query } },
          { type: { contains: query } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return {
      count: learnings.length,
      learnings: learnings.map(l => ({
        type: l.type,
        scene: l.scene,
        content: l.content,
        createdAt: l.createdAt
      }))
    };
  } catch (error) {
    console.error('[Tools] search_history error:', error);
    return { error: '搜索历史失败', learnings: [] };
  }
}
tools.search_history = searchHistory;

// evaluate_reply
async function evaluateReply({ girlId, originalReply, goal }) {
  try {
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) return { error: '女生不存在' };

    let personality = {};
    try { personality = JSON.parse(girl.personality || '{}'); } catch (e) {}

    let goalHint = goal ? `【优化目标】${goal}` : '';

    // 直接返回评估任务给 AI（简化版，不额外调用 AI）
    return {
      originalReply,
      goalHint,
      girlStage: girl.stage,
      communicationStyle: personality.communicationStyle || '未知',
      evaluationCriteria: {
        naturalness: '语气是否像正常聊天，不生硬',
        warmth: '是否有情感温度，不过于冷淡',
        alignment: '是否符合女生的沟通风格'
      }
    };
  } catch (error) {
    console.error('[Tools] evaluate_reply error:', error);
    return { error: '评估回复失败' };
  }
}
tools.evaluate_reply = evaluateReply;

// recommend_coach
async function recommendCoach({ clientId, question, girlId }) {
  try {
    // 加载客户画像和女生画像用于决策
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: { clientType: true, antiFrustrationLevel: true, learningAbility: true }
    });

    let stage = '未知';
    if (girlId) {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (girl) stage = girl.stage;
    }

    // 基于客户类型和问题类型推荐
    let recommendation = {
      recommendedType: '通用',
      reason: '基于你的情况推荐',
      tips: []
    };

    if (client?.clientType === '执行型') {
      recommendation.tips.push('给你简洁明确的行动指引，不绕弯子');
    } else if (client?.clientType === '质疑型') {
      recommendation.tips.push('会解释为什么这样建议，给出逻辑依据');
    } else if (client?.clientType === '自主型') {
      recommendation.tips.push('给框架和方向，你自己决定');
    }

    if ((client?.antiFrustrationLevel || 5) <= 3) {
      recommendation.tips.push('优先心态支持，不给激进建议');
    }

    if (question.includes('聊天') || question.includes('卡壳')) {
      recommendation.recommendedType = '聊天卡壳';
    } else if (question.includes('拉伸') || question.includes('暧昧')) {
      recommendation.recommendedType = '关系拉伸';
    } else if (question.includes('心态') || question.includes('情绪')) {
      recommendation.recommendedType = '心态问题';
    }

    return recommendation;
  } catch (error) {
    console.error('[Tools] recommend_coach error:', error);
    return { error: '推荐失败' };
  }
}
tools.recommend_coach = recommendCoach;

// daily_review
async function dailyReview({ clientId }) {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // 今天的 learnings
    const todayLearnings = await prisma.clientLearning.findMany({
      where: { clientId, createdAt: { gte: startOfDay } },
      orderBy: { createdAt: 'desc' }
    });

    // 今天的信号
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: { signals: true }
    });

    let signals = [];
    try { signals = JSON.parse(client?.signals || '[]'); } catch (e) {}
    const recentSignals = signals.filter(s => {
      if (!s.date) return false;
      const d = new Date(s.date);
      return d >= startOfDay;
    });

    // 今天的新 learnings
    return {
      date: today.toLocaleDateString('zh-CN'),
      learningsCount: todayLearnings.length,
      learnings: todayLearnings.slice(0, 3).map(l => ({
        type: l.type,
        scene: l.scene,
        content: l.content
      })),
      newSignalsCount: recentSignals.length,
      newSignals: recentSignals.slice(0, 3),
      summary: todayLearnings.length === 0 && recentSignals.length === 0
        ? '今天暂无新的学习和信号记录'
        : `今天有 ${todayLearnings.length} 条新经验，${recentSignals.length} 条新信号`
    };
  } catch (error) {
    console.error('[Tools] daily_review error:', error);
    return { error: '生成每日回顾失败' };
  }
}
tools.daily_review = dailyReview;

// synthesize_signals
async function synthesizeSignals({ girlId }) {
  try {
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) return { error: '女生不存在' };

    let signals = [];
    let pendingActions = [];
    let observations = [];

    try { signals = JSON.parse(girl.signals || '[]'); } catch (e) {}
    try { pendingActions = JSON.parse(girl.pendingActions || '[]'); } catch (e) {}
    try { observations = JSON.parse(girl.observations || '[]'); } catch (e) {}

    const positiveSignals = signals.filter(s => s.type === 'positive');
    const negativeSignals = signals.filter(s => s.type === 'negative');

    // 趋势分析
    let trend = 'neutral';
    if (positiveSignals.length > negativeSignals.length * 2) trend = 'positive';
    if (negativeSignals.length > positiveSignals.length * 2) trend = 'negative';

    return {
      girlName: girl.name,
      stage: girl.stage,
      tensionScore: girl.tensionScore,
      trend,
      signalSummary: {
        positive: positiveSignals.length,
        negative: negativeSignals.length,
        neutral: signals.length - positiveSignals.length - negativeSignals.length
      },
      topSignals: signals.slice(-5),
      pendingActions,
      observations,
      strategicNote: trend === 'positive'
        ? '近期正面信号较多，可以积极推进'
        : trend === 'negative'
        ? '近期有负面信号，需要谨慎修复关系氛围'
        : '信号混杂，保持稳定节奏观察'
    };
  } catch (error) {
    console.error('[Tools] synthesize_signals error:', error);
    return { error: '信号综合分析失败' };
  }
}
tools.synthesize_signals = synthesizeSignals;

// summarize_conversation
async function summarizeConversation({ memoryId, clientId }) {
  try {
    const memory = await prisma.conversationMemory.findUnique({ where: { id: memoryId } });
    if (!memory) return { error: '会话不存在' };

    let messages = [];
    try { messages = JSON.parse(memory.messages || '[]'); } catch (e) {}

    if (messages.length === 0) {
      return { summary: '会话暂无内容', actionItems: [], keyInsights: [] };
    }

    const recent = messages.slice(-10);
    const userMessages = recent.filter(m => m.role === 'user');
    const assistantMessages = recent.filter(m => m.role === 'assistant');

    // 简单的启发式总结
    const summary = `本次会话共 ${recent.length} 条消息，用户 ${userMessages.length} 条，教练 ${assistantMessages.length} 条`;

    return {
      summary,
      messageCount: recent.length,
      actionItems: memory.conversationSummary ? [memory.conversationSummary] : [],
      keyInsights: memory.signals ? (() => {
        try { return JSON.parse(memory.signals); } catch (e) { return []; }
      })() : [],
      compactionCount: memory.compactionCount
    };
  } catch (error) {
    console.error('[Tools] summarize_conversation error:', error);
    return { error: '对话总结失败' };
  }
}
tools.summarize_conversation = summarizeConversation;

// diagnose_stage
const { diagnoseStage, generateDiagnosticReport } = require('../stage-diagnosis');

async function diagnoseStageTool({ girlId, question = '' }) {
  try {
    return await diagnoseStage(girlId, question);
  } catch (error) {
    console.error('[Tools] diagnose_stage error:', error);
    return { error: '阶段诊断失败', phase: 1, phaseName: '入场', confidence: 0.3, source: 'error_fallback' };
  }
}
tools.diagnose_stage = diagnoseStageTool;

// diagnostic_report
async function diagnosticReportTool({ girlId, question, clientId }) {
  try {
    return await generateDiagnosticReport(girlId, question);
  } catch (error) {
    console.error('[Tools] diagnostic_report error:', error);
    return { error: '诊断报告生成失败' };
  }
}
tools.diagnostic_report = diagnosticReportTool;

// ============ Tool Executor ============

async function executeTool(toolName, arguments_) {
  const handler = tools[toolName];
  if (!handler) {
    return { error: `未知工具: ${toolName}` };
  }

  try {
    const args = typeof arguments_ === 'string' ? JSON.parse(arguments_) : arguments_;
    console.log(`[Tools] executing ${toolName}:`, JSON.stringify(args).substring(0, 100));
    const result = await handler(args);
    console.log(`[Tools] ${toolName} result:`, JSON.stringify(result).substring(0, 100));
    return result;
  } catch (error) {
    console.error(`[Tools] ${toolName} error:`, error);
    return { error: `工具执行失败: ${error.message}` };
  }
}

module.exports = {
  tools,
  toolDefinitions,
  executeTool
};

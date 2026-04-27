/**
 * Agent 上下文构建器 - 各 Agent 共享的上下文构建逻辑
 *
 * 从 UnifiedContext 和 promptBuilder 中的通用逻辑抽取，
 * 供所有专业 Agent 复用。
 */

const { STAGE_LABELS } = require('../services/relationshipStage');

// ---- 关系阶段标签映射 ----
const STAGE_TAG_MAP = {
  EXPLORATION: '探索期',
  FLIRTING: '暧昧期',
  ADVANCEMENT: '推进期',
  CONFIRMATION: '确认期',
  STABLE: '稳定期',
};

// ---- Agent 输出格式常量 ----
const RESPONSE_FORMAT = `
回答要求：
- 简洁口语化，像朋友聊天
- 直接给结论和建议，不要绕弯子
- 不要用任何加粗、斜体等格式
- 不要出现任何大师名字、称号、角色名
- 不要说"置信度"、"框架"、"原则"等专业术语
- 不要出现**符号
`.trim();

const SITUATION_FORMAT = `
回答格式（严格按这个格式输出）：
第一段：判断窗口——她对你是什么态度，窗口开着还是关着？
第二段：核心问题——当前这段关系最大的卡点在哪？
第三段：具体行动——给1-2条马上可以做的行动建议
第四段：如果信息不够，直接说"目前信息不足，需要了解XX"，追问1个关键问题
`.trim();

/**
 * 从 UnifiedContext 构建女生档案描述
 */
function buildGirlContext(ctx) {
  if (!ctx.girlProfile) {
    return '【女生档案】暂无';
  }

  const gp = ctx.girlProfile;
  const relStageLabel = gp.relationshipStage
    ? STAGE_TAG_MAP[gp.relationshipStage] || gp.relationshipStage
    : '未设置';

  const signalsText = ctx.recentSignals.length > 0
    ? ctx.recentSignals.map(s => `${s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]'} ${s.event}`).join('\n')
    : '暂无';

  return `【女生档案】
昵称：${gp.name || '未知'}
关系阶段：${relStageLabel}
关系热度：${gp.tensionScore || 5}/10
亲密度：${gp.intimacyLevel || 1}${gp.intimacyLevelUpdatedAt ? `（${formatDate(gp.intimacyLevelUpdatedAt)}更新）` : ''}

【性格画像】
MBTI：${gp.personality?.mbti || '未知'}
沟通风格：${gp.personality?.communicationStyle || '未知'}
情绪触发点：${(gp.personality?.emotionalTriggers || []).join('、') || '暂无'}
聊天禁忌：${(gp.personality?.thingsToAvoid || []).join('、') || '暂无'}
擅长话题：${(gp.personality?.talkingTopics || []).join('、') || '未知'}

【近期关键信号】
${signalsText}
`;
}

/**
 * 从 UnifiedContext 构建客户档案语气提示
 */
function buildClientHint(ctx) {
  if (!ctx.clientProfile) return '';

  const cp = ctx.clientProfile;
  const lines = [];

  // 情绪成熟度
  const maturity = cp.emotionalMaturityLevel || (cp.emotionalMaturity === '成熟' ? 3 : cp.emotionalMaturity === '幼稚' ? 1 : 2);
  if (maturity <= 1) {
    lines.push('语气：更鼓励、更耐心，少用专业术语');
  } else if (maturity >= 3) {
    lines.push('语气：更深度、抽象，语言精炼直接');
  }

  // 抗挫能力
  const antiFrus = cp.antiFrustrationLevel || 5;
  if (antiFrus <= 3) {
    lines.push('策略：优先心态支持，避免激进拉伸，多给正向反馈');
  } else if (antiFrus >= 8) {
    lines.push('策略：可接受高风险建议，不会因激进策略崩溃');
  }

  // 节奏偏好
  if (cp.pacePreference === '快节奏') {
    lines.push('节奏：更紧凑，推进关系不要拖泥带水');
  } else if (cp.pacePreference === '慢热型') {
    lines.push('节奏：更稳妥，先建立舒适感再拉伸');
  } else if (cp.pacePreference === '稳健型') {
    lines.push('节奏：稳步推进，既不冒进也不拖沓');
  }

  // 客户类型
  if (cp.clientType === '质疑型') {
    lines.push('语气：少说"你应该"，多说"我建议这样，因为..."');
  } else if (cp.clientType === '执行型') {
    lines.push('语气：简洁直接，给明确的步骤和行动指引');
  } else if (cp.clientType === '自主型') {
    lines.push('语气：给框架和方向，让客户自己做决定');
  }

  return lines.length > 0 ? `【客户提示】\n${lines.join('\n')}` : '';
}

/**
 * 从 UnifiedContext 构建女生策略提示
 */
function buildGirlStrategyHint(ctx) {
  if (!ctx.girlProfile) return '';

  const gp = ctx.girlProfile;
  const lines = [];

  const tension = gp.tensionScore || 5;
  if (tension <= 5) {
    lines.push(`女生策略：热度偏低（${tension}/10），节奏放慢，先找共鸣`);
  } else if (tension >= 7) {
    lines.push(`女生策略：热度较高（${tension}/10），可以更积极拉伸`);
  }

  const relStage = gp.relationshipStage;
  if (relStage === 'EXPLORATION') {
    lines.push('阶段：探索期，重点是建立基础沟通和吸引，不要急于推进');
  } else if (relStage === 'FLIRTING') {
    lines.push('阶段：暧昧期，适度拉伸，注意窗口信号');
  } else if (relStage === 'ADVANCEMENT') {
    lines.push('阶段：推进期，积极拉伸关系，创造约会机会');
  } else if (relStage === 'CONFIRMATION') {
    lines.push('阶段：确认期，重点是加深亲密度和维护稳定');
  } else if (relStage === 'STABLE') {
    lines.push('阶段：稳定期，长期关系维护');
  }

  const intimacy = gp.intimacyLevel || 1;
  if (intimacy <= 2) {
    lines.push(`亲密度低(${intimacy})，策略偏向建立信任`);
  } else if (intimacy >= 4) {
    lines.push(`亲密度高(${intimacy})，可以谈更深入的话题`);
  }

  const hasNegative = ctx.recentSignals.some(s => s.type === 'negative');
  const hasPositive = ctx.recentSignals.some(s => s.type === 'positive');
  if (hasNegative) {
    lines.push('近期有负面信号，需要谨慎，优先修复关系氛围');
  } else if (hasPositive) {
    lines.push('近期有正面信号，可以更积极推进');
  }

  return lines.length > 0 ? `【女生策略】\n${lines.join('\n')}` : '';
}

/**
 * 从 UnifiedContext 构建对话历史
 */
function buildHistorySection(ctx) {
  if (!ctx.conversationHistory || ctx.conversationHistory.length === 0) {
    return ctx.compactionCount > 0
      ? `【对话历史】早期对话已压缩${ctx.compactionCount}次\n${ctx.conversationSummary || ''}`
      : '【对话历史】新鲜会话';
  }

  const recent = ctx.conversationHistory.slice(-10);
  const historyText = recent.map(m =>
    `${m.role === 'user' ? '用户' : 'AI教练'}: ${m.content}`
  ).join('\n');

  return `【对话历史】（第${ctx.turnCount}轮${ctx.compactionCount > 0 ? `，已压缩${ctx.compactionCount}次` : ''}）
${historyText}
${ctx.compactionCount > 0 && ctx.conversationSummary ? `\n【历史摘要】${ctx.conversationSummary}\n` : ''}`;
}

/**
 * 构建对话状态信息
 */
function buildDepthInfo(ctx) {
  return `【对话状态】轮次: ${ctx.turnCount}${ctx.compactionCount > 0 ? ` | 已压缩 ${ctx.compactionCount} 次` : ''}`;
}

/**
 * 日期格式化
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

module.exports = {
  buildGirlContext,
  buildClientHint,
  buildGirlStrategyHint,
  buildHistorySection,
  buildDepthInfo,
  RESPONSE_FORMAT,
  SITUATION_FORMAT,
  STAGE_TAG_MAP,
};

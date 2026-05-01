/**
 * Prompt Builder - 构建AI教练prompt
 */

const { getMultiDimensionalSkillsWithMeta } = require('./router');
const { buildStructuredFusion } = require('./fusion');
const { getAllLearnings, formatLearningsForPrompt } = require('../services/learning');
const { buildDynamicPersona, buildPersonaSection } = require('../services/coachPersona');
const { STAGE_LABELS } = require('../services/relationshipStage');

/**
 * 构建综合教练prompt
 * @param {string} question - 用户输入的问题（必须插入prompt）
 * @param {Object} context - 上下文对象
 * @param {Object} options - 配置选项
 */
async function buildMasterPrompt(question, context = {}, options = {}) {
  const {
    girlInfo = null,
    conversationHistory = [],
    turnCount = 0,
    clientProfile = null,
    girlProfile = null,
    clientId = null
  } = options;
  const girlId = girlInfo?.id || null;

  // 获取相关skill（会返回多个coach视角）
  const { skills, meta } = getMultiDimensionalSkillsWithMeta(question, context);

  // 构建大师视角部分（多coach融合）
  const masterSection = skills.map(skill => buildMasterSection(skill)).join('\n\n');

  // 构建女生上下文（基础信息）
  const contextSection = buildContextSection(girlInfo);

  // 构建历史对话
  const historySection = buildHistorySection(conversationHistory, turnCount);

  // 构建结构化融合提示（替代原有简单融合）
  // 传入 clientId 以加载个性化权重（反馈驱动）
  const fusionHint = await buildStructuredFusion(skills, meta, {
    clientId,
    clientProfile,
    girlProfile,
    routedType: meta?.routedType
  });

  // 加载历史 learnings 并注入 prompt（Learning 接入对话流）
  let learningsSection = '';
  if (clientId) {
    try {
      const learnings = await getAllLearnings(clientId, girlId);
      learningsSection = buildLearningsSection(learnings, girlId);
    } catch (e) {
      console.warn('[promptBuilder] 加载 learnings 失败:', e.message);
    }
  }

  // 加载人格适配参数（Coach 人格适配）
  let personaSection = '';
  if (clientId) {
    try {
      const persona = await buildDynamicPersona({ clientProfile, clientId, girlId });
      personaSection = buildPersonaSection(persona);
    } catch (e) {
      console.warn('[promptBuilder] 加载人格适配失败:', e.message);
    }
  }

  // 核心：question 必须插入 prompt，否则AI看不到用户的问题
  return `
你是一个有丰富情感经验的朋友，帮用户分析情感问题。

【专业视角】（综合多位教练的经验）
${masterSection}

${fusionHint}

【用户情况】
${contextSection}

${buildClientProfileSection(clientProfile)}
${buildGirlProfileSection(girlProfile)}
${learningsSection}

【历史对话】
${historySection}

【用户的问题】
${question}

回答要求：
- 像朋友聊天一样自然，有温度但直接
- 直接指出核心问题和原因
- 给出具体可执行的建议
- 使用正常的中文标点符号（，。！？）
- 如果信息不够，说清楚还缺什么
`.trim();
}

/**
 * 构建单个教练视角
 */
function buildMasterSection(skill) {
  const principles = skill.principles || [];
  const heuristics = skill.decision_heuristics || [];
  const style = skill.style || {};

  // 核心原则（选2-3个最重要的）
  const topPrinciples = principles.slice(0, 3).map(p => {
    if (p.steps && Array.isArray(p.steps)) {
      const stepsText = p.steps.slice(0, 3).map((s, i) => {
        const stepName = typeof s === 'string' ? s : s.name;
        return `${i + 1}. ${stepName}`;
      }).join(' → ');
      return `${p.name}：${p.description || ''}（${stepsText}）`;
    } else {
      return `${p.name}：${p.description || ''} | ${p.rule || ''}`;
    }
  }).join('\n');

  // 决策规则（选2-3个最实用的）
  const topHeuristics = heuristics.slice(0, 3).map(h =>
    `- ${h.rule}：${h.description || ''}`
  ).join('\n');

  // 风格提示
  const styleNote = style.expression ? `风格：${style.expression}` : '';

  return `
【视角】
${topPrinciples}
${topHeuristics ? `【规则】\n${topHeuristics}` : ''}
${styleNote}
`;
}

/**
 * 构建融合提示（当多coach视角可能冲突时）
 */
function buildFusionHint(skills, meta = {}) {
  if (skills.length <= 1) {
    return '';
  }

  // 列出各coach的擅长方向，帮助AI在冲突时做判断
  const coachLabels = skills.map(s => s.name || s.id).join('、');

  // 构建路由追踪信息
  let traceInfo = '';
  if (meta.matchedKeywords && meta.matchedKeywords.length > 0) {
    const matchedKws = meta.matchedKeywords.filter(k => !k.startsWith('context_')).join('、');
    const topTypes = Object.entries(meta.typeScores || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, score]) => `${type}(${score.toFixed(2)})`)
      .join('、');
    traceInfo = `\n【路由追踪】命中关键词: ${matchedKws} | 类型得分: ${topTypes}`;
  }

  return `
【综合参考原则】${coachLabels}${traceInfo}
以上 ${skills.length} 个框架可能从不同角度分析，综合判断时：
- 优先考虑当前关系阶段适用的视角
- 如果建议矛盾，给出最稳妥的方案，不要矛盾
- 女生性格特点优先于通用策略
`;
}

/**
 * 构建客户画像语气提示（影响AI教练的语气深度和策略）
 */
function buildClientProfileSection(cp) {
  if (!cp) return '';

  const lines = [];

  // emotionalMaturity
  const maturityLevel = cp.emotionalMaturityLevel || (cp.emotionalMaturity === '成熟' ? 3 : cp.emotionalMaturity === '幼稚' ? 1 : 2);
  if (maturityLevel <= 1) {
    lines.push('语气：更鼓励、更耐心，少用专业术语，多用通俗易懂的语言，避免给客户太大压力');
  } else if (maturityLevel >= 3) {
    lines.push('语气：可以用更深度、抽象的策略思维，语言更精炼、直接');
  } else {
    lines.push('语气：平衡风格，既要有温度，也要有逻辑');
  }

  // antiFrustrationLevel
  const antiFrustration = cp.antiFrustrationLevel || 5;
  if (antiFrustration <= 3) {
    lines.push('策略：优先心态支持，避免激进拉伸建议，不要给客户施压，多给正向反馈');
  } else if (antiFrustration >= 8) {
    lines.push('策略：可以接受高风险高回报的建议，不会因为激进策略崩溃');
  }

  // pacePreference
  if (cp.pacePreference === '快节奏') {
    lines.push('节奏：可以更紧凑，建议更有进攻性，推进关系不要拖泥带水');
  } else if (cp.pacePreference === '慢热型') {
    lines.push('节奏：建议更稳妥，不要急于推进，先建立舒适感再考虑拉伸');
  } else if (cp.pacePreference === '稳健型') {
    lines.push('节奏：稳步推进，保持节奏稳定，既不冒进也不拖沓');
  }

  // clientType — 语气调整（少说"你应该"，多说"我建议这样因为"）
  if (cp.clientType === '质疑型') {
    lines.push('语气风格：少说"你应该"，多说"我建议这样，因为..."，多提供理由和逻辑，少用命令式');
  } else if (cp.clientType === '执行型') {
    lines.push('语气风格：简洁直接，给明确的步骤和行动指引，不要绕弯子');
  } else if (cp.clientType === '自主型') {
    lines.push('语气风格：给框架和方向，让客户自己做决定，不要过度指令');
  }

  // coachCooperation — 配合度影响详细程度
  const coopLevel = cp.coachCooperationLevel || (cp.coachCooperation === '配合' ? 3 : cp.coachCooperation === '抵触' ? 1 : 2);
  if (coopLevel <= 1) {
    lines.push('客户配合度低，建议精简到最核心的1-2条行动，不要给太多信息');
  } else if (coopLevel >= 3) {
    lines.push('客户配合度高，可以给更完整的分析和多步行动计划');
  }

  if (lines.length === 0) return '';

  return `
【客户画像提示】
${lines.join('\n')}
`;
}

/**
 * 构建女生上下文
 */
function buildContextSection(girlInfo) {
  if (!girlInfo) {
    return '【女生上下文】暂无';
  }

  const personality = girlInfo.personality || {};

  const relStageLabel = girlInfo.relationshipStage ? STAGE_LABELS[girlInfo.relationshipStage] || girlInfo.relationshipStage : null;
  return `
【女生上下文】
- 昵称：${girlInfo.name || '未知'}
- 关系阶段：${relStageLabel || '未设置'}
- 关系热度：${girlInfo.tensionScore || 5}/10
- 亲密度：${girlInfo.intimacyLevel || 1}

【性格画像】
- 沟通风格：${personality.communicationStyle || '未知'}
- 情绪触发点：${(personality.emotionalTriggers || []).join('、') || '暂无'}
- 聊天禁忌：${(personality.thingsToAvoid || []).join('、') || '暂无'}
- 喜欢话题：${(personality.talkingTopics || []).join('、') || '未知'}
`;
}

/**
 * 构建女生画像策略提示（影响AI教练对女生的策略深度）
 */
function buildGirlProfileSection(gp) {
  if (!gp) return '';

  const lines = [];
  const tension = gp.tensionScore || 5;

  // 热度：冷女生 -> 缓节奏、共鸣切入；热女生 -> 可激进拉伸、制造张力
  if (tension <= 5) {
    lines.push('女生策略：热度偏低（' + tension + '/10），节奏放慢，先找共鸣和舒适感，不要急于拉伸');
  } else if (tension >= 7) {
    lines.push('女生策略：热度较高（' + tension + '/10），可以更积极拉伸、制造张力，适时升级关系');
  } else {
    lines.push('女生策略：热度适中，保持稳定节奏，稳步推进关系');
  }

  // 阶段策略（使用新的 relationshipStage 系统）
  const relStage = gp.relationshipStage;
  if (relStage === 'EXPLORATION') {
    lines.push('阶段：探索期，刚认识不久，重点是建立基础沟通和吸引，不要急于推进');
  } else if (relStage === 'FLIRTING') {
    lines.push('阶段：暧昧期，可以适度拉伸，注意窗口信号，制造心动时刻');
  } else if (relStage === 'ADVANCEMENT') {
    lines.push('阶段：推进期，积极拉伸关系，创造约会机会，争取升级');
  } else if (relStage === 'CONFIRMATION') {
    lines.push('阶段：确认期，关系基本明确，重点是加深亲密度和维护稳定');
  } else if (relStage === 'STABLE') {
    lines.push('阶段：稳定期，长期关系，重点是维护和深化亲密度');
  }

  // 亲密度权重
  const intimacy = gp.intimacyLevel || 1;
  if (intimacy <= 2) {
    lines.push('亲密度低(' + intimacy + ')，策略偏向建立信任，避免过度进攻');
  } else if (intimacy >= 4) {
    lines.push('亲密度高(' + intimacy + ')，可以谈更深入的话题，适度推进');
  }

  // recentSignals 影响
  const recentSignals = gp.recentSignals || [];
  const hasNegative = recentSignals.some(s => s.type === 'negative');
  const hasPositive = recentSignals.some(s => s.type === 'positive');
  if (hasNegative) {
    lines.push('近期有负面信号，需要谨慎，优先修复关系氛围');
  } else if (hasPositive) {
    lines.push('近期有正面信号，可以更积极推进');
  }

  if (lines.length === 0) return '';

  return `
【女生策略提示】
${lines.join('\n')}
`;
}

/**
 * 构建历史经验注入区块
 */
function buildLearningsSection(learnings, girlId) {
  if (!learnings || learnings.length === 0) {
    return '';
  }

  // 优先使用当前女生的 learnings，其次是全局的
  const girlLearnings = girlId ? learnings.filter(l => l.girlId === girlId) : [];
  const displayLearnings = girlLearnings.length > 0 ? girlLearnings.slice(0, 5) : learnings.slice(0, 5);

  const formatted = formatLearningsForPrompt(displayLearnings);

  return `
【历史经验】
${formatted}
（这些是从你们之前的对话中提炼出来的经验，可以参考但不要生搬硬套）
`;
}

/**
 * 构建历史对话
 */
function buildHistorySection(history, turnCount) {
  if (!history || history.length === 0) {
    return '【对话历史】新鲜会话';
  }

  const recentHistory = history.slice(-5);
  const historyText = recentHistory.map(h => {
    const role = h.role === 'user' ? '用户' : '教练';
    return `${role}：${h.content}`;
  }).join('\n');

  return `
【对话历史】（第${turnCount}轮，已压缩）
${historyText}
`;
}

/**
 * 构建聊天分析prompt
 */
function buildChatAnalysisPrompt(chatHistory, context) {
  const { skills } = getMultiDimensionalSkillsWithMeta('聊天分析', context);

  return `
你是聊天分析专家，分析以下聊天记录，识别对话双方的意图、情绪和关系状态。

【聊天记录】
${chatHistory}

【分析框架】
${skills.map(s => {
  // 提取所有有 steps 的 principle（兼容 framework/core_theory 等类型）
  const principlesWithSteps = (s.principles || []).filter(p => p.steps && Array.isArray(p.steps));
  return principlesWithSteps.map(p =>
    `${p.name}：${p.steps.map((step, i) => `${i+1}.${typeof step === 'string' ? step : step.name}`).join(' → ')}`
  ).join('\n');
}).filter(Boolean).join('\n') || '（无结构化框架，依赖通用分析）'}

请按以下10个维度输出 JSON 分析结果，直接写字段名和值，不要加说明：
1. userIntention：用户意图
2. userEmotion：用户情绪
3. girlIntention：女生意图
4. girlEmotion：女生情绪
5. relationshipStage：关系阶段
6. keySignals：关键信号列表（2-3个）
7. girlSignals：女生积极信号列表（1-2个）
8. interactionQuality：互动质量评价
9. riskSignals：风险信号（如有）
10. suggestions：操盘手建议（1-2条）

请按以下 JSON 格式返回：
{
  "userIntention": "...",
  "userEmotion": "...",
  "girlIntention": "...",
  "girlEmotion": "...",
  "relationshipStage": "...",
  "keySignals": ["...", "..."],
  "girlSignals": ["...", "..."],
  "interactionQuality": "...",
  "riskSignals": ["..."] | [],
  "suggestions": ["...", "..."]
}

只输出 JSON，不要其他内容。
`;
}

module.exports = {
  buildMasterPrompt,
  buildChatAnalysisPrompt
};

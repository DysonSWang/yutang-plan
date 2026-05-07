/**
 * Prompt Builder - 构建AI教练prompt
 */

const { getMultiDimensionalSkillsWithMeta } = require('./router');
const { buildStructuredFusion, OS_CONFLICT_RULES } = require('./fusion');
const { getAllLearnings, formatLearningsForPrompt } = require('../services/learning');
const { buildDynamicPersona, buildPersonaSection } = require('../services/coachPersona');
const { STAGE_LABELS } = require('../services/relationshipStage');
const { PHASES, enforceNoSkip } = require('./stage-diagnosis');

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

  // 预算感知上下文（信号、待办、观察、摘要等补充信息）
  const supplementaryContext = context.contextInfo || '';

  // OS 元规则注入（阶段模型 + 冲突裁决）
  const osMetaSection = buildOSMetaSection(context);

  // 核心：question 必须插入 prompt，否则AI看不到用户的问题
  return `
你是追爱AI教练，一个有丰富经验的朋友，帮用户分析情感问题。你的身份是统一的、唯一的——就是用户信赖的私人情感顾问。

${osMetaSection}

【内部参考资料】（仅供你参考分析，严禁在回答中引用）
${masterSection}

${fusionHint}

【用户情况】
${contextSection}

${buildClientProfileSection(clientProfile)}
${buildGirlProfileSection(girlProfile)}
${learningsSection}
${supplementaryContext ? `\n【补充上下文】\n${supplementaryContext}` : ''}
${context.wikiContext ? `\n${context.wikiContext}` : ''}

【历史对话】
${historySection}

【用户的问题】
${question}

回答要求：
- 像朋友聊天一样自然，有温度。可以犀利直接，但不能敷衍简短——每个问题至少从3个角度分析
- 诊断问题：分析根因，为什么会出现这个情况，结合女生心理和两性关系规律讲清楚
- 给出方案：具体可执行的建议，每一步都说清楚怎么做、为什么这样做，至少给出2-3步
- 预判结果：每个建议后面附上可能的反应和应对方式
- 如果信息不够，说清楚还缺什么，但不要因为缺信息就不分析——基于现有信息给出最可能的判断
- 可以使用 markdown 格式增强可读性，但必须严格遵守以下 markdown 语法规范：
  - 加粗：**关键词**（两星紧贴文字，正确闭合，仅加粗关键词而非整段）
  - 标题：### 标题文字（## 后必须有空格，标题独占一行，前后留空行）
  - 列表：- 列表项（短横后必须有空格）或 1. 列表项（数字点后必须有空格）
  - 引用：> 引用内容（> 后必须有空格，引用内容独占一行）
  - 分隔线：独占一行写 ---（前后留空行，不要和文字连在一起）
  - 禁止使用：__粗体__、**和文字间留空格、标题符后不带空格直接连文字
- 你是用户唯一的AI情感顾问，回答中只使用你自己的第一人称视角（"我建议"、"我觉得"）
- 只要用户没问你是什么 你是谁 不要主动回答名字 严禁在回答中出现任何导师名字（如"王导"、"李导"等）
- 严禁出现"根据XX导师的建议"、"综合多位教练的经验"等引用性表述
- 严禁以"多位专家认为"、"框架分析显示"等第三人称口吻回答
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
【综合参考原则】（内部参考，严禁在回答中引用框架名称）
以上框架从不同角度提供了分析思路，综合判断时：
- 优先考虑当前关系阶段适用的角度
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
    lines.push('语气风格：给明确的步骤和行动指引，用完整的分析支撑每个建议');
  } else if (cp.clientType === '自主型') {
    lines.push('语气风格：给框架和方向，让客户自己做决定，不要过度指令');
  }

  // coachCooperation — 配合度影响详细程度
  const coopLevel = cp.coachCooperationLevel || (cp.coachCooperation === '配合' ? 3 : cp.coachCooperation === '抵触' ? 1 : 2);
  if (coopLevel <= 1) {
    lines.push('客户配合度低，优先给出最核心的行动建议，同时在分析中完整解释原因');
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

  // 基础信息行：年龄、职业、来源等
  const basics = [];
  if (girlInfo.age) basics.push(`${girlInfo.age}岁`);
  if (girlInfo.occupation) basics.push(girlInfo.occupation);
  if (girlInfo.sourcePlatform) basics.push(`来源: ${girlInfo.sourcePlatform}`);

  return `
【女生上下文】
- 昵称：${girlInfo.name || '未知'}
${basics.length > 0 ? `- 基本信息：${basics.join(' | ')}` : ''}
- 关系阶段：${relStageLabel || '未设置'}
- 关系热度：${girlInfo.tensionScore || 5}/10
- 亲密度：${girlInfo.intimacyLevel || 1}
${girlInfo.lastContact ? `- 最近联系：${girlInfo.lastContact}` : ''}

【性格画像】
- 沟通风格：${personality.communicationStyle || '未知'}
${personality.mbti ? `- MBTI：${personality.mbti}` : ''}
- 情绪触发点：${(personality.emotionalTriggers || []).join('、') || '暂无'}
- 聊天禁忌：${(personality.thingsToAvoid || []).join('、') || '暂无'}
- 喜欢话题：${(personality.talkingTopics || []).join('、') || '未知'}
${girlInfo.notes ? `\n【备注】\n${girlInfo.notes}` : ''}
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

/**
 * 构建 OS 元规则区块（注入系统 prompt 顶部）
 * 包含：7 阶段模型简述 + 当前阶段约束 + 核心冲突裁决规则
 */
function buildOSMetaSection(context) {
  const { girlProfile = null, clientProfile = null } = context;
  let lines = [];

  lines.push('【恋爱操作系统 · 内部规则】');
  lines.push('所有分析基于以下统一框架：');

  // 1. 7 阶段简述
  lines.push('');
  lines.push('阶段模型：');
  lines.push('- Phase 0 资源池：收集资源、展示面建设');
  lines.push('- Phase 1 入场：破冰、意图表达、解决阻力');
  lines.push('- Phase 2 探测：评估筛选、价值展示、意愿锁定');
  lines.push('- Phase 3 升温：情绪推拉、叙事建立信任');
  lines.push('- Phase 4 确认：【分叉点】用户必须选择短轨(速约)或长轨(长期)，不可混合');
  lines.push('- Phase 5 确立：短轨=速约收尾 / 长轨=关系锁定');
  lines.push('- Phase 6 经营：短轨=撤退策略 / 长轨=长期维护');

  // 2. 当前阶段约束
  if (girlProfile?.stage) {
    const stagePhaseMap = { '陌生': 0, '搭讪': 0, '聊天': 2, '暧昧': 3, '约会': 4, '长期': 5 };
    const currentPhase = stagePhaseMap[girlProfile.stage] ?? 1;
    const enforcement = enforceNoSkip(currentPhase);
    lines.push('');
    lines.push(`当前阶段：Phase ${currentPhase}（${enforcement.phaseName}）`);
    lines.push(`核心任务：${enforcement.coreAction}`);
    if (enforcement.warning) {
      lines.push(`⚠️ 注意：${enforcement.warning}`);
    }
  }

  // 3. 轨道判断
  if (girlProfile?.track) {
    lines.push('');
    lines.push(`用户轨道：${girlProfile.track === 'short' ? '短轨(速约)' : '长轨(长期)'}`);
    lines.push(girlProfile.track === 'short' ? '策略：效率优先、快速筛选' : '策略：真诚优先、长期经营');
  }

  // 4. 核心裁决规则（选 5 条最关键的）
  lines.push('');
  lines.push('冲突裁决规则（当策略矛盾时按此执行）：');
  lines.push('1. 短轨和长轨是两个独立系统，混用必败');
  lines.push('2. Phase 4 是用户选择分叉点，不能替用户决定');
  lines.push('3. 感觉是结果不是方法，用阶段/信号/数据决策');
  lines.push('4. 不善良的人消耗远大于产出，先验证善良度');
  lines.push('5. 阶段不可跳步，必须先完成前置阶段的核心任务');

  return lines.join('\n');
}

module.exports = {
  buildMasterPrompt,
  buildChatAnalysisPrompt
};

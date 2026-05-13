/**
 * Prompt Builder - 构建AI教练prompt
 */

const osConfig = require('./os-config');
const { getMultiDimensionalSkillsWithMeta } = require('./router');
const { buildStructuredFusion, OS_CONFLICT_RULES } = require('./fusion');
const { getAllLearnings, formatLearningsForPrompt } = require('../services/learning');
const { buildDynamicPersona, buildPersonaSection } = require('../services/coachPersona');
const { STAGE_LABELS } = require('../services/relationshipStage');
const { enforceNoSkip } = require('./stage-diagnosis');

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

【核心约束】
- 严禁在回答中出现任何导师名字（如"王导"、"李导"等）
- 严禁出现"根据XX导师的建议"、"综合多位教练的经验"等引用性表述
- 严禁以"多位专家认为"、"框架分析显示"等第三人称口吻回答

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
${context.wikiContext ? `\n【知识库素材】（仅供参考，不要直接复制）\n${context.wikiContext}\n\n（以上是知识库中的实战素材，包括话术示例、案例参考、场景细节等。请用你自己的语言和逻辑组织回答，不要用知识库的内容作为回答框架。回答框架请使用【恋爱操作系统】的阶段模型。）` : ''}

【历史对话】
${historySection}

【用户的问题】
${question}

回答要求：
- 像朋友聊天一样自然，有温度。可以犀利直接，但不能敷衍简短——每个问题至少从3个角度分析
- 诊断问题：分析根因，为什么会出现这个情况，结合女生心理和两性关系规律讲清楚
- 给出方案：具体可执行的建议，每一步都说清楚怎么做、为什么这样做，至少给出2-3步
- 预判结果：每个建议后面附上可能的反应和应对方式
- **重要**：使用【恋爱操作系统】的阶段框架（Phase 0/1/2/3/4/5）来组织回答结构，而不是自由发挥。知识库中的素材（话术、案例、场景细节）可以填充到框架中使用，但回答的整体框架必须遵循恋爱OS的阶段模型
- 如果信息不够，说清楚还缺什么，但不要因为缺信息就不分析——基于现有信息给出最可能的判断
- 使用 markdown 增强可读性（加粗关键词、用标题分段）
- 回答要分段清晰，每段不要太长（不超过5行），段与段之间用空行分隔
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
/**
 * 术语白名单配置
 * - ALLOWED: 对任何用户都可用
 * - RESTRICTED: 仅对进阶用户可用
 * - HIDDEN: 对普通用户隐藏
 */
const ALLOWED_TERMS = ['入场', '升温', '确认', '推进', '拉伸', '暧昧', '破冰', '收尾'];
const RESTRICTED_TERMS = ['Phase 0', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6', '资源池', '私域', '轨道', '短轨', '长轨'];

/**
 * 判断用户是否为进阶用户
 * 根据情绪成熟度、抗压等级等判断
 */
function isAdvancedUser(clientProfile) {
  if (!clientProfile) return false;
  const maturityLevel = clientProfile.emotionalMaturityLevel || 2;
  const antiFrustration = clientProfile.antiFrustrationLevel || 5;
  // 情绪成熟度高 + 抗压能力强 = 进阶用户
  return maturityLevel >= 3 && antiFrustration >= 7;
}

/**
 * 根据用户类型生成输出风格指令
 */
function buildOutputStyleInstruction(context) {
  const { clientProfile } = context;
  const isAdvanced = isAdvancedUser(clientProfile);

  const lines = [];
  lines.push('');
  lines.push('【输出风格指令】（必须遵守）');

  if (isAdvanced) {
    // 进阶用户：可以使用更多专业术语
    lines.push('允许使用的专业术语：入场、升温、确认、推进、拉伸、暧昧、破冰、收尾、Phase 0-6、资源池、私域、轨道决策');
    lines.push('可以使用"Phase X"的表述方式');
  } else {
    // 普通用户：完全隐藏专业术语
    lines.push('禁止在回答中出现的术语：Phase 0、Phase 1、Phase 2、Phase 3、Phase 4、Phase 5、Phase 6、资源池、私域、短轨、长轨');
    lines.push('禁止使用"Phase X"等编号形式');
    lines.push('阶段名称只允许：入场、升温、确认、推进、拉伸、暧昧');
    lines.push('用通俗易懂的语言表达，禁止"黑话连篇"');
  }

  // 所有用户都适用
  lines.push('');
  lines.push('通用输出要求：');
  lines.push('- 像朋友在耳边叮嘱一样说话，口语化，避免机械感');
  lines.push('- 用具体的场景和例子解释，不要干巴巴讲道理');
  lines.push('- 逻辑清晰：先说结论，再说原因');
  lines.push('- 控制长度，有话则长，无话则短');

  return lines.join('\n');
}

function buildOSMetaSection(context) {
  const { girlProfile = null, clientProfile = null } = context;
  const lines = [];

  const { CORE_PRINCIPLES, PHASES, SIGNAL_IOI, TRACK_DECISION, DB_STAGE_MAP } = osConfig;

  // 计算当前阶段
  const currentPhase = girlProfile?.stage
    ? (DB_STAGE_MAP[girlProfile.stage] ?? 1)
    : null;
  const currentPhaseInfo = currentPhase != null ? PHASES[currentPhase] : null;
  const isAdvanced = isAdvancedUser(clientProfile);

  // ===== 1. 输出风格指令（最重要，放在最前面）=====
  lines.push('【恋爱操作系统 · 内部决策框架】');
  lines.push('以下框架仅供内部决策用，最终输出必须符合输出风格指令：');

  // ===== 2. 阶段模型（内部用，外部通过输出风格指令控制）=====
  lines.push('');
  lines.push('【阶段模型】（内部参考）');
  for (const [phase, info] of Object.entries(PHASES)) {
    const leonInfo = info.leonScore ? `（评分${info.leonScore}）` : '';
    lines.push(`Phase ${phase} ${info.name}${leonInfo}：${info.coreTask}`);
    if (info.deadEnd) {
      lines.push(`  ⚠️ 死胡同：${info.deadEnd}`);
    }
  }

  // ===== 3. 当前阶段约束 =====
  if (currentPhaseInfo) {
    lines.push('');
    lines.push('【当前阶段】');
    lines.push(`Phase ${currentPhase}（${currentPhaseInfo.name}）`);
    lines.push(`核心任务：${currentPhaseInfo.coreTask}`);
    lines.push(`执行要点：${currentPhaseInfo.prerequisites.join(' → ')}`);
    if (currentPhaseInfo.deadEnd) {
      lines.push(`⚠️ 避坑：${currentPhaseInfo.deadEnd}`);
    }
  }

  // ===== 4. 轨道判断 =====
  if (girlProfile?.track) {
    lines.push('');
    lines.push('【用户轨道】');
    lines.push(girlProfile.track === 'short' ? '快节奏模式：效率优先、快速筛选' : '慢节奏模式：真诚优先、长期经营');
  } else {
    lines.push('');
    lines.push('【轨道决策参考】');
    lines.push(`目标型关键词：${TRACK_DECISION.short_keywords.join('/')}`);
    lines.push(`认真型关键词：${TRACK_DECISION.long_keywords.join('/')}`);
    lines.push(`注意：两个轨道策略不同，混用必败`);
  }

  // ===== 5. 核心原则（内部决策用）=====
  lines.push('');
  lines.push('【核心原则】（内部决策参考）');
  for (const p of CORE_PRINCIPLES) {
    lines.push(`- ${p.name}：${p.diagnostic} | 禁区：${p.warning}`);
  }

  // ===== 6. 信号识别 =====
  if (girlProfile) {
    lines.push('');
    lines.push('【信号识别】');
    for (const s of SIGNAL_IOI) {
      lines.push(`  ${s.type}：✅=${s.positive} | ❌=${s.negative}`);
    }
    lines.push('判断：3个以上✅=可以推进 | 3个以上❌=暂停/调整');
  }

  // ===== 7. 冲突裁决 =====
  lines.push('');
  lines.push('【冲突裁决】');
  lines.push('1. 阶段不可跳步，必须先完成当前阶段的核心任务');
  lines.push('2. 快节奏和慢节奏是两个独立系统，策略不能混用');
  lines.push('3. 感觉是结果不是方法，用阶段/信号/数据判断下一步');
  lines.push('4. 对方态度冷淡时，先退后建设价值，不要硬冲');

  // ===== 8. 输出风格指令（最严格，必须100%遵守）=====
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('【强制输出规则 - 任何违规直接失败】');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('⚠️ 【绝对禁止】以下任何术语出现在最终回答中：');
  lines.push('');
  lines.push('#禁用列表 START');
  lines.push('Phase 0');
  lines.push('Phase 1');
  lines.push('Phase 2');
  lines.push('Phase 3');
  lines.push('Phase 4');
  lines.push('Phase 5');
  lines.push('Phase 6');
  lines.push('资源池');
  lines.push('资源池建设');
  lines.push('私域');
  lines.push('私域聊天');
  lines.push('私域联系');
  lines.push('短轨');
  lines.push('长轨');
  lines.push('轨道');
  lines.push('建立资源池');
  lines.push('资源积累');
  lines.push('#禁用列表 END');
  lines.push('');
  lines.push('⚠️ 【必须替换】以下是正确的替代词：');
  lines.push('');
  lines.push('| 禁用词 | 必须替换为 |');
  lines.push('|--------|--------------|');
  lines.push('| Phase X | 用"入场"、"升温"、"确认"等中文词 |');
  lines.push('| 资源池 | "认识新人"、"加微信"、"收集联系方式" |');
  lines.push('| 私域 | "私下聊天"、"后续联系"、"微信上聊" |');
  lines.push('| 短轨/长轨 | "快速模式"、"认真模式" |');
  lines.push('| 轨道决策 | "目标选择"、"关系定位" |');
  lines.push('');
  lines.push('⚠️ 【表达风格】必须遵守：');
  lines.push('   1. 像朋友在你耳边叮嘱，语气亲切自然');
  lines.push('   2. 用"兄弟"、"咱们"、"你啊"等人称');
  lines.push('   3. 有具体场景和例子，不干巴巴讲理论');
  lines.push('   4. 逻辑清晰：先给结论，再说原因');
  lines.push('   5. 有话则长，无话则短，不要凑字数');
  lines.push('');
  lines.push('⚠️ 【输出前检查】：');
  lines.push('   1. 搜索回答中是否有"资源池"→ 替换为"加微信"');
  lines.push('   2. 搜索回答中是否有"私域"→ 替换为"私下聊"');
  lines.push('   3. 搜索回答中是否有"Phase"→ 删除整句重写');
  lines.push('   4. 搜索回答中是否有"短轨/长轨"→ 替换为"快速/认真模式"');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}

module.exports = {
  buildMasterPrompt,
  buildChatAnalysisPrompt,
  buildOSMetaSection
};

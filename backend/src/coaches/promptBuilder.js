/**
 * Prompt Builder - 构建AI教练prompt
 */

const { getMultiDimensionalSkillsWithMeta } = require('./router');

/**
 * 构建综合教练prompt
 * @param {string} question - 用户输入的问题（必须插入prompt）
 * @param {Object} context - 上下文对象
 * @param {Object} options - 配置选项
 */
function buildMasterPrompt(question, context = {}, options = {}) {
  const {
    girlInfo = null,
    conversationHistory = [],
    turnCount = 0
  } = options;

  // 获取相关skill（会返回多个coach视角）
  const { skills, meta } = getMultiDimensionalSkillsWithMeta(question, context);

  // 构建大师视角部分（多coach融合）
  const masterSection = skills.map(skill => buildMasterSection(skill)).join('\n\n');

  // 构建女生上下文
  const contextSection = buildContextSection(girlInfo);

  // 构建历史对话
  const historySection = buildHistorySection(conversationHistory, turnCount);

  // 构建融合提示（当多coach视角冲突时）
  const fusionHint = buildFusionHint(skills, meta);

  // 核心：question 必须插入 prompt，否则AI看不到用户的问题
  return `
你是鱼塘AI情感教练，帮助用户分析情感问题，给出简单实用的建议。

回答要求：
- 简洁口语化，像朋友聊天
- 直接给结论和建议，不要绕弯子
- 不要用任何加粗、斜体等格式
- 不要出现任何大师名字、称号、角色名
- 不要说"置信度"、"框架"、"原则"等专业术语
- 不要出现**符号
- 如果多个参考角度给出不同建议，综合判断后给出一个最稳妥的，不要矛盾

【分析框架】（多位教练的综合视角）

${masterSection}

${fusionHint}

${contextSection}

${historySection}

【当前问题】
${question}

【回答格式】（严格按这个格式输出，不要加任何标题前缀，不要用markdown）：
第一段：判断窗口——她对你是什么态度，窗口开着还是关着？
第二段：核心问题——当前这段关系最大的卡点在哪？
第三段：具体行动——给1-2条马上可以做的行动建议
第四段：如果信息不够，直接说"目前信息不足，需要了解XX"，追问1个关键问题
`.trim();
}

/**
 * 构建单个教练视角（不暴露名字，只提供专业框架）
 */
function buildMasterSection(skill) {
  const principles = skill.principles || [];

  const principlesText = principles.map(p => {
    if (p.steps && Array.isArray(p.steps)) {
      const stepsText = p.steps.map((s, i) => {
        const stepName = typeof s === 'string' ? s : s.name;
        const question = s.question || '';
        return `  ${i + 1}. ${stepName}${question ? ` - ${question}` : ''}`;
      }).join('\n');
      return `[框架] ${p.name}：${p.description || ''}\n${stepsText}`;
    } else {
      return `[原则] ${p.name}：${p.description || ''} | ${p.rule || ''}`;
    }
  }).join('\n');

  return `
[框架组]
${principlesText}
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
 * 构建女生上下文
 */
function buildContextSection(girlInfo) {
  if (!girlInfo) {
    return '【女生上下文】暂无';
  }

  const personality = girlInfo.personality || {};

  return `
【女生上下文】
- 昵称：${girlInfo.name || '未知'}
- 当前阶段：${girlInfo.stage || '未知'}
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
  const skills = getMultiDimensionalSkills('聊天分析', context);

  return `
你是聊天分析专家，分析以下聊天记录，识别对话双方的意图、情绪和关系状态。

【聊天记录】
${chatHistory}

【分析框架】
${skills.map(s => {
  const framework = s.principles?.find(p => p.type === 'framework');
  return framework ? `${framework.name}：${framework.steps?.map((step, i) => `${i+1}.${typeof step === 'string' ? step : step.name}`).join(' → ')}` : '';
}).filter(Boolean).join('\n')}

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

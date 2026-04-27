/**
 * 阶段守卫服务 (M007 S01 T03)
 *
 * 职责：
 * - addStageContext: 在 AI prompt 中注入当前关系阶段上下文
 * - validateRecommendation: 检查建议是否与当前阶段匹配，返回警告
 */

const { STAGE_LABELS, STAGE_ORDER } = require('./relationshipStage');

const STAGE_DESCRIPTIONS = {
  EXPLORATION: '探索期 — 从认识到建立基础连接，以日常寒暄和了解为主，不要过早涉及感情话题',
  FLIRTING: '暧昧期 — 有明显兴趣信号，可以适当调情和亲密互动，但不要过早表白或承诺',
  ADVANCEMENT: '推进期 — 主动升级关系，经常约会，愿意为对方付出，可以聊感情话题',
  CONFIRMATION: '确认期 — 双方有意愿，可以正式表白或确认关系，关注未来规划',
  STABLE: '稳定期 — 关系确立，进入日常相处模式，关注相处质量和长期规划'
};

const STAGE_ADVICE_BY_STAGE = {
  EXPLORATION: [
    '不要急于表白或谈感情话题，重点是建立舒适感和基本信任',
    '聊天以日常话题为主，了解对方的生活、兴趣、工作',
    '不要频繁主动联系，保持适度的神秘感和联系频率',
    '如果对方回复冷淡，可以适当减少联系频率'
  ],
  FLIRTING: [
    '可以适当调情和制造暧昧，但不要用力过猛',
    '多创造线下见面机会，通过约会推进关系',
    '关注对方的信号：是否主动找你聊天、是否答应约会邀约',
    '可以适当表达欣赏和喜欢，但不要过度追求或施压'
  ],
  ADVANCEMENT: [
    '增加约会频率和投入，约会中可以有更亲密的举动（牵手等）',
    '可以聊一些更深入的话题（家庭、感情观、未来规划）',
    '关注是否出现了推进窗口（对方主动、情绪高涨时）',
    '准备好表白或确认关系的时机，但不要在对方还没准备好时强行推进'
  ],
  CONFIRMATION: [
    '双方感情基础已经很好，可以考虑正式表白或确认关系',
    '表白时选择合适的时机和场景，不要在公开场合施压',
    '如果对方有意愿但还没准备好，可以给对方更多时间',
    '表白后关注对方反馈，保持沟通'
  ],
  STABLE: [
    '关系已经确立，重点是维护相处质量',
    '日常相处中多关注对方感受，保持良好的沟通',
    '避免过度占有或控制，给彼此空间',
    '长期关系需要持续投入，关注双方成长'
  ]
};

/**
 * 获取阶段对应的颜色（用于前端展示）
 */
function getStageColor(stage) {
  const colors = {
    EXPLORATION: 'gray',
    FLIRTING: 'pink',
    ADVANCEMENT: 'orange',
    CONFIRMATION: 'green',
    STABLE: 'blue'
  };
  return colors[stage] || 'gray';
}

/**
 * 在 prompt 末尾追加阶段约束
 * @param {string} currentStage - 当前关系阶段
 * @param {string} stageContext - 额外上下文（可选）
 */
function addStageContext(currentStage, stageContext = '') {
  if (!currentStage || !STAGE_ORDER[currentStage]) {
    // 无阶段信息，不添加约束
    return '';
  }

  const description = STAGE_DESCRIPTIONS[currentStage] || '';
  const advice = STAGE_ADVICE_BY_STAGE[currentStage]?.map(a => `- ${a}`).join('\n') || '';
  const label = STAGE_LABELS[currentStage] || currentStage;

  return `

${stageContext}
【关系阶段约束】
当前关系阶段：${label}（${description}）
建议策略：
${advice}

重要提示：在给建议时，请确保你的建议与当前关系阶段相符。不要给出与阶段不符的建议（如在探索期建议表白，或在稳定期建议追着聊天）。如果你的建议涉及跨阶段操作，请在回复末尾标注"[⚠️ 阶段警告：此建议需要推进到下一阶段]"。
`;
}

/**
 * 检查建议是否与当前阶段匹配
 * @param {string} recommendation - AI 的建议内容
 * @param {string} currentStage - 当前关系阶段
 * @returns {Object} { isAppropriate, warnings[] }
 */
function validateRecommendation(recommendation, currentStage) {
  if (!currentStage || !STAGE_ORDER[currentStage]) {
    return { isAppropriate: true, warnings: [] };
  }

  const warnings = [];
  const rec = (recommendation || '').toLowerCase();
  const currentOrder = STAGE_ORDER[currentStage];

  // 定义各阶段应该避免的内容
  const stageRisks = {
    EXPLORATION: {
      order: 1,
      riskyKeywords: ['表白', '确认关系', '接吻', '牵手', '亲密', '订婚', '承诺', '正式交往', 'BF', 'GF', '在一起', '追求成功'],
      riskReason: '探索期不应过早涉及感情确认，应以建立舒适感为主'
    },
    FLIRTING: {
      order: 2,
      riskyKeywords: ['表白', '确认关系', '订婚', '承诺', 'BF', 'GF', '正式交往', '在一起', '追到', '确定关系'],
      riskReason: '暧昧期感情基础尚浅，过早表白可能被拒绝或吓跑对方'
    },
    ADVANCEMENT: {
      order: 3,
      riskyKeywords: ['订婚', '结婚', '见家长', '同居', '承诺一辈子', '确定关系', '正式交往', 'BF', 'GF'],
      riskReason: '推进期还在追求过程中，不应急于做出重大承诺'
    },
    CONFIRMATION: {
      order: 4,
      riskyKeywords: ['订婚', '结婚', '见家长', '同居', '承诺一辈子'],
      riskReason: '确认期需要双方充分沟通后再考虑重大决定'
    },
    STABLE: {
      order: 5,
      riskyKeywords: [],
      riskReason: ''
    }
  };

  const risk = stageRisks[currentStage];
  if (!risk) return { isAppropriate: true, warnings: [] };

  for (const keyword of risk.riskyKeywords) {
    if (rec.includes(keyword.toLowerCase())) {
      warnings.push(`[⚠️ 阶段警告] 当前处于【${STAGE_LABELS[currentStage]}】，${risk.riskReason}。建议中包含"${keyword}"可能与当前阶段不符。`);
    }
  }

  return {
    isAppropriate: warnings.length === 0,
    warnings,
    currentStage: currentStage,
    currentStageLabel: STAGE_LABELS[currentStage]
  };
}

/**
 * 在 AI 回复文本后追加阶段警告（如果有必要）
 * @param {string} aiResponse - AI 的原始回复
 * @param {string} currentStage - 当前关系阶段
 * @returns {string} - 可能附加警告的回复
 */
function appendStageWarning(aiResponse, currentStage) {
  if (!currentStage || !STAGE_ORDER[currentStage]) {
    return aiResponse;
  }

  const validation = validateRecommendation(aiResponse, currentStage);
  if (validation.warnings.length === 0) {
    return aiResponse;
  }

  const warningText = `\n\n---\n${validation.warnings.join('\n')}`;
  return aiResponse + warningText;
}

module.exports = {
  addStageContext,
  validateRecommendation,
  appendStageWarning,
  getStageColor,
  STAGE_DESCRIPTIONS,
  STAGE_ADVICE_BY_STAGE
};

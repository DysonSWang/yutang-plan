/**
 * Question Router - 问题类型路由（带权重评分）
 *
 * 改进：
 * 1. 关键词权重机制 — 多类型同时命中时选权重最高的
 * 2. 多类型支持 — 复杂问题可同时触发多个类型
 * 3. 调试 meta — 返回路由过程信息供追踪
 */

const { loadSkills, getRoutingConfig } = require('./loader');

/**
 * 关键词权重配置
 * { keyword, weight, type }
 * weight: 0.0-1.0，越高越优先
 */
const KEYWORD_WEIGHTS = [
  // 分手挽回 — 权重最高（明确意图）
  { keyword: '分手', weight: 0.95, type: '分手挽回' },
  { keyword: '挽回', weight: 0.95, type: '分手挽回' },
  { keyword: '前任', weight: 0.9, type: '分手挽回' },
  { keyword: '前女友', weight: 0.9, type: '分手挽回' },
  { keyword: '前男友', weight: 0.9, type: '分手挽回' },

  // 性相关 — 权重高
  { keyword: '性张力', weight: 0.9, type: '性张力不足' },
  { keyword: '没张力', weight: 0.85, type: '性张力不足' },
  { keyword: '肢体', weight: 0.8, type: '性张力不足' },
  { keyword: '床上', weight: 0.8, type: '性张力不足' },

  // 关系拉伸
  { keyword: '牵手', weight: 0.85, type: '关系拉伸' },
  { keyword: '接吻', weight: 0.85, type: '关系拉伸' },
  { keyword: '升级', weight: 0.8, type: '关系拉伸' },
  { keyword: '拉伸', weight: 0.75, type: '关系拉伸' },
  { keyword: '暧昧', weight: 0.7, type: '关系拉伸' },
  { keyword: '推进', weight: 0.7, type: '关系拉伸' },

  // 心态问题
  { keyword: '崩溃', weight: 0.9, type: '心态问题' },
  { keyword: '绝望', weight: 0.9, type: '心态问题' },
  { keyword: '焦虑', weight: 0.8, type: '心态问题' },
  { keyword: '难受', weight: 0.7, type: '心态问题' },
  { keyword: '难过', weight: 0.7, type: '心态问题' },

  // 冷淡不回
  { keyword: '忽冷忽热', weight: 0.85, type: '聊天卡壳' },
  { keyword: '不回', weight: 0.8, type: '聊天卡壳' },
  { keyword: '不热情', weight: 0.8, type: '聊天卡壳' },
  { keyword: '敷衍', weight: 0.8, type: '聊天卡壳' },
  { keyword: '冷淡', weight: 0.75, type: '聊天卡壳' },

  // 价值判断
  { keyword: '该不该', weight: 0.85, type: '价值判断' },
  { keyword: '止损', weight: 0.85, type: '价值判断' },
  { keyword: '放弃', weight: 0.75, type: '价值判断' },
  { keyword: '继续', weight: 0.6, type: '价值判断' },

  // 长期关系
  { keyword: '结婚', weight: 0.9, type: '长期关系' },
  { keyword: '在一起很久', weight: 0.85, type: '长期关系' },
  { keyword: '女朋友', weight: 0.7, type: '长期关系' },
  { keyword: '男朋友', weight: 0.7, type: '长期关系' },

  // 沟通问题
  { keyword: '怎么说', weight: 0.7, type: '沟通问题' },
  { keyword: '不会聊', weight: 0.7, type: '沟通问题' },

  // 社交软件
  { keyword: '微信聊天', weight: 0.8, type: '社交软件' },
  { keyword: '怎么聊', weight: 0.75, type: '社交软件' },
  { keyword: '聊天方法', weight: 0.75, type: '社交软件' },
  { keyword: '社交软件', weight: 0.7, type: '社交软件' },
  { keyword: '陌陌', weight: 0.7, type: '社交软件' },
  { keyword: '探探', weight: 0.7, type: '社交软件' },
  { keyword: 'soul', weight: 0.6, type: '社交软件' },

  // 情绪调动
  { keyword: '调动情绪', weight: 0.8, type: '情绪调动' },
  { keyword: '情绪波动', weight: 0.7, type: '情绪调动' },
  { keyword: '没感觉', weight: 0.7, type: '情绪调动' },
];

/**
 * 对问题进行加权评分路由
 * @param {string} question
 * @param {Object} context
 * @returns {Object} { type, score, matchedKeywords, meta }
 */
function routeQuestion(question, context = {}) {
  const q = (question || '').toLowerCase();
  const routing = getRoutingConfig();

  // 计算每个类型的总分
  const typeScores = {};
  const matchDetails = [];

  for (const kw of KEYWORD_WEIGHTS) {
    if (q.includes(kw.keyword)) {
      matchDetails.push({ keyword: kw.keyword, weight: kw.weight, type: kw.type });
      typeScores[kw.type] = (typeScores[kw.type] || 0) + kw.weight;
    }
  }

  // ---- 女生上下文增强 ----
  const girlProfile = context.girlProfile;
  if (girlProfile?.stage) {
    if (['约会', '暧昧', '女朋友'].includes(girlProfile.stage)) {
      if (q.includes('冷淡') || q.includes('不回')) {
        typeScores['长期关系'] = (typeScores['长期关系'] || 0) + 0.5;
        matchDetails.push({ keyword: 'context_stage_boost', weight: 0.5, type: '长期关系' });
      }
    }
    // 阶段权重：陌生/朋友 -> 基础沟通和搭讪；暧昧/亲密 -> 拉伸和长期关系
    if (girlProfile.stage === '陌生') {
      typeScores['社交软件'] = (typeScores['社交软件'] || 0) + 0.3;
      typeScores['沟通问题'] = (typeScores['沟通问题'] || 0) + 0.2;
      matchDetails.push({ keyword: 'girl_stage_cold', weight: 0.3, type: '社交软件' });
    } else if (girlProfile.stage === '朋友') {
      typeScores['关系拉伸'] = (typeScores['关系拉伸'] || 0) + 0.2;
      typeScores['沟通问题'] = (typeScores['沟通问题'] || 0) + 0.15;
    } else if (['暧昧', '约会', '女朋友'].includes(girlProfile.stage)) {
      typeScores['关系拉伸'] = (typeScores['关系拉伸'] || 0) + 0.3;
      typeScores['长期关系'] = (typeScores['长期关系'] || 0) + 0.25;
      matchDetails.push({ keyword: 'girl_stage_warm', weight: 0.3, type: '关系拉伸' });
    }
  }

  // ---- 女生热度权重调整 ----
  if (girlProfile) {
    const tension = girlProfile.tensionScore || 5;
    const recentSignals = girlProfile.recentSignals || [];
    const hasPositiveSignal = recentSignals.some(s => s.type === 'positive');
    const hasNegativeSignal = recentSignals.some(s => s.type === 'negative');

    if (tension <= 5) {
      // 冷女生：惩罚激进拉伸，奖励聊天卡壳
      if (typeScores['关系拉伸']) {
        typeScores['关系拉伸'] -= 0.3;
        matchDetails.push({ keyword: 'girl_cold_penalize_stretch', weight: -0.3, type: '关系拉伸' });
      }
      typeScores['聊天卡壳'] = (typeScores['聊天卡壳'] || 0) + 0.4;
      matchDetails.push({ keyword: 'girl_cold_boost_chat', weight: 0.4, type: '聊天卡壳' });
      if (hasNegativeSignal) {
        typeScores['心态问题'] = (typeScores['心态问题'] || 0) + 0.3;
        matchDetails.push({ keyword: 'girl_cold_negative_signal', weight: 0.3, type: '心态问题' });
      }
    } else if (tension >= 7) {
      // 热女生：奖励拉伸，惩罚价值判断
      typeScores['关系拉伸'] = (typeScores['关系拉伸'] || 0) + 0.35;
      typeScores['性张力不足'] = (typeScores['性张力不足'] || 0) + 0.2;
      typeScores['价值判断'] = Math.max(0, (typeScores['价值判断'] || 0) - 0.2);
      matchDetails.push({ keyword: 'girl_hot_boost_stretch', weight: 0.35, type: '关系拉伸' });
      if (hasPositiveSignal) {
        typeScores['长期关系'] = (typeScores['长期关系'] || 0) + 0.2;
        matchDetails.push({ keyword: 'girl_hot_positive_signal', weight: 0.2, type: '长期关系' });
      }
    }

    // 亲密度权重
    const intimacy = girlProfile.intimacyLevel || 1;
    if (intimacy >= 4) {
      typeScores['长期关系'] = (typeScores['长期关系'] || 0) + 0.25;
      typeScores['性张力不足'] = (typeScores['性张力不足'] || 0) + 0.2;
    } else if (intimacy <= 2) {
      typeScores['聊天卡壳'] = (typeScores['聊天卡壳'] || 0) + 0.2;
      typeScores['关系拉伸'] = Math.max(0, (typeScores['关系拉伸'] || 0) - 0.15);
    }
  }

  // ---- 客户画像权重调整 ----
  const cp = context.clientProfile;
  if (cp) {
    // emotionalMaturity: 幼稚(1) -> 多用脱不花基础沟通; 成熟(3) -> 可用纳爷财富观
    const maturityLevel = cp.emotionalMaturityLevel || (cp.emotionalMaturity === '成熟' ? 3 : cp.emotionalMaturity === '幼稚' ? 1 : 2);
    if (maturityLevel <= 1) {
      // 幼稚客户：增强心态支持，抑制激进拉伸
      typeScores['心态问题'] = (typeScores['心态问题'] || 0) + 0.4;
      typeScores['关系拉伸'] = Math.max(0, (typeScores['关系拉伸'] || 0) - 0.2);
      matchDetails.push({ keyword: 'client_immature_boost', weight: 0.4, type: '心态问题' });
    } else if (maturityLevel >= 3) {
      // 成熟客户：可接受更深度策略
      typeScores['长期关系'] = (typeScores['长期关系'] || 0) + 0.3;
      typeScores['价值判断'] = (typeScores['价值判断'] || 0) + 0.2;
      matchDetails.push({ keyword: 'client_mature_boost', weight: 0.3, type: '长期关系' });
    }

    // antiFrustrationLevel: 低 -> 避免激进拉伸建议，优先心态支持
    const antiFrustration = cp.antiFrustrationLevel || 5;
    if (antiFrustration <= 3) {
      typeScores['心态问题'] = (typeScores['心态问题'] || 0) + 0.5;
      typeScores['关系拉伸'] = Math.max(0, (typeScores['关系拉伸'] || 0) - 0.3);
      typeScores['分手挽回'] = Math.max(0, (typeScores['分手挽回'] || 0) - 0.2);
      matchDetails.push({ keyword: 'client_low_frustration_tone', weight: 0.5, type: '心态问题' });
    } else if (antiFrustration >= 8) {
      // 高抗压：可接受激进拉伸建议
      typeScores['关系拉伸'] = (typeScores['关系拉伸'] || 0) + 0.2;
      matchDetails.push({ keyword: 'client_high_frustration_tone', weight: 0.2, type: '关系拉伸' });
    }

    // pacePreference: 快节奏 -> 优先进攻型策略; 慢热型 -> 优先稳妥型策略
    if (cp.pacePreference === '快节奏') {
      typeScores['关系拉伸'] = (typeScores['关系拉伸'] || 0) + 0.2;
      typeScores['性张力不足'] = (typeScores['性张力不足'] || 0) + 0.15;
    } else if (cp.pacePreference === '慢热型') {
      typeScores['聊天卡壳'] = (typeScores['聊天卡壳'] || 0) + 0.2;
      typeScores['心态问题'] = (typeScores['心态问题'] || 0) + 0.15;
      matchDetails.push({ keyword: 'client_slow_pace_preference', weight: 0.2, type: '聊天卡壳' });
    }

    // clientType: 质疑型 -> 调整语气策略（少说"你应该"，多说"我建议这样因为"）
    if (cp.clientType === '质疑型') {
      typeScores['价值判断'] = (typeScores['价值判断'] || 0) + 0.2;
      typeScores['沟通问题'] = (typeScores['沟通问题'] || 0) + 0.15;
      matchDetails.push({ keyword: 'client_skeptical_type', weight: 0.2, type: '价值判断' });
    }
  }

  // 选取得分最高的类型
  let bestType = '通用';
  let bestScore = 0;

  for (const [type, score] of Object.entries(typeScores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  const meta = {
    matchedKeywords: matchDetails.map(m => m.keyword),
    typeScores,
    bestScore,
    routedType: bestType,
    clientProfileBoost: cp ? {
      maturityLevel: cp.emotionalMaturityLevel,
      antiFrustrationLevel: cp.antiFrustrationLevel,
      pacePreference: cp.pacePreference,
      clientType: cp.clientType
    } : null,
    girlProfileBoost: girlProfile ? {
      tensionScore: girlProfile.tensionScore,
      intimacyLevel: girlProfile.intimacyLevel,
      stage: girlProfile.stage
    } : null
  };

  return { type: bestType, score: bestScore, meta };
}

/**
 * 获取问题对应的skill列表
 */
function getSkillsForQuestion(question, context = {}) {
  const { type, meta } = routeQuestion(question, context);
  const routing = getRoutingConfig();
  const skillIds = routing[type] || routing['通用'];

  return { skills: loadSkills(skillIds), meta };
}

/**
 * 获取多维度skill（用于复杂问题）
 */
function getMultiDimensionalSkills(question, context = {}) {
  const { type, meta } = routeQuestion(question, context);
  const routing = getRoutingConfig();
  const primarySkills = routing[type] || routing['通用'];

  // 检查是否需要多维度（通过复杂指示词或高置信度冲突）
  const hasComplexIndicators = [
    question.includes('但是'),
    question.includes('而且'),
    question.includes('同时'),
    question.includes('又')
  ];

  if (hasComplexIndicators.some(Boolean)) {
    const extraSkills = routing['通用'] || [];
    return loadSkills([...new Set([...primarySkills, ...extraSkills])]);
  }

  return loadSkills(primarySkills);
}

/**
 * 获取多维度skill（带路由meta，用于调试）
 */
function getMultiDimensionalSkillsWithMeta(question, context = {}) {
  const { type, meta } = routeQuestion(question, context);
  const routing = getRoutingConfig();
  const primarySkills = routing[type] || routing['通用'];

  const hasComplexIndicators = [
    question.includes('但是'),
    question.includes('而且'),
    question.includes('同时'),
    question.includes('又')
  ];

  let finalSkills;
  if (hasComplexIndicators.some(Boolean)) {
    const extraSkills = routing['通用'] || [];
    finalSkills = loadSkills([...new Set([...primarySkills, ...extraSkills])]);
  } else {
    finalSkills = loadSkills(primarySkills);
  }

  return {
    skills: finalSkills,
    meta: {
      ...meta,
      coachIds: finalSkills.map(s => s.id || s.name),
      coachCount: finalSkills.length,
      multiDimensional: hasComplexIndicators.some(Boolean)
    }
  };
}

/**
 * 动态调整优先级（根据问题焦点）
 */
function adjustPriority(baseType, questionFocus) {
  const focusMap = {
    '聊天卡壳': ['wang', 'dadi', 'ziyang'],
    '关系拉伸': ['kaige', 'moge', 'linlaotou'],
    '长期关系': ['tuobuhua', 'tong', 'moge'],
    '分手挽回': ['xuge', 'dadi', 'wang'],
    '价值判断': ['haoge', 'leon', 'linlaotou'],
    '性张力不足': ['haoge', 'leon', 'wang'],
    '心态问题': ['xunuo', 'haoge'],
    '沟通问题': ['tuobuhua', 'tong'],
  };

  return focusMap[baseType] || [];
}

module.exports = {
  routeQuestion,
  getSkillsForQuestion,
  getMultiDimensionalSkills,
  getMultiDimensionalSkillsWithMeta,
  adjustPriority,
  KEYWORD_WEIGHTS
};
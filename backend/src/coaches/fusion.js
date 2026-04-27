/**
 * 融合引擎 - 结构化优先级决策
 *
 * 多 coach 给出矛盾建议时，显式决策而非模糊综合。
 * 基于客户画像 + 女生画像 + 问题类型 计算优先级权重。
 * 支持：客户个性化反馈驱动权重调整（per-client coach preferences）。
 */

const { loadSkills, getRoutingConfig } = require('./loader');
const { getCoachWeightsForTypes } = require('../services/clientCoachProfile');

/**
 * 优先级矩阵定义
 * 优先级：1=最高, 3=中, 5=低
 * coach 擅长领域 → 优先级分数
 */

// 客户类型 → coach 优先级
const CLIENT_TYPE_PRIORITY = {
  '执行型': { 'tuobuhua': 1, 'tong': 2, 'moge': 3, 'default': 3 },
  '质疑型': { 'leon': 1, 'linlaotou': 2, 'default': 3 },
  '自主型': { 'kaige': 1, 'haoge': 2, 'default': 3 },
  '默认': { 'default': 3 }
};

// 女生阶段 → coach 类型优先级
const STAGE_PRIORITY = {
  '陌生': { '社交软件': 1, '沟通问题': 2, '通用': 3, '关系拉伸': 5, '长期关系': 5 },
  '朋友': { '关系拉伸': 2, '沟通问题': 3, '通用': 3, '长期关系': 4, '社交软件': 3 },
  '暧昧': { '关系拉伸': 1, '长期关系': 2, '性张力不足': 2, '通用': 4, '聊天卡壳': 4 },
  '约会': { '关系拉伸': 1, '性张力不足': 1, '长期关系': 2, '聊天卡壳': 3, '通用': 4 },
  '女朋友': { '长期关系': 1, '性张力不足': 2, '关系拉伸': 2, '通用': 4 },
  '未知': { 'default': 3 }
};

// 问题类型 → coach 类型优先级
const QUESTION_TYPE_PRIORITY = {
  '心态问题': { '情绪调动': 1, '关系拉伸': 3, '长期关系': 3, '聊天卡壳': 2, '通用': 4 },
  '聊天卡壳': { '聊天卡壳': 1, '社交软件': 2, '沟通问题': 2, '通用': 3 },
  '关系拉伸': { '关系拉伸': 1, '性张力不足': 2, '长期关系': 3, '通用': 4 },
  '分手挽回': { '分手挽回': 1, '心态问题': 2, '长期关系': 3, '通用': 4 },
  '性张力不足': { '性张力不足': 1, '关系拉伸': 2, '通用': 3 },
  '价值判断': { '价值判断': 1, '长期关系': 2, '通用': 3 },
  '长期关系': { '长期关系': 1, '关系拉伸': 2, '通用': 3 },
  '社交软件': { '社交软件': 1, '沟通问题': 2, '通用': 3 },
  '沟通问题': { '沟通问题': 1, '社交软件': 2, '通用': 3 },
  '情绪调动': { '情绪调动': 1, '心态问题': 2, '通用': 3 },
  '通用': { 'default': 3 }
};

// coach 擅长方向映射（与 INDEX.json 保持一致）
const COACH_SKILLS = {
  'tuobuhua': ['沟通问题', '社交软件', '长期关系'],
  'tong': ['沟通问题', '长期关系'],
  'moge': ['关系拉伸', '长期关系'],
  'kaige': ['关系拉伸', '性张力不足'],
  'haoge': ['心态问题', '性张力不足', '价值判断'],
  'leon': ['价值判断', '长期关系', '性张力不足'],
  'linlaotou': ['价值判断', '长期关系'],
  'xuge': ['分手挽回', '心态问题'],
  'dadi': ['聊天卡壳', '分手挽回'],
  'wang': ['聊天卡壳', '性张力不足'],
  'ziyang': ['聊天卡壳', '情绪调动'],
  'xunuo': ['心态问题', '情绪调动'],
  'shege': ['社交软件', '情绪调动', '关系拉伸'],
  '浪哥': ['聊天卡壳', '情绪判断', '吸引'],
  '马克': ['搭讪', '焦虑突破', '身体语言'],
  '七哥': ['吸引', '关系拉伸', '推拉技巧'],
  'B哥': ['特殊群体约会'],
};

// coach 标签（与 INDEX.json 的 name 字段保持一致）
const COACH_LABELS = {
  'tuobuhua': '脱不花',
  'tong': '童锦程',
  'moge': 'Mo哥',
  'kaige': '凯哥',
  'haoge': '昊哥',
  'leon': '李昂',
  'linlaotou': '林老头',
  'xuge': '旭哥',
  'dadi': '大迪',
  'wang': '王哥',
  'ziyang': '子扬',
  'xunuo': '许诺',
  'shege': '社哥',
  '浪哥': '浪哥',
  '马克': '马克',
  '七哥': '七哥',
  'B哥': 'B哥',
};

/**
 * 检测技能之间的冲突方向
 * 返回: { hasConflict, conflictType, winningDirection }
 */
function detectConflict(skills) {
  if (skills.length <= 1) return { hasConflict: false };

  // 获取每个 skill 的擅长方向
  const directions = skills.map(s => {
    const id = s.id || s.name || '';
    return COACH_SKILLS[id] || [];
  }).flat();

  // 检测矛盾方向
  const hasStretch = directions.includes('关系拉伸') || directions.includes('性张力不足');
  const hasCaution = directions.includes('聊天卡壳') || directions.includes('心态问题');
  const hasLongTerm = directions.includes('长期关系');

  if (hasStretch && hasCaution) {
    return {
      hasConflict: true,
      conflictType: 'stretch_vs_caution',
      winningDirection: 'caution', // 默认谨慎方向，除非有特殊信号
      description: '激进拉伸 vs 稳妥谨慎'
    };
  }

  if (hasStretch && hasLongTerm && directions.includes('价值判断')) {
    return {
      hasConflict: true,
      conflictType: 'aggressive_vs_conservative',
      winningDirection: 'depends_on_context',
      description: '进攻策略 vs 保守判断'
    };
  }

  return { hasConflict: false };
}

/**
 * 计算单个 coach 的优先级分数
 * @param {string} coachId
 * @param {Object} context - { clientId, clientProfile, girlProfile, routedType, personalizedWeights }
 */
function calcCoachPriority(coachId, context) {
  const { clientProfile, girlProfile, routedType, personalizedWeights = {} } = context;
  let score = 5; // 基础分数

  // 0. 个性化反馈权重（客户对特定教练的反馈加成，最优先）
  // 这反映了过去该教练对这个客户的帮助程度
  if (personalizedWeights[coachId] !== undefined) {
    score += personalizedWeights[coachId];
  }

  // 1. 客户类型优先级
  if (clientProfile?.clientType) {
    const cp = CLIENT_TYPE_PRIORITY[clientProfile.clientType] || CLIENT_TYPE_PRIORITY['默认'];
    if (cp[coachId]) score += (5 - cp[coachId]);
    else score += (5 - cp.default);
  }

  // 2. 女生阶段优先级
  if (girlProfile?.stage) {
    const stageP = STAGE_PRIORITY[girlProfile.stage] || STAGE_PRIORITY['未知'];
    const routing = getRoutingConfig();
    // 找到 coachId 对应的 type
    for (const [type, coaches] of Object.entries(routing)) {
      if (coaches.includes(coachId)) {
        const p = stageP[type] || stageP.default || 3;
        score += (5 - p);
        break;
      }
    }
  }

  // 3. 问题类型优先级
  if (routedType) {
    const qp = QUESTION_TYPE_PRIORITY[routedType] || QUESTION_TYPE_PRIORITY['通用'];
    const routing = getRoutingConfig();
    for (const [type, coaches] of Object.entries(routing)) {
      if (coaches.includes(coachId)) {
        const p = qp[type] || 3;
        score += (5 - p);
        break;
      }
    }
  }

  // 4. 客户情绪稳定性调整
  if (clientProfile?.antiFrustrationLevel !== undefined) {
    if (clientProfile.antiFrustrationLevel <= 3) {
      // 低抗压客户，抑制激进 coach，增强稳妥 coach
      const aggressiveCoaches = ['kaige', 'leon', '七哥', '浪哥'];
      const cautiousCoaches = ['xunuo', 'xuge', 'dadi', 'tuobuhua', '马克'];
      if (aggressiveCoaches.includes(coachId)) score -= 2;
      if (cautiousCoaches.includes(coachId)) score += 1;
    } else if (clientProfile.antiFrustrationLevel >= 8) {
      // 高抗压客户，可以接受激进 coach
      const aggressiveCoaches = ['kaige', 'leon', '七哥', '浪哥'];
      if (aggressiveCoaches.includes(coachId)) score += 1;
    }
  }

  // 5. 女生热度调整
  if (girlProfile?.tensionScore !== undefined) {
    const aggressiveCoaches = ['kaige', 'leon', '七哥', '浪哥'];
    if (girlProfile.tensionScore <= 5) {
      // 冷女生，抑制进攻型 coach
      if (aggressiveCoaches.includes(coachId)) score -= 1.5;
    } else if (girlProfile.tensionScore >= 7) {
      // 热女生，增强进攻型 coach
      if (aggressiveCoaches.includes(coachId)) score += 1;
    }
  }

  return score;
}

/**
 * 融合决策引擎
 * @param {Array} skills - 来自 router 的 skill 列表
 * @param {Object} meta - 路由 meta
 * @param {Object} context - 融合上下文，包含 clientId 用于加载个性化权重
 * @returns {Object} 融合结果
 */
async function fusionDecide(skills, meta, context = {}) {
  const { clientId = null, clientProfile = null, girlProfile = null, routedType = '通用' } = context;

  if (!skills || skills.length === 0) {
    return {
      primaryCoach: null,
      priorityCoaches: [],
      conflict: { hasConflict: false },
      fusionStrategy: 'single_coach',
      decisionReason: '只有一个教练视角，直接采用'
    };
  }

  // 加载该客户的个性化教练权重（从反馈历史中学到的）
  const personalizedWeights = clientId
    ? await getCoachWeightsForTypes(clientId, [routedType, '通用'])
    : {};

  // 计算每个 coach 的优先级分数
  const ctx = { clientProfile, girlProfile, routedType, personalizedWeights };
  const coachScores = skills.map(skill => {
    const id = skill.id || skill.name || '';
    return {
      id,
      label: COACH_LABELS[id] || id,
      score: calcCoachPriority(id, ctx),
      principles: skill.principles || []
    };
  });

  // 按分数排序
  coachScores.sort((a, b) => b.score - a.score);

  // 检测冲突
  const conflict = detectConflict(skills);

  // 冲突处理：如果有冲突，根据上下文显式决策
  let fusionStrategy = 'multi_coach_blended';
  let decisionReason = '';
  let primaryCoach = coachScores[0];

  if (conflict.hasConflict) {
    // 冲突决策规则
    if (conflict.conflictType === 'stretch_vs_caution') {
      // 客户抗压低 → 选谨慎方向
      if ((clientProfile?.antiFrustrationLevel || 5) <= 3) {
        decisionReason = '客户抗压水平低，选择稳妥策略';
        fusionStrategy = 'caution_priority';
        // 选心态/聊天类 coach
        const cautious = coachScores.filter(c =>
          ['xunuo', 'xuge', 'dadi', 'ziyang', 'tuobuhua', '马克', 'moge'].includes(c.id)
        );
        if (cautious.length > 0) primaryCoach = cautious[0];
      }
      // 女生热度高 + 客户抗压高 → 选进取方向
      else if ((girlProfile?.tensionScore || 5) >= 7 && (clientProfile?.antiFrustrationLevel || 5) >= 6) {
        decisionReason = '女生热度高且客户抗压充足，可以进取';
        fusionStrategy = 'aggressive_priority';
      } else {
        decisionReason = '多方向冲突，平衡处理';
        fusionStrategy = 'balanced_blend';
      }
    } else {
      decisionReason = '多策略冲突，根据上下文综合判断';
      fusionStrategy = 'context_balanced';
    }
  } else {
    decisionReason = `教练优先级排序：${coachScores.map(c => c.label).join(' > ')}`;
  }

  // 构建优先级coach列表（top 3）
  const priorityCoaches = coachScores.slice(0, Math.min(3, coachScores.length));

  return {
    primaryCoach: primaryCoach.id,
    primaryLabel: primaryCoach.label,
    primaryScore: primaryCoach.score,
    priorityCoaches,
    conflict,
    fusionStrategy,
    decisionReason,
    routedType,
    coachScores: coachScores.map(c => ({ id: c.id, label: c.label, score: parseFloat(c.score.toFixed(2)) }))
  };
}

/**
 * 构建结构化融合提示（供 promptBuilder 使用）
 * 替代原有的 buildFusionHint
 */
async function buildStructuredFusion(skills, meta, context = {}) {
  const result = await fusionDecide(skills, meta, context);

  // 构建融合提示文本
  let hint = '';

  // 1. 融合策略说明
  hint += `\n【融合策略】${result.fusionStrategy === 'single_coach' ? '单一教练' : result.fusionStrategy === 'caution_priority' ? '谨慎优先' : result.fusionStrategy === 'aggressive_priority' ? '进取优先' : result.fusionStrategy === 'balanced_blend' ? '平衡综合' : '多教练融合'}`;
  hint += `\n决策原因：${result.decisionReason}`;

  // 2. 优先级教练顺序
  if (result.priorityCoaches.length > 1) {
    const coachNames = result.priorityCoaches.map(c => c.label).join(' > ');
    hint += `\n教练优先级：${coachNames}`;
  }

  // 3. 冲突处理说明
  if (result.conflict.hasConflict) {
    hint += `\n注意：检测到策略冲突（${result.conflict.description}），系统已按上述策略处理`;
  }

  // 4. 问题类型优先级
  hint += `\n当前问题类型：${result.routedType}`;

  // 5. 决策矩阵总结（用于 AI 判断）
  if (result.coachScores && result.coachScores.length > 0) {
    const topCoaches = result.coachScores.slice(0, 3);
    hint += `\n决策参考：`;
    for (const c of topCoaches) {
      hint += `\n  - ${c.label}（权重${c.score}）`;
    }
  }

  return hint;
}

module.exports = {
  fusionDecide,
  buildStructuredFusion,
  detectConflict,
  calcCoachPriority
};
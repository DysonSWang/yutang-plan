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

// OS 13 条冲突裁决规则
// 每条：{ id, conflict, rule: (context) => { winningCoach, reason } }
const OS_CONFLICT_RULES = [
  {
    id: 1,
    name: '人的定位',
    description: '猎物 vs 善良的人',
    resolve: (ctx) => {
      const { phase } = ctx;
      if (phase <= 3) return { winner: '乌哥', reason: 'Phase 1-3 是博弈对手，用乌哥的博弈论视角' };
      return { winner: 'context_dependent', reason: 'Phase 4 后按轨道分：短轨=博弈，长轨=善良的人' };
    }
  },
  {
    id: 2,
    name: '关系目标',
    description: '速约 vs 长期',
    resolve: (ctx) => {
      const { userTrack } = ctx;
      if (userTrack === 'short') return { winner: '表哥', reason: '用户选择短轨，走速约路线' };
      if (userTrack === 'long') return { winner: '梵公子', reason: '用户选择长轨，走长期经营路线' };
      return { winner: 'os_router', reason: 'Phase 4 分叉点，请用户选择短轨或长轨，不可混合' };
    }
  },
  {
    id: 3,
    name: '走心/真诚',
    description: '工具画饼 vs 真诚',
    resolve: (ctx) => {
      const { userTrack } = ctx;
      if (userTrack === 'short') return { winner: '表哥', reason: '短轨允许策略性话术' };
      if (userTrack === 'long') return { winner: '童锦程', reason: '长轨必须真诚，童锦程的真心路线' };
      return { winner: 'phase_dependent', reason: '短轨可画饼，长轨必须真诚' };
    }
  },
  {
    id: 4,
    name: '付出态度',
    description: '不付出 vs 价值交换',
    resolve: (ctx) => {
      const { phase } = ctx;
      if (phase <= 2) return { winner: '表哥', reason: 'Phase 1-2 不付出，先建立框架' };
      if (phase === 3) return { winner: '脱不花', reason: 'Phase 3 价值交换，建立互信' };
      return { winner: '梵公子', reason: 'Phase 5+ 长轨引导对方投资' };
    }
  },
  {
    id: 5,
    name: '对感觉的态度',
    description: '跟着感觉走 vs 理性决策',
    resolve: () => ({
      winner: '乌哥',
      reason: 'OS统一：感觉是结果不是方法，用阶段/信号/数据决策'
    })
  },
  {
    id: 6,
    name: '善良前提',
    description: '要不要假设对方是善良的人',
    resolve: () => ({
      winner: '梵公子',
      reason: 'OS底线：不善良的人消耗远大于产出，先验证善良度'
    })
  },
  {
    id: 7,
    name: '时代错配',
    description: '技术流 vs 时代对齐',
    resolve: (ctx) => {
      const { userTrack } = ctx;
      if (userTrack === 'long') return { winner: '梵公子+Leon', reason: '长轨必须时代对齐，不依赖过时技术' };
      return { winner: '表哥', reason: '短轨可用技术流快速推进' };
    }
  },
  {
    id: 8,
    name: '框架vs真诚',
    description: '高位框架 vs 真诚表达',
    resolve: (ctx) => {
      const { phase } = ctx;
      if (phase <= 2) return { winner: '表哥', reason: 'Phase 1-2 框架优先，建立高位' };
      return { winner: '童锦程', reason: 'Phase 3+ 真诚表达，框架内走心' };
    }
  },
  {
    id: 9,
    name: '推拉vs稳定',
    description: '情绪推拉 vs 稳定陪伴',
    resolve: (ctx) => {
      const { phase, userTrack } = ctx;
      if (phase <= 3) return { winner: '表哥', reason: 'Phase 1-3 推拉制造情绪波动' };
      if (userTrack === 'long' && phase >= 4) return { winner: '梵公子', reason: '长轨 Phase 4+ 稳定陪伴' };
      return { winner: '熊哥', reason: '短轨 Phase 4+ 继续推拉推进' };
    }
  },
  {
    id: 10,
    name: '进攻vs防守',
    description: '主动进攻 vs 等待窗口',
    resolve: (ctx) => {
      const { antiFrustrationLevel } = ctx;
      if (antiFrustrationLevel <= 3) return { winner: '许诺', reason: '低抗压客户，先稳心态' };
      return { winner: '凯哥', reason: '正常抗压水平，主动推进' };
    }
  },
  {
    id: 11,
    name: '速约vs培养',
    description: '打猎思维 vs 养殖思维',
    resolve: (ctx) => {
      const { userTrack } = ctx;
      if (userTrack === 'short') return { winner: '熊哥', reason: '短轨=打猎，快速筛选速约' };
      if (userTrack === 'long') return { winner: '梵公子', reason: '长轨=养殖，耐心培养' };
      return { winner: '熊哥', reason: '未指定轨道，默认打猎思维快速判断窗口' };
    }
  },
  {
    id: 12,
    name: '话术vs真诚',
    description: '话术模板 vs 自然表达',
    resolve: (ctx) => {
      const { phase } = ctx;
      if (phase <= 1) return { winner: '王哥', reason: 'Phase 1 需要话术破冰' };
      return { winner: '脱不花', reason: 'Phase 2+ 自然沟通优先' };
    }
  },
  {
    id: 13,
    name: '筛选vs包容',
    description: '严格筛选 vs 包容理解',
    resolve: (ctx) => {
      const { phase } = ctx;
      if (phase <= 2) return { winner: 'Leon', reason: 'Phase 1-2 严格筛选，不合标准直接踢' };
      return { winner: '童锦程', reason: 'Phase 3+ 包容理解，修复关系' };
    }
  }
];

/**
 * OS 冲突裁决引擎
 * @param {Array} ruleIds - 要应用的规则 ID 列表
 * @param {Object} ctx - { phase, userTrack, antiFrustrationLevel }
 * @returns {Array} { ruleId, name, winner, reason }
 */
function osResolveConflict(ruleIds, ctx) {
  return OS_CONFLICT_RULES
    .filter(r => ruleIds.includes(r.id))
    .map(r => {
      const result = r.resolve(ctx);
      return {
        ruleId: r.id,
        name: r.name,
        winner: result.winner,
        reason: result.reason
      };
    });
}

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

  // OS 冲突裁决（13 条规则）
  const osCtx = {
    phase: meta?.phase ?? 1,
    userTrack: meta?.track ?? 'both',
    antiFrustrationLevel: clientProfile?.antiFrustrationLevel ?? 5,
    tensionScore: girlProfile?.tensionScore ?? 5
  };
  const osResolutions = osResolveConflict([1,2,3,4,5,6,7,8,9,10,11,12,13], osCtx);

  // 冲突处理：OS 裁决优先于原有逻辑
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
    osResolutions,
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

  // 1. 融合策略说明（内部参考）
  hint += `\n【融合策略】（内部参考）${result.fusionStrategy === 'single_coach' ? '单一角度' : result.fusionStrategy === 'caution_priority' ? '谨慎优先' : result.fusionStrategy === 'aggressive_priority' ? '进取优先' : result.fusionStrategy === 'balanced_blend' ? '平衡综合' : '多维融合'}`;
  hint += `\n决策原因：${result.decisionReason}`;

  // 2. 优先级参考（不暴露教练名称）
  if (result.priorityCoaches.length > 1) {
    hint += `\n分析优先级：已按权重排序（共${result.priorityCoaches.length}个维度）`;
  }

  // 3. 冲突处理说明
  if (result.conflict.hasConflict) {
    hint += `\n注意：检测到策略冲突（${result.conflict.description}），系统已按上述策略处理`;
  }

  // 4. 问题类型优先级
  hint += `\n当前问题类型：${result.routedType}`;

  // 5. 决策参考（仅权重，不暴露教练名称）
  if (result.coachScores && result.coachScores.length > 0) {
    const topCoaches = result.coachScores.slice(0, 3);
    hint += `\n决策参考（权重由高到低）：`;
    for (const c of topCoaches) {
      hint += `\n  - 维度权重${c.score}`;
    }
  }

  // 6. OS 冲突裁决结果
  if (result.osResolutions && result.osResolutions.length > 0) {
    hint += `\n\n【OS 裁决结果】`;
    for (const r of result.osResolutions.slice(0, 5)) {
      hint += `\n  - ${r.name}：${r.winner}（${r.reason}）`;
    }
  }

  return hint;
}

module.exports = {
  fusionDecide,
  buildStructuredFusion,
  detectConflict,
  calcCoachPriority,
  OS_CONFLICT_RULES,
  osResolveConflict
};
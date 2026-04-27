/**
 * Triage Agent - 路由入口 Agent
 *
 * 职责：
 * 1. 意图识别：分析用户输入，判断需求类型
 * 2. 路由决策：选择最合适的专业 Agent
 * 3. 上下文预加载：通过 handoff 回调为下游 Agent 准备上下文
 *
 * 路由类型：
 * - situation: 情况咨询（默认）
 * - chat_analysis: 聊天分析
 * - reply: 回复建议
 * - moment: 朋友圈分析
 * - overview: 全局概览
 * - optimize_reply: 话术优化
 * - general: 通用教练
 */

const { routeQuestion } = require('../coaches/router');
const { ROUTE_TYPES } = require('./UnifiedContext');

const TRIAGE_INSTRUCTIONS = `你是鱼塘计划的路由 Agent。根据用户问题类型，分流到最合适的专业 Agent：

路由类型：
- situation（情况咨询）：用户描述当前情况、问怎么办、问进展如何 → Situation Agent
- chat_analysis（聊天分析）：用户发聊天记录让分析意图/情绪/信号 → ChatAnalysis Agent
- reply（回复建议）：用户问怎么回复、给个回复选项 → Reply Agent
- optimize_reply（话术优化）：用户有已有回复，让AI优化 → Reply Agent（话术优化模式）
- moment（朋友圈分析）：用户发朋友圈截图/文字，让分析 → Moment Agent
- overview（全局概览）：用户问全局、鱼塘整体情况 → Overview Agent
- general（通用教练）：不符合以上类型，使用通用教练

判断规则：
1. 有聊天记录 → chat_analysis
2. 有朋友圈内容 → moment
3. 问怎么回复/给回复 → reply（无原始回复则普通建议，有原始回复则优化模式）
4. 有原始回复文本 → optimize_reply
5. 问全局/鱼塘/所有女生 → overview
6. 其他 → situation（情况咨询）

只输出路由类型，不要解释理由。`;

// ---- 关键词路由（轻量，无 LLM 调用）----
const KEYWORD_ROUTES = [
  // 朋友圈分析（优先于聊天分析，避免"发了"抢匹配）
  { keywords: ['朋友圈', '小红书', '发了个', '发了条', '抖音', '社交媒体'], route: ROUTE_TYPES.MOMENT, confidence: 0.8 },

  // 聊天分析
  { keywords: ['聊天记录', '分析一下', '她说什么', '他说什么', '发了消息', '发消息', '回复了', '回了', '对方说', '她说', '他说'], route: ROUTE_TYPES.CHAT_ANALYSIS, confidence: 0.85 },
  { keywords: ['意图', '情绪', '信号', '怎么看', '分析分析'], route: ROUTE_TYPES.CHAT_ANALYSIS, confidence: 0.7 },

  // 回复建议
  { keywords: ['怎么回', '怎么回复', '给个回复', '回复建议', '怎么接', '怎么答', '发什么', '说点什么'], route: ROUTE_TYPES.REPLY, confidence: 0.85 },
  { keywords: ['帮我写', '帮我组织', '组织一下'], route: ROUTE_TYPES.REPLY, confidence: 0.75 },

  // 话术优化
  { keywords: ['优化', '改一下', '调整一下', '改善', '太生硬', '太土'], route: ROUTE_TYPES.OPTIMIZE_REPLY, confidence: 0.8 },

  // 全局概览
  { keywords: ['全局', '整体情况', '鱼塘', '所有女生', '客户池', '一览', '总结'], route: ROUTE_TYPES.OVERVIEW, confidence: 0.8 },

  // 情况咨询（默认）
  { keywords: ['怎么办', '怎么推进', '怎么拉伸', '进展', '情况', '感觉', '应该'], route: ROUTE_TYPES.SITUATION, confidence: 0.65 },
];

/**
 * 关键词路由（快速预判）
 */
function keywordRoute(input) {
  const q = input.toLowerCase();

  let best = { route: ROUTE_TYPES.SITUATION, confidence: 0.3 };

  for (const rule of KEYWORD_ROUTES) {
    for (const keyword of rule.keywords) {
      if (q.includes(keyword)) {
        if (rule.confidence > best.confidence) {
          best = { route: rule.route, confidence: rule.confidence, matched: keyword };
        }
        break;
      }
    }
  }

  return best;
}

/**
 * Coach Router 增强路由（利用已有的加权路由）
 */
function coachRoute(input, context) {
  // 利用现有的 routeQuestion 逻辑
  const result = routeQuestion(input, {
    clientProfile: context.clientProfile,
    girlProfile: context.girlProfile ? {
      tensionScore: context.girlProfile.tensionScore,
      intimacyLevel: context.girlProfile.intimacyLevel,
      stage: context.girlProfile.stage,
      recentSignals: context.recentSignals,
    } : null,
  });

  // coach route type -> agent route type 映射
  const typeMap = {
    '聊天卡壳': ROUTE_TYPES.SITUATION,
    '关系拉伸': ROUTE_TYPES.SITUATION,
    '长期关系': ROUTE_TYPES.SITUATION,
    '分手挽回': ROUTE_TYPES.SITUATION,
    '价值判断': ROUTE_TYPES.SITUATION,
    '性张力不足': ROUTE_TYPES.SITUATION,
    '心态问题': ROUTE_TYPES.SITUATION,
    '沟通问题': ROUTE_TYPES.SITUATION,
    '情绪调动': ROUTE_TYPES.SITUATION,
    '社交软件': ROUTE_TYPES.SITUATION,
    '通用': ROUTE_TYPES.SITUATION,
  };

  return {
    coachType: result.type,
    score: result.score,
    meta: result.meta,
    agentType: typeMap[result.type] || ROUTE_TYPES.SITUATION,
  };
}

/**
 * LLM 辅助路由（用于模糊场景）
 */
async function llmRoute(input, aiConfig) {
  try {
    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: TRIAGE_INSTRUCTIONS },
          { role: 'user', content: input }
        ],
        temperature: 0,
        max_tokens: 50
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || '').trim().toLowerCase();

    const routeMap = {
      'situation': ROUTE_TYPES.SITUATION,
      'chat_analysis': ROUTE_TYPES.CHAT_ANALYSIS,
      'reply': ROUTE_TYPES.REPLY,
      'optimize_reply': ROUTE_TYPES.OPTIMIZE_REPLY,
      'moment': ROUTE_TYPES.MOMENT,
      'overview': ROUTE_TYPES.OVERVIEW,
      'general': ROUTE_TYPES.GENERAL,
    };

    // 提取第一个匹配的类型
    for (const [key, value] of Object.entries(routeMap)) {
      if (content.includes(key)) {
        return { route: value, confidence: 0.95, method: 'llm' };
      }
    }

    return { route: ROUTE_TYPES.SITUATION, confidence: 0.6, method: 'llm', raw: content };
  } catch (err) {
    console.warn(`[TriageAgent] LLM 路由失败: ${err.message}`);
    return null;
  }
}

/**
 * Triage Agent 主函数：路由决策
 * @param {string} input - 用户输入
 * @param {UnifiedContext} context - 统一上下文
 * @param {Object} aiConfig - AI 配置
 * @returns {Promise<{ routeType: string, confidence: number, method: string, meta: Object }>}
 */
async function triage(input, context, aiConfig) {
  // Step 1: 关键词快速路由
  const kwResult = keywordRoute(input);

  // Step 2: Coach Router 加权路由（利用已有的多维度路由）
  const coachResult = coachRoute(input, context);

  // Step 3: 如果关键词置信度低（<0.7），使用 LLM 辅助
  let llmResult = null;
  if (kwResult.confidence < 0.7) {
    llmResult = await llmRoute(input, aiConfig);
  }

  // 综合决策：优先信任高置信度的结果
  let finalRoute;
  let finalConfidence;
  let finalMethod;

  if (llmResult && llmResult.confidence > kwResult.confidence) {
    finalRoute = llmResult.route;
    finalConfidence = llmResult.confidence;
    finalMethod = 'llm';
  } else if (kwResult.confidence >= coachResult.score / 10) {
    finalRoute = kwResult.route;
    finalConfidence = kwResult.confidence;
    finalMethod = 'keyword';
  } else {
    // Coach Router 有高置信度结果，优先采用
    finalRoute = coachResult.agentType;
    finalConfidence = coachResult.score / 10;
    finalMethod = 'coach';
  }

  // 特殊情况：没有 girlId 时，chat_analysis 和 reply 需要降级
  if (!context.girlId) {
    if ([ROUTE_TYPES.CHAT_ANALYSIS, ROUTE_TYPES.REPLY].includes(finalRoute)) {
      // 如果没有女生ID，这些功能受限，但仍然允许（使用传入的girlInfo参数）
      finalConfidence *= 0.8;
    }
  }

  const result = {
    routeType: finalRoute,
    confidence: finalConfidence,
    method: finalMethod,
    meta: {
      keywordMatch: kwResult.matched || null,
      coachType: coachResult.coachType,
      coachScore: coachResult.score,
      llmRaw: llmResult?.raw || null,
    },
  };

  context.setRouteType(finalRoute);
  context.logEvent('triage', result);

  return result;
}

/**
 * 获取路由类型的友好名称
 */
function getRouteTypeName(routeType) {
  const names = {
    [ROUTE_TYPES.SITUATION]: '情况咨询',
    [ROUTE_TYPES.CHAT_ANALYSIS]: '聊天分析',
    [ROUTE_TYPES.REPLY]: '回复建议',
    [ROUTE_TYPES.MOMENT]: '朋友圈分析',
    [ROUTE_TYPES.OVERVIEW]: '全局概览',
    [ROUTE_TYPES.OPTIMIZE_REPLY]: '话术优化',
    [ROUTE_TYPES.GENERAL]: '通用教练',
  };
  return names[routeType] || routeType;
}

module.exports = {
  triage,
  keywordRoute,
  coachRoute,
  llmRoute,
  getRouteTypeName,
  TRIAGE_INSTRUCTIONS,
  ROUTE_TYPES,
};

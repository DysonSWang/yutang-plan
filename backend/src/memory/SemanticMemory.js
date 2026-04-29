/**
 * SemanticMemory - 语义记忆层
 *
 * 存储相对稳定的知识：
 * - 女生画像摘要
 * - 客户偏好
 * - 学习要点
 *
 * 直接读写 Prisma，不走 memory service
 */

const prisma = require('../prisma');

/**
 * 获取女生的语义记忆（画像摘要）
 */
async function getGirlSemanticMemory(girlId) {
  const girl = await prisma.girl.findUnique({
    where: { id: girlId },
    select: {
      id: true,
      name: true,
      stage: true,
      tensionScore: true,
      intimacyLevel: true,
      personality: true,
      conversationSummary: true,
      relationshipStage: true,
      relationshipAttitude: true,
      bestApproach: true,
      recommendedTopics: true,
      upgradeConditions: true,
      riskFactors: true,
      strategicNotes: true,
      responsePattern: true,
      signals: true,
      pendingActions: true,
      observations: true,
    }
  });

  if (!girl) return null;

  let personality = {};
  try { personality = girl.personality ? JSON.parse(girl.personality) : {}; } catch (e) { console.warn('[SemanticMemory] personality parse failed:', e.message); personality = {}; }

  let signals = [];
  try { const parsed = girl.signals ? JSON.parse(girl.signals) : null; signals = Array.isArray(parsed) ? parsed : []; } catch (e) { console.warn('[SemanticMemory] signals parse failed:', e.message); signals = []; }

  let pendingActions = [];
  try { const parsed = girl.pendingActions ? JSON.parse(girl.pendingActions) : null; pendingActions = Array.isArray(parsed) ? parsed : []; } catch (e) { console.warn('[SemanticMemory] pendingActions parse failed:', e.message); pendingActions = []; }

  let observations = [];
  try { const parsed = girl.observations ? JSON.parse(girl.observations) : null; observations = Array.isArray(parsed) ? parsed : []; } catch (e) { console.warn('[SemanticMemory] observations parse failed:', e.message); observations = []; }

  return {
    girlId: girl.id,
    name: girl.name,
    stage: girl.stage,
    tensionScore: girl.tensionScore,
    intimacyLevel: girl.intimacyLevel,
    personality,
    conversationSummary: girl.conversationSummary,
    relationshipStage: girl.relationshipStage,
    // 战略信息
    relationshipAttitude: girl.relationshipAttitude,
    bestApproach: girl.bestApproach,
    recommendedTopics: girl.recommendedTopics,
    upgradeConditions: girl.upgradeConditions,
    riskFactors: girl.riskFactors,
    strategicNotes: girl.strategicNotes,
    responsePattern: girl.responsePattern,
    // 动态信息
    signals,
    pendingActions,
    observations,
    // 汇总
    summary: buildSemanticSummary(girl, personality, signals),
  };
}

/**
 * 构建语义记忆摘要
 */
function buildSemanticSummary(girl, personality, signals) {
  const stageMap = { EXPLORATION: '探索期', FLIRTING: '暧昧期', ADVANCEMENT: '推进期', CONFIRMATION: '确认期', STABLE: '稳定期' };

  const parts = [];
  if (girl.name) parts.push(`${girl.name}`);
  if (girl.relationshipStage) parts.push(stageMap[girl.relationshipStage] || girl.relationshipStage);
  if (girl.tensionScore) parts.push(`热度${girl.tensionScore}/10`);
  if (girl.intimacyLevel) parts.push(`亲密度${girl.intimacyLevel}`);

  if (personality.communicationStyle) parts.push(`${personality.communicationStyle}风格`);
  if (personality.mbti) parts.push(`MBTI${personality.mbti}`);

  const positive = signals.filter(s => s.type === 'positive').length;
  const negative = signals.filter(s => s.type === 'negative').length;
  if (positive > 0 || negative > 0) {
    parts.push(`信号: +${positive}/-${negative}`);
  }

  return parts.join(' | ');
}

/**
 * 获取客户的语义记忆
 */
async function getClientSemanticMemory(clientId) {
  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      emotionalMaturity: true,
      emotionalMaturityLevel: true,
      antiFrustrationLevel: true,
      pacePreference: true,
      clientType: true,
      coachCooperation: true,
      coachCooperationLevel: true,
      emotionalStable: true,
      eqLevel: true,
      learningAbility: true,
      attachmentStyle: true,
      loveStyle: true,
      loveLanguage1: true,
      loveLanguage2: true,
      loveLanguage3: true,
      clientBestApproach: true,
      clientRiskFactors: true,
      clientRecommendedTopics: true,
      clientStrategicNotes: true,
      familyBackground: true,
      familyStructure: true,
      familyAtmosphere: true,
      familyBurden: true,
      relationshipAttitude: true,
    }
  });

  if (!client) return null;

  return {
    clientId: client.id,
    // 情绪维度
    emotionalMaturity: client.emotionalMaturity,
    emotionalMaturityLevel: client.emotionalMaturityLevel,
    antiFrustrationLevel: client.antiFrustrationLevel,
    emotionalStable: client.emotionalStable,
    eqLevel: client.eqLevel,
    // 风格偏好
    pacePreference: client.pacePreference,
    clientType: client.clientType,
    // 学习相关
    learningAbility: client.learningAbility,
    coachCooperation: client.coachCooperation,
    coachCooperationLevel: client.coachCooperationLevel,
    // 战略信息
    attachmentStyle: client.attachmentStyle,
    loveStyle: client.loveStyle,
    loveLanguages: [client.loveLanguage1, client.loveLanguage2, client.loveLanguage3].filter(Boolean),
    clientBestApproach: client.clientBestApproach,
    clientRiskFactors: client.clientRiskFactors,
    clientRecommendedTopics: client.clientRecommendedTopics,
    clientStrategicNotes: client.clientStrategicNotes,
    // 家庭背景
    familyBackground: client.familyBackground,
    familyStructure: client.familyStructure,
    familyAtmosphere: client.familyAtmosphere,
    familyBurden: client.familyBurden,
    // 关系态度
    relationshipAttitude: client.relationshipAttitude,
    // 汇总
    summary: buildClientSummary(client),
  };
}

/**
 * 构建客户语义记忆摘要
 */
function buildClientSummary(client) {
  const parts = [];

  if (client.emotionalMaturityLevel || client.emotionalMaturity) {
    const lvl = client.emotionalMaturityLevel || (client.emotionalMaturity === '成熟' ? '高' : client.emotionalMaturity === '幼稚' ? '低' : '中');
    parts.push(`情绪成熟度:${lvl}`);
  }

  if (client.pacePreference) parts.push(`${client.pacePreference}`);
  if (client.clientType) parts.push(`${client.clientType}型`);

  const antiFrus = client.antiFrustrationLevel;
  if (antiFrus) parts.push(`抗挫:${antiFrus}/10`);

  if (client.loveStyle) parts.push(`${client.loveStyle}风格`);

  return parts.join(' | ') || '未设置客户画像';
}

/**
 * 更新女生的语义记忆（画像字段）
 */
async function updateGirlSemanticMemory(girlId, updates) {
  const allowedFields = [
    'conversationSummary', 'relationshipAttitude', 'bestApproach',
    'recommendedTopics', 'upgradeConditions', 'riskFactors',
    'strategicNotes', 'responsePattern',
  ];

  const data = {};
  if (!updates || typeof updates !== 'object') return null;
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      data[key] = typeof value === 'object' ? JSON.stringify(value) : value;
    }
  }

  if (Object.keys(data).length === 0) return null;

  return prisma.girl.update({ where: { id: girlId }, data });
}

/**
 * 批量获取多个女生的语义记忆
 */
async function batchGetGirlMemory(girlIds) {
  const girls = await prisma.girl.findMany({
    where: { id: { in: girlIds } },
    select: {
      id: true,
      name: true,
      stage: true,
      tensionScore: true,
      intimacyLevel: true,
      relationshipStage: true,
      lastContact: true,
      updatedAt: true,
      conversationSummary: true,
      signals: true,
      pendingActions: true,
      personality: true,
    }
  });

  return girls.map(g => {
    let signals = [], pendingActions = [], personality = {};
    try { signals = g.signals ? JSON.parse(g.signals) : []; } catch (e) { console.warn('[SemanticMemory] signals parse failed:', e.message); signals = []; }
    try { pendingActions = g.pendingActions ? JSON.parse(g.pendingActions) : []; } catch (e) { console.warn('[SemanticMemory] pendingActions parse failed:', e.message); pendingActions = []; }
    try { personality = g.personality ? JSON.parse(g.personality) : {}; } catch (e) { console.warn('[SemanticMemory] personality parse failed:', e.message); personality = {}; }

    return {
      ...g,
      signals,
      pendingActions,
      personality,
      summary: buildSemanticSummary(g, personality, signals),
    };
  });
}

module.exports = {
  getGirlSemanticMemory,
  getClientSemanticMemory,
  updateGirlSemanticMemory,
  batchGetGirlMemory,
  buildSemanticSummary,
  buildClientSummary,
};
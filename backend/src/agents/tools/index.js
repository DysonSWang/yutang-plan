/**
 * Agent Tools - 各专业 Agent 共享的工具函数
 *
 * 提供：
 * - getGirlContext: 获取女生上下文
 * - getConversationHistory: 获取对话历史
 * - getProfile: 获取用户档案
 */

/**
 * 获取女生上下文（用于各 Agent）
 * @param {string} girlId - 女生ID
 * @param {Object} opts - 可选参数
 */
async function getGirlContext(girlId, opts = {}) {
  const prisma = require('../../prisma');
  const { getConversationHistory } = require('../../services/memory');

  if (!girlId) return null;

  const girl = await prisma.girl.findUnique({
    where: { id: girlId },
    include: {
      signals: false,
    }
  });

  if (!girl) return null;

  let personality = {};
  try { personality = girl.personality ? JSON.parse(girl.personality) : {}; } catch (e) {}

  // 解析 signals（近期30天）
  let recentSignals = [];
  if (girl.signals) {
    try {
      const allSignals = JSON.parse(girl.signals);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      recentSignals = allSignals.filter(s => new Date(s.date) >= thirtyDaysAgo);
    } catch (e) {}
  }

  // 解析 pendingActions
  let pendingActions = [];
  if (girl.pendingActions) {
    try { pendingActions = JSON.parse(girl.pendingActions); } catch (e) {}
  }

  // 解析 observations
  let observations = [];
  if (girl.observations) {
    try { observations = JSON.parse(girl.observations); } catch (e) {}
  }

  // 关系阶段标签
  const STAGE_LABELS = {
    EXPLORATION: '探索期',
    FLIRTING: '暧昧期',
    ADVANCEMENT: '推进期',
    CONFIRMATION: '确认期',
    STABLE: '稳定期',
  };

  return {
    id: girl.id,
    name: girl.name,
    stage: girl.stage,
    sourcePlatform: girl.sourcePlatform,
    intimacyLevel: girl.intimacyLevel,
    tensionScore: girl.tensionScore || 5,
    age: girl.age,
    occupation: girl.occupation,
    personality,
    notes: girl.notes,
    relationshipStage: girl.relationshipStage,
    relationshipStageLabel: STAGE_LABELS[girl.relationshipStage] || girl.relationshipStage,
    recentSignals,
    pendingActions,
    observations,
    conversationSummary: girl.conversationSummary,
    lastContact: girl.lastContact,
    updatedAt: girl.updatedAt,
    // 战略字段
    relationshipAttitude: girl.relationshipAttitude,
    bestApproach: girl.bestApproach,
    recommendedTopics: girl.recommendedTopics,
    upgradeConditions: girl.upgradeConditions,
    riskFactors: girl.riskFactors,
    strategicNotes: girl.strategicNotes,
    responsePattern: girl.responsePattern,
  };
}

/**
 * 获取对话历史（用于各 Agent）
 * @param {string} memorySessionId - 记忆会话ID
 * @param {number} limit - 最大消息数（默认50）
 */
async function getChatHistory(memorySessionId, limit = 50) {
  const { getConversationHistory } = require('../../services/memory');
  const history = await getConversationHistory(memorySessionId);
  return history.slice(-limit);
}

/**
 * 获取客户档案（用于各 Agent）
 * @param {string} clientId - 客户ID
 */
async function getClientProfile(clientId) {
  const prisma = require('../../prisma');

  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: {
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
      loveLanguage4: true,
      loveLanguage5: true,
      clientBestApproach: true,
      clientRiskFactors: true,
      clientRecommendedTopics: true,
      clientStrategicNotes: true,
      familyBackground: true,
      familyStructure: true,
      familyAtmosphere: true,
      familyBurden: true,
      relationshipAttitude: true,
      serviceStage: true,
    }
  });

  return client;
}

/**
 * 获取所有女生汇总（用于 Overview Agent）
 * @param {string} operatorId - 操盘手ID
 */
async function getAllGirlsSummary(operatorId) {
  const prisma = require('../../prisma');

  const girls = await prisma.girl.findMany({
    where: { clientId: operatorId },
    select: {
      id: true,
      name: true,
      stage: true,
      tensionScore: true,
      intimacyLevel: true,
      lastContact: true,
      relationshipStage: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' }
  });

  return girls;
}

module.exports = {
  getGirlContext,
  getChatHistory,
  getClientProfile,
  getAllGirlsSummary,
};
/**
 * 上下文构建服务 - 构建AI教练的上下文Prompt
 * 参考 Claude compact.rs 机制，支持信息分层和按需召回
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * 构建AI教练的上下文Prompt
 * @param {string} clientId - 客户ID
 * @param {string} girlId - 女生ID（可选）
 * @param {string} userMessage - 用户当前问题
 */
async function buildAICoachContext(clientId, girlId, userMessage) {
  // 1. 获取客户信息
  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      nickname: true,
      serviceStage: true,
      familyBackground: true,
      familyStructure: true,
      familyAtmosphere: true,
      familyBurden: true,
      relationshipAttitude: true
    }
  });

  // 2. 获取女生信息（如果指定）
  let girlInfo = null;
  let recentSignals = [];
  let pendingActions = [];
  let observations = [];
  let conversationSummary = '';

  if (girlId) {
    const girl = await prisma.girl.findUnique({
      where: { id: girlId }
    });

    // 安全验证：客户只能访问自己的女生
    if (girl && girl.clientId !== clientId) {
      return {
        girlInfo: null,
        recentSignals: [],
        pendingActions: [],
        observations: [],
        conversationSummary: '',
        client: null
      };
    }

    if (girl) {
      girlInfo = {
        id: girl.id,
        name: girl.name,
        stage: girl.stage,
        sourcePlatform: girl.sourcePlatform,
        intimacyLevel: girl.intimacyLevel,
        tensionScore: girl.tensionScore || 5.0,
        age: girl.age,
        occupation: girl.occupation,
        personality: (() => {
          if (!girl.personality) return {};
          try { return JSON.parse(girl.personality); }
          catch { return { raw: girl.personality }; }
        })(),
        notes: girl.notes,
        updatedAt: girl.updatedAt
      };

      // 解析 signals（保留最近30天的）
      if (girl.signals) {
        try {
          const allSignals = JSON.parse(girl.signals);
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          recentSignals = allSignals.filter(s => new Date(s.date) >= thirtyDaysAgo);
        } catch (e) {
          recentSignals = [];
        }
      }

      // 解析 pendingActions
      if (girl.pendingActions) {
        try {
          pendingActions = JSON.parse(girl.pendingActions);
        } catch (e) {
          pendingActions = [];
        }
      }

      // 解析 observations
      if (girl.observations) {
        try {
          observations = JSON.parse(girl.observations);
        } catch (e) {
          observations = [];
        }
      }

      conversationSummary = girl.conversationSummary || '';
    }
  }

  // 3. 获取客户经验（按场景召回 - 暂时取所有，后期可优化为语义搜索）
  const learnings = await prisma.clientLearning.findMany({
    where: {
      clientId,
      OR: [{ girlId: null }, { girlId: girlId || undefined }]
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  // 4. 组装上下文
  return {
    client,
    girlInfo,
    recentSignals,
    pendingActions,
    observations,
    conversationSummary,
    learnings,
    // 原始数据引用（AI可按需查询）
    rawData: {
      signals: recentSignals,
      pendingActions,
      observations
    }
  };
}

/**
 * 构建女生档案摘要（约300字）
 * @param {object} girlInfo - 女生信息
 * @param {array} recentSignals - 近期信号
 * @param {string} conversationSummary - 对话摘要
 */
function buildGirlProfileSummary(girlInfo, recentSignals) {
  if (!girlInfo) return '未选择特定女生';

  const signalsText = recentSignals.length > 0
    ? recentSignals.map(s => {
        const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
        const flag = s.type === 'negative' ? ' ⚠️' : '';
        return `${icon} ${s.event} — ${s.date}${flag}`;
      }).join('\n')
    : '暂无近期信号';

  return `## ${girlInfo.name} | ${girlInfo.stage || '未知阶段'} | ${girlInfo.updatedAt ? new Date(girlInfo.updatedAt).toLocaleDateString() : '未知'}

### 关系热度
${girlInfo.tensionScore}/10 ${getTensionEmoji(girlInfo.tensionScore)}

### 关键信号（近30天）
${signalsText}

### 当前进度
- 亲密度：${'❤️'.repeat(girlInfo.intimacyLevel || 1)}
- 平台：${girlInfo.sourcePlatform || '未知'}
${girlInfo.notes ? `- 备注：${girlInfo.notes}` : ''}`;
}

/**
 * 构建客户画像摘要
 */
function buildClientProfileSummary(client) {
  if (!client) return '客户信息未知';

  return `### 客户画像
家庭背景：${client.familyBackground || '未知'}
家庭结构：${client.familyStructure || '未知'}
婚姻态度：${client.relationshipAttitude || '未知'}
服务阶段：${client.serviceStage || '未知'}`;
}

/**
 * 获取热度emoji
 */
function getTensionEmoji(score) {
  if (score >= 8) return '🔥🔥🔥';
  if (score >= 7) return '🔥🔥';
  if (score >= 5) return '🔥';
  if (score >= 3) return '❄️';
  return '❄️❄️';
}

/**
 * 获取上下文摘要（用于快速注入）
 */
async function getContextSummary(clientId, girlId) {
  const context = await buildAICoachContext(clientId, girlId);

  return {
    girlProfile: buildGirlProfileSummary(context.girlInfo, context.recentSignals),
    clientProfile: buildClientProfileSummary(context.client),
    recentSignals: context.recentSignals,
    pendingActions: context.pendingActions,
    pendingActionsText: context.pendingActions.length > 0
      ? context.pendingActions.map(a => `- ${a}`).join('\n')
      : '暂无待推进事项',
    observations: context.observations,
    learnings: context.learnings,
    conversationSummary: context.conversationSummary
  };
}

module.exports = {
  buildAICoachContext,
  getContextSummary,
  buildGirlProfileSummary,
  buildClientProfileSummary
};

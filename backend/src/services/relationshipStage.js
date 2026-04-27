/**
 * 关系阶段评估服务 (M007 S01 T02)
 *
 * 职责：
 * - evaluateRelationshipStage: AI 分析聊天记录+信号+约会历史，推荐当前关系阶段
 * - setRelationshipStage: 手动设置阶段，记录历史
 * - getStageHistory: 获取阶段变更历史
 */

const prisma = require('../prisma');
const { getAIConfig } = require('../config');

// 有效阶段值（应用层枚举）
const VALID_STAGES = ['EXPLORATION', 'FLIRTING', 'ADVANCEMENT', 'CONFIRMATION', 'STABLE'];

const STAGE_LABELS = {
  EXPLORATION: '探索期',
  FLIRTING: '暧昧期',
  ADVANCEMENT: '推进期',
  CONFIRMATION: '确认期',
  STABLE: '稳定期'
};

const STAGE_ORDER = {
  EXPLORATION: 1,
  FLIRTING: 2,
  ADVANCEMENT: 3,
  CONFIRMATION: 4,
  STABLE: 5
};

// ============================================================================
// 上下文构建
// ============================================================================

/**
 * 构建阶段评估所需的上下文
 */
async function buildStageContext(girlId) {
  const girl = await prisma.girl.findUnique({
    where: { id: girlId },
    include: {
      chatLogs: {
        orderBy: { createdAt: 'desc' },
        take: 20
      },
      dates: {
        orderBy: { dateTime: 'desc' },
        take: 10
      },
      events: {
        orderBy: { eventTime: 'desc' },
        take: 20
      }
    }
  });

  if (!girl) return null;

  // 解析 signals
  let recentSignals = [];
  if (girl.signals) {
    try {
      const allSignals = JSON.parse(girl.signals);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      recentSignals = allSignals
        .filter(s => new Date(s.date) >= thirtyDaysAgo)
        .slice(0, 15);
    } catch (e) {
      recentSignals = [];
    }
  }

  // 最近聊天记录摘要
  const chatSummary = girl.chatLogs
    .slice(0, 10)
    .map(log => {
      const prefix = log.type === 'sent' ? '[我]' : '[她]';
      return `${prefix} ${log.content?.slice(0, 100) || ''}`;
    })
    .join('\n');

  // 约会摘要
  const dateSummary = girl.dates
    .filter(d => d.status === 'completed')
    .map(d => `${d.title || '约会'} (${new Date(d.dateTime).toLocaleDateString()}) - 评价:${d.rating || '未评价'}`)
    .join('\n');

  // 事件摘要（只看 AI 行动项和手动添加的重要事件）
  const eventSummary = girl.events
    .filter(e => e.type === 'action' || e.type === 'manual')
    .slice(0, 10)
    .map(e => `[${e.status}] ${e.title} (${new Date(e.eventTime).toLocaleDateString()})`)
    .join('\n');

  // 计算最近活跃时间
  const lastContact = girl.lastContact
    ? `${Math.round((Date.now() - new Date(girl.lastContact).getTime()) / (1000 * 60 * 60))} 小时前`
    : '未知';

  return {
    girl: {
      id: girl.id,
      name: girl.name,
      age: girl.age,
      occupation: girl.occupation,
      stage: girl.stage, // 旧 stage 字段（参考用）
      relationshipStage: girl.relationshipStage,
      tensionScore: girl.tensionScore,
      intimacyLevel: girl.intimacyLevel,
      lastContact: girl.lastContact ? new Date(girl.lastContact).toLocaleString() : null,
      responsePattern: girl.responsePattern,
      signals: recentSignals,
      positiveSignalsCount: recentSignals.filter(s => s.type === 'positive').length,
      negativeSignalsCount: recentSignals.filter(s => s.type === 'negative').length
    },
    chatSummary,
    dateSummary: dateSummary || '暂无约会记录',
    eventSummary: eventSummary || '暂无事件记录',
    stats: {
      chatLogCount: girl.chatLogs.length,
      completedDateCount: girl.dates.filter(d => d.status === 'completed').length,
      signalCount: recentSignals.length,
      lastContactHoursAgo: lastContact
    }
  };
}

// ============================================================================
// AI 调用
// ============================================================================

/**
 * 调用通义千问进行阶段评估
 */
async function callStageAI(systemPrompt, userPrompt) {
  const aiConfig = getAIConfig();
  if (!aiConfig) {
    throw new Error('AI 配置不可用，请检查 DASH_SCOPE_API_KEY 或 ZHIPUAI_API_KEY');
  }

  const response = await fetch(aiConfig.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${aiConfig.key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: aiConfig.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3, // 低温度确保评估稳定性
      max_tokens: 600
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI 评估失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ============================================================================
// 阶段评估
// ============================================================================

/**
 * AI 评估当前关系阶段（返回推荐阶段，不自动写入）
 * @param {string} girlId
 * @param {string} operatorId - 操盘手ID（用于记录）
 * @returns {Object} { recommendedStage, confidence, reasoning, warnings }
 */
async function evaluateRelationshipStage(girlId, operatorId) {
  const ctx = await buildStageContext(girlId);
  if (!ctx) {
    throw new Error('女生不存在');
  }

  const systemPrompt = `你是一位专业的情感关系分析师，擅长根据双方的互动记录判断当前关系阶段。

请根据以下信息，判断女生当前处于哪个关系阶段：

**5阶段定义：**
- EXPLORATION（探索期）：从认识到建立基础连接。特征：刚认识不久，聊天频率低，内容以日常寒暄为主，没有深入的情感交流，双方都在试探对方。
- FLIRTING（暧昧期）：有明显兴趣信号，但未正式确认关系。特征：聊天频率较高，有调情互动，互相关心，约会中有亲密举动（如牵手），但双方没有明确表白。
- ADVANCEMENT（推进期）：主动升级关系，有明确的追求动作。特征：经常约会，经常主动找对方聊天，愿意为对方付出时间和资源，聊天中出现明确的感情话题或暗示。
- CONFIRMATION（确认期）：双方有意愿，需要正式表白或确认。特征：双方已经聊到感情话题，约会中有多次亲密举动（如接吻），一方已准备好表白或有明确的表白意愿。
- STABLE（稳定期）：关系确立，进入长期维护。特征：双方已确认恋爱关系，进入日常相处模式，关注点是相处质量和未来规划。

**输出要求：**
请严格按以下 JSON 格式输出（不要包含任何其他内容）：
{
  "recommendedStage": "阶段枚举值",
  "confidence": 0-100的置信度数字,
  "reasoning": "判断依据，2-3句话说明为什么是这个阶段",
  "warnings": ["如果当前阶段判断有不确定因素，列出警告"],
  "keyIndicators": ["判断的关键指标，2-3个"]
}`;

  const userPrompt = `**女生信息：**
- 姓名：${ctx.girl.name}
- 年龄：${ctx.girl.age || '未知'}
- 职业：${ctx.girl.occupation || '未知'}
- 热度评分：${ctx.girl.tensionScore || 5}/10
- 亲密度：${'❤️'.repeat(ctx.girl.intimacyLevel || 1)}
- 最后联系：${ctx.stats.lastContactHoursAgo}
- 回复规律：${ctx.girl.responsePattern || '未知'}
- 正向信号数（近30天）：${ctx.stats.positiveSignalsCount}
- 负向信号数（近30天）：${ctx.stats.negativeSignalsCount}
- 聊天记录数：${ctx.stats.chatLogCount}
- 已完成约会数：${ctx.stats.completedDateCount}

**近期关键信号（近30天）：**
${ctx.girl.signals.length > 0
  ? ctx.girl.signals.map(s => `- [${s.type}] ${s.event} (${s.date})`).join('\n')
  : '暂无记录'}

**最近聊天摘要：**
${ctx.chatSummary || '暂无聊天记录'}

**约会历史：**
${ctx.dateSummary}

**重要事件：**
${ctx.eventSummary}

**请分析以上信息，判断当前关系阶段并输出 JSON。**`;

  const rawResponse = await callStageAI(systemPrompt, userPrompt);

  // 解析 AI 响应
  let result;
  try {
    // 尝试提取 JSON
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('无法解析 AI 响应');
    }
  } catch (e) {
    console.warn('[RelationshipStage] AI 响应解析失败:', rawResponse);
    throw new Error('AI 评估结果解析失败');
  }

  // 校验阶段值
  if (!VALID_STAGES.includes(result.recommendedStage)) {
    throw new Error(`AI 返回了无效阶段值: ${result.recommendedStage}`);
  }

  return {
    recommendedStage: result.recommendedStage,
    stageLabel: STAGE_LABELS[result.recommendedStage],
    confidence: result.confidence,
    reasoning: result.reasoning,
    warnings: result.warnings || [],
    keyIndicators: result.keyIndicators || [],
    currentStage: ctx.girl.relationshipStage,
    currentStageLabel: ctx.girl.relationshipStage ? STAGE_LABELS[ctx.girl.relationshipStage] : null
  };
}

// ============================================================================
// 阶段设置
// ============================================================================

/**
 * 设置女生关系阶段（写入 DB + 记录历史）
 * @param {string} girlId
 * @param {string} stage - 阶段枚举值
 * @param {string} reason - 设置原因
 * @param {string} operatorId - 操盘手ID
 * @param {string} source - 来源：'manual' | 'ai_evaluate'
 * @returns {Object} 更新后的 girl 记录
 */
async function setRelationshipStage(girlId, stage, reason, operatorId, source = 'manual') {
  if (!VALID_STAGES.includes(stage)) {
    throw new Error(`无效阶段值: ${stage}。有效值: ${VALID_STAGES.join(', ')}`);
  }

  // 获取当前阶段
  const girl = await prisma.girl.findUnique({ where: { id: girlId } });
  if (!girl) {
    throw new Error('女生不存在');
  }

  const fromStage = girl.relationshipStage;
  const now = new Date();

  // 写入阶段 + 时间戳（在事务中）
  const updated = await prisma.$transaction(async (tx) => {
    // 更新女生阶段
    const updatedGirl = await tx.girl.update({
      where: { id: girlId },
      data: {
        relationshipStage: stage,
        relationshipStageUpdatedAt: now
      }
    });

    // 记录历史
    await tx.relationshipStageHistory.create({
      data: {
        girlId,
        fromStage,
        toStage: stage,
        reason: reason || null,
        source,
        changedBy: operatorId
      }
    });

    return updatedGirl;
  });

  return {
    girl: updated,
    fromStage,
    fromStageLabel: fromStage ? STAGE_LABELS[fromStage] : null,
    toStage: stage,
    toStageLabel: STAGE_LABELS[stage]
  };
}

// ============================================================================
// 历史查询
// ============================================================================

/**
 * 获取女生关系阶段变更历史
 * @param {string} girlId
 * @returns {Array} 历史记录列表
 */
async function getStageHistory(girlId) {
  const history = await prisma.relationshipStageHistory.findMany({
    where: { girlId },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  return history.map(h => ({
    id: h.id,
    fromStage: h.fromStage,
    fromStageLabel: h.fromStage ? STAGE_LABELS[h.fromStage] : null,
    toStage: h.toStage,
    toStageLabel: STAGE_LABELS[h.toStage],
    reason: h.reason,
    source: h.source,
    changedBy: h.changedBy,
    createdAt: h.createdAt
  }));
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  VALID_STAGES,
  STAGE_LABELS,
  STAGE_ORDER,
  evaluateRelationshipStage,
  setRelationshipStage,
  getStageHistory,
  buildStageContext
};

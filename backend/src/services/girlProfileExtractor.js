/**
 * Layer 2: 女生档案提取器
 *
 * 职责：
 * - 接收 girlId + 内容，调用 profileEngine 分析
 * - 将分析结果写入 PendingProfileUpdate 表（待确认）
 * - 提供 confirmProfileUpdate() 确认后应用到女生档案
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
  analyzeGirlText,
  analyzeGirlImage,
  analyzeGirlChat,
  extractGirlPendingFields
} = require('./profileEngine');

/**
 * 构建女生档案上下文（用于 AI prompt）
 */
async function buildGirlContext(girlId) {
  const girl = await prisma.girl.findUnique({ where: { id: girlId } });
  if (!girl) return null;

  // 解析 signals（保留最近30天）
  let recentSignals = [];
  if (girl.signals) {
    try {
      const allSignals = JSON.parse(girl.signals);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      recentSignals = allSignals.filter(s => {
        try { return new Date(s.date) >= thirtyDaysAgo; } catch { return true; }
      });
    } catch { recentSignals = []; }
  }

  // 解析 pendingActions
  let pendingActions = [];
  if (girl.pendingActions) {
    try { pendingActions = JSON.parse(girl.pendingActions); } catch {}
  }

  // 解析 observations
  let observations = [];
  if (girl.observations) {
    try { observations = JSON.parse(girl.observations); } catch {}
  }

  // 解析 personality
  let personality = {};
  if (girl.personality) {
    try { personality = JSON.parse(girl.personality); } catch { personality = {}; }
  }

  return {
    girl,
    profile: {
      id: girl.id,
      name: girl.name,
      age: girl.age,
      occupation: girl.occupation,
      education: girl.education,
      major: girl.major,
      hometown: girl.hometown,
      residence: girl.residence,
      workplace: girl.workplace,
      stage: girl.stage,
      tensionScore: girl.tensionScore,
      intimacyLevel: girl.intimacyLevel,
      // 顶层字段：直接从 girl 对象取（不在 personality JSON 里）
      appearance: girl.appearance,
      dressingStyle: girl.dressingStyle,
      dietPreferences: girl.dietPreferences,
      dietRestrictions: girl.dietRestrictions,
      personality,
      recentSignals,
      pendingActions,
      observations,
      conversationSummary: girl.conversationSummary || ''
    }
  };
}

/**
 * 记录待确认档案更新到数据库
 */
async function savePendingUpdate(girlId, source, profileContext, analysisData, operatorId, adoptedReply = null, replyStyle = null) {
  const pending = await prisma.pendingProfileUpdate.create({
    data: {
      targetType: 'girl',
      targetId: girlId,
      source,
      operatorId,
      profileContext: JSON.stringify({
        name: profileContext.name,
        stage: profileContext.stage,
        tensionScore: profileContext.tensionScore
      }),
      analysisData: JSON.stringify(analysisData),
      adoptedReply,
      replyStyle,
      status: 'pending'
    }
  });
  return pending;
}

// ============================================================================
// 入口函数
// ============================================================================

/**
 * 从备注提取信号和档案字段（返回待确认，不自动入库）
 */
async function extractFromNotes(girlId, operatorId, notes) {
  const ctx = await buildGirlContext(girlId);
  if (!ctx) return null;

  const analysis = await analyzeGirlText(ctx.profile, notes);
  if (!analysis) return null;

  // 保存到待确认队列
  const pending = await savePendingUpdate(girlId, 'notes', ctx.profile, analysis, operatorId);

  // 提取待确认字段（仅空字段）
  const pendingFields = extractGirlPendingFields(analysis.profileUpdates, ctx.girl);

  return {
    pendingId: pending.id,
    analysis,
    pendingFields,
    profileContext: ctx.profile
  };
}

/**
 * 从聊天记录提取信号和档案字段（返回待确认，不自动入库）
 */
async function extractFromChat(girlId, operatorId, message, chatContext) {
  const ctx = await buildGirlContext(girlId);
  if (!ctx) return null;

  const analysis = await analyzeGirlChat(ctx.profile, {
    message,
    ...chatContext
  });

  if (!analysis) return null;

  const pending = await savePendingUpdate(girlId, 'chat_analyze', ctx.profile, analysis, operatorId);
  const pendingFields = extractGirlPendingFields(analysis.profileUpdates, ctx.girl);

  return {
    pendingId: pending.id,
    analysis,
    pendingFields,
    profileContext: ctx.profile
  };
}

/**
 * 从图片提取信号和档案字段（返回待确认，不自动入库）
 */
async function extractFromImage(girlId, imageUrl, baseUrl, operatorId) {
  const ctx = await buildGirlContext(girlId);
  if (!ctx) return null;

  let fullImageUrl = imageUrl;
  if (imageUrl?.startsWith('/')) {
    fullImageUrl = (baseUrl || 'http://localhost:3005') + imageUrl;
  }

  const analysis = await analyzeGirlImage(ctx.profile, fullImageUrl);
  if (!analysis) return null;

  // 保存到待确认队列
  const pending = await savePendingUpdate(girlId, 'screenshot', ctx.profile, analysis, operatorId);

  // 提取待确认字段
  const pendingFields = extractGirlPendingFields(analysis.profileUpdates, ctx.girl);

  // 生成摘要文本
  const aiNotes = '[AI图像分析] ' + ctx.profile.name + '\n' +
    '聊天摘要：' + (analysis.chatSummary || '无') + '\n' +
    '女生情绪：' + (analysis.girlEmotion || '未知') + '\n' +
    '关系阶段：' + (ctx.profile.stage || '未知') + ' -> ' + (analysis.nextStage || ctx.profile.stage) + '\n' +
    '热度变化：' + (ctx.profile.tensionScore || 5) + ' -> ' + ((ctx.profile.tensionScore || 5) + (analysis.tensionAdjustment || 0)) + '\n' +
    '信号提取：' + ((analysis.newSignals || []).map(s => s.event).join('; ') || '无') + '\n' +
    '待推进：' + ((analysis.pendingActions || []).join('; ') || '无');

  return {
    pendingId: pending.id,
    analysis,
    pendingFields,
    chatText: analysis.chatText || '',
    aiNotes
  };
}

// ============================================================================
// 确认应用
// ============================================================================

/**
 * 确认并应用档案更新（仅应用选中的字段）
 */
async function confirmProfileUpdate(girlId, pendingId, selectedFields) {
  const pending = await prisma.pendingProfileUpdate.findFirst({
    where: { id: pendingId, targetType: 'girl', targetId: girlId, status: 'pending' }
  });

  if (!pending) return { success: false, reason: '未找到待确认更新' };

  const analysis = JSON.parse(pending.analysisData);
  const girl = await prisma.girl.findUnique({ where: { id: girlId } });
  if (!girl) return { success: false, reason: '女生不存在' };

  // 解析现有 signals
  let existingSignals = [];
  if (girl.signals) {
    try { existingSignals = JSON.parse(girl.signals); } catch {}
  }

  // 构建更新数据
  const updateData = {};

  // 1. 合并新信号
  let allSignals = [...existingSignals];
  if (analysis.newSignals?.length > 0) {
    const newSignals = analysis.newSignals.map(s => ({
      ...s,
      date: s.date || new Date().toLocaleDateString('zh-CN')
    }));
    allSignals = [...allSignals, ...newSignals];
  }

  // 保留最近30天
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  allSignals = allSignals.filter(s => {
    try { return new Date(s.date) >= thirtyDaysAgo; } catch { return true; }
  });
  updateData.signals = JSON.stringify(allSignals);

  // 2. 合并待推进事项
  let pendingActions = [];
  if (girl.pendingActions) {
    try { pendingActions = JSON.parse(girl.pendingActions); } catch {}
  }
  if (analysis.pendingActions?.length > 0) {
    analysis.pendingActions.forEach(action => {
      if (!pendingActions.includes(action)) pendingActions.push(action);
    });
  }
  updateData.pendingActions = JSON.stringify(pendingActions);

  // 3. 合并观察点
  let observations = [];
  if (girl.observations) {
    try { observations = JSON.parse(girl.observations); } catch {}
  }
  if (analysis.observations?.length > 0) {
    analysis.observations.forEach(obs => {
      if (!observations.includes(obs)) observations.push(obs);
    });
  }
  updateData.observations = JSON.stringify(observations);

  // 4. 更新热度
  let tensionScore = girl.tensionScore || 5.0;
  if (analysis.tensionAdjustment) {
    tensionScore = Math.max(1.0, Math.min(10.0, tensionScore + analysis.tensionAdjustment));
  }
  updateData.tensionScore = tensionScore;

  // 5. 判断阶段变化
  if (analysis.stageChange === '升级' && analysis.nextStage) {
    updateData.stage = analysis.nextStage;
  } else if (analysis.stageChange === '降级' && analysis.nextStage) {
    updateData.stage = analysis.nextStage;
  }

  // 6. 应用选中的档案字段
  if (selectedFields && typeof selectedFields === 'object') {
    const profileUpdates = analysis.profileUpdates || {};
    for (const [key, value] of Object.entries(selectedFields)) {
      if (value === null || value === undefined || value === '') continue;
      if (!profileUpdates[key]) continue;

      const currentValue = girl[key];
      // 只填充空字段
      if (!currentValue || currentValue === '' || currentValue === null) {
        if (key === 'age' || key === 'height') {
          const parsed = parseInt(value, 10);
          if (!isNaN(parsed)) updateData[key] = parsed;
        } else {
          updateData[key] = value;
        }
      }
    }
  }

  // 更新数据库
  await prisma.girl.update({ where: { id: girlId }, data: updateData });

  // 更新 pending 状态
  await prisma.pendingProfileUpdate.update({
    where: { id: pendingId },
    data: { status: 'approved' }
  });

  const updatedFields = Object.keys(updateData);
  console.log('[GirlProfileExtractor] 女生档案已确认更新:', girlId, { updatedFields });

  return { success: true, updatedFields };
}

/**
 * 驳回待确认更新
 */
async function rejectProfileUpdate(girlId, pendingId) {
  const pending = await prisma.pendingProfileUpdate.findFirst({
    where: { id: pendingId, targetType: 'girl', targetId: girlId, status: 'pending' }
  });

  if (!pending) return { success: false, reason: '未找到待确认更新' };

  await prisma.pendingProfileUpdate.update({
    where: { id: pendingId },
    data: { status: 'rejected' }
  });

  return { success: true };
}

/**
 * 获取女生的所有待确认档案更新
 */
async function getPendingUpdates(girlId) {
  const pending = await prisma.pendingProfileUpdate.findMany({
    where: { targetType: 'girl', targetId: girlId, status: 'pending' },
    orderBy: { createdAt: 'desc' }
  });

  return pending.map(p => ({
    ...p,
    analysisData: JSON.parse(p.analysisData),
    profileContext: p.profileContext ? JSON.parse(p.profileContext) : null
  }));
}

module.exports = {
  buildGirlContext,
  extractFromNotes,
  extractFromChat,
  extractFromImage,
  confirmProfileUpdate,
  rejectProfileUpdate,
  getPendingUpdates
};

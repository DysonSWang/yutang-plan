/**
 * Layer 2: 客户档案提取器
 *
 * 职责：
 * - 接收 clientId + 聊天内容，调用 profileEngine 分析
 * - 将分析结果写入 PendingProfileUpdate 表（待确认）
 * - 提供 confirmProfileUpdate() 确认后应用到客户档案
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { analyzeClientChat, extractClientPendingFields } = require('./profileEngine');

/**
 * 构建客户档案上下文
 */
async function buildClientContext(clientId) {
  const client = await prisma.user.findUnique({
    where: { id: clientId, role: 'client' }
  });
  if (!client) return null;

  return { client };
}

/**
 * 记录待确认档案更新到数据库
 */
async function savePendingUpdate(clientId, source, profileContext, analysisData, operatorId) {
  const pending = await prisma.pendingProfileUpdate.create({
    data: {
      targetType: 'client',
      targetId: clientId,
      source,
      operatorId,
      profileContext: JSON.stringify({
        name: profileContext.nickname || profileContext.username || '未知',
        serviceStage: profileContext.serviceStage,
        trustLevel: profileContext.trustLevel,
        interactionHeat: profileContext.interactionHeat
      }),
      analysisData: JSON.stringify(analysisData),
      status: 'pending'
    }
  });
  return pending;
}

/**
 * 从聊天记录提取客户画像更新（返回待确认，不自动入库）
 */
async function extractFromChat(clientId, operatorId, message, chatContext) {
  const ctx = await buildClientContext(clientId);
  if (!ctx) return null;

  const analysis = await analyzeClientChat(ctx.client, {
    message,
    ...chatContext
  });

  if (!analysis) return null;

  const pending = await savePendingUpdate(clientId, 'chat_analyze', ctx.client, analysis, operatorId);
  const pendingFields = extractClientPendingFields(analysis.profileUpdates, ctx.client);

  return {
    pendingId: pending.id,
    analysis,
    pendingFields,
    profileContext: ctx.client
  };
}

// ============================================================================
// 确认应用
// ============================================================================

/**
 * 确认并应用客户档案更新
 */
async function confirmProfileUpdate(clientId, pendingId, selectedFields) {
  const pending = await prisma.pendingProfileUpdate.findFirst({
    where: { id: pendingId, targetType: 'client', targetId: clientId, status: 'pending' }
  });

  if (!pending) return { success: false, reason: '未找到待确认更新' };

  const analysis = JSON.parse(pending.analysisData);
  const client = await prisma.user.findUnique({
    where: { id: clientId, role: 'client' }
  });
  if (!client) return { success: false, reason: '客户不存在' };

  const updateData = {};

  // 信任度调整
  if (analysis.trustAdjustment) {
    let trustLevel = client.trustLevel || 1;
    trustLevel = Math.max(1, Math.min(5, trustLevel + analysis.trustAdjustment));
    updateData.trustLevel = trustLevel;
  }

  // 应用选中的档案字段
  if (selectedFields && typeof selectedFields === 'object') {
    const profileUpdates = analysis.profileUpdates || {};
    for (const [key, value] of Object.entries(selectedFields)) {
      if (value === null || value === undefined || value === '') continue;
      if (!profileUpdates[key]) continue;

      const currentValue = client[key];
      // 只填充空字段
      if (!currentValue || currentValue === '' || currentValue === null) {
        // Int 类型
        if (['emotionalStable', 'eqLevel', 'antiFrustrationLevel', 'trustLevel', 'interactionHeat'].includes(key)) {
          const parsed = parseInt(value.toString().replace('/10', '').replace('/5', ''), 10);
          if (!isNaN(parsed)) updateData[key] = parsed;
        } else if (key === 'pendingActions') {
          // pendingActions 特殊处理：合并
          let existing = [];
          if (client.pendingActions) {
            try { existing = JSON.parse(client.pendingActions); } catch {}
          }
          const newActions = String(value).split(/[,，]/).map(s => s.trim()).filter(Boolean);
          newActions.forEach(a => { if (!existing.includes(a)) existing.push(a); });
          updateData.pendingActions = JSON.stringify(existing);
        } else {
          updateData[key] = value;
        }
      }
    }
  }

  // 更新数据库
  await prisma.user.update({ where: { id: clientId }, data: updateData });

  // 更新 pending 状态
  await prisma.pendingProfileUpdate.update({
    where: { id: pendingId },
    data: { status: 'approved' }
  });

  const updatedFields = Object.keys(updateData);
  console.log('[ClientProfileExtractor] 客户档案已确认更新:', clientId, { updatedFields });

  return { success: true, updatedFields };
}

/**
 * 驳回待确认更新
 */
async function rejectProfileUpdate(clientId, pendingId) {
  const pending = await prisma.pendingProfileUpdate.findFirst({
    where: { id: pendingId, targetType: 'client', targetId: clientId, status: 'pending' }
  });

  if (!pending) return { success: false, reason: '未找到待确认更新' };

  await prisma.pendingProfileUpdate.update({
    where: { id: pendingId },
    data: { status: 'rejected' }
  });

  return { success: true };
}

/**
 * 获取客户的所有待确认档案更新
 */
async function getPendingUpdates(clientId) {
  const pending = await prisma.pendingProfileUpdate.findMany({
    where: { targetType: 'client', targetId: clientId, status: 'pending' },
    orderBy: { createdAt: 'desc' }
  });

  return pending.map(p => ({
    ...p,
    analysisData: JSON.parse(p.analysisData),
    profileContext: p.profileContext ? JSON.parse(p.profileContext) : null
  }));
}

module.exports = {
  buildClientContext,
  extractFromChat,
  confirmProfileUpdate,
  rejectProfileUpdate,
  getPendingUpdates
};

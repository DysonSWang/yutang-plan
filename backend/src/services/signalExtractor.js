/**
 * 信号提取服务 - 委托层
 *
 * 旧实现保留接口，对内委托给新的 extractor 服务。
 * extractFromNotes / extractFromImage 不再自动入库，统一改为返回待确认结果。
 *
 * 新增 confirmAnalysis / rejectAnalysis 用于旧接口的兼容确认。
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { BASE_URL, getAIConfig } = require('../config');
const girlProfileExtractor = require('./girlProfileExtractor');
const extractorExtractFromNotes = girlProfileExtractor.extractFromNotes;
const extractorExtractFromImage = girlProfileExtractor.extractFromImage;
const extractorExtractFromChat = girlProfileExtractor.extractFromChat;
const extractorConfirm = girlProfileExtractor.confirmProfileUpdate;
const extractorReject = girlProfileExtractor.rejectProfileUpdate;
const extractorGetPending = girlProfileExtractor.getPendingUpdates;

/**
 * 从备注提取信号和档案字段（返回待确认，不自动入库）
 * 签名: extractFromNotes(girlId, operatorId, notes)
 */
async function extractFromNotes(girlId, operatorId, notes) {
  return extractorExtractFromNotes(girlId, operatorId || 'system', notes);
}

/**
 * 从截图图片提取信号和档案字段（返回待确认，不自动入库）
 * 签名: extractFromImage(girlId, imageUrl, baseUrl, operatorId)
 */
async function extractFromImage(girlId, imageUrl, baseUrl, operatorId) {
  return extractorExtractFromImage(girlId, imageUrl, baseUrl, operatorId || 'system');
}

/**
 * 从聊天提取信号和档案字段（返回待确认）
 * 签名: extractFromChat(girlId, operatorId, message, chatContext)
 * 注意: operatorId 在 message 之前，与其他两个函数保持一致
 */
async function extractFromChat(girlId, operatorId, message, chatContext) {
  return extractorExtractFromChat(girlId, operatorId || 'system', message, chatContext);
}

/**
 * 确认并应用档案更新（女生）
 * 兼容旧 /confirm-fields 接口
 */
async function applyAnalysisToGirl(girlId, analysis, existingSignals, girl) {
  // 写入临时 pending 记录，然后确认
  const pending = await prisma.pendingProfileUpdate.create({
    data: {
      targetType: 'girl',
      targetId: girlId,
      source: 'screenshot',
      operatorId: 'system',
      profileContext: JSON.stringify({ name: girl?.name, stage: girl?.stage, tensionScore: girl?.tensionScore }),
      analysisData: JSON.stringify(analysis),
      status: 'pending'
    }
  });

  // 直接应用（selectedFields = null 表示全部应用）
  return extractorConfirm(girlId, pending.id, null);
}

/**
 * 确认档案更新（女生，通过 pendingId）
 */
async function confirmAnalysis(girlId, pendingId, selectedFields) {
  return extractorConfirm(girlId, pendingId, selectedFields);
}

/**
 * 驳回档案更新（女生）
 */
async function rejectAnalysis(girlId, pendingId) {
  return extractorReject(girlId, pendingId);
}

/**
 * 获取女生的待确认档案更新
 */
async function getPendingUpdates(girlId) {
  return extractorGetPending(girlId);
}

/**
 * 批量分析所有女生（用于每日简报）
 * 独立于提取流程，不需要改动
 */
async function analyzeAllGirls(clientId) {
  try {
    const where = clientId ? { clientId } : {};
    const girls = await prisma.girl.findMany({ where });

    const results = [];
    for (const girl of girls) {
      let signals = [];
      let pendingActions = [];

      if (girl.signals) {
        try { signals = JSON.parse(girl.signals); } catch (e) {}
      }
      if (girl.pendingActions) {
        try { pendingActions = JSON.parse(girl.pendingActions); } catch (e) {}
      }

      const todayTasks = [];
      const alerts = [];

      if (signals.length > 0) {
        const lastSignal = signals[signals.length - 1];
        const lastDate = new Date(lastSignal.date);
        const daysSince = Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24));
        if (daysSince >= 3) {
          alerts.push({
            girlId: girl.id,
            girlName: girl.name,
            type: 'warning',
            message: '已' + daysSince + '天无新互动，需要破冰或重新定位'
          });
        }
      }

      if (girl.tensionScore < 4) {
        alerts.push({
          girlId: girl.id,
          girlName: girl.name,
          type: 'danger',
          message: '关系热度偏低，建议补充能量或重新定位'
        });
      }

      pendingActions.forEach(action => {
        todayTasks.push({
          girlId: girl.id,
          girlName: girl.name,
          stage: girl.stage,
          tensionScore: girl.tensionScore,
          action,
          priority: 'P0'
        });
      });

      results.push({ girl, todayTasks, alerts });
    }

    return results;
  } catch (error) {
    console.error('[SignalExtractor] 批量分析失败:', error);
    return [];
  }
}

module.exports = {
  extractFromNotes,
  extractFromImage,
  extractFromChat,
  applyAnalysisToGirl,
  confirmAnalysis,
  rejectAnalysis,
  getPendingUpdates,
  analyzeAllGirls
};

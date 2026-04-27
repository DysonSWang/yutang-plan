/**
 * ClientCoachProfile Service - 客户教练画像管理
 *
 * 核心职责：
 * 1. 加载某客户对某教练在某类问题上的个性化权重
 * 2. 接收反馈事件，更新权重
 * 3. 提供给 fusion 引擎使用的权重调整量
 */

const prisma = require('../prisma');

// ---- 配置 ----
const MIN_SAMPLES = 2; // 至少需要多少样本才开始应用权重调整
const DECAY_FACTOR = 0.9; // 旧样本的衰减系数（越老的反馈影响越小）

/**
 * 获取某客户在特定问题类型上对所有教练的个性化权重
 * @param {string} clientId
 * @param {string} questionType - 路由到的问题类型（如 '关系拉伸'）
 * @returns {Object} { coachId -> feedbackBonus }
 */
async function getCoachWeightsForType(clientId, questionType) {
  const profiles = await prisma.clientCoachProfile.findMany({
    where: {
      clientId,
      questionType
    }
  });

  const weights = {};
  for (const p of profiles) {
    // 只返回有足够样本的权重
    const total = p.helpfulCount + p.notHelpfulCount;
    if (total >= MIN_SAMPLES) {
      weights[p.coachId] = p.feedbackBonus;
    }
  }

  return weights;
}

/**
 * 获取某客户在多个问题类型上的权重（用于融合决策）
 * @param {string} clientId
 * @param {string[]} questionTypes - 候选问题类型列表
 * @returns {Object} { coachId -> avgBonus }
 */
async function getCoachWeightsForTypes(clientId, questionTypes) {
  if (!questionTypes || questionTypes.length === 0) {
    return {};
  }

  const profiles = await prisma.clientCoachProfile.findMany({
    where: {
      clientId,
      questionType: { in: questionTypes }
    }
  });

  // 按 coachId 聚合（多类型取平均）
  const coachScores = {};
  const coachCounts = {};

  for (const p of profiles) {
    const total = p.helpfulCount + p.notHelpfulCount;
    if (total >= MIN_SAMPLES) {
      coachScores[p.coachId] = (coachScores[p.coachId] || 0) + p.feedbackBonus;
      coachCounts[p.coachId] = (coachCounts[p.coachId] || 0) + 1;
    }
  }

  const weights = {};
  for (const coachId of Object.keys(coachScores)) {
    weights[coachId] = coachScores[coachId] / coachCounts[coachId];
  }

  return weights;
}

/**
 * 获取某客户的整体教练偏好（跨所有问题类型）
 * 用于 promptBuilder 注入客户教练偏好描述
 */
async function getClientCoachPreferences(clientId) {
  const profiles = await prisma.clientCoachProfile.findMany({
    where: { clientId },
    orderBy: { updatedAt: 'desc' }
  });

  if (profiles.length === 0) {
    return { hasData: false, topCoaches: [], summary: '' };
  }

  // 按教练聚合（跨问题类型）
  const coachTotals = {};
  const coachCounts = {};

  for (const p of profiles) {
    const total = p.helpfulCount + p.notHelpfulCount;
    if (total >= MIN_SAMPLES) {
      coachTotals[p.coachId] = (coachTotals[p.coachId] || 0) + p.feedbackBonus * total;
      coachCounts[p.coachId] = (coachCounts[p.coachId] || 0) + total;
    }
  }

  const coachAvg = {};
  for (const coachId of Object.keys(coachTotals)) {
    coachAvg[coachId] = coachTotals[coachId] / coachCounts[coachId];
  }

  // 排序：最好的在前
  const sorted = Object.entries(coachAvg)
    .sort((a, b) => b[1] - a[1])
    .filter(([, bonus]) => Math.abs(bonus) >= 0.1) // 过滤掉无意义的调整
    .slice(0, 3);

  const topCoaches = sorted.map(([id, bonus]) => ({
    coachId: id,
    bonus: parseFloat(bonus.toFixed(2)),
    label: getCoachLabel(id)
  }));

  let summary = '';
  if (topCoaches.length > 0) {
    const prefs = topCoaches.map(c => c.label).join('、');
    summary = `该客户对以下教练风格反应较好：${prefs}。`;
  }

  return { hasData: true, topCoaches, summary };
}

/**
 * 记录一条教练反馈，并更新权重
 *
 * @param {Object} params
 * @param {string} params.clientId
 * @param {string} params.coachId - 使用的教练ID
 * @param {string} params.questionType - 路由到的问题类型
 * @param {string} params.feedbackType - 'helpful' | 'not_helpful'
 */
async function recordFeedback({ clientId, coachId, questionType, feedbackType }) {
  const isHelpful = feedbackType === 'helpful';

  // Upsert：更新或创建记录
  const existing = await prisma.clientCoachProfile.findUnique({
    where: {
      clientId_coachId_questionType: {
        clientId,
        coachId,
        questionType
      }
    }
  });

  if (existing) {
    await prisma.clientCoachProfile.update({
      where: { id: existing.id },
      data: {
        helpfulCount: { increment: isHelpful ? 1 : 0 },
        notHelpfulCount: { increment: isHelpful ? 0 : 1 },
        feedbackBonus: computeFeedbackBonus(
          existing.helpfulCount + (isHelpful ? 1 : 0),
          existing.notHelpfulCount + (isHelpful ? 0 : 1)
        )
      }
    });
  } else {
    await prisma.clientCoachProfile.create({
      data: {
        clientId,
        coachId,
        questionType,
        helpfulCount: isHelpful ? 1 : 0,
        notHelpfulCount: isHelpful ? 0 : 1,
        feedbackBonus: 0 // 初始为0，等下次有更多样本再更新
      }
    });
  }
}

/**
 * 批量处理某客户的反馈历史，从 CoachFeedback 表聚合后更新权重
 * 用于初始化或定期同步
 */
async function rebuildProfilesFromFeedback(clientId) {
  // 从 CoachFeedback 表聚合统计
  const feedbacks = await prisma.coachFeedback.findMany({
    where: {
      memory: { clientId }
    },
    orderBy: { createdAt: 'asc' }
  });

  // 按 coachId + questionType 聚合
  const agg = {};

  for (const f of feedbacks) {
    if (!f.coachesUsed || !f.routedType) continue;

    let coaches;
    try {
      coaches = JSON.parse(f.coachesUsed);
    } catch {
      coaches = [];
    }

    if (!Array.isArray(coaches) || coaches.length === 0) continue;

    for (const coachId of coaches) {
      const key = `${coachId}__${f.routedType}`;
      if (!agg[key]) {
        agg[key] = { coachId, questionType: f.routedType, helpful: 0, notHelpful: 0 };
      }
      if (f.type === 'helpful') agg[key].helpful++;
      else agg[key].notHelpful++;
    }
  }

  // 批量 upsert
  for (const item of Object.values(agg)) {
    const bonus = computeFeedbackBonus(item.helpful, item.notHelpful);

    await prisma.clientCoachProfile.upsert({
      where: {
        clientId_coachId_questionType: {
          clientId,
          coachId: item.coachId,
          questionType: item.questionType
        }
      },
      update: {
        helpfulCount: item.helpful,
        notHelpfulCount: item.notHelpful,
        feedbackBonus: bonus
      },
      create: {
        clientId,
        coachId: item.coachId,
        questionType: item.questionType,
        helpfulCount: item.helpful,
        notHelpfulCount: item.notHelpful,
        feedbackBonus: bonus
      }
    });
  }

  console.log(`[ClientCoachProfile] Rebuilt profiles for client ${clientId}: ${Object.keys(agg).length} entries`);
  return Object.keys(agg).length;
}

/**
 * 计算反馈 bonus
 * 公式：基于 helpful ratio 的非线性调整
 *
 * ratio = helpful / (helpful + notHelpful)
 * bonus = (ratio - 0.5) * scale
 *
 * scale 控制最大调整幅度：
 * - 样本少时 scale 小（防止过拟合）
 * - 样本多时 scale 大（更确信）
 */
function computeFeedbackBonus(helpful, notHelpful) {
  const total = helpful + notHelpful;
  if (total === 0) return 0;

  const ratio = helpful / total;
  const confidence = Math.min(total / 10, 1); // 样本越多置信度越高，最少10个达到1
  const maxBonus = 2.0; // 最大调整幅度

  // bonus = (ratio - 0.5) * confidence * maxBonus
  // ratio=1.0 (全正面) -> bonus ≈ confidence * maxBonus (最多 +2)
  // ratio=0.5 (五五开) -> bonus = 0
  // ratio=0.0 (全负面) -> bonus ≈ -confidence * maxBonus (最多 -2)
  const bonus = (ratio - 0.5) * confidence * maxBonus;

  return parseFloat(bonus.toFixed(2));
}

/**
 * coach ID -> 中文标签映射
 * 必须与 fusion.js COACH_LABELS 和 INDEX.json name 字段保持一致
 */
function getCoachLabel(coachId) {
  const labels = {
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
  return labels[coachId] || coachId;
}

/**
 * 获取某客户的画像摘要（用于调试）
 */
async function getProfileSummary(clientId) {
  const profiles = await prisma.clientCoachProfile.findMany({
    where: { clientId },
    orderBy: { updatedAt: 'desc' }
  });

  if (profiles.length === 0) {
    return { entryCount: 0, activeCoaches: [], summary: '暂无个性化数据' };
  }

  const total = profiles.reduce((sum, p) => sum + p.helpfulCount + p.notHelpfulCount, 0);

  // 按教练聚合
  const coachMap = {};
  for (const p of profiles) {
    if (!coachMap[p.coachId]) {
      coachMap[p.coachId] = { coachId: p.coachId, label: getCoachLabel(p.coachId), total: 0, bonus: 0, types: 0 };
    }
    coachMap[p.coachId].total += p.helpfulCount + p.notHelpfulCount;
    coachMap[p.coachId].types++;
  }

  const activeCoaches = Object.values(coachMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return {
    entryCount: profiles.length,
    totalFeedbacks: total,
    activeCoaches,
    summary: `共 ${profiles.length} 条记录，${activeCoaches.length} 个教练有数据`
  };
}

module.exports = {
  getCoachWeightsForType,
  getCoachWeightsForTypes,
  getClientCoachPreferences,
  recordFeedback,
  rebuildProfilesFromFeedback,
  getProfileSummary,
  MIN_SAMPLES
};

/**
 * Alert Engine - 操盘手主动预警检测引擎
 *
 * M007 S02: 主动预警
 * 检测规则（按优先级）：
 * 1. 互动沉默：3天无新signal → P1 warning，7天+ → P0 danger
 * 2. 热度骤降：tensionScore 相比7天前下降>30% → P1 regression
 * 3. 阶段停滞：女生卡在EXPLORATION/FLIRTING超14天且pendingActions为空 → P1 info
 * 4. 反撇信号：新增的observation/signal包含"冷淡""敷衍""消失""已读不回"等关键词 → P0/P1 danger
 * 5. 待办积压：pendingActions中存在超过3天未处理的action → P2 notice
 * 6. 阶段倒退：relationshipStage历史中出现 fromStage比toStage更高级的记录 → P0 danger
 */

const prisma = require('../prisma');

// 反撇关键词（触发更高优先级预警）
// 与 reversalDetector.js 保持同步
const REVERSAL_KEYWORDS = ['冷淡', '敷衍', '消失', '已读不回', '不回', '不回消息', '态度变差', '突然不回', '爱理不理', '忽冷忽热', '热度下降', '变冷', '冷落', '不回话'];

// 阶段等级（用于检测倒退）
const STAGE_LEVELS = {
  EXPLORATION: 1,
  FLIRTING: 2,
  ADVANCEMENT: 3,
  CONFIRMATION: 4,
  STABLE: 5,
};

// 预警可操作建议（M007 评审团修复 P1）
const ALERT_SUGGESTIONS = {
  silence_3day: '建议发一条轻松的话题破冰，避免查岗式消息。可以从她朋友圈最近动态切入。',
  silence_7day: '重新评估关系定位，考虑调整策略或降低热度。避免连续追问，给对方空间。',
  tension_drop: '核实女生真实状态，减少主动联系频率观察反应。不要过度解读，尊重对方节奏。',
  reversal_signal: '减少联系频率，给对方空间，观察3-5天再决定下一步。不要追问原因，保持从容。',
  stage_stagnation: '制定下一步具体行动计划，明确本周要完成的小目标。联系操盘手讨论策略调整。',
  action_backlog: '优先处理积压的待办事项，完成后再推进新计划。拖延会降低女生信任。',
  stage_regression: '分析阶段倒退原因，可能需要重新建立舒适感。暂停进攻性动作，先恢复联系频率。',
};

/**
 * 解析 JSON 字段，失败返回空数组
 */
function parseJsonField(raw, fallback = []) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 检测"互动沉默"预警
 */
function detectSilence(girl, days) {
  const signals = parseJsonField(girl.signals);
  if (signals.length === 0) {
    // 从未有过互动记录
    if (!girl.createdAt) return null;
    const daysSinceCreated = Math.floor((Date.now() - new Date(girl.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceCreated >= days) {
      return {
        alertType: 'proactive',
        severity: days >= 7 ? 'P0' : 'P1',
        title: `已${daysSinceCreated}天无新互动`,
        message: `${girl.name || '该女生'}已${daysSinceCreated}天没有任何互动记录，需要破冰或重新定位。`,
        triggerReason: `最后互动时间距今${daysSinceCreated}天（无signal记录，检测到创建${daysSinceCreated}天未激活）`,
      };
    }
    return null;
  }

  const lastSignal = signals[signals.length - 1];
  if (!lastSignal?.date) return null;
  const lastDate = new Date(lastSignal.date);
  const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSince >= days) {
    return {
      alertType: 'proactive',
      severity: days >= 7 ? 'P0' : 'P1',
      title: `已${daysSince}天无新互动`,
      message: `${girl.name || '该女生'}已${daysSince}天没有新互动记录，建议主动联系或重新定位策略。`,
      triggerReason: `最后signal时间距今${daysSince}天`,
    };
  }
  return null;
}

/**
 * 检测"热度骤降"预警
 * 需要对比7天前的tensionScore
 */
async function detectTensionDrop(girl, operatorId) {
  // 从 chatLogs 中估算7天前的热度
  // 简化方案：找最近的 chatLog 条目，分析回复时间来估算热度趋势
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentLogs = await prisma.chatLog.findMany({
    where: { girlId: girl.id, createdAt: { gte: sevenDaysAgo } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { createdAt: true, receiverName: true }
  });

  if (recentLogs.length === 0) {
    // 7天内没有任何聊天记录，热度可能骤降
    if (girl.tensionScore && girl.tensionScore > 6) {
      return {
        alertType: 'signal',
        severity: 'P1',
        title: '热度可能骤降',
        message: `${girl.name || '该女生'}7天内没有任何聊天记录，当前热度${girl.tensionScore}可能虚高，建议核实实际状态。`,
        triggerReason: '7天内chatLog为空 + 当前tensionScore较高',
      };
    }
    return null;
  }

  // 分析回复时间间隔变化
  if (recentLogs.length >= 2) {
    const latest = recentLogs[0];
    const prev = recentLogs[recentLogs.length - 1];
    const totalSpan = latest.createdAt.getTime() - prev.createdAt.getTime();
    const avgGapHours = totalSpan / (recentLogs.length - 1) / (1000 * 60 * 60);

    // 如果平均间隔超过48小时，且当前热度较高 → 疑似热度下降
    if (avgGapHours > 48 && girl.tensionScore && girl.tensionScore > 6) {
      return {
        alertType: 'signal',
        severity: 'P1',
        title: '回复节奏变慢',
        message: `${girl.name || '该女生'}近期聊天间隔变长（平均${Math.round(avgGapHours)}小时回复一次），热度可能下降。`,
        triggerReason: `最近${recentLogs.length}条聊天平均间隔${Math.round(avgGapHours)}小时，tensionScore=${girl.tensionScore}`,
      };
    }
  }

  return null;
}

/**
 * 检测"阶段停滞"预警
 */
function detectStageStagnation(girl) {
  if (!girl.relationshipStage) return null;
  if (girl.relationshipStage !== 'EXPLORATION' && girl.relationshipStage !== 'FLIRTING') return null;

  const pendingActions = parseJsonField(girl.pendingActions);
  if (pendingActions.length > 0) return null; // 有待办，说明在推进

  if (!girl.relationshipStageUpdatedAt && !girl.updatedAt) return null;
  const stageStart = girl.relationshipStageUpdatedAt || girl.updatedAt;
  const daysStuck = Math.floor((Date.now() - new Date(stageStart).getTime()) / (1000 * 60 * 60 * 24));

  if (daysStuck >= 14) {
    return {
      alertType: 'proactive',
      severity: 'P1',
      title: '关系阶段停滞',
      message: `${girl.name || '该女生'}卡在${girl.relationshipStage}阶段已超过14天且无待办推进事项，建议制定下一步行动计划。`,
      triggerReason: `relationshipStage=${girl.relationshipStage}，持续${daysStuck}天，pendingActions为空`,
    };
  }

  return null;
}

/**
 * 检测"反撇信号"预警
 */
function detectReversalSignals(girl) {
  const observations = parseJsonField(girl.observations);
  const signals = parseJsonField(girl.signals);

  // 合并最近3条 observations + signals 进行关键词检测
  const recentItems = [
    ...observations.slice(-3).map(o => ({ type: 'observation', ...o })),
    ...signals.slice(-3).map(s => ({ type: 'signal', ...s })),
  ];

  for (const item of recentItems) {
    const text = (item.event || item.content || item.note || '').toLowerCase();
    const matchedKeywords = REVERSAL_KEYWORDS.filter(kw => text.includes(kw));
    if (matchedKeywords.length > 0) {
      const isRecent = item.date && (Date.now() - new Date(item.date).getTime()) < 3 * 24 * 60 * 60 * 1000;
      return {
        alertType: 'signal',
        severity: isRecent ? 'P0' : 'P1',
        title: '检测到反撇信号',
        message: `${girl.name || '该女生'}的最近动态中检测到反撇迹象：${matchedKeywords.join('、')}。建议密切关注并调整策略。`,
        triggerReason: `关键词匹配：${matchedKeywords.join(', ')}，来源：${item.type}`,
      };
    }
  }

  return null;
}

/**
 * 检测"待办积压"预警
 */
function detectActionBacklog(girl) {
  const pendingActions = parseJsonField(girl.pendingActions);
  const now = Date.now();

  for (const action of pendingActions) {
    if (action.createdAt) {
      const age = Math.floor((now - new Date(action.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      if (age >= 3) {
        return {
          alertType: 'action',
          severity: 'P2',
          title: '待办事项积压',
          message: `${girl.name || '该女生'}有一条待办"${action.action || action}"已积压${age}天，建议尽快处理。`,
          triggerReason: `待办"${action.action || action}"创建于${age}天前`,
        };
      }
    }
  }

  return null;
}

/**
 * 检测"阶段倒退"预警
 * 需要查询 RelationshipStageHistory
 */
async function detectStageRegression(girl) {
  const history = await prisma.relationshipStageHistory.findMany({
    where: { girlId: girl.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  for (const entry of history) {
    if (entry.fromStage && entry.toStage) {
      const fromLevel = STAGE_LEVELS[entry.fromStage];
      const toLevel = STAGE_LEVELS[entry.toStage];
      if (fromLevel > toLevel) {
        return {
          alertType: 'signal',
          severity: 'P0',
          title: '关系阶段倒退',
          message: `${girl.name || '该女生'}的关系阶段从${entry.fromStage}倒退到${entry.toStage}，需要关注原因并制定恢复策略。`,
          triggerReason: `fromStage=${entry.fromStage}(level=${fromLevel}) → toStage=${entry.toStage}(level=${toLevel})，倒退${fromLevel - toLevel}个等级`,
        };
      }
    }
  }

  return null;
}

/**
 * 对单个女生运行所有预警检测
 * @param {string} clientId - 客户ID
 * @param {string} operatorId - 操盘手ID
 * @param {object} girl - 女生对象（含 signals/observations/pendingActions 字段）
 * @returns {Array} 生成的预警列表
 */
async function evaluateGirl(clientId, operatorId, girl) {
  const alerts = [];

  // 1. 互动沉默（3天 P1，7天 P0）
  const silence3 = detectSilence(girl, 3);
  if (silence3) {
    silence3.suggestion = silence3.severity === 'P0'
      ? ALERT_SUGGESTIONS.silence_7day
      : ALERT_SUGGESTIONS.silence_3day;
    alerts.push(silence3);
  }

  const silence7 = detectSilence(girl, 7);
  if (silence7 && !silence3) {
    silence7.suggestion = ALERT_SUGGESTIONS.silence_7day;
    alerts.push(silence7);
  }

  // 2. 热度骤降
  const tensionDrop = await detectTensionDrop(girl, operatorId);
  if (tensionDrop) {
    tensionDrop.suggestion = ALERT_SUGGESTIONS.tension_drop;
    alerts.push(tensionDrop);
  }

  // 3. 阶段停滞
  const stagnation = detectStageStagnation(girl);
  if (stagnation) {
    stagnation.suggestion = ALERT_SUGGESTIONS.stage_stagnation;
    alerts.push(stagnation);
  }

  // 4. 反撇信号
  const reversal = detectReversalSignals(girl);
  if (reversal) {
    reversal.suggestion = ALERT_SUGGESTIONS.reversal_signal;
    alerts.push(reversal);
  }

  // 5. 待办积压
  const backlog = detectActionBacklog(girl);
  if (backlog) {
    backlog.suggestion = ALERT_SUGGESTIONS.action_backlog;
    alerts.push(backlog);
  }

  // 6. 阶段倒退（需要查历史）
  const regression = await detectStageRegression(girl);
  if (regression) {
    regression.suggestion = ALERT_SUGGESTIONS.stage_regression;
    alerts.push(regression);
  }

  return alerts;
}

/**
 * 评估操盘手所有客户的女生
 * @param {string} operatorId - 操盘手ID
 * @param {string|null} clientId - 可选，筛选特定客户
 * @returns {Array} 所有生成的预警（含 girlId/clientId）
 */
async function evaluateAllGirls(operatorId, clientId = null) {
  // 获取操盘手负责的所有 ChatSession
  const sessions = await prisma.chatSession.findMany({
    where: { operatorId },
    select: { clientId: true }
  });

  const clientIds = clientId
    ? sessions.filter(s => s.clientId === clientId).map(s => s.clientId)
    : sessions.map(s => s.clientId);

  if (clientIds.length === 0) return [];

  // 获取这些客户的所有女生
  const girls = await prisma.girl.findMany({
    where: { clientId: { in: clientIds } }
  });

  const allAlerts = [];
  for (const girl of girls) {
    const girlAlerts = await evaluateGirl(girl.clientId, operatorId, girl);
    for (const alert of girlAlerts) {
      allAlerts.push({
        ...alert,
        operatorId,
        clientId: girl.clientId,
        girlId: girl.id,
        status: 'active',
      });
    }
  }

  // 去重：同类型、同女生、同原因的不重复创建
  return deduplicateAlerts(allAlerts);
}

/**
 * 去重：同类预警已存在 active 状态则不重复创建（批量查询优化）
 */
async function deduplicateAlerts(newAlerts) {
  if (newAlerts.length === 0) return [];

  // 批量查询所有已有的 active alerts
  const existingConditions = newAlerts.map(alert => ({
    operatorId: alert.operatorId,
    girlId: alert.girlId,
    alertType: alert.alertType,
    severity: alert.severity,
  }));

  // 收集所有需要检查的 (operatorId, girlId, alertType, severity) 组合
  const existingAlerts = await prisma.alert.findMany({
    where: {
      OR: existingConditions,
      status: { in: ['active', 'acknowledged'] },
    },
    select: {
      operatorId: true,
      girlId: true,
      alertType: true,
      severity: true,
    }
  });

  // 构建去重集合
  const existingSet = new Set(
    existingAlerts.map(e => `${e.operatorId}|${e.girlId}|${e.alertType}|${e.severity}`)
  );

  return newAlerts.filter(alert => {
    const key = `${alert.operatorId}|${alert.girlId}|${alert.alertType}|${alert.severity}`;
    return !existingSet.has(key);
  });
}

/**
 * 获取活跃预警
 * @param {string} operatorId - 操盘手ID
 * @param {object} filters - { clientId?, status?, severity?, girlId? }
 */
async function getActiveAlerts(operatorId, filters = {}) {
  const { clientId, status, severity, girlId } = filters;
  const where = { operatorId };

  if (clientId) where.clientId = clientId;
  if (status) where.status = status;
  else where.status = { in: ['active', 'acknowledged'] }; // 默认只查活跃的
  if (severity) where.severity = severity;
  if (girlId) where.girlId = girlId;

  const alerts = await prisma.alert.findMany({
    where,
    include: {
      girl: { select: { id: true, name: true, relationshipStage: true, tensionScore: true } },
    },
    orderBy: [
      { severity: 'asc' },   // P0优先
      { createdAt: 'desc' },
    ],
  });

  return alerts;
}

/**
 * 获取预警统计
 */
async function getAlertStats(operatorId, clientId = null) {
  const where = { operatorId };
  if (clientId) where.clientId = clientId;

  const [total, p0, p1, p2, active, acknowledged] = await Promise.all([
    prisma.alert.count({ where: { ...where, status: { in: ['active', 'acknowledged'] } } }),
    prisma.alert.count({ where: { ...where, severity: 'P0', status: { in: ['active', 'acknowledged'] } } }),
    prisma.alert.count({ where: { ...where, severity: 'P1', status: { in: ['active', 'acknowledged'] } } }),
    prisma.alert.count({ where: { ...where, severity: 'P2', status: { in: ['active', 'acknowledged'] } } }),
    prisma.alert.count({ where: { ...where, status: 'active' } }),
    prisma.alert.count({ where: { ...where, status: 'acknowledged' } }),
  ]);

  return { total, p0, p1, p2, active, acknowledged };
}

/**
 * 标记预警为已读
 */
async function acknowledgeAlert(alertId, userId) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw new Error('预警不存在');
  if (alert.operatorId !== userId) throw new Error('无权操作此预警');

  return prisma.alert.update({
    where: { id: alertId },
    data: { status: 'acknowledged' },
  });
}

/**
 * 关闭（忽略）预警
 */
async function dismissAlert(alertId, userId) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw new Error('预警不存在');
  if (alert.operatorId !== userId) throw new Error('无权操作此预警');

  return prisma.alert.update({
    where: { id: alertId },
    data: { status: 'dismissed' },
  });
}

/**
 * 标记预警为已处理
 */
async function resolveAlert(alertId, userId, reason = null) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw new Error('预警不存在');
  if (alert.operatorId !== userId) throw new Error('无权操作此预警');

  const metadata = alert.metadata ? JSON.parse(alert.metadata) : {};
  if (reason) {
    metadata.resolvedReason = reason;
    metadata.resolvedAt = new Date().toISOString();
  }

  return prisma.alert.update({
    where: { id: alertId },
    data: {
      status: 'resolved',
      metadata: JSON.stringify(metadata),
    },
  });
}

/**
 * 批量保存预警（evaluateAllGirls 后的写入）
 */
async function saveAlerts(alerts) {
  if (alerts.length === 0) return [];
  // 过滤掉 suggestion 等非 schema 字段，只保留 Alert 模型定义的字段
  const validFields = ['operatorId', 'clientId', 'girlId', 'alertType', 'severity', 'title', 'message', 'triggerReason', 'status'];
  const cleanData = alerts.map(a => {
    const cleaned = {};
    for (const key of validFields) {
      if (a[key] !== undefined) cleaned[key] = a[key];
    }
    // 将 suggestion 存入 metadata
    if (a.suggestion) {
      cleaned.metadata = JSON.stringify({ suggestion: a.suggestion });
    }
    return cleaned;
  });
  return prisma.alert.createMany({ data: cleanData });
}

module.exports = {
  evaluateGirl,
  evaluateAllGirls,
  getActiveAlerts,
  getAlertStats,
  acknowledgeAlert,
  dismissAlert,
  resolveAlert,
  saveAlerts,
  // 导出检测函数供测试
  detectSilence,
  detectTensionDrop,
  detectStageStagnation,
  detectReversalSignals,
  detectActionBacklog,
  detectStageRegression,
  ALERT_SUGGESTIONS,
  buildAlert,
};

/**
 * 构建预警对象（供外部调用）
 */
function buildAlert(alertType, girlName, operatorId, clientId, severity, extra = {}) {
  const base = {
    alertType,
    severity,
    operatorId,
    clientId,
    status: 'active',
  };
  const suggestion = ALERT_SUGGESTIONS[alertType] || ALERT_SUGGESTIONS[Object.keys(ALERT_SUGGESTIONS).find(k => alertType.includes(k.split('_')[0]))] || '';
  return { ...base, ...extra, suggestion };
}

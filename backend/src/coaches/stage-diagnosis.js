/**
 * Stage Diagnosis Engine - OS 阶段诊断
 *
 * 三级诊断：DB确定性(1.0) → 关键词推断(0.3-0.8) → 默认(0.3)
 * 阶段不可跳步强制执行
 */

const prisma = require('../prisma');
const osConfig = require('./os-config');

// 扩展 PHASES：保留原有 keywords 用于诊断，新增 deadEnd/prerequisites/masterTools
const _originalPhases = {
  0: { name: '资源池', keywords: ['资源', '展示面', '社交软件', '搭讪'] },
  1: { name: '入场', keywords: ['刚认识', '刚加微信', '第一次聊天', '开场', '破冰', '打招呼', 'hello', '你好', '刚加'] },
  2: { name: '聊天', keywords: ['聊天', '了解', '价值展示', '评估', '筛选', '意愿', '试探'] },
  3: { name: '暧昧', keywords: ['暧昧', '情绪', '推拉', '信任', '升温', '约会邀请', '模糊邀约'] },
  4: { name: '确认', keywords: ['确认关系', '表白', '确定关系', '要不要在一起', '选择', '长期', '短期'] },
  5: { name: '确立', keywords: ['女朋友', '在一起', '确定关系', '恋爱', '确立'] },
  6: { name: '经营', keywords: ['长期', '经营', '矛盾', '分手', '挽回', '维护', '结婚', '婚姻'] }
};

// 合并：os-config 的完整数据 + 原有 keywords
const PHASES = {};
for (const [key, data] of Object.entries(osConfig.PHASES)) {
  PHASES[key] = { ...data, keywords: _originalPhases[key]?.keywords || [] };
}

// 保留 DB_STAGE_MAP 来自 os-config
const { DB_STAGE_MAP } = osConfig;

/**
 * 诊断女生所处阶段
 * @param {string} girlId - 女生ID
 * @param {string} userQuestion - 用户问题文本（用于关键词推断）
 * @returns {Object} { phase, phaseName, confidence, source, skipWarning }
 */
async function diagnoseStage(girlId, userQuestion = '') {
  // === Level 1: DB 确定性诊断 ===
  if (girlId) {
    const girl = await prisma.girl.findUnique({
      where: { id: girlId },
      select: { stage: true, intimacyLevel: true, tensionScore: true, signals: true, name: true }
    });

    if (girl?.stage) {
      const mappedPhase = DB_STAGE_MAP[girl.stage];
      if (mappedPhase !== undefined) {
        const result = {
          phase: mappedPhase,
          phaseName: PHASES[mappedPhase].name,
          confidence: 1.0,
          source: 'database',
          girlName: girl.name,
          skipWarning: null
        };
        // 检查是否有跳步风险
        result.skipWarning = detectSkipRisk(mappedPhase, girl);
        return result;
      }
    }

    // DB 有记录但无 stage，用信号推断
    if (girl?.signals) {
      let signals = [];
      try { signals = JSON.parse(girl.signals || '[]'); } catch (e) {}
      if (signals.length > 0) {
        const inferred = inferFromSignals(signals);
        return {
          phase: inferred.phase,
          phaseName: PHASES[inferred.phase].name,
          confidence: 0.7,
          source: 'signals',
          girlName: girl.name,
          skipWarning: null
        };
      }
    }
  }

  // === Level 2: 关键词推断 ===
  if (userQuestion) {
    const inferred = inferFromKeywords(userQuestion);
    if (inferred.phase !== null) {
      return {
        phase: inferred.phase,
        phaseName: PHASES[inferred.phase].name,
        confidence: inferred.confidence,
        source: 'keywords',
        girlName: null,
        skipWarning: null
      };
    }
  }

  // === Level 3: 默认 ===
  return {
    phase: 1,
    phaseName: PHASES[1].name,
    confidence: 0.3,
    source: 'default',
    girlName: null,
    skipWarning: null
  };
}

/**
 * 从信号列表推断阶段
 */
function inferFromSignals(signals) {
  const recentSignals = signals.slice(-10);
  const events = recentSignals.map(s => s.event || '').join(' ').toLowerCase();

  // 按阶段特征匹配
  if (events.includes('约') || events.includes('见面') || events.includes('约会')) {
    return { phase: 4, confidence: 0.7 };
  }
  if (events.includes('暧昧') || events.includes('牵手') || events.includes('拥抱')) {
    return { phase: 3, confidence: 0.7 };
  }
  if (events.includes('聊天') || events.includes('回复')) {
    return { phase: 2, confidence: 0.6 };
  }
  if (events.includes('认识') || events.includes('打招呼')) {
    return { phase: 1, confidence: 0.6 };
  }

  return { phase: 1, confidence: 0.5 };
}

/**
 * 从用户问题关键词推断阶段
 */
function inferFromKeywords(question) {
  const q = question.toLowerCase();
  let bestPhase = null;
  let bestScore = 0;

  for (const [phaseNum, phaseInfo] of Object.entries(PHASES)) {
    let matchCount = 0;
    for (const kw of phaseInfo.keywords) {
      if (q.includes(kw.toLowerCase())) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      // confidence = 0.3 + 0.1 * matchCount, capped at 0.8
      const score = Math.min(0.8, 0.3 + 0.1 * matchCount);
      if (score > bestScore) {
        bestScore = score;
        bestPhase = parseInt(phaseNum);
      }
    }
  }

  return { phase: bestPhase, confidence: bestScore };
}

/**
 * 检测阶段跳步风险
 * 阶段不可跳步：如果信号显示跳过了中间阶段，发出警告
 */
function detectSkipRisk(currentPhase, girl) {
  const signals = (() => { try { return JSON.parse(girl.signals || '[]'); } catch { return []; } })();

  // 检查是否有前期阶段的信号
  const hasEarlySignals = signals.some(s => {
    const ev = (s.event || '').toLowerCase();
    return ev.includes('认识') || ev.includes('打招呼') || ev.includes('破冰');
  });

  // 如果当前阶段 >= 3 但没有早期信号，可能有跳步风险
  if (currentPhase >= 3 && !hasEarlySignals && signals.length < 3) {
    return `当前阶段 ${PHASES[currentPhase].name}，但缺少前期阶段信号，建议先完成 Phase 1-2 的核心任务`;
  }

  return null;
}

/**
 * 阶段不可跳步强制执行
 * 返回当前阶段可以执行的操作和必须完成的前置条件
 */
function enforceNoSkip(currentPhase) {
  const phaseInfo = PHASES[currentPhase] || {};
  return {
    currentPhase,
    phaseName: phaseInfo.name || '',
    prerequisites: phaseInfo.prerequisites || [],
    coreAction: phaseInfo.coreTask || '',
    availableMasters: Array.isArray(phaseInfo.masterTools) ? phaseInfo.masterTools : [],
    warning: phaseInfo.deadEnd || ''
  };
}

/**
 * 按阶段路由大师
 * 返回每个 Phase 对应的大师列表
 */
function routeByPhase(phase) {
  const phaseInfo = PHASES[phase] || {};
  const result = {
    masters: Array.isArray(phaseInfo.masterTools) ? phaseInfo.masterTools : [],
    reason: `${phaseInfo.name || '通用'}阶段核心任务`
  };
  if (phaseInfo.trackDecision) {
    result.trackDecision = true;
    result.shortTrack = phaseInfo.masterTools?.short || [];
    result.longTrack = phaseInfo.masterTools?.long || [];
  }
  return result;
}

/**
 * 诊断报告（面向用户）
 */
async function generateDiagnosticReport(girlId, userQuestion) {
  const stage = await diagnoseStage(girlId, userQuestion);
  const enforcement = enforceNoSkip(stage.phase);
  const routing = routeByPhase(stage.phase);

  return {
    stage,
    enforcement,
    routing,
    recommendation: `建议优先使用 ${enforcement.availableMasters.join('、')} 的视角`,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  diagnoseStage,
  enforceNoSkip,
  routeByPhase,
  generateDiagnosticReport,
  PHASES,
  DB_STAGE_MAP
};
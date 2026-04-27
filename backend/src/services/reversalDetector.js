/**
 * 反撇检测服务 - M007 S03
 *
 * AI 分析女生聊天记录、朋友圈截图，识别反撇信号（降温/冷淡/消失）
 * 比规则引擎（S02关键词检测）更精准，提前发现苗头
 */

const prisma = require('../prisma');
const { getAIConfig } = require('../config');

// 反撇类型定义
const REVERSAL_TYPES = {
  COLD_IGNORED: '冷淡敷衍型',     // 回复变少、变敷衍
  SUDDEN_DISAPPEAR: '突然消失型',  // 突然不回复或间隔变长
  SLOW_FADE: '节奏放慢型',        // 慢慢降温，没有明确转折
  AMBIGUOUS: '态度模糊型',        // 信号不明确，可能是反撇也可能是忙
};

// 反撇风险等级
const RISK_LEVELS = {
  HIGH: 'high',     // P0 - 明确反撇信号
  MEDIUM: 'medium', // P1 - 有苗头，需要观察
  LOW: 'low',       // P2 - 正常
  NONE: 'none',     // 无反撇迹象
};

/**
 * 构建反撇分析 Prompt
 */
function buildReversalPrompt(context) {
  return `你是两性关系分析专家，专注于识别女生的反撇信号（Pullback）。

请分析以下女生档案和近期互动记录，判断是否存在反撇迹象。

【女生基本信息】
姓名：${context.name || '未知'}
当前关系阶段：${context.relationshipStage || '未知'}
当前热度：${context.tensionScore || 5}/10
最后联系时间：${context.lastContact || '未知'}

【最近聊天记录（按时间倒序）】
${context.chatLogs || '暂无聊天记录'}

【朋友圈/动态】
${context.screenshots || '暂无截图'}

【操盘手观察备注】
${context.observations || '暂无备注'}

【近期信号记录】
${context.signals || '暂无信号记录'}

请分析以上信息，输出 JSON：
{
  "isReversal": true/false,                          // 是否存在反撇
  "type": "反撇类型（见下方定义）或null",            // 不反撇时为 null
  "confidence": 0-100,                              // 判断置信度
  "riskLevel": "high/medium/low/none",              // 风险等级
  "evidence": ["具体证据1", "证据2"],               // 支持判断的具体片段
  "signals": [                                       // 识别的反撇信号列表
    { "signal": "信号描述", "from": "证据来源", "weight": 1-3 }
  ],
  "timeline": [                                       // 时间线还原
    { "date": "日期", "event": "事件", "significance": "意义" }
  ],
  "suggestion": "给操盘手的具体建议（1-3句话）",
  "differential": "鉴别诊断：排除的其他可能性（如真忙、周期等）"
}

反撇类型定义：
- 冷淡敷衍型：回复变少、变敷衍、语气降温
- 突然消失型：之前正常，突然不回或间隔骤增
- 节奏放慢型：慢慢降温，没有明确转折节点
- 态度模糊型：信号不明确，可能反撇也可能真忙

只输出 JSON，不要其他内容。`;
}

/**
 * 解析 AI 返回的 JSON
 */
function parseAIResponse(content) {
  try {
    // 尝试直接解析
    return JSON.parse(content);
  } catch {
    // 尝试提取 JSON 块
    const match = content.match(/```json\n?([\s\S]+?)\n?```/) ||
                  content.match(/\{[\s\S]+\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // 尝试提取最外层 JSON
        const jsonMatch = match[0].match(/\{[\s\S]+\}/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
}

/**
 * 调用 AI 分析
 */
async function callAI(prompt, timeout = 20000) {
  const aiConfig = getAIConfig();
  if (!aiConfig) throw new Error('AI 未配置');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3, // 降低随机性，更稳定
        max_tokens: 1500
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error(`AI 请求失败: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/**
 * 构建分析上下文
 */
async function buildContext(girlId) {
  const girl = await prisma.girl.findUnique({ where: { id: girlId } });
  if (!girl) return null;

  // 解析各 JSON 字段
  let signals = [];
  let observations = [];
  let pendingActions = [];

  if (girl.signals) { try { signals = JSON.parse(girl.signals); } catch {} }
  if (girl.observations) { try { observations = JSON.parse(girl.observations); } catch {} }
  if (girl.pendingActions) { try { pendingActions = JSON.parse(girl.pendingActions); } catch {} }

  // 获取最近聊天记录
  const chatLogs = await prisma.chatLog.findMany({
    where: { girlId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      content: true,
      receiverName: true,
      createdAt: true,
      type: true,
    }
  });

  // 获取朋友圈截图
  const screenshots = await prisma.chatScreenshot.findMany({
    where: { girlId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      chatText: true,
      notes: true,
      createdAt: true,
    }
  });

  // 格式化聊天记录
  const chatLogsText = chatLogs.length > 0
    ? chatLogs.map((log, i) => {
        const sender = log.type === 'text' ? '男生' : '女生';
        const date = new Date(log.createdAt).toLocaleDateString('zh-CN');
        return `[${date}] ${sender}: ${log.content}`;
      }).join('\n')
    : '暂无聊天记录';

  // 格式化截图
  const screenshotsText = screenshots.length > 0
    ? screenshots.map(s => {
        const date = new Date(s.createdAt).toLocaleDateString('zh-CN');
        return `[${date}] ${s.chatText || s.notes || '（无文字）'}`;
      }).join('\n')
    : '暂无截图';

  // 格式化信号
  const signalsText = signals.slice(-5).map(s => {
    const date = new Date(s.date).toLocaleDateString('zh-CN');
    return `[${date}] ${s.event || s.content || s}`;
  }).join('\n') || '暂无信号记录';

  // 格式化观察
  const obsText = observations.slice(-3).map(o => {
    const date = new Date(o.date || o.createdAt).toLocaleDateString('zh-CN');
    return `[${date}] ${o.content || o.note || o.event || ''}`;
  }).join('\n') || '暂无备注';

  return {
    name: girl.name,
    relationshipStage: girl.relationshipStage,
    tensionScore: girl.tensionScore,
    lastContact: girl.lastContact ? new Date(girl.lastContact).toLocaleDateString('zh-CN') : '未知',
    chatLogs: chatLogsText,
    screenshots: screenshotsText,
    observations: obsText,
    signals: signalsText,
    pendingActions: pendingActions.map(a => a.action || a).join(', ') || '无',
  };
}

/**
 * 综合分析女生的反撇风险
 * @param {string} girlId
 * @returns {object} { success, analysis }
 */
async function analyzeGirlOverall(girlId) {
  const girl = await prisma.girl.findUnique({ where: { id: girlId } });
  if (!girl) throw new Error('女生不存在');

  const context = await buildContext(girlId);
  if (!context) throw new Error('女生不存在');

  const prompt = buildReversalPrompt(context);
  const content = await callAI(prompt);
  const analysis = parseAIResponse(content);

  if (!analysis) {
    return {
      success: false,
      error: 'AI 返回格式异常',
    };
  }

  // 规范化输出
  const normalized = {
    girlId,
    isReversal: analysis.isReversal || false,
    type: analysis.type || null,
    confidence: Math.min(100, Math.max(0, analysis.confidence || 0)),
    riskLevel: analysis.riskLevel || 'none',
    evidence: Array.isArray(analysis.evidence) ? analysis.evidence : [],
    signals: Array.isArray(analysis.signals) ? analysis.signals : [],
    timeline: Array.isArray(analysis.timeline) ? analysis.timeline : [],
    suggestion: analysis.suggestion || '',
    differential: analysis.differential || '',
    rawResponse: content,
    analyzedAt: new Date().toISOString(),
  };

  // 持久化到 DB（Upsert）
  try {
    await prisma.reversalAnalysis.upsert({
      where: { id: girlId },  // 用 girlId 作为 id（每个女生只保留最新分析）
      create: {
        id: girlId,
        girlId,
        clientId: girl.clientId,
        isReversal: normalized.isReversal,
        type: normalized.type,
        confidence: normalized.confidence,
        riskLevel: normalized.riskLevel,
        evidence: JSON.stringify(normalized.evidence),
        signals: JSON.stringify(normalized.signals),
        timeline: JSON.stringify(normalized.timeline),
        suggestion: normalized.suggestion,
        differential: normalized.differential,
        rawResponse: normalized.rawResponse,
      },
      update: {
        isReversal: normalized.isReversal,
        type: normalized.type,
        confidence: normalized.confidence,
        riskLevel: normalized.riskLevel,
        evidence: JSON.stringify(normalized.evidence),
        signals: JSON.stringify(normalized.signals),
        timeline: JSON.stringify(normalized.timeline),
        suggestion: normalized.suggestion,
        differential: normalized.differential,
        rawResponse: normalized.rawResponse,
      }
    });
  } catch (e) {
    console.warn('[ReversalDetector] 持久化分析结果失败:', e.message);
  }

  return { success: true, analysis: normalized };
}

/**
 * 快速判断反撇风险等级（不调用 AI，基于规则）
 */
async function getReversalRisk(girlId) {
  const girl = await prisma.girl.findUnique({ where: { id: girlId } });
  if (!girl) return null;

  let signals = [];
  let observations = [];
  if (girl.signals) { try { signals = JSON.parse(girl.signals); } catch {} }
  if (girl.observations) { try { observations = JSON.parse(girl.observations); } catch {} }

  // 检查关键词（与 alertEngine 同步）
  const allItems = [...signals, ...observations];
  let matchedKeywords = [];

  for (const item of allItems) {
    const text = (item.event || item.content || item.note || '').toLowerCase();
    matchedKeywords = matchedKeywords.concat(REVERSAL_KEYWORDS.filter(k => text.includes(k)));
  }

  if (matchedKeywords.length >= 2) {
    return { riskLevel: 'high', matchedKeywords: [...new Set(matchedKeywords)] };
  }
  if (matchedKeywords.length === 1) {
    return { riskLevel: 'medium', matchedKeywords };
  }

  // 检查热度
  if (girl.tensionScore && girl.tensionScore < 4) {
    return { riskLevel: 'medium', reason: 'tensionScore偏低' };
  }

  return { riskLevel: 'low', matchedKeywords: [] };
}

/**
 * 反撇关键词（与 alertEngine.js 保持同步，使用最完整的合并列表）
 */
const REVERSAL_KEYWORDS = ['冷淡', '敷衍', '消失', '已读不回', '不回', '不回消息', '态度变差', '突然不回', '爱理不理', '忽冷忽热', '热度下降', '变冷', '冷落', '不回话'];

module.exports = {
  analyzeGirlOverall,
  getReversalRisk,
  REVERSAL_TYPES,
  RISK_LEVELS,
  REVERSAL_KEYWORDS,
};

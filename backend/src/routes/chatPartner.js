/**
 * 实战聊天路由 - 操盘手帮客户和女生聊天的 AI 军师
 *
 * 核心功能：
 * - 粘贴女生发来的消息
 * - AI 分析意图 + 生成多条回复建议（基于完整档案上下文）
 * - 操盘手选择建议后，保存到代聊记录 + 触发反馈闭环（更新热度、记录信号）
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { buildAICoachContext } = require('../services/contextBuilder');
const { executeTool } = require('../coaches/skills');

const prisma = new PrismaClient();
const { JWT_SECRET, getAIConfig } = require('../config');

/**
 * 待审核更新队列（内存）
 * 结构：Map<girlId, PendingUpdate[]>
 * PendingUpdate: { id, operatorId, clientId, girlId, logId, replyText,
 *   originalGirlMessage, style, intention, createdAt, status: 'pending'|'approved'|'rejected',
 *   analysis: { tensionChange, signalType, signalEvent, newSignals, learning } }
 */
const pendingUpdates = new Map();

/**
 * 生成待审核更新 ID
 */
function makeUpdateId() {
  return `pu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 获取女生的待审核更新（倒序，新到旧）
 */
function getPendingForGirl(girlId) {
  const updates = pendingUpdates.get(girlId) || [];
  return updates.filter(u => u.status === 'pending').reverse();
}

/**
 * 异步执行反馈分析（不阻塞主流程）
 * 分析采纳的建议会对女生档案产生什么变化，但暂时不写入，只返回变化内容
 */
async function runAsyncFeedbackAnalysis({ girlId, clientId, operatorId, logId, replyText, originalGirlMessage, style, intention }) {
  const updateId = makeUpdateId();

  // 热度调整映射（和 /feedback 里一致）
  const tensionAdjustments = {
    '进攻型': 1, '暧昧型': 1.5, '浪漫型': 1.5, '试探型': 0.5,
    '推进型': 1, '调侃型': 0.5, '制造暧昧': 1, '推进关系': 1,
    '稳妥型': 0, '破冰型': 0, '自然型': 0, '探索型': 0,
    '陪伴型': 0, '关心型': 0, '默契型': 0,
    '维持联系': 0, '维持舒适感': 0, '维持': 0,
    '自然型优化': 0.5, '温度型优化': 1, '性格型优化': 0.5,
  };

  const adjustment = tensionAdjustments[intention] || tensionAdjustments[style] || 0;
  const signalType = adjustment > 0 ? 'positive' : adjustment < 0 ? 'negative' : 'neutral';
  const signalEvent = adjustment > 0
    ? `采纳"${style}"回复，对方回应积极，关系推进信号`
    : `采纳"${style}"回复，维持互动`;

  // 分析消息内容，推断热度变化原因和新增信号
  const analysisResult = {
    tensionChange: adjustment,
    signalType,
    signalEvent,
    newSignals: [
      { type: signalType, event: signalEvent, date: new Date().toISOString() }
    ],
    // record_learning 的内容（异步，不写库）
    learning: {
      style,
      intention,
      replyText: replyText.slice(0, 50),
      result: adjustment > 0 ? 'positive' : adjustment < 0 ? 'negative' : 'neutral',
      timestamp: new Date().toISOString()
    },
    // 可供操盘手审核的字段变化
    fieldChanges: {
      tensionScore: adjustment !== 0 ? { delta: adjustment, reason: signalEvent } : null,
      signals: [{ type: signalType, event: signalEvent }],
    }
  };

  // 写入待审核队列
  const update = {
    id: updateId,
    operatorId,
    clientId,
    girlId,
    logId,
    replyText,
    originalGirlMessage,
    style,
    intention,
    createdAt: new Date().toISOString(),
    status: 'pending',
    analysis: analysisResult
  };

  const existing = pendingUpdates.get(girlId) || [];
  existing.push(update);
  pendingUpdates.set(girlId, existing);

  // 异步执行 record_learning（不影响主流程）
  setImmediate(async () => {
    try {
      await executeTool('record_learning', {
        clientId,
        girlId,
        event: signalEvent,
        result: adjustment > 0 ? 'positive' : 'neutral',
        message: replyText
      });
    } catch (e) {
      console.warn('[PendingUpdates] record_learning 失败:', e.message);
    }
  });

  console.log(`[PendingUpdates] 生成待审核更新 ${updateId} for girl ${girlId}`);
  return updateId;
}

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'token无效' });
  }
};

function getTensionEmoji(score) {
  if (score >= 8) return '🔥🔥🔥';
  if (score >= 7) return '🔥🔥';
  if (score >= 5) return '🔥';
  if (score >= 3) return '❄️';
  return '❄️❄️';
}

/**
 * 话术优化 - 操盘手粘贴自己准备发的话，AI 给出优化版本
 * POST /api/chat-partner/optimize-message
 *
 * 改动：
 * - 接入 contextBuilder，吃完整档案
 * - 基于女生性格、关系阶段给出定制化优化
 * - 返回多条不同风格的优化版本
 */
router.post('/optimize-message', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId, myMessage, history = [] } = req.body;

    if (!myMessage) {
      return res.status(400).json({ error: '消息内容是必需的' });
    }

    const context = girlId
      ? await buildAICoachContext(req.user.id, girlId)
      : { girlInfo: null, recentSignals: [], pendingActions: [], observations: [], conversationSummary: '' };

    const { girlInfo, recentSignals, pendingActions, observations, conversationSummary } = context;

    let personality = {};
    if (girlInfo?.personality) {
      try { personality = girlInfo.personality; } catch {}
    }

    const stage = girlInfo?.stage || '聊天';
    const historyString = history.slice(-10).map(m => {
      const role = m.role === 'user' ? '我（客户）' : (girlInfo?.name || '女生');
      return `${role}: ${m.content}`;
    }).join('\n');

    const systemPrompt = `你是一个专业的聊天话术优化专家。你擅长把平淡或生硬的回复优化成有温度、有情商、有吸引力的聊天内容。

【女生档案】
昵称：${girlInfo?.name || '未知'}
当前阶段：${stage}
关系热度：${girlInfo?.tensionScore || 5}/10 ${getTensionEmoji(girlInfo?.tensionScore || 5)}
亲密度：${'❤️'.repeat(girlInfo?.intimacyLevel || 1)}

【性格画像】
MBTI：${personality.mbti || '未知'}
沟通风格：${personality.communicationStyle || '未知'}
情绪触发点：${personality.emotionalTriggers?.join('、') || '暂无'}
聊天禁忌：${personality.thingsToAvoid?.join('、') || '暂无'}
Talking Topics：${personality.talkingTopics?.join('、') || '未知'}

【近期关键信号】
${recentSignals.length > 0
  ? recentSignals.map(s => {
      const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
      return `${icon} ${s.event} — ${s.date}`;
    }).join('\n')
  : '暂无'}

【对话上下文】
${historyString || '（暂无历史记录）'}

【操盘手准备发送的内容】
"${myMessage}"

请给出 3 条不同风格的优化版本，按以下维度优化：
- 语气更自然（口语化、去生硬感）
- 更有温度（带情绪、少机械感）
- 更契合对方性格

每条优化要有明确的优化点说明，让操盘手知道好在哪里。

请按以下 JSON 格式返回：
{
  "original": "原文：${myMessage}",
  "optimizations": [
    {"text": "优化版本1", "point": "优化点：...", "style": "自然型"},
    {"text": "优化版本2", "point": "优化点：...", "style": "温度型"},
    {"text": "优化版本3", "point": "优化点：...", "style": "性格型"}
  ]
}

只输出 JSON，不要其他内容。`;

    const aiConfig = getAIConfig();
    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: 'system', content: '你是一个专业的聊天话术优化专家，擅长把平淡的话优化成有温度、有吸引力的聊天内容。回复要口语化、有温度。' },
          { role: 'user', content: systemPrompt }
        ],
        temperature: 0.8,
        max_tokens: 1200
      })
    });

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || '';

    let result;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('[ChatPartner] 话术优化返回非 JSON 格式');
    }

    res.json({
      success: true,
      girlId: girlId || null,
      original: result?.original || myMessage,
      optimizations: result?.optimizations || [
        { text: myMessage, point: '暂无优化建议', style: '原版' }
      ],
      context: {
        stage,
        tensionScore: girlInfo?.tensionScore || 5,
        intimacyLevel: girlInfo?.intimacyLevel || 1,
        personalityMatch: personality.mbti ? `${personality.mbti} · ${personality.communicationStyle || '未知风格'}` : '未知'
      }
    });

  } catch (error) {
    console.error('[ChatPartner] 话术优化失败:', error);
    res.status(500).json({ error: '话术优化失败' });
  }
});

/**
 * AI 分析 + 建议回复（实战聊天核心 API）
 * POST /api/chat-partner/analyze
 *
 * 改动：
 * - 接入 contextBuilder，吃完整档案（性格、信号、待推进事项、观察记录）
 * - 注入聊天历史（最近10条）
 * - prompt 按关系阶段推荐回复风格
 */
router.post('/analyze', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId, message, history = [], operatorNotes } = req.body;

    if (!message) {
      return res.status(400).json({ error: '消息内容是必需的' });
    }

    // 使用 contextBuilder 构建完整上下文
    const context = girlId
      ? await buildAICoachContext(req.user.id, girlId)
      : { girlInfo: null, recentSignals: [], pendingActions: [], observations: [], conversationSummary: '' };

    const { girlInfo, recentSignals, pendingActions, observations, conversationSummary } = context;

    // 解析 personality
    let personality = {};
    if (girlInfo?.personality) {
      try { personality = girlInfo.personality; } catch {}
    }

    // 聊天历史（最近10条）
    const historyString = history.slice(-10).map(m => {
      const role = m.role === 'user' ? '我（客户）' : (girlInfo?.name || '女生');
      return `${role}: ${m.content}`;
    }).join('\n');

    // 近期信号
    const signalsText = recentSignals.length > 0
      ? recentSignals.map(s => {
          const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
          return `${icon} ${s.event} — ${s.date}`;
        }).join('\n')
      : '暂无';

    // 根据关系阶段决定默认风格
    const stage = girlInfo?.stage || '聊天';
    const stageStyleMap = {
      '陌生': ['稳妥型', '破冰型', '探索型'],
      '搭讪': ['稳妥型', '自然型', '幽默型'],
      '聊天': ['稳妥型', '进攻型', '调侃型'],
      '暧昧': ['进攻型', '暧昧型', '试探型'],
      '约会': ['浪漫型', '推进型', '调侃型'],
      '长期': ['陪伴型', '关心型', '默契型'],
    };
    const defaultStyles = stageStyleMap[stage] || ['稳妥型', '进攻型', '调侃型'];

    // 构建提示词
    const systemPrompt = `你是一个专业的恋爱军师和沟通顾问，擅长分析女生聊天对话并提供高情商回复建议。

【女生档案】
昵称：${girlInfo?.name || '未知'}
年龄：${girlInfo?.age || '未知'}
职业：${girlInfo?.occupation || '未知'}
当前阶段：${stage}
关系热度：${girlInfo?.tensionScore || 5}/10 ${getTensionEmoji(girlInfo?.tensionScore || 5)}
亲密度：${'❤️'.repeat(girlInfo?.intimacyLevel || 1)}

【性格画像】
MBTI：${personality.mbti || '未知'}
沟通风格：${personality.communicationStyle || '未知'}
情绪触发点：${personality.emotionalTriggers?.join('、') || '暂无'}
聊天禁忌：${personality.thingsToAvoid?.join('、') || '暂无'}
Talking Topics：${personality.talkingTopics?.join('、') || '未知'}
擅长话题：${personality.humorStyle || personality.talkingTopics?.join('、') || '暂无'}

【近期关键信号（近30天）】
${signalsText}

【待推进事项】
${pendingActions.length > 0 ? pendingActions.map(a => `- ${a}`).join('\n') : '暂无'}

【观察记录】
${observations.length > 0 ? observations.map(o => `- ${o}`).join('\n') : '暂无'}

【对话摘要】
${conversationSummary || '暂无'}

【聊天历史】
${historyString || '（暂无历史记录）'}

【操盘手备注】
${operatorNotes || '无'}

对方（女生）刚刚发来消息："${message}"

请你：
1. 分析对方这句话的意图、情绪和潜台词
2. 结合上下文和女生性格，给出 3 条回复建议
3. 每条建议要口语化、15-30字、有明确的意图导向

回复风格应适配当前阶段（${stage}），优先使用该阶段适合的风格。

请按以下 JSON 格式返回：
{
  "analysis": "分析内容（80-150字），包括：意图、情绪、潜台词、建议策略",
  "suggestions": [
    {"text": "回复内容1", "style": "${defaultStyles[0]}", "intention": "意图说明"},
    {"text": "回复内容2", "style": "${defaultStyles[1]}", "intention": "意图说明"},
    {"text": "回复内容3", "style": "${defaultStyles[2]}", "intention": "意图说明"}
  ]
}

只输出 JSON，不要其他内容。`;

    const aiConfig = getAIConfig();
    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: 'system', content: '你是一个专业的恋爱军师和沟通顾问，擅长分析女生聊天对话并提供高情商回复建议。回复要口语化、有温度。' },
          { role: 'user', content: systemPrompt }
        ],
        temperature: 0.8,
        max_tokens: 1200
      })
    });

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || '';

    let result;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('[ChatPartner] AI 返回非 JSON 格式');
    }

    res.json({
      success: true,
      girlId: girlId || null,
      analysis: result?.analysis || '分析中...',
      suggestions: result?.suggestions || [
        { text: '嗯嗯，我在呢~', style: defaultStyles[0], intention: '维持联系' },
        { text: '想我啦？', style: defaultStyles[1], intention: '制造暧昧' },
        { text: '怎么突然找我呀？', style: defaultStyles[2], intention: '试探对方' }
      ],
      context: {
        stage,
        tensionScore: girlInfo?.tensionScore || 5,
        intimacyLevel: girlInfo?.intimacyLevel || 1,
        signalCount: recentSignals.length
      }
    });

  } catch (error) {
    console.error('[ChatPartner] 分析失败:', error);
    res.status(500).json({ error: '分析失败' });
  }
});

/**
 * 采纳建议后的反馈闭环（异步版本）
 * POST /api/chat-partner/feedback
 *
 * 流程：
 * 1. 同步保存到 chatLogs（立即返回 logId）
 * 2. 异步执行分析（add_signal / update_tension / record_learning）
 * 3. 结果写入 pendingUpdates 队列，不直接更新女生档案
 * 4. 前端轮询获取待审核更新，操盘手确认后再写入
 */
router.post('/feedback', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId, clientId, receiverName, chosenReply, originalGirlMessage, style, intention } = req.body;

    if (!girlId || !clientId || !chosenReply) {
      return res.status(400).json({ error: '参数不完整' });
    }

    // 1. 同步保存到代聊记录
    const log = await prisma.chatLog.create({
      data: {
        girlId,
        clientId,
        operatorId: req.user.id,
        receiverName: receiverName || '女生',
        content: chosenReply,
        aiAdopted: true,
        aiAnalysis: originalGirlMessage ? `女生原文: ${originalGirlMessage}` : null
      }
    });

    // 2. 异步执行反馈分析（不等待，写入 pendingUpdates）
    const updateId = await runAsyncFeedbackAnalysis({
      girlId,
      clientId,
      operatorId: req.user.id,
      logId: log.id,
      replyText: chosenReply,
      originalGirlMessage,
      style: style || '建议',
      intention: intention || ''
    });

    res.json({
      success: true,
      logId: log.id,
      feedbackId: updateId,
      status: 'pending_review'
    });

  } catch (error) {
    console.error('[ChatPartner] 反馈保存失败:', error);
    res.status(500).json({ error: '反馈保存失败' });
  }
});

/**
 * 获取女生的待审核更新
 * GET /api/chat-partner/pending-updates/:girlId
 */
router.get('/pending-updates/:girlId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId } = req.params;
    const updates = getPendingForGirl(girlId);

    // 附带女生当前状态（用于 diff）
    let currentGirl = null;
    if (girlId !== 'null' && girlId !== 'undefined') {
      try {
        currentGirl = await prisma.girl.findUnique({
          where: { id: girlId },
          select: {
            tensionScore: true,
            intimacyLevel: true,
            stage: true,
            signals: true
          }
        });
      } catch {}
    }

    res.json({
      success: true,
      updates,
      currentState: currentGirl ? {
        tensionScore: currentGirl.tensionScore,
        intimacyLevel: currentGirl.intimacyLevel,
        stage: currentGirl.stage,
        signals: currentGirl.signals || []
      } : null
    });

  } catch (error) {
    console.error('[ChatPartner] 获取待审核更新失败:', error);
    res.status(500).json({ error: '获取待审核更新失败' });
  }
});

/**
 * 批量审核待审核更新（全部采纳或全部忽略）
 * POST /api/chat-partner/approve-updates
 */
router.post('/approve-updates', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { updateIds, approve } = req.body;

    if (!Array.isArray(updateIds)) {
      return res.status(400).json({ error: 'updateIds 必须是数组' });
    }

    const results = [];

    for (const updateId of updateIds) {
      // 找到这条更新
      let found = null;
      for (const [girlId, updates] of pendingUpdates.entries()) {
        const idx = updates.findIndex(u => u.id === updateId && u.status === 'pending');
        if (idx !== -1) {
          found = updates[idx];
          found.status = approve ? 'approved' : 'rejected';
          break;
        }
      }

      if (!found) {
        results.push({ updateId, success: false, reason: '未找到或已处理' });
        continue;
      }

      if (approve) {
        // 执行实际的档案更新
        const { girlId, analysis } = found;

        try {
          if (analysis.fieldChanges.tensionScore) {
            await executeTool('update_tension', {
              girlId,
              adjustment: analysis.fieldChanges.tensionScore.delta,
              reason: `操盘手审核采纳: ${analysis.fieldChanges.tensionScore.reason}`
            });
          }

          if (analysis.newSignals?.length > 0) {
            for (const signal of analysis.newSignals) {
              await executeTool('add_signal', {
                girlId,
                type: signal.type,
                event: signal.event
              });
            }
          }
        } catch (toolError) {
          console.warn(`[PendingUpdates] apply update ${updateId} failed:`, toolError);
        }
      }

      results.push({ updateId, success: true, approved: approve });
    }

    res.json({ success: true, results });

  } catch (error) {
    console.error('[ChatPartner] 审核更新失败:', error);
    res.status(500).json({ error: '审核更新失败' });
  }
});

/**
 * 单独采纳一条待审核更新
 * POST /api/chat-partner/apply-update/:updateId
 */
router.post('/apply-update/:updateId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { updateId } = req.params;
    let found = null;
    let foundGirlId = null;

    for (const [girlId, updates] of pendingUpdates.entries()) {
      const idx = updates.findIndex(u => u.id === updateId && u.status === 'pending');
      if (idx !== -1) {
        found = updates[idx];
        foundGirlId = girlId;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ error: '未找到待审核更新' });
    }

    found.status = 'approved';

    // 执行档案更新
    const { analysis } = found;
    if (analysis.fieldChanges.tensionScore) {
      await executeTool('update_tension', {
        girlId: foundGirlId,
        adjustment: analysis.fieldChanges.tensionScore.delta,
        reason: `操盘手审核采纳: ${analysis.fieldChanges.tensionScore.reason}`
      });
    }

    if (analysis.newSignals?.length > 0) {
      for (const signal of analysis.newSignals) {
        await executeTool('add_signal', {
          girlId: foundGirlId,
          type: signal.type,
          event: signal.event
        });
      }
    }

    res.json({ success: true, updateId, approved: true });

  } catch (error) {
    console.error('[ChatPartner] 采纳更新失败:', error);
    res.status(500).json({ error: '采纳更新失败' });
  }
});

/**
 * 获取女生的聊天历史（从代聊记录）
 * GET /api/chat-partner/history/:girlId
 */
router.get('/history/:girlId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId } = req.params;
    const { limit = 50 } = req.query;

    const logs = await prisma.chatLog.findMany({
      where: { girlId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    const history = logs.reverse().map(log => ({
      role: 'user',
      content: log.content,
      timestamp: log.createdAt,
      aiAdopted: log.aiAdopted,
      id: log.id
    }));

    res.json({ success: true, history });

  } catch (error) {
    console.error('[ChatPartner] 获取历史失败:', error);
    res.status(500).json({ error: '获取历史失败' });
  }
});

/**
 * 保存代聊消息（保留原有端点，简化逻辑）
 * POST /api/chat-partner/send
 */
router.post('/send', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId, clientId, receiverName, content, aiAdopted = false, originalMessage } = req.body;

    if (!girlId || !clientId || !content) {
      return res.status(400).json({ error: '参数不完整' });
    }

    const log = await prisma.chatLog.create({
      data: {
        girlId,
        clientId,
        operatorId: req.user.id,
        receiverName,
        content,
        aiAdopted,
        aiAnalysis: originalMessage ? `原文: ${originalMessage}` : null
      }
    });

    res.json({ success: true, log });

  } catch (error) {
    console.error('[ChatPartner] 保存失败:', error);
    res.status(500).json({ error: '保存失败' });
  }
});

module.exports = router;

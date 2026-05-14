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
const fs = require('fs');
const path = require('path');
const { buildAICoachContext } = require('../services/contextBuilder');
const { executeTool } = require('../coaches/skills');
const { extractFromChat: extractGirlFromChat } = require('../services/girlProfileExtractor');
const { extractFromChat: extractClientFromChat } = require('../services/clientProfileExtractor');
const { GIRL_FIELD_LABELS, CLIENT_FIELD_LABELS, callVisionModel } = require('../services/profileEngine');

const { JWT_SECRET, getAIConfig, getVLModelConfig } = require('../config');
const prisma = require('../prisma');
const membershipService = require('../services/membershipService');
const activityService = require('../services/activityService');

/**
 * 待审核更新队列（数据库驱动，不再使用内存 Map）
 * 写入：runAsyncFeedbackAnalysis() → PendingProfileUpdate 表
 * 读取：/pending-updates → DB 查询
 * 审核：/approve-updates → DB 更新 status
 */


/**
 * 异步执行反馈分析（不阻塞主流程）
 * 分析采纳的建议会对女生档案产生什么变化，写入数据库待审核队列
 */
async function runAsyncFeedbackAnalysis({ girlId, clientId, operatorId, logId, replyText, originalGirlMessage, style, intention }) {
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

  // 构建分析数据（写入数据库）
  const analysisResult = {
    tensionChange: adjustment,
    signalType,
    signalEvent,
    newSignals: [
      { type: signalType, event: signalEvent, date: new Date().toISOString() }
    ],
    // fieldChanges 供审核时使用
    fieldChanges: {
      tensionScore: adjustment !== 0 ? { delta: adjustment, reason: signalEvent } : null,
      signals: [{ type: signalType, event: signalEvent }],
    },
    // record_learning 的内容（异步，不写库）
    learning: {
      style,
      intention,
      replyText: replyText.slice(0, 50),
      result: adjustment > 0 ? 'positive' : adjustment < 0 ? 'negative' : 'neutral',
      timestamp: new Date().toISOString()
    }
  };

  // 写入数据库待审核队列（持久化，重启不丢失）
  const pending = await prisma.pendingProfileUpdate.create({
    data: {
      targetType: 'girl',
      targetId: girlId,
      source: 'chat_feedback',
      operatorId,
      profileContext: JSON.stringify({
        girlId,
        clientId,
        logId,
        replyText,
        originalGirlMessage,
        style,
        intention
      }),
      analysisData: JSON.stringify(analysisResult),
      adoptedReply: replyText,
      replyStyle: style,
      status: 'pending'
    }
  });

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

  console.log(`[PendingUpdates] 生成待审核更新 ${pending.id} for girl ${girlId}`);
  return pending.id;
}

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ error: { code: 'A0101', message: '未登录' } });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: { code: 'A0102', message: '认证令牌无效' } });
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
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    // 试用限制检查
    try {
      await membershipService.checkTrialLimit(req.user.id, 'chat_optimize');
      await membershipService.useTrialCount(req.user.id);
    } catch (e) {
      return res.status(403).json({ error: { code: 'A0108', message: e.message } });
    }

    const { girlId, myMessage, history = [] } = req.body;

    if (!myMessage) {
      return res.status(400).json({ error: { code: 'S0803', message: '消息内容是必需的' } });
    }

    const context = girlId
      ? await buildAICoachContext(req.user.id, girlId)
      : { girlInfo: null, recentSignals: [], pendingActions: [], observations: [], conversationSummary: '' };

    const { girlInfo, recentSignals, pendingActions, observations, conversationSummary } = context;

    let personality = {};
    if (girlInfo?.personality) {
      try { personality = girlInfo.personality; } catch (e) { console.warn('[ChatPartner] personality 赋值失败:', e.message); }
    }

    const stage = girlInfo?.stage || '聊天';
    const historyString = history.slice(-10).map(m => {
      const role = m.role === 'user' ? '我（客户）' : (girlInfo?.name || '女生');
      return `${role}: ${m.content}`;
    }).join('\n');

    const systemPrompt = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验，真诚自然，不油腔滑调，不套路撩骚。

你是一个专业的话术优化专家。你擅长把平淡或生硬的回复优化成有温度、有情商、有吸引力的聊天内容。

请从以下4个维度优化操盘手准备发送的回复：

优化维度：
1. **语气自然度**：口语化、去生硬感。像正常聊天，不要像背台词。
2. **情绪温度**：带情绪、少机械感。不要干巴巴的信息传递，要有互动感。
3. **性格契合度**：更契合女生性格（${girlInfo?.name || '女生'}是${personality.communicationStyle || '未知'}风格，${personality.mbti || '未知MBTI'}）。
4. **意图精准度**：服务于当前目的（推进关系/维持舒适感/试探/制造暧昧），优化版本要服务于这个目的。

【女生档案】
昵称：${girlInfo?.name || '未知'}
当前阶段：${stage}
关系热度：${girlInfo?.tensionScore || 5}/10 ${getTensionEmoji(girlInfo?.tensionScore || 5)}
亲密度：${'❤️'.repeat(girlInfo?.intimacyLevel || 1)}

【性格画像】
MBTI：${personality.mbti || '未知'}
沟通风格：${personality.communicationStyle || '未知'}
情绪触发点：${(personality.emotionalTriggers || []).join('、') || '暂无'}
聊天禁忌：${(personality.thingsToAvoid || []).join('、') || '暂无'}
喜欢话题：${(personality.talkingTopics || []).join('、') || '未知'}

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

请按以下 JSON 格式返回：
{
  "original": "${myMessage}",
  "optimizations": [
    {
      "text": "优化版本1（自然型）",
      "point": "优化点：语气更口语，像正常聊天，有互动感",
      "style": "自然型"
    },
    {
      "text": "优化版本2（温度型）",
      "point": "优化点：情绪更温暖，带一点调侃或暧昧的感觉",
      "style": "温度型"
    },
    {
      "text": "优化版本3（性格型）",
      "point": "优化点：更契合${personality.communicationStyle || '未知'}风格，${personality.talkingTopics?.[0] ? '融入' + personality.talkingTopics[0] + '话题' : '适配她的性格节奏'}",
      "style": "性格型"
    }
  ]
}

只输出 JSON，不要其他内容。优化版本要15-30字，不要超过30字。`;

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
    res.status(500).json({ error: { code: 'S0802', message: '话术优化失败，请稍后重试' } });
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
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId, message, history = [], operatorNotes } = req.body;

    if (!message) {
      return res.status(400).json({ error: { code: 'S0803', message: '消息内容是必需的' } });
    }

    // 使用 contextBuilder 构建完整上下文
    const context = girlId
      ? await buildAICoachContext(req.user.id, girlId)
      : { girlInfo: null, recentSignals: [], pendingActions: [], observations: [], conversationSummary: '' };

    const { girlInfo, recentSignals, pendingActions, observations, conversationSummary } = context;

    // 解析 personality
    let personality = {};
    if (girlInfo?.personality) {
      try { personality = girlInfo.personality; } catch (e) { console.warn('[ChatPartner] personality 赋值失败:', e.message); }
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
    const systemPrompt = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验，真诚自然，不油腔滑调，不套路撩骚。

分析女生刚刚发来的消息，结合她的完整档案，给出专业分析和高情商回复建议。

【女生档案】
昵称：${girlInfo?.name || '未知'}
年龄：${girlInfo?.age || '未知'}
职业：${girlInfo?.occupation || '未知'}
当前阶段：${stage}
关系热度：${girlInfo?.tensionScore || 5}/10 ${getTensionEmoji(girlInfo?.tensionScore || 5)}
亲密度：${'❤️'.repeat(girlInfo?.intimacyLevel || 1)}

【外貌与风格】
外貌：${girlInfo?.appearance || '未知'}
穿着风格：${personality.dressingStyle || '未知'}
风格标签：${personality.styleTags || '未知'}

【性格画像】
MBTI：${personality.mbti || '未知'}
性格：${personality.type || personality.personality || '未知'}
沟通风格：${personality.communicationStyle || '未知'}
情绪触发点：${(personality.emotionalTriggers || []).join('、') || '暂无'}
聊天禁忌：${(personality.thingsToAvoid || []).join('、') || '暂无'}
喜欢话题：${(personality.talkingTopics || []).join('、') || '未知'}
婚恋态度：${personality.relationshipAttitude || '未知'}
依恋类型：${personality.attachmentStyle || '未知'}
回复规律：${personality.responsePattern || '未知'}
爱的语言：${personality.loveLanguage || '未知'}
防御机制：${personality.defenseMechanism || '暂无'}
核心羞耻感：${personality.coreShame || '暂无'}

【近期关键信号（近30天）】
${signalsText}

【待推进事项】
${pendingActions.length > 0 ? pendingActions.map(a => `- ${a}`).join('\n') : '暂无'}

【观察记录】
${observations.length > 0 ? observations.map(o => `- ${o}`).join('\n') : '暂无'}

【对话摘要】
${conversationSummary || '暂无'}

【聊天历史（最近10条）】
${historyString || '（暂无历史记录）'}

【操盘手备注】
${operatorNotes || '无'}

【女生刚刚发来的消息】
"${message}"

请按以下8个维度进行分析，然后给出回复建议：

1. **意图识别**：她这句话想达到什么目的？（了解信息/表达好感/试探邀约/调侃/敷衍/冷淡/求关注/撒娇/抱怨等）
2. **情绪状态**：她当前的情绪如何？（开心/害羞/犹豫/期待/紧张/淡定/冷漠/烦躁等）
3. **潜台词**：她没明说但暗示了什么？有没有弦外之音？
4. **关系信号**：她有没有释放积极信号？（主动/秒回/分享日常/暧昧称呼/身体接触暗示）
5. **风险识别**：有没有需要注意的雷区？（触及情绪触发点/聊天禁忌/过于直接/时机不对）
6. **时机判断**：当前热度（${girlInfo?.tensionScore || 5}/10）适合推进还是维持？
7. **回复策略**：应该用什么风格推进？（${defaultStyles.join('、')}）
8. **档案更新**：从这句话能提取哪些新信息？（职业/年龄/爱好/性格/偏好等）

结合关系阶段（${stage}）和女生性格，给出3条回复建议。每条要口语化、15-30字、有明确的意图导向。

回复风格优先使用：${defaultStyles.join('、')}

请按以下 JSON 格式返回：
{
  "analysis": "分析内容（100-200字），覆盖意图、情绪、潜台词、关系信号、风险、时机、策略",
  "intent": "意图标签（3个词内）",
  "emotion": "情绪状态（2个词）",
  "subtext": "潜台词（20字内，如有）",
  "riskWarning": "风险提示（如有，20字内）",
  "timingAdvice": "时机建议（10字内）",
  "suggestions": [
    {"text": "回复内容1", "style": "${defaultStyles[0]}", "intention": "意图说明（推进关系/制造暧昧/试探/维持舒适感等）"},
    {"text": "回复内容2", "style": "${defaultStyles[1]}", "intention": "意图说明"},
    {"text": "回复内容3", "style": "${defaultStyles[2]}", "intention": "意图说明"}
  ]
}

只输出 JSON，不要其他内容。`;

    // 并行执行：AI 回复建议 + 档案字段提取（一次 fetch，复用结果）
    const aiConfig = getAIConfig();
    const [replyResult, profileResult] = await Promise.allSettled([
      // AI 回复建议
      fetch(aiConfig.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { role: 'user', content: systemPrompt }
          ],
          temperature: 0.8,
          max_tokens: 1500
        })
      }),
      // 档案字段提取（女生 + 客户）
      Promise.all([
        girlId ? extractGirlFromChat(girlId, req.user.id, message, { history, pendingActions, observations, conversationSummary }) : Promise.resolve(null),
        clientId ? extractClientFromChat(clientId, req.user.id, message, { recentMessages: history }) : Promise.resolve(null)
      ])
    ]);

    // 解析回复建议
    let replySuggestions = [
      { text: '嗯嗯，我在呢~', style: defaultStyles[0], intention: '维持联系' },
      { text: '想我啦？', style: defaultStyles[1], intention: '制造暧昧' },
      { text: '怎么突然找我呀？', style: defaultStyles[2], intention: '试探对方' }
    ];
    let replyAnalysis = '分析中...';

    if (replyResult.status === 'fulfilled' && replyResult.value.ok) {
      const replyData = await replyResult.value.json();
      const aiContent = replyData.choices?.[0]?.message?.content || '';
      try {
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          replyAnalysis = parsed.analysis || replyAnalysis;
          replySuggestions = parsed.suggestions || replySuggestions;
          // 新字段
          if (parsed.intent) context.intent = parsed.intent;
          if (parsed.emotion) context.emotion = parsed.emotion;
          if (parsed.subtext) context.subtext = parsed.subtext;
          if (parsed.riskWarning) context.riskWarning = parsed.riskWarning;
          if (parsed.timingAdvice) context.timingAdvice = parsed.timingAdvice;
        }
      } catch (e) { console.warn('[ChatPartner] replyAnalysis JSON 解析失败:', e.message); }
    }

    // 解析档案提取结果（女生 + 客户）
    let pendingFields = {};
    let profilePendingId = null;
    let clientPendingFields = {};
    let clientProfilePendingId = null;
    if (profileResult.status === 'fulfilled' && profileResult.value) {
      if (Array.isArray(profileResult.value)) {
        // [girlResult, clientResult]
        const [girlResult, clientResult] = profileResult.value;
        if (girlResult) {
          pendingFields = girlResult.pendingFields || {};
          profilePendingId = girlResult.pendingId;
        }
        if (clientResult) {
          clientPendingFields = clientResult.pendingFields || {};
          clientProfilePendingId = clientResult.pendingId;
        }
      } else {
        pendingFields = profileResult.value.pendingFields || {};
        profilePendingId = profileResult.value.pendingId;
      }
    }

    res.json({
      success: true,
      girlId: girlId || null,
      analysis: replyAnalysis,
      suggestions: replySuggestions,
      profilePendingId,  // 女生档案待确认 ID
      pendingFields,     // 女生待确认档案字段 { fieldKey: { label, value } }
      fieldLabels: GIRL_FIELD_LABELS,
      clientProfilePendingId, // 客户档案待确认 ID
      clientPendingFields,    // 客户待确认档案字段
      clientFieldLabels: CLIENT_FIELD_LABELS,
      context: {
        stage,
        tensionScore: girlInfo?.tensionScore || 5,
        intimacyLevel: girlInfo?.intimacyLevel || 1,
        signalCount: recentSignals.length
      }
    });

  } catch (error) {
    console.error('[ChatPartner] 分析失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '分析失败，请稍后重试' } });
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
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId, receiverName, chosenReply, originalGirlMessage, style, intention,
      profilePendingId, selectedProfileFields } = req.body;

    if (!girlId || !chosenReply) {
      return res.status(400).json({ error: { code: 'S0803', message: '参数不完整' } });
    }

    // 安全：从女生记录获取 clientId，防止操作不属于自己的客户数据
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    }
    // 客户端只能操作自己的女生
    if (req.user.role === 'client' && girl.clientId !== req.user.id) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    const clientId = girl.clientId;

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

    // 3. 处理档案字段确认（女生 + 客户）
    let profileConfirmResult = null;
    let clientProfileConfirmResult = null;
    if (profilePendingId) {
      try {
        const { confirmProfileUpdate } = require('../services/girlProfileExtractor');
        const fieldsToApply = selectedProfileFields === undefined ? {} : selectedProfileFields;
        profileConfirmResult = await confirmProfileUpdate(girlId, profilePendingId, fieldsToApply);
      } catch (e) {
        console.warn('[ChatPartner] 女生档案确认失败:', e.message);
      }
    }
    // 同时确认客户档案更新
    const { clientProfilePendingId, clientSelectedProfileFields } = req.body;
    if (clientProfilePendingId) {
      try {
        const { confirmProfileUpdate } = require('../services/clientProfileExtractor');
        const fieldsToApply = clientSelectedProfileFields === undefined ? {} : clientSelectedProfileFields;
        clientProfileConfirmResult = await confirmProfileUpdate(clientId, clientProfilePendingId, fieldsToApply);
      } catch (e) {
        console.warn('[ChatPartner] 客户档案确认失败:', e.message);
      }
    }

    res.json({
      success: true,
      logId: log.id,
      feedbackId: updateId,
      profileConfirm: profileConfirmResult,
      clientProfileConfirm: clientProfileConfirmResult,
      status: 'pending_review'
    });

  } catch (error) {
    console.error('[ChatPartner] 反馈保存失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '反馈保存失败，请稍后重试' } });
  }
});

/**
 * 获取女生的待审核更新
 * GET /api/chat-partner/pending-updates/:girlId
 */
router.get('/pending-updates/:girlId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId } = req.params;

    // 安全：操盘手只能访问自己负责的客户的女生
    if (req.user.role === 'admin') {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此女生数据' } });
    }

    // 从数据库查询待审核记录（包括 chat_feedback 和 chat_analyze 等来源）
    const pending = await prisma.pendingProfileUpdate.findMany({
      where: { targetType: 'girl', targetId: girlId, status: 'pending' },
      orderBy: { createdAt: 'desc' }
    });

    const updates = pending.map(p => ({
      id: p.id,
      operatorId: p.operatorId,
      source: p.source,
      createdAt: p.createdAt,
      status: p.status,
      analysis: JSON.parse(p.analysisData),
      profileContext: p.profileContext ? JSON.parse(p.profileContext) : null,
      adoptedReply: p.adoptedReply,
      replyStyle: p.replyStyle
    }));

    // 附带女生当前状态（用于 diff）
    let currentGirl = null;
    if (girlId && girlId !== 'null' && girlId !== 'undefined') {
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
      } catch (e) { console.warn('[ChatPartner] 女生状态查询失败 girlId:', girlId, e.message); }
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
    res.status(500).json({ error: { code: 'S0802', message: '获取待审核更新失败，请稍后重试' } });
  }
});

/**
 * 批量审核待审核更新（全部采纳或全部忽略）
 * POST /api/chat-partner/approve-updates
 */
router.post('/approve-updates', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { updateIds, approve } = req.body;

    if (!Array.isArray(updateIds)) {
      return res.status(400).json({ error: { code: 'S0803', message: 'updateIds必须是数组' } });
    }

    const results = [];

    for (const updateId of updateIds) {
      // 从数据库查找待审核记录
      const pending = await prisma.pendingProfileUpdate.findFirst({
        where: { id: updateId, status: 'pending' }
      });

      if (!pending) {
        results.push({ updateId, success: false, reason: '未找到或已处理' });
        continue;
      }

      // 安全：操盘手只能操作自己负责的客户的更新
      if (req.user.role === 'admin') {
        let targetClientId = null;
        if (pending.targetType === 'girl') {
          const girl = await prisma.girl.findUnique({ where: { id: pending.targetId } });
          if (!girl) { results.push({ updateId, success: false, reason: '女生不存在' }); continue; }
          targetClientId = girl.clientId;
        } else {
          targetClientId = pending.targetId;
        }
        const session = await prisma.chatSession.findFirst({
          where: { operatorId: req.user.id, clientId: targetClientId }
        });
        if (!session) { results.push({ updateId, success: false, reason: '无权限操作此更新' }); continue; }
      }

      // 更新数据库状态
      await prisma.pendingProfileUpdate.update({
        where: { id: updateId },
        data: { status: approve ? 'approved' : 'rejected' }
      });

      if (approve) {
        const analysis = JSON.parse(pending.analysisData);

        try {
          if (analysis.fieldChanges?.tensionScore) {
            await executeTool('update_tension', {
              girlId: pending.targetId,
              adjustment: analysis.fieldChanges.tensionScore.delta,
              reason: `操盘手审核采纳: ${analysis.fieldChanges.tensionScore.reason}`
            });
          }

          if (analysis.newSignals?.length > 0) {
            for (const signal of analysis.newSignals) {
              await executeTool('add_signal', {
                girlId: pending.targetId,
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
    res.status(500).json({ error: { code: 'S0802', message: '审核更新失败，请稍后重试' } });
  }
});

/**
 * 单独采纳一条待审核更新
 * POST /api/chat-partner/apply-update/:updateId
 */
router.post('/apply-update/:updateId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { updateId } = req.params;

    // 从数据库查找待审核记录
    const pending = await prisma.pendingProfileUpdate.findFirst({
      where: { id: updateId, status: 'pending' }
    });

    if (!pending) {
      return res.status(404).json({ error: { code: 'S0804', message: '未找到待审核更新' } });
    }

    // 安全：操盘手只能操作自己负责的客户的更新
    if (req.user.role === 'admin') {
      let targetClientId = null;
      if (pending.targetType === 'girl') {
        const girl = await prisma.girl.findUnique({ where: { id: pending.targetId } });
        if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
        targetClientId = girl.clientId;
      } else {
        targetClientId = pending.targetId;
      }
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: targetClientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限操作此更新' } });
    }

    // 更新数据库状态
    await prisma.pendingProfileUpdate.update({
      where: { id: updateId },
      data: { status: 'approved' }
    });

    // 执行档案更新
    const analysis = JSON.parse(pending.analysisData);
    if (analysis.fieldChanges?.tensionScore) {
      await executeTool('update_tension', {
        girlId: pending.targetId,
        adjustment: analysis.fieldChanges.tensionScore.delta,
        reason: `操盘手审核采纳: ${analysis.fieldChanges.tensionScore.reason}`
      });
    }

    if (analysis.newSignals?.length > 0) {
      for (const signal of analysis.newSignals) {
        await executeTool('add_signal', {
          girlId: pending.targetId,
          type: signal.type,
          event: signal.event
        });
      }
    }

    res.json({ success: true, updateId, approved: true });

  } catch (error) {
    console.error('[ChatPartner] 采纳更新失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '采纳更新失败，请稍后重试' } });
  }
});

/**
 * 获取女生的聊天历史（从代聊记录）
 * GET /api/chat-partner/history/:girlId
 */
router.get('/history/:girlId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId } = req.params;
    const { limit = 50 } = req.query;

    // 安全：操盘手只能访问自己负责的客户的女生
    if (req.user.role === 'admin') {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此女生历史记录' } });
    }

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
    res.status(500).json({ error: { code: 'S0802', message: '获取历史失败，请稍后重试' } });
  }
});

/**
 * 保存代聊消息（保留原有端点，简化逻辑）
 * POST /api/chat-partner/send
 */
router.post('/send', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId, receiverName, content, aiAdopted = false, originalMessage } = req.body;

    if (!girlId || !content) {
      return res.status(400).json({ error: { code: 'S0803', message: '参数不完整' } });
    }

    // 安全：从女生记录获取 clientId，防止操作不属于自己的客户数据
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    }
    // 客户端只能操作自己的女生
    if (req.user.role === 'client' && girl.clientId !== req.user.id) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    const clientId = girl.clientId;

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

    // 记录活跃度（仅客户端用户）
    if (req.user.role === 'client') {
      activityService.recordActivity(req.user.id, 'chat_message', {
        girlId,
        aiAdopted,
      }).catch(err => console.error(`[Activity] 记录chat_message失败: ${err.message}`));
    }

    res.json({ success: true, log });

  } catch (error) {
    console.error('[ChatPartner] 保存失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '保存失败，请稍后重试' } });
  }
});

/**
 * 客户聊天分析 - 操盘手和客户沟通时的 AI 军师
 * POST /api/chat-partner/client-analyze
 *
 * 和 /analyze 的区别：
 * - 上下文是客户档案（沟通风格、服务阶段、情绪状态、配合度）
 * - 目标是帮助操盘手更有效地与客户沟通
 * - 建议风格要适配客户的性格和沟通偏好
 */
router.post('/client-analyze', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    // 试用限制检查
    try {
      await membershipService.checkTrialLimit(req.user.id, 'reply_suggest');
      await membershipService.useTrialCount(req.user.id);
    } catch (e) {
      return res.status(403).json({ error: { code: 'A0108', message: e.message } });
    }

    const { clientId, message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: { code: 'S0803', message: '消息内容是必需的' } });
    }
    if (!clientId) {
      return res.status(400).json({ error: { code: 'S0803', message: 'clientId是必需的' } });
    }

    // 安全校验：验证 clientId 属于当前操盘手（通过会话关联校验）
    const operatorSession = await prisma.chatSession.findFirst({
      where: { clientId, operatorId: req.user.id }
    });
    if (!operatorSession) {
      return res.status(403).json({ error: { code: 'A0108', message: '无权操作此客户' } });
    }

    // 获取客户档案
    const client = await prisma.user.findUnique({ where: { id: clientId, role: 'client' } });
    if (!client) {
      return res.status(404).json({ error: { code: 'C0201', message: '客户不存在' } });
    }

    // 获取与该客户的聊天历史
    const session = await prisma.chatSession.findFirst({
      where: { clientId },
      orderBy: { updatedAt: 'desc' }
    });

    let recentMessages = [];
    if (session) {
      const msgs = await prisma.message.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      recentMessages = msgs.reverse().map(m => ({
        role: m.senderRole === 'operator' ? '操盘手' : '客户',
        content: m.content
      }));
    }

    const historyString = recentMessages.map(m => `${m.role}: ${m.content}`).join('\n') || '（暂无历史记录）';

    const clientType = client.clientType || '执行型';
    const communicationStyle = client.communicationStyle || '含蓄';
    const cooperation = client.coachCooperation || '配合';
    const serviceStage = client.serviceStage || '建池';


    // 沟通风格适配
    const styleMap = {
      '直接': ['直接型', '真诚型', '简洁型'],
      '含蓄': ['委婉型', '细腻型', '试探型'],
      '话多': ['耐心型', '互动型', '引导型'],
      '话少': ['精简型', '沉稳型', '观察型'],
    };
    const defaultStyles = styleMap[communicationStyle] || ['真诚型', '细腻型', '引导型'];

    const systemPrompt = `你是童锦程，情感咨询领域的老中医。你的风格：专业、精准、有温度，懂客户心理，能快速判断客户诉求并给出适配的沟通策略。

分析客户刚刚发来的消息，结合他的档案和服务阶段，给出专业的操盘手沟通建议。

【客户档案】
昵称：${client.nickname || client.username || '未知'}
服务阶段：${serviceStage}
沟通风格：${communicationStyle}
客户类型：${clientType}
配合度：${cooperation}
信任度：${client.trustLevel || 1}/5
互动热度：${client.interactionHeat || 5}/10

【性格画像】
性格：${client.personality || '未知'}
情绪稳定性：${client.emotionalStable ? client.emotionalStable + '/10' : '未知'}
情商水平：${client.eqLevel ? client.eqLevel + '/10' : '未知'}
社交风格：${client.socialStyle || '未知'}
婚恋态度：${client.relationshipAttitude || '未知'}
感情诉求：${client.emotionalGoal || '未知'}
自尊水平：${client.selfEsteemLevel || '未知'}
抗压能力：${client.antiFrustrationLevel ? client.antiFrustrationLevel + '/10' : '未知'}

【价值画像】
核心卖点：${client.strengths || '未知'}
价值短板：${client.weaknesses || '未知'}
自我价值认知：${client.selfValuePerception || '未知'}
学习能力：${client.learningAbility || '未知'}

【代聊风格偏好】
互动风格：${client.interactionStyle || '未知'}
幽默风格：${client.humorStyle || '未知'}
口头禅：${client.petPhrases || '暂无'}
代聊禁区：${client.chatTaboos || '暂无'}

【近期沟通记录（最近20条）】
${historyString}

客户刚刚发来消息："${message}"

请按以下8个维度进行分析，然后给出操盘手回复建议：

1. **意图识别**：客户这条消息想达到什么目的？（咨询/抱怨/催促/感谢/质疑/试探/倾诉/求安慰/给反馈/提建议）
2. **情绪状态**：客户当前情绪如何？（积极/中性/焦虑/抵触/期待/紧张/急躁/低落/平稳）
3. **潜台词**：客户没明说但暗示了什么？有没有弦外之音？
4. **配合度信号**：客户的配合度有没有变化？（更配合/更抵触/没变化）
5. **服务需求**：客户当前最需要什么？（专业分析/情绪安抚/具体建议/认可鼓励/更多信息/决策支持）
6. **信任度判断**：这条消息显示信任度上升还是下降？原因是什么？
7. **回复策略**：应该用什么风格沟通？（${defaultStyles.join('、')}）
8. **禁区检查**：这条消息有没有触及代聊禁区或敏感话题？

每条回复建议要适配客户的沟通偏好（${communicationStyle}风格），避开代聊禁区，15-30字，有明确的意图导向。

请按以下 JSON 格式返回：
{
  "analysis": "分析内容（100-200字），覆盖意图、情绪、潜台词、配合度、服务需求、信任度、策略",
  "intent": "意图标签（3个词内）",
  "emotion": "情绪状态（2个词）",
  "subtext": "潜台词（20字内，如有）",
  "cooperationSignal": "配合度变化（上升/下降/不变）",
  "trustSignal": "信任度变化（上浮/下降/不变）",
  "serviceNeed": "服务需求标签（3个词内）",
  "riskWarning": "禁区或敏感话题提示（如有，20字内）",
  "suggestions": [
    {"text": "回复内容1", "style": "${defaultStyles[0]}", "intention": "意图说明（安抚/分析/引导/确认/共情等）"},
    {"text": "回复内容2", "style": "${defaultStyles[1]}", "intention": "意图说明"},
    {"text": "回复内容3", "style": "${defaultStyles[2]}", "intention": "意图说明"}
  ],
  "summary": "对本轮对话的简短总结（50字以内），帮助操盘手快速掌握沟通要点"
}

只输出 JSON，不要其他内容。`;

    // 并行执行：AI 回复建议 + 档案字段提取（一次 fetch，复用结果）
    const aiConfig = getAIConfig();
    const [replyResult, profileResult] = await Promise.allSettled([
      // AI 回复建议
      fetch(aiConfig.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { role: 'user', content: systemPrompt }
          ],
          temperature: 0.8,
          max_tokens: 1500
        })
      }),
      // 档案字段提取
      extractClientFromChat(clientId, req.user.id, message, { recentMessages })
    ]);

    // 解析回复建议
    let replySuggestions = [
      { text: '收到，我来看看情况。', style: defaultStyles[0], intention: '确认收到' },
      { text: '嗯嗯，说说你的想法？', style: defaultStyles[1], intention: '引导表达' },
      { text: '这个情况我理解，我们来分析一下。', style: defaultStyles[2], intention: '共情+分析' }
    ];
    let replyAnalysis = '分析中...';
    let replySummary = '';

    if (replyResult.status === 'fulfilled' && replyResult.value.ok) {
      const replyData = await replyResult.value.json();
      const aiContent = replyData.choices?.[0]?.message?.content || '';
      try {
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          replyAnalysis = parsed.analysis || replyAnalysis;
          replySuggestions = parsed.suggestions || replySuggestions;
          replySummary = parsed.summary || '';
          // 新字段
          if (parsed.intent) context.intent = parsed.intent;
          if (parsed.emotion) context.emotion = parsed.emotion;
          if (parsed.subtext) context.subtext = parsed.subtext;
          if (parsed.cooperationSignal) context.cooperationSignal = parsed.cooperationSignal;
          if (parsed.trustSignal) context.trustSignal = parsed.trustSignal;
          if (parsed.serviceNeed) context.serviceNeed = parsed.serviceNeed;
          if (parsed.riskWarning) context.riskWarning = parsed.riskWarning;
        }
      } catch (e) { console.warn('[ChatPartner] context JSON 解析失败:', e.message); }
    }

    // 解析档案提取结果
    let pendingFields = {};
    let profilePendingId = null;
    if (profileResult.status === 'fulfilled' && profileResult.value) {
      pendingFields = profileResult.value.pendingFields || {};
      profilePendingId = profileResult.value.pendingId;
    }

    res.json({
      success: true,
      clientId,
      analysis: replyAnalysis,
      suggestions: replySuggestions,
      summary: replySummary,
      profilePendingId,
      pendingFields,
      fieldLabels: CLIENT_FIELD_LABELS,
      context: {
        serviceStage,
        communicationStyle,
        trustLevel: client.trustLevel || 1,
        interactionHeat: client.interactionHeat || 5,
        cooperation: client.coachCooperation || '配合'
      }
    });

  } catch (error) {
    console.error('[ChatPartner] 客户聊天分析失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '客户聊天分析失败，请稍后重试' } });
  }
});

/**
 * 客户聊天话术优化 - 操盘手准备发给客户的话，AI 给出优化版本
 * POST /api/chat-partner/client-optimize
 */
router.post('/client-optimize', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    // 试用限制检查
    try {
      await membershipService.checkTrialLimit(req.user.id, 'chat_optimize');
      await membershipService.useTrialCount(req.user.id);
    } catch (e) {
      return res.status(403).json({ error: { code: 'A0108', message: e.message } });
    }

    const { clientId, myMessage, history = [] } = req.body;

    if (!myMessage) {
      return res.status(400).json({ error: { code: 'S0803', message: '消息内容是必需的' } });
    }

    // 安全：操盘手只能优化自己负责的客户的消息
    if (req.user.role === 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限优化该客户的消息' } });
    }

    const context = await buildAICoachContext(req.user.id, null);
    const { client } = context;

    if (!client || client.role !== 'client') {
      return res.status(404).json({ error: { code: 'C0201', message: '客户不存在' } });
    }

    const communicationStyle = client.communicationStyle || '含蓄';
    const serviceStage = client.serviceStage || '建池';
    const cooperation = client.coachCooperation || '配合';
    const interactionStyle = client.interactionStyle || '细腻型';
    const humorStyle = client.humorStyle || '正经';
    const chatTaboos = client.chatTaboos || '暂无';
    const petPhrases = client.petPhrases || '暂无';

    const historyString = history.slice(-10).map(m => {
      const role = m.role === 'operator' ? '操盘手' : (client.nickname || '客户');
      return `${role}: ${m.content}`;
    }).join('\n');

    const systemPrompt = `你是童锦程，情感咨询领域的老中医。你的风格：专业、精准、有温度，懂客户心理，能快速判断客户诉求并给出适配的沟通策略。

你是一个专业的客户服务话术优化专家，帮助操盘手（情感咨询师）把准备发送给客户的回复优化得更专业、更有效。

请从以下4个维度优化操盘手准备发送的回复：

优化维度：
1. **专业度**：结构清晰、有理有据、不含糊，专业感
2. **温度感**：共情、理解、支持，让客户感受到被理解
3. **契合度**：更契合该客户性格（${communicationStyle}风格，${interactionStyle}互动，${serviceStage}阶段）
4. **意图达成**：服务于当前沟通目的（安抚/分析/引导/确认），优化版本要能达成这个目的

注意：绝对不能使用代聊禁区中的内容。

【客户档案】
昵称：${client.nickname || client.username || '未知'}
服务阶段：${serviceStage}
沟通风格：${communicationStyle}
配合度：${cooperation}
信任度：${client.trustLevel || 1}/5
互动热度：${client.interactionHeat || 5}/10

【性格画像】
情绪稳定性：${client.emotionalStable ? client.emotionalStable + '/10' : '未知'}
情商水平：${client.eqLevel ? client.eqLevel + '/10' : '未知'}
自尊水平：${client.selfEsteemLevel || '未知'}
抗压能力：${client.antiFrustrationLevel ? client.antiFrustrationLevel + '/10' : '未知'}
感情诉求：${client.emotionalGoal || '未知'}

【代聊风格偏好】
互动风格：${interactionStyle}
幽默风格：${humorStyle}
口头禅：${petPhrases}

【代聊禁区（绝对不能说）】
${chatTaboos}

【对话上下文】
${historyString || '（暂无历史记录）'}

【操盘手准备发送的内容】
"${myMessage}"

请按以下 JSON 格式返回：
{
  "original": "${myMessage}",
  "optimizations": [
    {
      "text": "优化版本1（专业型）",
      "point": "优化点：结构清晰、有理有据，专业感强",
      "style": "专业型"
    },
    {
      "text": "优化版本2（温度型）",
      "point": "优化点：共情理解、让客户感受到被支持",
      "style": "温度型"
    },
    {
      "text": "优化版本3（契合型）",
      "point": "优化点：更契合${communicationStyle}风格，${serviceStage}阶段适配",
      "style": "契合型"
    }
  ]
}

只输出 JSON，不要其他内容。优化版本要15-30字，不要超过30字。注意避开禁区。`;

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
      console.warn('[ChatPartner] 客户话术优化返回非 JSON 格式');
    }

    res.json({
      success: true,
      clientId,
      original: result?.original || myMessage,
      optimizations: result?.optimizations || [
        { text: myMessage, point: '暂无优化建议', style: '原版' }
      ],
      context: {
        serviceStage,
        communicationStyle,
        interactionStyle,
        cooperation
      }
    });

  } catch (error) {
    console.error('[ChatPartner] 客户话术优化失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '客户话术优化失败，请稍后重试' } });
  }
});

// ============================================================================
// 女生档案待确认管理
// ============================================================================

/**
 * 获取女生的待确认档案更新列表
 * GET /api/chat-partner/girl-profile/pending/:girlId
 */
router.get('/girl-profile/pending/:girlId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId } = req.params;

    // 安全：操盘手只能访问自己负责的客户的女生
    if (req.user.role === 'admin') {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此女生数据' } });
    }

    const { getPendingUpdates } = require('../services/girlProfileExtractor');
    const updates = await getPendingUpdates(girlId);

    res.json({ success: true, updates });
  } catch (error) {
    console.error('[ChatPartner] 获取女生待确认更新失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '获取待确认更新失败，请稍后重试' } });
  }
});

/**
 * 确认女生档案更新
 * POST /api/chat-partner/girl-profile/confirm
 */
router.post('/girl-profile/confirm', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId, pendingId, selectedFields } = req.body;
    if (!girlId || !pendingId) {
      return res.status(400).json({ error: { code: 'S0803', message: '参数不完整' } });
    }

    // 安全：操盘手只能操作自己负责的客户的女生
    if (req.user.role === 'admin') {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限操作此女生数据' } });
    }

    const { confirmProfileUpdate } = require('../services/girlProfileExtractor');
    const result = await confirmProfileUpdate(girlId, pendingId, selectedFields);

    if (!result.success) {
      return res.status(404).json({ error: { code: 'S0802', message: result.reason } });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[ChatPartner] 确认女生档案更新失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '确认失败，请稍后重试' } });
  }
});

/**
 * 驳回女生档案更新
 * POST /api/chat-partner/girl-profile/reject
 */
router.post('/girl-profile/reject', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId, pendingId } = req.body;
    if (!girlId || !pendingId) {
      return res.status(400).json({ error: { code: 'S0803', message: '参数不完整' } });
    }

    // 安全：操盘手只能操作自己负责的客户的女生
    if (req.user.role === 'admin') {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限操作此女生数据' } });
    }

    const { rejectProfileUpdate } = require('../services/girlProfileExtractor');
    const result = await rejectProfileUpdate(girlId, pendingId);

    if (!result.success) {
      return res.status(404).json({ error: { code: 'S0802', message: result.reason } });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[ChatPartner] 驳回女生档案更新失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '驳回失败，请稍后重试' } });
  }
});

// ============================================================================
// 客户档案待确认管理
// ============================================================================

/**
 * 获取客户的待确认档案更新列表
 * GET /api/chat-partner/client-profile/pending/:clientId
 */
router.get('/client-profile/pending/:clientId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { clientId } = req.params;

    // 安全：操盘手只能访问自己负责的客户的数据
    if (req.user.role === 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此客户数据' } });
    }

    const { getPendingUpdates } = require('../services/clientProfileExtractor');
    const updates = await getPendingUpdates(clientId);

    res.json({ success: true, updates });
  } catch (error) {
    console.error('[ChatPartner] 获取客户待确认更新失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '获取待确认更新失败，请稍后重试' } });
  }
});

/**
 * 确认客户档案更新
 * POST /api/chat-partner/client-profile/confirm
 */
router.post('/client-profile/confirm', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { clientId, pendingId, selectedFields } = req.body;
    if (!clientId || !pendingId) {
      return res.status(400).json({ error: { code: 'S0803', message: '参数不完整' } });
    }

    // 安全：操盘手只能操作自己负责的客户的数据，admin 可以操作所有客户数据
    if (req.user.role === 'operator') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限操作此客户数据' } });
    }

    const { confirmProfileUpdate } = require('../services/clientProfileExtractor');
    const result = await confirmProfileUpdate(clientId, pendingId, selectedFields);

    if (!result.success) {
      return res.status(404).json({ error: { code: 'S0802', message: result.reason } });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[ChatPartner] 确认客户档案更新失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '确认失败，请稍后重试' } });
  }
});

/**
 * 驳回客户档案更新
 * POST /api/chat-partner/client-profile/reject
 */
router.post('/client-profile/reject', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { clientId, pendingId } = req.body;
    if (!clientId || !pendingId) {
      return res.status(400).json({ error: { code: 'S0803', message: '参数不完整' } });
    }

    // 安全：操盘手只能操作自己负责的客户的数据，admin 可以操作所有客户数据
    if (req.user.role === 'operator') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限操作此客户数据' } });
    }

    const { rejectProfileUpdate } = require('../services/clientProfileExtractor');
    const result = await rejectProfileUpdate(clientId, pendingId);

    if (!result.success) {
      return res.status(404).json({ error: { code: 'S0802', message: result.reason } });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[ChatPartner] 驳回客户档案更新失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '驳回失败，请稍后重试' } });
  }
});

/**
 * 朋友圈模式分析
 * POST /api/chat-partner/analyze-moment
 *
 * 支持两种输入：
 * - momentText: 朋友圈文字内容
 * - momentImage: base64 图片（内嵌）或图片 URL
 *
 * 输出：AI 分析 + 回复建议，作为聊天上下文记录下来
 */
router.post('/analyze-moment', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId, momentText, momentImage, operatorNotes } = req.body;

    if (!momentText && !momentImage) {
      return res.status(400).json({ error: { code: 'S0803', message: '朋友圈文字或图片至少需要提供一个' } });
    }

    // 安全：操盘手只能分析自己负责的客户的女生朋友圈
    if (girlId && req.user.role === 'admin') {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限分析此女生朋友圈' } });
    }

    // 构建上下文
    const context = girlId
      ? await buildAICoachContext(req.user.id, girlId)
      : { girlInfo: null, recentSignals: [], pendingActions: [], observations: [], conversationSummary: '' };

    const { girlInfo, recentSignals, pendingActions, observations, conversationSummary } = context;

    let personality = {};
    if (girlInfo?.personality) {
      try { personality = girlInfo.personality; } catch (e) { console.warn('[ChatPartner] personality 赋值失败:', e.message); }
    }

    const stage = girlInfo?.stage || '聊天';
    const signalsText = recentSignals.length > 0
      ? recentSignals.map(s => {
          const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
          return `${icon} ${s.event} — ${s.date}`;
        }).join('\n')
      : '暂无';

    const stageStyleMap = {
      '陌生': ['稳妥型', '破冰型', '探索型'],
      '搭讪': ['稳妥型', '自然型', '幽默型'],
      '聊天': ['稳妥型', '进攻型', '调侃型'],
      '暧昧': ['进攻型', '暧昧型', '试探型'],
      '约会': ['浪漫型', '推进型', '调侃型'],
      '长期': ['陪伴型', '关心型', '默契型'],
    };
    const defaultStyles = stageStyleMap[stage] || ['稳妥型', '进攻型', '调侃型'];

    // 构建 prompt
    let contentDescription = '';
    if (momentText) contentDescription += `【朋友圈文字】\n${momentText}\n\n`;
    if (momentImage) contentDescription += '【朋友圈图片】\n（见下方图片）\n';

    const systemPrompt = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验，真诚自然，不油腔滑调，不套路撩骚。

分析以下女生朋友圈，提取对她有帮助的信息，结合她的档案给出发评论/私聊建议。

【女生档案】
昵称：${girlInfo?.name || '未知'}
年龄：${girlInfo?.age || '未知'}
职业：${girlInfo?.occupation || '未知'}
当前阶段：${stage}
关系热度：${girlInfo?.tensionScore || 5}/10
亲密度：${'❤️'.repeat(girlInfo?.intimacyLevel || 1)}

【性格画像】
MBTI：${personality.mbti || '未知'}
沟通风格：${personality.communicationStyle || '未知'}
情绪触发点：${personality.emotionalTriggers?.join('、') || '暂无'}
聊天禁忌：${personality.thingsToAvoid?.join('、') || '暂无'}
擅长话题：${personality.talkingTopics?.join('、') || '未知'}

【近期关键信号】
${signalsText}

【待推进事项】
${pendingActions.length > 0 ? pendingActions.map(a => `- ${a}`).join('\n') : '暂无'}

【观察记录】
${observations.length > 0 ? observations.map(o => `- ${o}`).join('\n') : '暂无'}

【操盘手备注】
${operatorNotes || '无'}

女生发了以下朋友圈：
${contentDescription}

请仔细看图（如果有图片）或文字，按以下8个维度分析：

1. **内容分析**：这条朋友圈发的是什么？（美食、旅行、自拍、合照、工作、风景、宠物等）
2. **生活方式**：作息暗示、消费水平、社交频率、生活品质
3. **审美偏好**：穿着风格、拍照风格、修图风格、内容调性
4. **社交圈信号**：经常和谁出镜、朋友圈活跃度、朋友类型
5. **情绪状态**：发这条朋友圈时的情绪（开心/emo/炫耀/求关注/日常分享）
6. **关系暗示**：是否暗示单身、有对象、在约会等
7. **性格洞察**：外向/内向、文艺/接地气、精致/随性、高调/低调
8. **互动时机**：适合评论还是私聊切入、评论方向建议

结合她的性格和当前关系阶段，给出评论/私聊建议。评论要自然有共鸣感，不要跪舔也不要高冷，15-30字。

请按以下 JSON 格式返回：
{
  "momentContent": "朋友圈内容描述（50字内）",
  "lifestyleSignals": ["生活方式信号1", "信号2"],
  "aestheticPreferences": "审美偏好描述",
  "socialSignals": ["社交圈信号1", "信号2"],
  "emotionalState": "情绪状态",
  "relationshipHints": ["关系暗示1", "暗示2"],
  "personalityInsights": "性格洞察（50字内）",
  "interactionAdvice": "互动建议（评论/私聊方向，30字内）",
  "commentSuggestions": [
    {"text": "评论内容1", "style": "评论风格", "intention": "意图说明"},
    {"text": "评论内容2", "style": "评论风格", "intention": "意图说明"}
  ],
  "dmSuggestions": [
    {"text": "私聊话术1", "style": "风格", "intention": "意图说明"},
    {"text": "私聊话术2", "style": "风格", "intention": "意图说明"}
  ]
}

只输出 JSON，不要其他内容。`;

    const aiConfig = getAIConfig();

    // 构建 AI 消息
    if (momentImage) {
      // 视觉模型 — 使用 profileEngine 的 callVisionModel（带压缩+超时+重试）
      const vlConfig = getVLModelConfig() || getAIConfig();

      let analysisResult = {
        momentContent: '图片分析中...',
        commentSuggestions: defaultStyles.slice(0, 2).map((s) => ({ text: '分析中...', style: s, intention: '' })),
        dmSuggestions: defaultStyles.slice(0, 2).map((s) => ({ text: '分析中...', style: s, intention: '' }))
      };

      try {
        // 处理 base64 或 URL
        let imageUrl = momentImage;
        if (momentImage.startsWith('data:')) {
          // base64 直接传递
          imageUrl = momentImage;
        } else if (momentImage.startsWith('/')) {
          // 本地路径
          imageUrl = momentImage;
        }

        const messages = [
          { role: 'user', content: [
            { type: 'text', text: systemPrompt + '\n\n【图片】见下方。' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]}
        ];

        const aiContent = await callVisionModel(messages, vlConfig);
        if (aiContent) {
          const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysisResult = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (err) {
        console.error('[ChatPartner] 视觉分析失败:', err.message);
      }

      return res.json({
        success: true,
        girlId: girlId || null,
        analysis: analysisResult.momentContent || analysisResult.momentAnalysis || '',
        lifestyleSignals: analysisResult.lifestyleSignals || [],
        aestheticPreferences: analysisResult.aestheticPreferences || '',
        socialSignals: analysisResult.socialSignals || [],
        emotionalState: analysisResult.emotionalState || '',
        relationshipHints: analysisResult.relationshipHints || [],
        personalityInsights: analysisResult.personalityInsights || '',
        interactionAdvice: analysisResult.interactionAdvice || '',
        commentSuggestions: analysisResult.commentSuggestions || [],
        dmSuggestions: analysisResult.dmSuggestions || [],
        context: {
          stage,
          tensionScore: girlInfo?.tensionScore || 5,
          intimacyLevel: girlInfo?.intimacyLevel || 1
        }
      });

    } else {
      // 纯文本模式
      const resp = await fetch(aiConfig.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { role: 'user', content: systemPrompt }
          ],
          temperature: 0.8,
          max_tokens: 1200
        })
      });

      let analysisResult = {
        momentContent: '分析中...',
        commentSuggestions: defaultStyles.slice(0, 2).map((s, i) => ({ text: '分析中...', style: s, intention: '' })),
        dmSuggestions: defaultStyles.slice(0, 2).map((s, i) => ({ text: '分析中...', style: s, intention: '' }))
      };

      if (resp.ok) {
        const data = await resp.json();
        const aiContent = data.choices?.[0]?.message?.content || '';
        try {
          const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysisResult = JSON.parse(jsonMatch[0]);
          }
        } catch (e) { console.warn('[ChatPartner] analyzeMoment JSON 解析失败:', e.message); }
      }

      return res.json({
        success: true,
        girlId: girlId || null,
        analysis: analysisResult.momentContent || analysisResult.momentAnalysis || '',
        lifestyleSignals: analysisResult.lifestyleSignals || [],
        aestheticPreferences: analysisResult.aestheticPreferences || '',
        socialSignals: analysisResult.socialSignals || [],
        emotionalState: analysisResult.emotionalState || '',
        relationshipHints: analysisResult.relationshipHints || [],
        personalityInsights: analysisResult.personalityInsights || '',
        interactionAdvice: analysisResult.interactionAdvice || '',
        commentSuggestions: analysisResult.commentSuggestions || [],
        dmSuggestions: analysisResult.dmSuggestions || [],
        context: {
          stage,
          tensionScore: girlInfo?.tensionScore || 5,
          intimacyLevel: girlInfo?.intimacyLevel || 1
        }
      });
    }

  } catch (error) {
    console.error('[ChatPartner] 朋友圈分析失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '朋友圈分析失败，请稍后重试' } });
  }
});

/**
 * 朋友圈建议采纳反馈
 * POST /api/chat-partner/moment-feedback
 *
 * 将采纳的朋友圈互动记录到 ChatLog，
 * 同时异步分析对档案的影响（热度、信号提取）
 */
router.post('/moment-feedback', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId, chosenReply, replyType, momentText, momentImageUrl, style, intention } = req.body;

    if (!girlId || !chosenReply) {
      return res.status(400).json({ error: { code: 'S0803', message: '参数不完整' } });
    }

    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    }

    // 安全：操盘手只能操作自己负责的客户的女生
    if (req.user.role === 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限操作此女生数据' } });
    }

    // 保存到 ChatLog
    const log = await prisma.chatLog.create({
      data: {
        girlId,
        clientId: girl.clientId,
        operatorId: req.user.id,
        receiverName: girl.name,
        content: chosenReply,
        type: replyType === 'dm' ? 'text' : 'text',
        momentText: momentText || null,
        momentImageUrl: momentImageUrl || null,
        aiAdopted: true,
        aiAnalysis: `朋友圈互动 | 类型: ${replyType} | 风格: ${style || ''} | 意图: ${intention || ''}`
      }
    });

    // 热度调整
    const tensionAdjustments = {
      '进攻型': 1, '暧昧型': 1.5, '浪漫型': 1.5, '试探型': 0.5,
      '推进型': 1, '调侃型': 0.5, '制造暧昧': 1, '推进关系': 1,
      '稳妥型': 0, '破冰型': 0, '自然型': 0, '探索型': 0,
      '陪伴型': 0, '关心型': 0, '默契型': 0,
      '评论': 0.5, '私聊': 1,
    };
    const adjustment = tensionAdjustments[intention] || tensionAdjustments[replyType] || 0;

    if (adjustment !== 0) {
      await executeTool('update_tension', {
        girlId,
        adjustment,
        reason: `朋友圈互动采纳"${style || replyType}"建议：${chosenReply.slice(0, 20)}`
      });
      await executeTool('add_signal', {
        girlId,
        type: adjustment > 0 ? 'positive' : 'neutral',
        event: `朋友圈互动：${intention || replyType} - ${chosenReply.slice(0, 30)}`
      });
    }

    res.json({ success: true, logId: log.id });

  } catch (error) {
    console.error('[ChatPartner] 朋友圈反馈失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '朋友圈反馈失败，请稍后重试' } });
  }
});

module.exports = router;

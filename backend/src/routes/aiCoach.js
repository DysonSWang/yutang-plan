/**
 * AI军师路由 - 谙世军师工具封装
 *
 * 操盘手工作台使用的AI分析工具：
 * - 情况咨询（situationCoach）
 * - 聊天分析（chatPartners analyze）
 * - 回复生成（chatReplyEngine）
 * - 情商画像（eq-profile）
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { buildAICoachContext } = require('../services/contextBuilder');
const { buildMasterPrompt, getSkillsForQuestion, getMultiDimensionalSkillsWithMeta } = require('../coaches');
const { chatWithTools, toolDefinitions } = require('../services/coach-engine');
const { getOrCreateSession, addMessage, getConversationHistory, listSessions, getClientSessions, getSystemStats, getSessionDetail, addFeedback, getFeedbackStats } = require('../services/memory');
const { streamGuardrails, runGuardrails } = require('../services/guardrails');

const { JWT_SECRET, getAIConfig, getVLModelConfig } = require('../config');
const prisma = require('../prisma');
const { getCache, setCache, getOverviewCache, setOverviewCache } = require('../services/girlSummaryCache');

// ---- Token Budget Config ----
const ESTIMATION_FACTOR = 4;   // chars / factor ~= tokens
const AI_RESPONSE_RESERVE = 600; // tokens reserved for AI response
const SYSTEM_PROMPT_BASE = 800;  // rough overhead for coach persona + formatting
const MAX_PROMPT_TOKENS = 28000; // leave headroom below model context limit

// ---- Internal Meta Sanitization ----
// 过滤敏感路由信息，仅保留调试用的非敏感字段
// coachIds等涉及多教练的信息绝不暴露给前端
function sanitizeRoutingMeta(meta) {
  if (!meta) return null;
  return {
    routedType: meta.routedType,
    bestScore: meta.bestScore,
    matchedKeywords: meta.matchedKeywords,
    typeScores: meta.typeScores,
    coachCount: meta.coachCount,
    multiDimensional: meta.multiDimensional
    // 注意：coachIds 已移除，不暴露给前端
  };
}

/**
 * Estimate tokens for a string (rough: chars / factor)
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / ESTIMATION_FACTOR);
}

/**
 * Calculate the remaining budget (in chars) for context injection.
 * Static parts consume: coach system prompt + user situation + history + overhead.
 */
function calcContextBudget(coachSystemPrompt, situation, historyText) {
  const staticTokens = estimateTokens(coachSystemPrompt)
    + estimateTokens(situation)
    + estimateTokens(historyText)
    + SYSTEM_PROMPT_BASE;
  const available = MAX_PROMPT_TOKENS - staticTokens - AI_RESPONSE_RESERVE;
  // Return remaining budget in chars (factor = 4)
  return Math.max(0, available * ESTIMATION_FACTOR);
}

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'token无效' });
  }
};


/**
 * 情况咨询 - 基于女生信息分析当前情况
 * POST /api/ai-coach/situation
 */
router.post('/situation', authMiddleware, async (req, res) => {
  try {
    // 允许 operator、admin、client 访问
    if (!['operator', 'admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }

    // 统一教练：无需选择教练ID，根据问题动态路由到多位大师
    const { girlId, situation, stream = true } = req.body;

    if (!situation) {
      return res.status(400).json({ error: '情况描述是必需的' });
    }

    // 安全：验证女生归属权，防止跨客户数据访问
    if (girlId) {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) {
        return res.status(404).json({ error: '女生不存在' });
      }
    }

    // 统一教练 session key
    const unifiedCoachId = 'unified';

    // 使用 contextBuilder 获取上下文（带预算感知）
    const { memory: sessionMemory } = await getOrCreateSession(req.user.id, unifiedCoachId, girlId);
    const history = await getConversationHistory(sessionMemory.id);

    // 构建对话历史文本（用于预算计算）
    let historyText = '';
    if (history.length > 0) {
      historyText = history.map(m =>
        `${m.role === 'system' ? '【系统】' : m.role === 'user' ? '用户' : '教练'}: ${m.content}`
      ).join('\n');
    }

    // 计算剩余上下文预算（字符数）
    const contextBudget = calcContextBudget('', situation, historyText);

    // 计算对话深度信息
    const turnCount = history.length;
    const compactionCount = sessionMemory.compactionCount || 0;

    const context = await buildAICoachContext(req.user.id, girlId, situation, {
      maxContextChars: contextBudget,
      turnCount,
      compactionCount
    });

    // 获取动态路由的多位大师视角（带调试meta）
    const { skills, meta: routingMeta } = getMultiDimensionalSkillsWithMeta(situation, {
      girlId,
      girlStage: context.girlInfo?.stage
    });

    // 使用 promptBuilder 构建统一教练 prompt（question已正确插入）
    const systemPrompt = buildMasterPrompt(situation, context, {
      girlInfo: context.girlInfo,
      conversationHistory: history,
      turnCount
    });

    const aiConfig = getAIConfig();

    // 添加用户消息到记忆（在prompt构建之后）
    await addMessage(sessionMemory.id, 'user', situation);

    // 流式模式
    if (stream) {
      // 设置 SSE headers - 禁用所有缓冲
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Content-Encoding', 'identity');
      res.flushHeaders();

      try {
        console.log('[AICoach] 开始调用AI provider，stream:', stream);
        const response = await fetch(aiConfig.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${aiConfig.key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: aiConfig.model,
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.7,
            max_tokens: 500,
            stream: true
          })
        });
        console.log('[AICoach] AI provider响应状态:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[AICoach] AI provider错误:', response.status, errorText);
          res.write(`data: ${JSON.stringify({ error: 'AI服务请求失败' })}\n\n`);
          res.end();
          return;
        }

        // 流式读取AI响应并发送给前端
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunkCount = 0;
        let fullResponse = ''; // 累积完整响应用于保存到记忆

        // 先发送路由meta信息（前端可展示调试信息，过滤了敏感字段）
        res.write(`data: ${JSON.stringify({ meta: sanitizeRoutingMeta(routingMeta) })}\n\n`);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunkCount++;
          const decoded = decoder.decode(value, { stream: true });
          buffer += decoded;

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                console.log(`[AICoach] 流式完成，共${chunkCount}个chunk`);
                res.write('data: [DONE]\n\n');
              } else {
                try {
                  const parsed = JSON.parse(data);
                  let content = parsed.choices?.[0]?.delta?.content || '';
                  if (content) {
                    // Guardrails: 过滤大师名字和加粗标记
                    const guardResult = streamGuardrails(content);
                    if (!guardResult.safe) {
                      console.warn(`[Guardrails] ${guardResult.reason}，已过滤`);
                      content = guardResult.filtered;
                    }
                    if (content) {
                      fullResponse += content; // 累积完整响应
                      res.write(`data: ${JSON.stringify({ content })}\n\n`);
                    }
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }
        }

        console.log(`[AICoach] 流式完成，路由类型: ${routingMeta.routedType}, Coaches: ${routingMeta.coachIds?.join(',')}, 匹配得分: ${routingMeta.bestScore}, 响应长度: ${fullResponse.length}`);

        // 保存AI响应到记忆
        if (fullResponse) {
          await addMessage(sessionMemory.id, 'assistant', fullResponse);
          console.log(`[AICoach] 保存AI响应到记忆`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        console.error('[AICoach] 流式咨询失败:', error);
        res.write(`data: ${JSON.stringify({ error: '分析失败' })}\n\n`);
        res.end();
      }
    } else {
      // 非流式模式 - 支持工具调用
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: situation }
      ];

      try {
        const analysis = await chatWithTools(messages, {
          coachConfig: { id: 'unified', name: 'AI统一教练' },
          tools: toolDefinitions
        });

        // 保存对话到记忆（非流式模式）
        await addMessage(sessionMemory.id, 'assistant', analysis);

        res.json({
          success: true,
          coachName: 'AI统一教练',
          analysis,
          meta: sanitizeRoutingMeta(routingMeta)
        });
      } catch (error) {
        console.error('[AICoach] 非流式咨询失败:', error);
        res.status(500).json({ error: '分析失败' });
      }
    }
  } catch (error) {
    console.error('[AICoach] 情况咨询失败:', error);
    res.status(500).json({ error: '分析失败' });
  }
});

/**
 * 聊天分析 - 分析聊天内容，识别意图和情绪
 * POST /api/ai-coach/analyze-chat
 */
router.post('/analyze-chat', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { chatHistory, girlId, girlInfo } = req.body;

    if (!chatHistory || chatHistory.length === 0) {
      return res.status(400).json({ error: '聊天记录是必需的' });
    }

    // 安全：验证女生归属权
    if (girlId) {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) {
        return res.status(404).json({ error: '女生不存在' });
      }
    }

    const historyText = chatHistory.map(msg =>
      `${msg.isFromUser ? '用户' : '女生'}: ${msg.content}`
    ).join('\n');

// 获取相关技能（带调试meta）
    const { skills } = getSkillsForQuestion('聊天分析', { girlId, girlStage: girlInfo?.stage });

    // 优先使用 girlId + contextBuilder（客户端场景）
    // 降级使用 girlInfo 对象（operator 多客户场景）
    let girlContextInfo = '';

    if (girlId) {
      // 使用 contextBuilder 获取完整上下文
      const context = await buildAICoachContext(req.user.id, girlId);
      if (context.girlInfo) {
        girlContextInfo = `
【女生完整档案】
昵称：${context.girlInfo.name}
当前阶段：${context.girlInfo.stage || '未知'}
关系热度：${context.girlInfo.tensionScore || 5}/10
亲密度：${'❤️'.repeat(context.girlInfo.intimacyLevel || 1)}

【近期关键信号】
${context.recentSignals.length > 0
  ? context.recentSignals.map(s => {
      const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
      return `${icon} ${s.event} — ${s.date}`;
    }).join('\n')
  : '暂无近期信号'}

【待推进事项】
${context.pendingActions.length > 0
  ? context.pendingActions.map(a => `- ${a}`).join('\n')
  : '暂无待推进事项'}

【观察记录】
${context.observations.length > 0
  ? context.observations.map(o => `- ${o}`).join('\n')
  : '暂无观察记录'}
`;
      }
    } else if (girlInfo) {
      // 降级：使用传入的 girlInfo 对象
      girlContextInfo = `
【女生信息】
昵称：${girlInfo.name || '未知'}
当前阶段：${girlInfo.stage || '未知'}
`;
    }

    // 统一教练：综合多位大师视角
    const systemPrompt = `你是鱼塘AI情感教练，分析聊天记录，识别对话双方的意图、情绪和关系状态。

【分析框架】
${skills.map(s => {
  const framework = s.principles?.find(p => p.type === 'framework');
  return framework ? `${framework.name}：${framework.steps?.map((step, i) => `${i+1}.${typeof step === 'string' ? step : step.name}`).join(' → ')}` : '';
}).filter(Boolean).join('\n')}

请分析以下聊天记录。

【聊天记录】
${historyText}

${girlContextInfo}

请按以下10个维度输出 JSON 分析结果，直接写字段名和值：
1. userIntention：用户意图
2. userEmotion：用户情绪
3. girlIntention：女生意图
4. girlEmotion：女生情绪
5. relationshipStage：关系阶段
6. keySignals：关键信号列表（2-3个）
7. girlSignals：女生积极信号列表（1-2个）
8. interactionQuality：互动质量评价
9. riskSignals：风险信号（如有）
10. suggestions：操盘手建议（1-2条）

请按以下 JSON 格式返回：
{
  "userIntention": "...",
  "userEmotion": "...",
  "girlIntention": "...",
  "girlEmotion": "...",
  "relationshipStage": "...",
  "keySignals": ["...", "..."],
  "girlSignals": ["...", "..."],
  "interactionQuality": "...",
  "riskSignals": ["..."] | [],
  "suggestions": ["...", "..."]
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
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    let analysis;
    try {
      analysis = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      analysis = { raw: content };
    }

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('[AICoach] 聊天分析失败:', error);
    res.status(500).json({ error: '分析失败' });
  }
});

/**
 * 回复建议 - 基于女生人格生成回复选项
 * POST /api/ai-coach/reply-suggestions
 */
router.post('/reply-suggestions', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId, lastMessage, context } = req.body;

    if (!lastMessage) {
      return res.status(400).json({ error: '对方消息是必需的' });
    }

    // 安全：验证女生归属权
    if (girlId) {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) {
        return res.status(404).json({ error: '女生不存在' });
      }
    }

    // 使用 contextBuilder 获取完整上下文
    const fullContext = await buildAICoachContext(req.user.id, girlId);
    const p = fullContext.girlInfo ? (fullContext.girlInfo.personality || {}) : {};

    // 获取动态路由的多位大师视角（带调试meta）
    const { skills, meta: routingMeta } = getMultiDimensionalSkillsWithMeta(lastMessage, { girlId, girlStage: fullContext.girlInfo?.stage });

    // 构建女生完整上下文
    let girlContextInfo = '';
    if (fullContext.girlInfo) {
      girlContextInfo = `
【女生完整档案】
昵称：${fullContext.girlInfo.name}
当前阶段：${fullContext.girlInfo.stage || '未知'}
关系热度：${fullContext.girlInfo.tensionScore || 5}/10
亲密度：${'❤️'.repeat(fullContext.girlInfo.intimacyLevel || 1)}

【性格画像】
MBTI：${p.mbti || '未知'}
沟通风格：${p.communicationStyle || '未知'}
情绪触发点：${p.emotionalTriggers?.join('、') || '未知'}
聊天禁忌：${p.thingsToAvoid?.join('、') || '暂无'}
Talking Topics：${p.talkingTopics?.join('、') || '未知'}

【近期关键信号】
${fullContext.recentSignals.length > 0
  ? fullContext.recentSignals.map(s => {
      const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
      return `${icon} ${s.event} — ${s.date}`;
    }).join('\n')
  : '暂无近期信号'}

【待推进事项】
${fullContext.pendingActions.length > 0
  ? fullContext.pendingActions.map(a => `- ${a}`).join('\n')
  : '暂无待推进事项'}
`;
    }

    // 统一教练：综合多位大师视角
    const systemPrompt = `你是鱼塘AI情感教练，根据以下信息生成回复选项。

${girlContextInfo}
【对方最后一条消息】
${lastMessage}

${context ? `【对话背景】\n${context}` : ''}

请生成3个不同风格的回复，每个回复要求：15-30字、口语化、符合女生性格：

1. 稳妥型：安全、礼貌的回复，维持舒适感，不冒进
2. 进攻型：稍微大胆、有攻势的回复，推进关系，制造暧昧
3. 调侃型：轻松、幽默的回复，活跃气氛，试探对方反应

回复风格适配阶段（${fullContext?.girlInfo?.stage || '聊天'}），女生沟通风格（${p?.communicationStyle || '未知'}）。

请按以下 JSON 格式返回：
{
  "options": [
    { "type": "稳妥型", "reply": "回复内容（15-30字）", "intention": "意图说明" },
    { "type": "进攻型", "reply": "回复内容（15-30字）", "intention": "意图说明" },
    { "type": "调侃型", "reply": "回复内容（15-30字）", "intention": "意图说明" }
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
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.8,
        max_tokens: 1000
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    let suggestions;
    try {
      suggestions = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      suggestions = { raw: content };
    }

    res.json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('[AICoach] 回复建议失败:', error);
    res.status(500).json({ error: '生成失败' });
  }
});

/**
 * 话术优化 - 优化操盘手已有的回复
 * POST /api/ai-coach/optimize-reply
 */
router.post('/optimize-reply', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { originalReply, girlId, goal } = req.body;

    if (!originalReply) {
      return res.status(400).json({ error: '原始回复是必需的' });
    }

    // 安全：验证女生归属权
    if (girlId) {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) {
        return res.status(404).json({ error: '女生不存在' });
      }
    }

    // 如果有 girlId，使用 contextBuilder 获取完整上下文
    const fullContext = girlId ? await buildAICoachContext(req.user.id, girlId) : null;

    let goalHint = '';
    if (goal) {
      goalHint = `【优化目标】${goal}`;
    }

    // 解析 personality
    let personality = {};
    if (fullContext?.girlInfo?.personality) {
      try { personality = typeof fullContext.girlInfo.personality === 'string' ? JSON.parse(fullContext.girlInfo.personality) : fullContext.girlInfo.personality; } catch (e) { console.warn('[AICoach] personality 解析失败:', e.message); }
      if (typeof personality === 'string') {
        try { personality = JSON.parse(personality); } catch (e) { console.warn('[AICoach] personality 二次解析失败:', e.message); personality = {}; }
      }
    }

// 获取动态路由的多位大师视角（带调试meta）
    const { skills, meta: routingMeta } = getMultiDimensionalSkillsWithMeta(originalReply, { girlId, girlStage: fullContext?.girlInfo?.stage });

    // 构建女生上下文（可选）
    let girlContextInfo = '';
    if (fullContext && fullContext.girlInfo) {
      girlContextInfo = `
【女生信息】
昵称：${fullContext.girlInfo.name}
阶段：${fullContext.girlInfo.stage || '未知'}
热度：${fullContext.girlInfo.tensionScore || 5}/10
近期信号：${fullContext.recentSignals[0]?.event || '暂无'}
待推进事项：${fullContext.pendingActions[0] || '暂无'}
`;
    }

    // 统一教练：综合多位大师视角
    const systemPrompt = `你是鱼塘AI情感教练，把平淡或生硬的回复优化成有温度、有情商、有吸引力的聊天内容。

【女生档案】
昵称：${fullContext?.girlInfo?.name || '未知'}
阶段：${fullContext?.girlInfo?.stage || '未知'}
性格：${personality?.communicationStyle || '未知'}
情绪触发点：${(personality?.emotionalTriggers || []).join('、') || '暂无'}
聊天禁忌：${(personality?.thingsToAvoid || []).join('、') || '暂无'}
喜欢话题：${(personality?.talkingTopics || []).join('、') || '未知'}

【原始回复】
"${originalReply}"

${goalHint}

请生成3个优化版本，每个15-30字：
1. 自然型：语气口语化，像正常聊天
2. 温度型：情绪温暖，带点暧昧
3. 性格型：更契合${personality?.communicationStyle || '未知'}风格

请按以下 JSON 格式返回：
{
  "original": "${originalReply}",
  "optimizations": [
    { "text": "优化版本1", "point": "优化说明", "style": "自然型" },
    { "text": "优化版本2", "point": "优化说明", "style": "温度型" },
    { "text": "优化版本3", "point": "优化说明", "style": "性格型" }
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
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.8,
        max_tokens: 1200
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    let optimized;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        optimized = {
          original: parsed.original || originalReply,
          optimizations: parsed.optimizations || [{ text: originalReply, point: '优化失败，保持原版', style: '原版' }]
        };
      } else {
        optimized = { original: originalReply, optimizations: [{ text: originalReply, point: '优化失败，保持原版', style: '原版' }] };
      }
    } catch {
      optimized = { original: originalReply, optimizations: [{ text: originalReply, point: '优化失败，保持原版', style: '原版' }] };
    }

    res.json({
      success: true,
      original: optimized.original,
      optimizations: optimized.optimizations
    });
  } catch (error) {
    console.error('[AICoach] 话术优化失败:', error);
    res.status(500).json({ error: '优化失败' });
  }
});

// ============================================================
// 操盘手监控 API（仅 operator / admin）
// ============================================================

/**
 * 系统级监控统计
 * GET /api/ai-coach/monitoring/stats
 */
router.get('/monitoring/stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const stats = await getSystemStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[AICoach] 监控统计失败:', error);
    res.status(500).json({ error: '获取监控数据失败' });
  }
});

/**
 * 会话列表（支持分页）
 * GET /api/ai-coach/monitoring/sessions?clientId=&girlId=&coachId=&activeOnly=&compressedOnly=&page=&pageSize=
 */
router.get('/monitoring/sessions', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const {
      clientId,
      girlId,
      coachId,
      activeOnly,
      compressedOnly,
      page,
      pageSize
    } = req.query;

    const result = await listSessions({
      clientId,
      girlId,
      coachId,
      activeOnly: activeOnly === 'true',
      compressedOnly: compressedOnly === 'true',
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[AICoach] 会话列表失败:', error);
    res.status(500).json({ error: '获取会话列表失败' });
  }
});

/**
 * 客户维度会话详情（按女生分组）
 * GET /api/ai-coach/monitoring/client/:clientId
 */
router.get('/monitoring/client/:clientId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { clientId } = req.params;
    const data = await getClientSessions(clientId);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[AICoach] 客户会话详情失败:', error);
    res.status(500).json({ error: '获取客户会话详情失败' });
  }
});

/**
 * 单个会话详情
 * GET /api/ai-coach/monitoring/session/:memoryId
 */
router.get('/monitoring/session/:memoryId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { memoryId } = req.params;
    const detail = await getSessionDetail(memoryId);

    if (!detail) {
      return res.status(404).json({ error: '会话不存在' });
    }

    res.json({ success: true, data: detail });
  } catch (error) {
    console.error('[AICoach] 会话详情失败:', error);
    res.status(500).json({ error: '获取会话详情失败' });
  }
});

/**
 * 朋友圈分析 - AI教练能力分析朋友圈，给出评论/私聊建议
 * POST /api/ai-coach/moment
 *
 * 使用AI教练的流式输出格式，避免JSON结构化输出
 */
router.post('/moment', authMiddleware, async (req, res) => {
  try {
    if (!['operator', 'admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId, momentText, momentImage, stream = true } = req.body;

    if (!momentText && !momentImage) {
      return res.status(400).json({ error: '朋友圈文字或图片至少需要提供一个' });
    }

    // 安全：验证女生归属权
    if (girlId) {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) {
        return res.status(404).json({ error: '女生不存在' });
      }
    }

    // 构建女生上下文
    const context = girlId
      ? await buildAICoachContext(req.user.id, girlId)
      : { girlInfo: null, recentSignals: [], pendingActions: [], observations: [], conversationSummary: '' };

    const { girlInfo, recentSignals, pendingActions, observations } = context;

    // 解析 personality
    let personality = {};
    if (girlInfo?.personality) {
      try { personality = typeof girlInfo.personality === 'string' ? JSON.parse(girlInfo.personality) : girlInfo.personality; } catch (e) { console.warn('[AICoach] personality 解析失败:', e.message); }
      if (typeof personality === 'string') {
        try { personality = JSON.parse(personality); } catch (e) { console.warn('[AICoach] personality 二次解析失败:', e.message); personality = {}; }
      }
    }

    const stage = girlInfo?.stage || '聊天';
    const signalsText = recentSignals.length > 0
      ? recentSignals.map(s => {
          const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
          return `${icon} ${s.event} — ${s.date}`;
        }).join('\n')
      : '暂无';

    // 构建朋友圈内容描述
    let contentDesc = '';
    if (momentText) contentDesc += `【朋友圈文字】\n${momentText}\n\n`;
    if (momentImage) contentDesc += '【朋友圈图片】\n（见下方图片）\n';

    // 构建系统prompt
    const systemPrompt = `你是鱼塘AI情感教练，帮助分析女生朋友圈，给出评论和私聊切入建议。

回答要求：
- 简洁口语化，像朋友聊天
- 直接给结论和建议，不要绕弯子
- 不要用任何加粗、斜体等格式
- 不要出现任何大师名字、称号、角色名
- 不要说置信度、框架、原则等专业术语
- 不要出现**符号

【女生档案】
昵称：${girlInfo?.name || '未知'}
阶段：${stage}
热度：${girlInfo?.tensionScore || 5}/10
亲密度：${'❤️'.repeat(girlInfo?.intimacyLevel || 1)}

【性格画像】
MBTI：${personality.mbti || '未知'}
沟通风格：${personality.communicationStyle || '未知'}
情绪触发点：${(personality.emotionalTriggers || []).join('、') || '暂无'}
聊天禁忌：${(personality.thingsToAvoid || []).join('、') || '暂无'}
擅长话题：${(personality.talkingTopics || []).join('、') || '未知'}

【近期关键信号】
${signalsText}

【待推进事项】
${pendingActions.length > 0 ? pendingActions.map(a => `- ${a}`).join('\n') : '暂无'}

【观察记录】
${observations.length > 0 ? observations.map(o => `- ${o}`).join('\n') : '暂无'}

女生发了以下朋友圈：
${contentDesc}

请分析这条朋友圈，给出评论和私聊切入建议。

【回答格式】（严格按这个格式输出，不要加任何标题前缀，不要用markdown）：
第一段：这条朋友圈发的是什么，她大概是什么情绪和状态
第二段：这条朋友圈透露出什么信息（生活方式、社交圈、感情状态等）
第三段：适合评论还是私聊切入，为什么
第四段：给2-3条具体的评论建议或私聊切入话术（15-30字，自然有共鸣感，不跪舔也不高冷）
第五段：如果信息不够，直接说还缺什么，追问1个关键问题
`;

    const aiConfig = getAIConfig();

    // 流式模式
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Content-Encoding', 'identity');
      res.flushHeaders();

      try {
        let body;
        if (momentImage) {
          // 视觉模型流式
          const vlConfig = getVLModelConfig();
          if (!vlConfig) {
            res.write(`data: ${JSON.stringify({ error: '当前配置不支持图片分析' })}\n\n`);
            res.end();
            return;
          }

          // 解析图片（base64或本地路径）
          let imageUrl = momentImage;
          if (momentImage.startsWith('data:')) {
            imageUrl = momentImage;
          } else if (momentImage.startsWith('/uploads/')) {
            const uploadDir = path.join(__dirname, '..', '..', 'uploads');
            const filePath = path.join(uploadDir, momentImage.replace('/uploads/', ''));
            try {
              const buffer = fs.readFileSync(filePath);
              const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'jpg';
              const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
              imageUrl = `data:${mime};base64,${buffer.toString('base64')}`;
            } catch (e) {
              res.write(`data: ${JSON.stringify({ error: '图片读取失败' })}\n\n`);
              res.end();
              return;
            }
          }

          body = JSON.stringify({
            model: vlConfig.model,
            messages: [
              { role: 'user', content: [
                { type: 'text', text: systemPrompt },
                { type: 'image_url', image_url: { url: imageUrl } }
              ]},
            ],
            temperature: 0.7,
            max_tokens: 600,
            stream: true
          });
        } else {
          body = JSON.stringify({
            model: aiConfig.model,
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.7,
            max_tokens: 600,
            stream: true
          });
        }

        const modelConfig = momentImage ? (getVLModelConfig() || aiConfig) : aiConfig;
        const response = await fetch(modelConfig.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${modelConfig.key}`,
            'Content-Type': 'application/json'
          },
          body
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[AICoach] 朋友圈分析失败:', response.status, errorText);
          res.write(`data: ${JSON.stringify({ error: '分析失败' })}\n\n`);
          res.end();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                res.write('data: [DONE]\n\n');
              } else {
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  if (content) {
                    // Guardrails: 过滤大师名字和加粗标记
                    const guardResult = streamGuardrails(content);
                    if (!guardResult.safe) {
                      console.warn(`[Guardrails] 朋友圈分析: ${guardResult.reason}，已过滤`);
                    }
                    const safeContent = guardResult.safe ? content : guardResult.filtered;
                    if (safeContent) {
                      res.write(`data: ${JSON.stringify({ content: safeContent })}\n\n`);
                    }
                  }
                } catch (e) { /* ignore */ }
              }
            }
          }
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        console.error('[AICoach] 朋友圈分析失败:', error);
        res.write(`data: ${JSON.stringify({ error: '分析失败' })}\n\n`);
        res.end();
      }
    } else {
      // 非流式模式
      try {
        let response;
        if (momentImage) {
          const vlConfig = getVLModelConfig() || aiConfig;
          let imageUrl = momentImage;
          if (momentImage.startsWith('/uploads/')) {
            const uploadDir = path.join(__dirname, '..', '..', 'uploads');
            const filePath = path.join(uploadDir, momentImage.replace('/uploads/', ''));
            const buffer = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'jpg';
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
            imageUrl = `data:${mime};base64,${buffer.toString('base64')}`;
          }

          response = await fetch(vlConfig.url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${vlConfig.key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: vlConfig.model,
              messages: [
                { role: 'user', content: [
                  { type: 'text', text: systemPrompt },
                  { type: 'image_url', image_url: { url: imageUrl } }
                ]}
              ],
              temperature: 0.7,
              max_tokens: 600
            })
          });
        } else {
          response = await fetch(aiConfig.url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${aiConfig.key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: aiConfig.model,
              messages: [{ role: 'user', content: systemPrompt }],
              temperature: 0.7,
              max_tokens: 600
            })
          });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        res.json({ success: true, analysis: content });
      } catch (error) {
        console.error('[AICoach] 朋友圈分析失败:', error);
        res.status(500).json({ error: '分析失败' });
      }
    }
  } catch (error) {
    console.error('[AICoach] 朋友圈分析失败:', error);
    res.status(500).json({ error: '分析失败' });
  }
});

// ============================================================
// 反馈 API（用于分析路由准确度和教练效果）
// ============================================================

/**
 * 记录教练反馈（thumbs up/down）
 * POST /api/ai-coach/feedback
 */
router.post('/feedback', authMiddleware, async (req, res) => {
  try {
    if (!['operator', 'admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }

    const { memoryId, type, reason, routedType, coachesUsed } = req.body;

    if (!memoryId || !type) {
      return res.status(400).json({ error: 'memoryId 和 type 是必需的' });
    }

    if (!['helpful', 'not_helpful'].includes(type)) {
      return res.status(400).json({ error: 'type 必须是 helpful 或 not_helpful' });
    }

    // 验证 memory 归属权
    const memory = await prisma.conversationMemory.findUnique({
      where: { id: memoryId }
    });

    if (!memory) {
      return res.status(404).json({ error: '会话不存在' });
    }

    if (memory.clientId !== req.user.id && req.user.role === 'client') {
      return res.status(403).json({ error: '无权评价此会话' });
    }

    await addFeedback(memoryId, type, { reason, routedType, coachesUsed });

    res.json({ success: true });
  } catch (error) {
    console.error('[AICoach] 反馈记录失败:', error);
    res.status(500).json({ error: '记录反馈失败' });
  }
});

/**
 * 获取反馈统计（仅 operator/admin）
 * GET /api/ai-coach/feedback-stats
 */
router.get('/feedback-stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { startDate, endDate } = req.query;

    const stats = await getFeedbackStats({ startDate, endDate });

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[AICoach] 反馈统计失败:', error);
    res.status(500).json({ error: '获取统计失败' });
  }
});

/**
 * 主动教练 - 全局概览（无女生选中时）
 * GET /api/ai-coach/overview
 *
 * 缓存策略（userDataHash）：
 * - hash 匹配 → 缓存返回
 * - 不匹配 → 重新生成 → 写缓存
 *
 * 支持 mode=daily 查询参数（每日计划模式）
 */
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    if (!['operator', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }

    const operatorId = req.user.id;
    const { cachedUserHash, mode } = req.query;

    // 计算当前 userDataHash（从当前操盘手的客户池整体状态）
    const allClients = await prisma.user.findMany({ where: { role: 'client' } });
    const clientIds = allClients.map(c => c.id);

    const allGirls = await prisma.girl.findMany({
      where: { clientId: { in: clientIds } },
      include: { client: { select: { id: true, nickname: true, username: true, age: true } } },
      orderBy: { tensionScore: 'desc' }
    });

    if (allGirls.length === 0) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ cached: false, userDataHash: '', changeReason: null, staleAlerts: [] })}\n\n`);
      res.write(`data: ${JSON.stringify({ content: '鱼塘还是空的，先去捞鱼吧～' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // 概览 hash 基于：总鱼数 + 各客户池整体热度分布
    const hotCount = allGirls.filter(g => (g.tensionScore || 5) >= 7).length;
    const warmCount = allGirls.filter(g => (g.tensionScore || 5) >= 5 && (g.tensionScore || 5) < 7).length;
    const coldCount = allGirls.filter(g => (g.tensionScore || 5) < 5).length;
    const overviewRaw = [allGirls.length, hotCount, warmCount, coldCount].join('|');
    const currentUserHash = crypto.createHash('md5').update(overviewRaw).digest('hex');

    // ---- 分支 1：缓存命中 ----
    if (cachedUserHash && cachedUserHash === currentUserHash) {
      console.log(`[overview] cache hit for operatorId=${operatorId}`);
      const cached = await getOverviewCache(operatorId);
      if (cached) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const staleAlerts = allGirls.map(g => computeStaleAlert(g)).filter(Boolean);

        res.write(`data: ${JSON.stringify({
          cached: true, userDataHash: currentUserHash,
          changeReason: null, staleAlerts
        })}\n\n`);

        const content = cached.content;
        const chunkSize = 100;
        for (let i = 0; i < content.length; i += chunkSize) {
          res.write(`data: ${JSON.stringify({ content: content.slice(i, i + chunkSize) })}\n\n`);
          await new Promise(r => setTimeout(r, 10));
        }

        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
    }

    console.log(`[overview] cache miss for operatorId=${operatorId}, mode=${mode || 'normal'}`);

    // 构建女生状态摘要
    const girlsSummary = allGirls.map(g => {
      let personality = {};
      if (g.personality) {
        try { personality = typeof g.personality === 'string' ? JSON.parse(g.personality) : g.personality; } catch (e) {}
      }
      return `【${g.name}】
  客户：${g.client?.nickname || g.client?.username || '未知'}
  阶段：${g.stage}
  热度：${g.tensionScore || 5}/10
  亲密度：${g.intimacyLevel || 1}
  ${g.notes ? '备注：' + g.notes.slice(0, 50) : ''}`;
    }).join('\n\n');

    // 热度分布
    const hotGirls = allGirls.filter(g => (g.tensionScore || 5) >= 7);
    const warmGirls = allGirls.filter(g => (g.tensionScore || 5) >= 5 && (g.tensionScore || 5) < 7);
    const coldGirls = allGirls.filter(g => (g.tensionScore || 5) < 5);

    // 失联提醒
    const staleAlerts = allGirls.map(g => computeStaleAlert(g)).filter(Boolean);

    let promptSuffix = '';
    if (mode === 'daily') {
      promptSuffix = `
5. 如果今天只能做一件事，应该做什么？
6. 今晚给客户发一条什么样的每日计划提醒？`;
    }

    const systemPrompt = `你是鱼塘AI情感教练，帮操盘手分析当前全局情况，主动给出学习和行动建议。

要求：
- 简洁口语化，像朋友聊天
- 直接给结论和建议，不要绕弯子
- 不要用任何加粗、斜体等格式
- 不要出现任何大师名字、称号、角色名
- 不要说置信度、框架、原则等专业术语
- 不要出现**符号

【今日概况】
总鱼数：${allGirls.length}
🔥 热度高（7+）：${hotGirls.length} 个
🌡️ 热度中（5-6）：${warmGirls.length} 个
❄️ 热度低（<5）：${coldGirls.length} 个

【女生资源清单】
${girlsSummary}

请主动分析：
1. 当前整体情况怎么样，哪些女生值得关注重点关注
2. 最需要推进的是哪1-2个，为什么
3. 操盘手今天应该重点做什么
4. 有没有需要学习/注意的情感知识点（结合当前实际案例讲）${promptSuffix}

用聊天语气说，像朋友一样给建议。`;

    const aiConfig = getAIConfig();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'identity');
    res.flushHeaders();

    // 先发 meta 帧
    res.write(`data: ${JSON.stringify({
      cached: false, userDataHash: currentUserHash,
      changeReason: '数据更新', staleAlerts
    })}\n\n`);

    try {
      const response = await fetch(aiConfig.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [{ role: 'user', content: systemPrompt }],
          temperature: 0.7,
          max_tokens: mode === 'daily' ? 1000 : 800,
          stream: true
        })
      });

      if (!response.ok) {
        res.write(`data: ${JSON.stringify({ error: 'AI服务请求失败' })}\n\n`);
        res.end();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
            } else {
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  const guardResult = streamGuardrails(content);
                  const safeContent = guardResult.safe ? content : guardResult.filtered;
                  if (safeContent) {
                    fullContent += safeContent;
                    res.write(`data: ${JSON.stringify({ content: safeContent })}\n\n`);
                  }
                }
              } catch (e) { /* ignore */ }
            }
          }
        }
      }

      // 写缓存
      if (fullContent) {
        setOverviewCache(operatorId, {
          content: fullContent,
          userDataHash: currentUserHash,
          prevSnapshot: { hotCount, warmCount, coldCount, totalGirls: allGirls.length }
        }).catch(err => console.error('[overview] cache write failed:', err));
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('[AICoach] 全局概览失败:', error);
      res.write(`data: ${JSON.stringify({ error: '分析失败' })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('[AICoach] 全局概览失败:', error);
    res.status(500).json({ error: '获取概览失败' });
  }
});

/**
 * 主动教练 - 女生专项（选中女生时）
 * GET /api/ai-coach/girl-summary/:girlId
 *
 * 缓存策略（双维度 hash）：
 * - girlDataHash 来自女生侧（tensionScore / intimacyLevel / stage / signals / pendingActions）
 * - userDataHash 来自用户侧（currentStage / stageProgress / trustLevel / interactionHeat /
 *                                  serviceStage / emotionalStable / antiFrustrationLevel /
 *                                  coachCooperation / clientType / signals / pendingActions）
 *
 * 三路分支：
 *   1. 两 hash 都匹配 → { cached: true, content, girlDataHash, userDataHash }
 *   2. 任一不匹配 → 重新生成（附 changeReason 标签）→ 写缓存 → 流式返回
 */
router.get('/girl-summary/:girlId', authMiddleware, async (req, res) => {
  try {
    if (!['operator', 'admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId } = req.params;
    const { cachedGirlHash, cachedUserHash } = req.query;
    const clientId = req.user.id;

    // 安全验证
    const girl = await prisma.girl.findUnique({
      where: { id: girlId },
      include: {
        client: { select: { id: true, nickname: true, username: true, age: true } },
        signals: { orderBy: { createdAt: 'desc' }, take: 5 },
        chatLogs: { orderBy: { createdAt: 'desc' }, take: 5 }
      }
    });

    if (!girl) {
      return res.status(404).json({ error: '女生不存在' });
    }

    // 读取用户数据（用于 userDataHash）
    const user = await prisma.user.findUnique({
      where: { id: clientId },
      select: {
        currentStage: true, stageProgress: true, trustLevel: true, interactionHeat: true,
        serviceStage: true, emotionalStable: true, antiFrustrationLevel: true,
        coachCooperation: true, clientType: true, signals: true, pendingActions: true
      }
    });

    // 计算当前 hash
    const currentGirlHash = computeGirlDataHash(girl);
    const currentUserHash = user ? computeUserDataHash(user) : '';

    // ---- 分支 1：缓存命中 ----
    if (cachedGirlHash && cachedUserHash &&
        cachedGirlHash === currentGirlHash &&
        cachedUserHash === currentUserHash) {
      console.log(`[girl-summary] cache hit for girlId=${girlId}, clientId=${clientId}`);
      const cached = await getCache(clientId, girlId);
      if (cached) {
        // 流式返回缓存内容（模拟流式发送）
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const staleAlert = computeStaleAlert(girl);

        // 先发 meta 帧
        res.write(`data: ${JSON.stringify({
          cached: true,
          girlDataHash: currentGirlHash,
          userDataHash: currentUserHash,
          changeReason: null,
          staleAlert
        })}\n\n`);

        // 分块发送缓存内容（每 100 字符一块，模拟流式）
        const content = cached.content;
        const chunkSize = 100;
        for (let i = 0; i < content.length; i += chunkSize) {
          res.write(`data: ${JSON.stringify({ content: content.slice(i, i + chunkSize) })}\n\n`);
          await new Promise(r => setTimeout(r, 10)); // 小延迟模拟流式
        }

        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      // 缓存记录不在 DB 但 hash 匹配（迁移场景），fallthrough
    }

    // ---- 分支 2/3：需要重新生成 ----
    let changeReason = '数据更新';
    if (cachedGirlHash || cachedUserHash) {
      // 构建 prev snapshot（从缓存记录恢复，若无则用传入的 hash 估算）
      const cached = await getCache(clientId, girlId);
      if (cached) {
        const prevSnapshot = cached.prevSnapshot ? JSON.parse(cached.prevSnapshot) : {};
        const currSnapshot = {
          emotionalStable: user?.emotionalStable,
          antiFrustrationLevel: user?.antiFrustrationLevel,
          signalsLength: parseJson(user?.signals).length,
          pendingActionsLength: parseJson(user?.pendingActions).length,
          tensionScore: girl.tensionScore,
          intimacyLevel: girl.intimacyLevel,
          stage: girl.stage,
          signalsLength: parseJson(girl.signals).length,
          pendingActionsLength: parseJson(girl.pendingActions).length,
          girlHash: cached.girlDataHash,
          userHash: cached.userDataHash
        };
        changeReason = detectChangeReason(prevSnapshot, currSnapshot);
      } else {
        // 无缓存记录但前端有 hash → 首次或过期后首次
        changeReason = '数据更新';
      }
    }

    console.log(`[girl-summary] cache miss for girlId=${girlId}, clientId=${clientId}, reason: ${changeReason}`);

    // 解析 personality
    let personality = {};
    if (girl.personality) {
      try { personality = typeof girl.personality === 'string' ? JSON.parse(girl.personality) : girl.personality; } catch (e) {}
    }

    // 获取近期信号
    const signalsText = girl.signals.length > 0
      ? girl.signals.map(s => {
          const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
          return `${icon} ${s.event} — ${new Date(s.createdAt).toLocaleDateString()}`;
        }).join('\n')
      : '暂无记录';

    // 获取最近聊天
    const recentChats = girl.chatLogs.length > 0
      ? girl.chatLogs.map(l => `${l.isFromUser ? '操盘手' : '女生'}：${l.content.slice(0, 50)}`).join('\n')
      : '暂无聊天记录';

    // 失联提醒（不参与 hash）
    const staleAlert = computeStaleAlert(girl);

    const systemPrompt = `你是鱼塘AI情感教练，帮操盘手分析当前选中的女生，主动给出行动建议。

要求：
- 简洁口语化，像朋友聊天
- 直接给结论和建议，不要绕弯子
- 不要用任何加粗、斜体等格式
- 不要出现任何大师名字、称号、角色名
- 不要说置信度、框架、原则等专业术语
- 不要出现**符号

${changeReason !== '数据更新' ? `【数据变化原因】\n${changeReason}\n\n` : ''}
【女生档案】
昵称：${girl.name}
客户：${girl.client?.nickname || girl.client?.username || '未知'}
阶段：${girl.stage}
热度：${girl.tensionScore || 5}/10
亲密度：${girl.intimacyLevel || 1}

【性格画像】
MBTI：${personality.mbti || '未知'}
沟通风格：${personality.communicationStyle || '未知'}
情绪触发点：${(personality.emotionalTriggers || []).join('、') || '暂无'}
聊天禁忌：${(personality.thingsToAvoid || []).join('、') || '暂无'}
擅长话题：${(personality.talkingTopics || []).join('、') || '未知'}

【近期关键信号】
${signalsText}

【最近聊天】
${recentChats}

【备注】
${girl.notes || '暂无'}

请主动分析：
1. ${girl.name}现在处于什么状态，关系进展到哪一步了
2. 最近有什么值得注意的信号（正向/负向）
3. 现在最应该做什么，优先级是什么
4. 如果要聊天的话，切入点是什么

用聊天语气说，像朋友一样给建议。`;

    const aiConfig = getAIConfig();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'identity');
    res.flushHeaders();

    // 先发 meta 帧（包含 hash 和 changeReason）
    res.write(`data: ${JSON.stringify({
      cached: false,
      girlDataHash: currentGirlHash,
      userDataHash: currentUserHash,
      changeReason,
      staleAlert
    })}\n\n`);

    try {
      const response = await fetch(aiConfig.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [{ role: 'user', content: systemPrompt }],
          temperature: 0.7,
          max_tokens: 600,
          stream: true
        })
      });

      if (!response.ok) {
        res.write(`data: ${JSON.stringify({ error: 'AI服务请求失败' })}\n\n`);
        res.end();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = ''; // 累积用于写缓存

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
            } else {
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  const guardResult = streamGuardrails(content);
                  const safeContent = guardResult.safe ? content : guardResult.filtered;
                  if (safeContent) {
                    fullContent += safeContent;
                    res.write(`data: ${JSON.stringify({ content: safeContent })}\n\n`);
                  }
                }
              } catch (e) { /* ignore */ }
            }
          }
        }
      }

      // 写缓存（异步，不阻塞响应）
      if (fullContent) {
        const prevSnapshot = user ? {
          emotionalStable: user.emotionalStable,
          antiFrustrationLevel: user.antiFrustrationLevel,
          signalsLength: parseJson(user.signals).length,
          pendingActionsLength: parseJson(user.pendingActions).length
        } : {};
        setCache(clientId, girlId, {
          content: fullContent,
          girlDataHash: currentGirlHash,
          userDataHash: currentUserHash,
          prevSnapshot
        }).catch(err => console.error('[girl-summary] cache write failed:', err));
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('[AICoach] 女生专项分析失败:', error);
      res.write(`data: ${JSON.stringify({ error: '分析失败' })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('[AICoach] 女生专项分析失败:', error);
    res.status(500).json({ error: '获取女生分析失败' });
  }
});

// ============================================================
// dataHash 缓存失效函数（双维度）
// ============================================================

const HYSTERESIS = 2; // emotionalStable / antiFrustrationLevel 变化阈值

/**
 * 计算女生侧 dataHash
 * 字段：tensionScore + intimacyLevel + stage + signals.length + pendingActions.length
 */
function computeGirlDataHash(girl) {
  const signals = parseJson(girl.signals);
  const pendingActions = parseJson(girl.pendingActions);
  const raw = [
    girl.tensionScore ?? 5.0,
    girl.intimacyLevel ?? 1,
    girl.stage || '',
    (signals || []).length,
    (pendingActions || []).length
  ].join('|');
  return crypto.createHash('md5').update(raw).digest('hex');
}

/**
 * 计算用户侧 dataHash
 * 字段：currentStage + stageProgress + trustLevel + interactionHeat
 *       + serviceStage + emotionalStable + antiFrustrationLevel
 *       + coachCooperation + clientType
 *       + signals.length + pendingActions.length
 */
function computeUserDataHash(user) {
  const signals = parseJson(user.signals);
  const pendingActions = parseJson(user.pendingActions);
  const raw = [
    user.currentStage || '',
    user.stageProgress ?? 0,
    user.trustLevel ?? 1,
    user.interactionHeat ?? 5.0,
    user.serviceStage || '',
    user.emotionalStable ?? 5,
    user.antiFrustrationLevel ?? 5,
    user.coachCooperation || '',
    user.clientType || '',
    (signals || []).length,
    (pendingActions || []).length
  ].join('|');
  return crypto.createHash('md5').update(raw).digest('hex');
}

/**
 * 生成失联提醒
 * lastContact 超过 1 天才触发提醒
 */
function computeStaleAlert(girl) {
  if (!girl.lastContact) return null;
  const daysSince = Math.floor((Date.now() - new Date(girl.lastContact).getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince < 1) return null;
  if (daysSince <= 3) return `⚠️ ${girl.name || '该女生'} 已 ${daysSince} 天没联系了`;
  if (daysSince <= 7) return `🔴 ${girl.name || '该女生'} 已 ${daysSince} 天没联系，优先级上调`;
  return `🚨 ${girl.name || '该女生'} 已 ${daysSince} 天没联系，需要主动破冰`;
}

/**
 * 检测变化原因（双维度）
 * prev: { girlHash, userHash, emotionalStable, antiFrustrationLevel, signalsLength }
 * curr: same shape
 */
function detectChangeReason(prev, curr) {
  const reasons = [];

  if (prev.girlHash !== curr.girlHash) {
    // 女生侧变化：需从数据本身比对，以下为标签近似
    if (prev.tensionScore !== curr.tensionScore) reasons.push('🔥 热度变化');
    if (prev.intimacyLevel !== curr.intimacyLevel) reasons.push('❤️ 亲密度变化');
    if (prev.stage !== curr.stage) reasons.push('📍 阶段变化');
    if (prev.signalsLength !== curr.signalsLength) reasons.push('📡 新信号');
    if (prev.pendingActionsLength !== curr.pendingActionsLength) reasons.push('📋 待办变化');
  }

  if (prev.userHash !== curr.userHash) {
    // 用户侧：hysteresis 保护
    if (prev.emotionalStable !== undefined && curr.emotionalStable !== undefined) {
      if (Math.abs((prev.emotionalStable ?? 5) - (curr.emotionalStable ?? 5)) >= HYSTERESIS) {
        reasons.push('😤 情绪波动');
      }
    }
    if (prev.antiFrustrationLevel !== undefined && curr.antiFrustrationLevel !== undefined) {
      if (Math.abs((prev.antiFrustrationLevel ?? 5) - (curr.antiFrustrationLevel ?? 5)) >= HYSTERESIS) {
        reasons.push('💪 抗压变化');
      }
    }
    if (prev.trustLevel !== curr.trustLevel) reasons.push('🤝 信任度变化');
    if (prev.stageProgress !== curr.stageProgress) reasons.push('📈 阶段进度变化');
    if (prev.serviceStage !== curr.serviceStage) reasons.push('🎯 服务阶段变化');
    if (prev.coachCooperation !== curr.coachCooperation) reasons.push('🤝 配合度变化');
    if (prev.clientType !== curr.clientType) reasons.push('👤 客户类型变化');
    if (prev.signalsLength !== curr.signalsLength) reasons.push('📡 用户信号变化');
    if (prev.pendingActionsLength !== curr.pendingActionsLength) reasons.push('📋 用户待办变化');
  }

  return reasons.join(' + ') || '数据更新';
}

/**
 * 统一 JSON 解析（兼容 null / undefined / 字符串 / 对象）
 */
function parseJson(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}

module.exports = router;

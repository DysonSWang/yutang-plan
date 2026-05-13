/**
 * Agent Chat - 统一的 Agent 对话端点
 *
 * 参照 openai-cs-agents-demo/server.py 的架构：
 * - Triage Agent 作为入口
 * - Input Guardrails 先于 Agent 执行
 * - 专业 Agent 负责各自职责
 * - Handoff 机制传递上下文
 * - SSE 流式响应
 *
 * 路由类型：
 * - situation → SituationAgent
 * - chat_analysis → ChatAnalysisAgent
 * - reply → ReplyAgent
 * - optimize_reply → ReplyAgent (话术优化模式)
 * - moment → MomentAgent
 * - overview → OverviewAgent
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { JWT_SECRET, getAIConfig } = require('../config');
const prisma = require('../prisma');
const activityService = require('../services/activityService');

const { createUnifiedContext, ROUTE_TYPES } = require('../agents/UnifiedContext');
const { runInputGuardrails, formatGuardrailEvents } = require('../guardrails/input');
const { triage, getRouteTypeName } = require('../agents/triage');
const { executeHandoff } = require('../agents/handoffs');
const { buildMasterPrompt } = require('../coaches/promptBuilder');
const { getOrCreateSession, getConversationHistory, addMessage } = require('../services/memory');
const { streamGuardrails, createChunkDeduplicator, stripMarkdown } = require('../services/guardrails');
const { buildDynamicPersona, buildPersonaSection } = require('../services/coachPersona');
const { addStageContext } = require('../services/stageGuard');
const { buildAICoachContext } = require('../services/contextBuilder');

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: { code: 'A0101', message: '未提供认证令牌' } });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: { code: 'A0102', message: '认证令牌无效' } });
  }
};

// ---- 流式响应工具 ----

/**
 * 通用流式 fetch（带重试和超时控制）
 */
const DEFAULT_TIMEOUT = 120000; // 默认 120 秒超时

async function streamAI(aiConfig, params, opts = {}) {
  const { deduplicator, onChunk, onMeta, onDone, onError, timeout = DEFAULT_TIMEOUT } = opts;
  const RETRY_DELAYS = [100, 300, 900];
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1] || 900));
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(aiConfig.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: aiConfig.model, ...params }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (attempt === MAX_RETRIES) { onError?.(`AI服务请求失败 (${response.status})`); return; }
        continue;
      }

      await processStream(response, { deduplicator, onChunk, onDone, onError });
      return;
    } catch (err) {
      if (err.name === 'AbortError') {
        onError?.(`请求超时（${timeout / 1000}秒）`);
        return;
      }
      if (attempt === MAX_RETRIES) { onError?.(`网络异常: ${err.message}`); return; }
    }
  }
  onError?.('服务暂时不可用');
}

async function processStream(response, opts) {
  const { deduplicator, onChunk, onDone, onError } = opts;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') { onDone?.(); return; }
          try {
            const parsed = JSON.parse(data);
            let content = parsed.choices?.[0]?.delta?.content || '';
            if (!content) continue;

            // Output guardrails
            const guardResult = streamGuardrails(content);
            if (!guardResult.safe) {
              content = guardResult.filtered;
              console.warn(`[Guardrails] ${guardResult.reason}，已过滤`);
            }
            if (!content) continue;

            // Markdown strip
            content = stripMarkdown(content);
            if (!content) continue;

            // Deduplication
            if (deduplicator?.check(content)) continue;

            onChunk?.(content);
          } catch {}
        }
      }
    }
    onDone?.();
  } catch {
    onError?.('流式读取异常');
  }
}

// ---- Agent Handlers ----

/**
 * Situation Agent Handler
 * 情况咨询：分析当前情况，给出行动建议
 */
async function handleSituation(input, ctx, res) {
  const mode = ctx.mode || 'pro';
  const aiConfig = getAIConfig(mode);

  // max_tokens 根据模式调整
  const maxTokens = mode === 'flash' ? 20000 : 50000;

  // 构建上下文（包含 Wiki 知识注入）
  const context = await buildAICoachContext(
    ctx.userId,
    ctx.girlId,
    input,
    {
      maxContextChars: 5000,
      turnCount: ctx.turnCount,
      compactionCount: ctx.compactionCount,
      clientProfile: ctx.clientProfile,
      routingMeta: ctx.eventLog.length > 0
        ? { routedType: ctx.currentRouteType, coachesUsed: [] }
        : { routedType: 'situation', coachesUsed: [] }
    }
  );

  // 构建 system prompt（注入 wikiContext）
  const basePrompt = await buildMasterPrompt(input, context, {
    girlInfo: context.girlInfo,
    conversationHistory: ctx.conversationHistory,
    turnCount: ctx.turnCount,
    clientProfile: ctx.clientProfile,
    clientId: ctx.userId,
  });

  // M007 S06: 追加人格适配
  let personaSection = '';
  if (ctx.clientProfile) {
    try {
      const persona = await buildDynamicPersona({ clientProfile: ctx.clientProfile, clientId: ctx.userId, girlId: ctx.girlId });
      personaSection = buildPersonaSection(persona);
    } catch {}
  }

  const systemPrompt = basePrompt + personaSection;

  // 女生档案新鲜度警告
  let staleAlert = null;
  if (ctx.girlProfile?.updatedAt) {
    const hoursSince = Math.floor((Date.now() - new Date(ctx.girlProfile.updatedAt).getTime()) / (1000 * 60 * 60));
    if (hoursSince >= 48) {
      staleAlert = { hoursSince, message: `和${ctx.girlProfile.name || '该女生'}的资料已 ${hoursSince}h 未更新` };
    }
  }

  const routingMeta = ctx.eventLog.length > 0
    ? { routeType: ctx.currentRouteType, routeName: getRouteTypeName(ctx.currentRouteType) }
    : null;

  // 发送 meta
  if (staleAlert || routingMeta) {
    const meta = { ...routingMeta };
    if (staleAlert) meta.staleAlert = staleAlert;
    res.write(`data: ${JSON.stringify({ meta })}\n\n`);
  }

  const deduplicator = createChunkDeduplicator();
  let fullResponse = '';

  // 调试：打印 Wiki 上下文长度
  if (context.wikiContext) {
    console.log(`[handleSituation] Wiki上下文: ${context.wikiContext.length} 字符`);
  }

  await streamAI(
    aiConfig,
    {
      messages: [{ role: 'user', content: systemPrompt }],
      temperature: 0.7,
      max_tokens: maxTokens,
      stream: true
    },
    {
      deduplicator,
      onChunk: (content) => {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      },
      onDone: async () => {
        // 保存到记忆
        if (fullResponse && ctx.memorySessionId) {
          addMessage(ctx.memorySessionId, 'assistant', fullResponse).catch(console.error);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      },
      onError: (msg) => {
        res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: msg } })}\n\n`);
        res.end();
      }
    }
  );
}

/**
 * ChatAnalysis Agent Handler
 * 聊天分析：分析聊天记录，识别意图和情绪
 */
async function handleChatAnalysis(input, ctx, res) {
  const aiConfig = getAIConfig(ctx.mode || 'pro');

  // 从 input 中提取 chatHistory（格式: "##CHAT##\n<聊天内容>"）
  let chatHistory = '';
  let remainingInput = input;

  const chatSeparator = input.indexOf('##CHAT##');
  if (chatSeparator !== -1) {
    remainingInput = input.slice(0, chatSeparator).trim();
    chatHistory = input.slice(chatSeparator + '##CHAT##'.length).trim();
  }

  // 如果没有聊天历史，提示用户
  if (!chatHistory) {
    const response = '请提供聊天记录来分析哦。格式：直接粘贴聊天记录，前面可以加一句描述。';
    res.write(`data: ${JSON.stringify({ content: response })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const historyText = chatHistory.split('\n').map(line => {
    // 简单识别：带"女"或"她"的是女生，带"男"或"我"的是用户
    if (line.trim().startsWith('她:') || line.trim().startsWith('女生:')) {
      return `女生：${line.replace(/^(她|女生)：/, '')}`;
    }
    return `用户：${line}`;
  }).join('\n');

  // 构建分析 prompt
  const relStage = ctx.girlProfile?.relationshipStage;
  const relStageLabel = relStage
    ? { EXPLORATION: '探索期', FLIRTING: '暧昧期', ADVANCEMENT: '推进期', CONFIRMATION: '确认期', STABLE: '稳定期' }[relStage] || relStage
    : '未设置';
  const stageContext = addStageContext(relStage);

  let personaSection = '';
  if (ctx.clientProfile) {
    try {
      const persona = await buildDynamicPersona({ clientProfile: ctx.clientProfile, clientId: ctx.userId, girlId: ctx.girlId });
      personaSection = buildPersonaSection(persona);
    } catch {}
  }

  const systemPrompt = `你是缘分AI情感教练，分析聊天记录，识别对话双方的意图、情绪和关系状态。

【分析框架】
请结合当前关系阶段(${relStageLabel})给出针对性分析。

【聊天记录】
${historyText}

【女生档案】（参考）
昵称：${ctx.girlProfile?.name || '未知'}
关系阶段：${relStageLabel}
热度：${ctx.girlProfile?.tensionScore || 5}/10
亲密度：${ctx.girlProfile?.intimacyLevel || 1}

${ctx.girlProfile?.personality?.communicationStyle ? `沟通风格：${ctx.girlProfile.personality.communicationStyle}` : ''}

${stageContext}
${personaSection}

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

  // 发送 meta
  res.write(`data: ${JSON.stringify({ meta: { routeType: ctx.currentRouteType, routeName: getRouteTypeName(ctx.currentRouteType), analysis: true } })}\n\n`);

  // 非流式（JSON 结构化输出）
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
        max_tokens: 800
      })
    });

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    // Guardrails
    const guardResult = streamGuardrails(content);
    if (!guardResult.safe) content = guardResult.filtered;
    content = stripMarkdown(content);

    let analysis;
    try {
      analysis = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      analysis = { raw: content };
    }

    res.write(`data: ${JSON.stringify({ analysis, relationshipStage: relStage, relationshipStageLabel: relStageLabel })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: `分析失败: ${err.message}` })}\n\n`);
    res.end();
  }
}

/**
 * Reply Agent Handler
 * 回复建议 / 话术优化
 */
async function handleReply(input, ctx, res, mode = 'suggest') {
  const aiConfig = getAIConfig(ctx.mode || 'flash');  // 回复建议默认 flash

  // 解析输入：是否有原始回复文本（话术优化模式）
  let originalReply = null;
  let remainingInput = input;

  // 格式1: "##ORIG##<原回复>\n##INPUT##<问题>"
  // 格式2: "怎么回：xxx"
  // 格式3: "优化这个回复：xxx"

  const origMatch = input.match(/##ORIG##([\s\S]*?)##INPUT##/);
  const optimizeMatch = input.match(/^优化.*?[:：]\s*([\s\S]+)$/im);
  const replyMatch = input.match(/^怎么[回复]?[:：]\s*([\s\S]+)$/im);

  if (optimizeMatch) {
    originalReply = optimizeMatch[1].trim();
    remainingInput = input.replace(optimizeMatch[0], '').trim();
  } else if (origMatch) {
    originalReply = origMatch[1].trim();
    remainingInput = origMatch.input.slice(origMatch.index + origMatch[0].length).trim();
  } else if (replyMatch) {
    remainingInput = replyMatch[1].trim();
  }

  const isOptimizeMode = !!originalReply;

  // 构建 prompt
  const relStage = ctx.girlProfile?.relationshipStage;
  const relStageLabel = relStage
    ? { EXPLORATION: '探索期', FLIRTING: '暧昧期', ADVANCEMENT: '推进期', CONFIRMATION: '确认期', STABLE: '稳定期' }[relStage] || relStage
    : '未设置';
  const stageContext = addStageContext(relStage);

  const personality = ctx.girlProfile?.personality || {};
  let personaSection = '';
  if (ctx.clientProfile) {
    try {
      const persona = await buildDynamicPersona({ clientProfile: ctx.clientProfile, clientId: ctx.userId, girlId: ctx.girlId });
      personaSection = buildPersonaSection(persona);
    } catch {}
  }

  let systemPrompt;
  if (isOptimizeMode) {
    systemPrompt = `你是缘分AI情感教练，把平淡或生硬的回复优化成有温度、有情商、有吸引力的聊天内容。

【女生档案】
昵称：${ctx.girlProfile?.name || '未知'}
阶段：${relStageLabel}
性格：${personality.communicationStyle || '未知'}
${stageContext}
${personaSection}

【原始回复】
"${originalReply}"

请生成3个优化版本，每个15-30字：
1. 自然型：语气口语化，像正常聊天
2. 温度型：情绪温暖，带点暧昧
3. 性格型：更契合${personality.communicationStyle || '未知'}风格

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
  } else {
    systemPrompt = `你是缘分AI情感教练，根据以下信息生成回复选项。

【女生档案】
昵称：${ctx.girlProfile?.name || '未知'}
关系阶段：${relStageLabel}
热度：${ctx.girlProfile?.tensionScore || 5}/10
亲密度：${ctx.girlProfile?.intimacyLevel || 1}

【性格画像】
MBTI：${personality.mbti || '未知'}
沟通风格：${personality.communicationStyle || '未知'}
情绪触发点：${(personality.emotionalTriggers || []).join('、') || '暂无'}
聊天禁忌：${(personality.thingsToAvoid || []).join('、') || '暂无'}
喜欢话题：${(personality.talkingTopics || []).join('、') || '未知'}
${stageContext}
${personaSection}

【对方最后一条消息】
${remainingInput}

回复风格适配阶段（${relStageLabel}），女生沟通风格（${personality.communicationStyle || '未知'}）。

请生成3个不同风格的回复，每个回复要求：15-30字、口语化、符合女生性格：

1. 稳妥型：安全、礼貌的回复，维持舒适感，不冒进
2. 进攻型：稍微大胆、有攻势的回复，推进关系，制造暧昧（注意：仅在暧昧期和推进期适用）
3. 调侃型：轻松、幽默的回复，活跃气氛，试探对方反应

请按以下 JSON 格式返回：
{
  "options": [
    { "type": "稳妥型", "reply": "回复内容（15-30字）", "intention": "意图说明" },
    { "type": "进攻型", "reply": "回复内容（15-30字）", "intention": "意图说明" },
    { "type": "调侃型", "reply": "回复内容（15-30字）", "intention": "意图说明" }
  ]
}

只输出 JSON，不要其他内容。`;
  }

  res.write(`data: ${JSON.stringify({ meta: { routeType: ctx.currentRouteType, routeName: getRouteTypeName(ctx.currentRouteType), optimize: isOptimizeMode } })}\n\n`);

  // 非流式（JSON）
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
        temperature: 0.8,
        max_tokens: isOptimizeMode ? 1200 : 1000
      })
    });

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    const guardResult = streamGuardrails(content);
    if (!guardResult.safe) content = guardResult.filtered;
    content = stripMarkdown(content);

    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content };
    } catch {
      result = { raw: content };
    }

    res.write(`data: ${JSON.stringify({ result, relationshipStage: relStage, relationshipStageLabel: relStageLabel })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: `生成失败: ${err.message}` })}\n\n`);
    res.end();
  }
}

/**
 * Moment Agent Handler
 * 朋友圈分析
 */
async function handleMoment(input, ctx, res) {
  const aiConfig = getAIConfig();

  const relStage = ctx.girlProfile?.relationshipStage;
  const relStageLabel = relStage
    ? { EXPLORATION: '探索期', FLIRTING: '暧昧期', ADVANCEMENT: '推进期', CONFIRMATION: '确认期', STABLE: '稳定期' }[relStage] || relStage
    : '未设置';
  const stageContext = addStageContext(relStage);
  const personality = ctx.girlProfile?.personality || {};

  let personaSection = '';
  if (ctx.clientProfile) {
    try {
      const persona = await buildDynamicPersona({ clientProfile: ctx.clientProfile, clientId: ctx.userId, girlId: ctx.girlId });
      personaSection = buildPersonaSection(persona);
    } catch {}
  }

  const signalsText = ctx.recentSignals.length > 0
    ? ctx.recentSignals.map(s => {
        const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
        return `${icon} ${s.event} — ${s.date}`;
      }).join('\n')
    : '暂无';

  const systemPrompt = `你是缘分AI情感教练，帮助分析女生朋友圈，给出评论和私聊切入建议。

回答要求：
- 简洁口语化，像朋友聊天
- 直接给结论和建议，不要绕弯子
- 不要用任何加粗、斜体等格式
- 不要出现任何大师名字、称号、角色名
- 不要说置信度、框架、原则等专业术语

【女生档案】
昵称：${ctx.girlProfile?.name || '未知'}
关系阶段：${relStageLabel}
热度：${ctx.girlProfile?.tensionScore || 5}/10
亲密度：${ctx.girlProfile?.intimacyLevel || 1}

【性格画像】
MBTI：${personality.mbti || '未知'}
沟通风格：${personality.communicationStyle || '未知'}
情绪触发点：${(personality.emotionalTriggers || []).join('、') || '暂无'}
聊天禁忌：${(personality.thingsToAvoid || []).join('、') || '暂无'}
擅长话题：${(personality.talkingTopics || []).join('、') || '未知'}

【近期关键信号】
${signalsText}

【待推进事项】
${ctx.pendingActions.length > 0 ? ctx.pendingActions.map(a => `- ${a}`).join('\n') : '暂无'}

${input ? `【朋友圈内容】\n${input}\n` : ''}

请分析这条朋友圈，给出评论和私聊切入建议。

【回答格式】（严格按这个格式输出，不要加任何标题前缀，不要用markdown）：
第一段：这条朋友圈发的是什么，她大概是什么情绪和状态
第二段：这条朋友圈透露出什么信息（生活方式、社交圈、感情状态等）
第三段：适合评论还是私聊切入，为什么
第四段：给2-3条具体的评论建议或私聊切入话术（15-30字，自然有共鸣感，不跪舔也不高冷）
第五段：如果信息不够，直接说还缺什么，追问1个关键问题

${stageContext}
${personaSection}`;

  res.write(`data: ${JSON.stringify({ meta: { routeType: ctx.currentRouteType, routeName: getRouteTypeName(ctx.currentRouteType) } })}\n\n`);

  const deduplicator = createChunkDeduplicator();
  let fullResponse = '';

  await streamAI(
    aiConfig,
    {
      messages: [{ role: 'user', content: systemPrompt }],
      temperature: 0.7,
      max_tokens: 600,
      stream: true
    },
    {
      deduplicator,
      onChunk: (content) => {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      },
      onDone: () => {
        res.write('data: [DONE]\n\n');
        res.end();
      },
      onError: (msg) => {
        res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: msg } })}\n\n`);
        res.end();
      }
    }
  );
}

// ---- Main Endpoint ----

/**
 * POST /api/agent/chat
 *
 * 统一的 Agent 聊天端点
 *
 * Body:
 * {
 *   message: string,       // 用户消息
 *   girlId?: string,       // 女生ID（可选）
 *   chatHistory?: Array<{content: string, role: 'user'|'assistant'}>, // 聊天历史（用于 chat_analysis）
 *   mode?: string,         // 强制路由类型（可选，agent自动判断）
 * }
 */
router.post('/chat', authMiddleware, async (req, res) => {
  const startTime = Date.now();

  try {
    // Role check
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { message, girlId, chatHistory, mode } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: { code: 'S0803', message: 'message 是必需的' } });
    }

    const userId = req.user.id;
    // 根据 mode 参数选择 AI 配置（默认 pro）
    const aiConfig = getAIConfig(mode || 'pro');

    // ---- 1. 构建 UnifiedContext ----
    const ctx = await createUnifiedContext(userId, {
      girlId,
      clientId: userId,
      originalInput: message,
      mode: mode || 'pro',  // 传递 mode 到 handlers
    });

    // 如果有女生，获取 memory session
    if (girlId && ctx.girlProfile) {
      const { girl } = await prisma.girl.findUnique({ where: { id: girlId } }).then(g => ({ girl: g }));
      if (girl && girl.clientId) {
        ctx.clientId = girl.clientId;
        // 重新加载客户档案
        const client = await prisma.user.findUnique({
          where: { id: girl.clientId },
          select: {
            emotionalMaturity: true, emotionalMaturityLevel: true,
            antiFrustrationLevel: true, pacePreference: true,
            clientType: true, coachCooperation: true, coachCooperationLevel: true,
            emotionalStable: true, eqLevel: true, learningAbility: true,
            attachmentStyle: true, loveStyle: true,
            loveLanguage1: true, loveLanguage2: true, loveLanguage3: true,
            clientBestApproach: true, clientRiskFactors: true,
            clientRecommendedTopics: true, clientStrategicNotes: true,
          }
        });
        if (client) ctx.clientProfile = client;
      }

      // Memory session
      const { memory } = await getOrCreateSession(userId, 'unified', girlId);
      ctx.memorySessionId = memory.id;
      const history = await getConversationHistory(memory.id);
      ctx.conversationHistory = history;
      ctx.turnCount = history.filter(m => m.role === 'user' || m.role === 'assistant').length;
    }

    // ---- 2. 设置 SSE ----
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // ---- 3. Input Guardrails ----
    const guardrailResult = await runInputGuardrails(message);

    // 发送 guardrail 检查结果
    const guardrailEvents = formatGuardrailEvents(guardrailResult.results);
    for (const evt of guardrailEvents) {
      res.write(`data: ${JSON.stringify({ event: 'guardrail', ...evt })}\n\n`);
    }

    if (!guardrailResult.passed) {
      // Guardrail 失败，返回拒绝响应
      const refusal = '抱歉，这个问题我无法回答。请换个和情感相关的话题。';
      res.write(`data: ${JSON.stringify({ content: refusal, guardrailFailed: true })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // ---- 4. Triage Agent 路由 ----
    const triageResult = await triage(message, ctx, aiConfig);

    res.write(`data: ${JSON.stringify({
      event: 'triage',
      routeType: triageResult.routeType,
      routeName: getRouteTypeName(triageResult.routeType),
      confidence: triageResult.confidence,
      method: triageResult.method,
    })}\n\n`);

    // 记录用户消息到记忆
    if (ctx.memorySessionId) {
      addMessage(ctx.memorySessionId, 'user', message).catch(console.error);
      activityService.recordActivity(req.user.id, 'mo_chat').catch(console.error);
    }

    // ---- 5. 执行对应 Agent ----
    await executeHandoff(ctx, triageResult.routeType, triageResult.meta?.coachType || null);

    switch (triageResult.routeType) {
      case ROUTE_TYPES.SITUATION:
      case ROUTE_TYPES.GENERAL:
        await handleSituation(message, ctx, res);
        break;

      case ROUTE_TYPES.CHAT_ANALYSIS:
        await handleChatAnalysis(message, ctx, res);
        break;

      case ROUTE_TYPES.REPLY:
        await handleReply(message, ctx, res, 'suggest');
        break;

      case ROUTE_TYPES.OPTIMIZE_REPLY:
        await handleReply(message, ctx, res, 'optimize');
        break;

      case ROUTE_TYPES.MOMENT:
        await handleMoment(message, ctx, res);
        break;

      default:
        await handleSituation(message, ctx, res);
    }

  } catch (error) {
    console.error('[AgentChat] 处理失败:', error);
    res.write(`data: ${JSON.stringify({ error: { code: 'A0601', message: 'AI服务暂时不可用' } })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/agent/health
 * 健康检查
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;

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
const { buildAICoachContext, getContextSummary } = require('../services/contextBuilder');
const { getCoach, listCoaches, getSystemPrompt } = require('../coaches');
const { chatWithTools, toolDefinitions } = require('../services/coach-engine');
const { getOrCreateSession, addMessage, shouldSummarize, getConversationHistory, listSessions, getClientSessions, getSystemStats, getSessionDetail } = require('../services/memory');
const { searchLearnings, extractLearningsFromConversation, formatLearningsForPrompt } = require('../services/learning');

const { JWT_SECRET, getAIConfig } = require('../config');
const prisma = require('../prisma');

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

// 教练配置已迁移到 coaches/index.js，通过 getCoach() 获取

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

    const { girlId, situation, coachId = 'general', stream = true } = req.body;

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

    // 使用 contextBuilder 获取上下文
    const context = await buildAICoachContext(req.user.id, girlId);
    const coach = getCoach(coachId);

    // 构建 systemPrompt（带上下文）
    let contextInfo = '';
    if (context.girlInfo) {
      contextInfo = `
【女生档案】
ID：${context.girlInfo.id}（调用工具时必须使用此ID）
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
`;
    }

    // 获取或创建对话会话（用于多轮记忆）
    const { memory: sessionMemory } = await getOrCreateSession(req.user.id, coachId, girlId);

    // 获取对话历史（包含压缩链上下文）
    const history = await getConversationHistory(sessionMemory.id);

    // 构建对话历史文本（注入到prompt）
    let historyText = '';
    if (history.length > 0) {
      historyText = history.map(m =>
        `${m.role === 'system' ? '【系统】' : m.role === 'user' ? '用户' : '教练'}: ${m.content}`
      ).join('\n');
    }

    const systemPrompt = `${coach.systemPrompt}
${contextInfo}
${historyText ? `【本次对话历史】（包含压缩后的上下文）\n${historyText}\n` : ''}
请根据以上上下文，结合当前情况，给出简洁专业的分析和建议（回复要简短，300字以内）：

【当前情况】
${situation}

请给出：
1. 核心分析（1-2句）
2. 推荐回复话术（1-2句）
3. 注意事项（1-2句）

要求：简洁有力，使用 Markdown 格式`;

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
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  if (content) {
                    fullResponse += content; // 累积完整响应
                    res.write(`data: ${JSON.stringify({ content })}\n\n`);
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }
        }

        console.log(`[AICoach] 流式读取完成，buffer剩余: ${buffer.length}`);

        // 保存AI响应到记忆
        if (fullResponse) {
          await addMessage(sessionMemory.id, 'assistant', fullResponse);
          console.log(`[AICoach] 保存AI响应到记忆，长度: ${fullResponse.length}`);

          // 检查是否需要摘要
          if (await shouldSummarize(sessionMemory.id)) {
            console.log(`[AICoach] 即将进行摘要（消息数已达${10}条）`);
            // 摘要会在下次对话时触发
          }
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
          coachConfig: coach,
          tools: toolDefinitions
        });

        // 保存对话到记忆（非流式模式）
        await addMessage(sessionMemory.id, 'assistant', analysis);

        res.json({
          success: true,
          coachName: coach.name,
          analysis
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

    const systemPrompt = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验，真诚自然，不油腔滑调，不套路撩骚。

请分析以下聊天记录，识别对话双方的意图、情绪和关系状态。

【聊天记录】
${historyText}

${girlContextInfo}

请按以下10个维度输出 JSON 分析结果：
1. **userIntention**：用户意图（了解信息/表达好感/试探邀约/调侃/抱怨/敷衍等）
2. **userEmotion**：用户情绪（开心/犹豫/害羞/期待/淡定/焦虑等）
3. **girlIntention**：女生意图（了解信息/表达好感/试探邀约/敷衍/冷淡/求关注等）
4. **girlEmotion**：女生情绪（开心/犹豫/害羞/期待/冷淡/敷衍等）
5. **relationshipStage**：关系阶段（陌生/搭讪/聊天/暧昧/约会等）
6. **keySignals**：关键信号列表（2-3个）
7. **girlSignals**：女生积极信号列表（1-2个，没有则写"暂无明显积极信号"）
8. **interactionQuality**：互动质量评价（顺畅/有来有往/单方面主动/冷淡等）
9. **riskSignals**：风险信号（如有）
10. **suggestions**：操盘手建议（1-2条）

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

    // 构建女生完整上下文
    let girlContextInfo = '';
    if (fullContext.girlInfo) {
      const p = fullContext.girlInfo.personality || {};
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

    const systemPrompt = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验，真诚自然，不油腔滑调，不套路撩骚。

你是专业的聊天话术专家。请根据以下信息，生成3个不同风格的回复选项。

${girlContextInfo}
【对方最后一条消息】
${lastMessage}

${context ? `【对话背景】\n${context}` : ''}

请按以下3个维度生成回复，每个回复要求：15-30字、口语化、符合女生性格、有明确意图导向：

1. **稳妥型**：安全、礼貌的回复，维持舒适感，不冒进
2. **进攻型**：稍微大胆、有攻势的回复，推进关系，制造暧昧
3. **调侃型**：轻松、幽默的回复，活跃气氛，试探对方反应

回复风格适配阶段（${fullContext?.girlInfo?.stage || '聊天'}），同时要考虑女生的沟通风格（${p?.communicationStyle || '未知'}）。

请按以下 JSON 格式返回：
{
  "options": [
    { "type": "稳妥型", "reply": "回复内容（15-30字）", "intention": "意图说明（维持/推进/试探）" },
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

    const systemPrompt = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验，真诚自然，不油腔滑调，不套路撩骚。

你是一个专业的话术优化专家。你擅长把平淡或生硬的回复优化成有温度、有情商、有吸引力的聊天内容。

请从以下4个维度优化操盘手准备发送的回复，每个维度给出具体的优化说明：

优化维度：
1. **语气自然度**：口语化、去生硬感。像正常聊天，不要像在背台词或写情书。
2. **情绪温度**：带情绪、少机械感。不要干巴巴的信息传递，要有温度和互动感。
3. **性格契合度**：更契合女生性格（${fullContext?.girlInfo?.name || '女生'}是${personality?.communicationStyle || '未知'}风格）。
4. **意图精准度**：明确回复想达到什么目的（${goalHint ? goalHint.split('【优化目标】')[1] : '推进关系/维持舒适感/试探'})，优化版本要服务于这个目的。

【女生档案】
昵称：${fullContext?.girlInfo?.name || '未知'}
阶段：${fullContext?.girlInfo?.stage || '未知'}
热度：${fullContext?.girlInfo?.tensionScore || 5}/10 ${(fullContext?.girlInfo?.tensionScore || 0) >= 8 ? '🔥🔥🔥' : (fullContext?.girlInfo?.tensionScore || 0) >= 7 ? '🔥🔥' : (fullContext?.girlInfo?.tensionScore || 0) >= 5 ? '🔥' : (fullContext?.girlInfo?.tensionScore || 0) >= 3 ? '❄️' : '❄️❄️'}
性格：${personality?.communicationStyle || '未知'} | ${personality?.mbti || '未知MBTI'}
情绪触发点：${(personality?.emotionalTriggers || []).join('、') || '暂无'}
聊天禁忌：${(personality?.thingsToAvoid || []).join('、') || '暂无'}
喜欢话题：${(personality?.talkingTopics || []).join('、') || '未知'}
近期信号：${fullContext?.recentSignals?.[0]?.event || '暂无'}
待推进：${fullContext?.pendingActions?.[0] || '暂无'}

【原始回复】
"${originalReply}"

请按以下 JSON 格式返回：
{
  "original": "${originalReply}",
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
      "point": "优化点：更契合${personality?.communicationStyle || '未知'}风格，${personality?.talkingTopics?.[0] ? '融入' + personality.talkingTopics[0] + '话题' : '适配她的性格节奏'}",
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

module.exports = router;

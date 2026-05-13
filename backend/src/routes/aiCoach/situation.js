/**
 * /situation 路由 - 情况咨询
 *
 * 从 aiCoach/index.js 提取，职责单一化
 */

const { buildAICoachContext } = require('../../services/contextBuilder');
const { buildMasterPrompt, getMultiDimensionalSkillsWithMeta } = require('../../coaches');
const { chatWithTools, toolDefinitions } = require('../../services/coach-engine');
const { getOrCreateSession, addMessage, removeLastAssistantMessage, getConversationHistory } = require('../../services/memory');
const { streamGuardrails, runGuardrails, stripMarkdown, estimateTokens: guardEstimateTokens, createChunkDeduplicator } = require('../../services/guardrails');
const { runInputGuardrails } = require('../../guardrails/input');
const { extractLearningsFromConversation } = require('../../services/learning');
const { buildPersonaSection, buildFullPersona } = require('../../services/coachPersona');
const { getAIConfig } = require('../../config');
const prisma = require('../../prisma');
const membershipService = require('../../services/membershipService');
const activityService = require('../../services/activityService');
const logger = require('../../utils/logger');

// ---- Token Budget Config ----
const AI_RESPONSE_RESERVE = 2000;
const SYSTEM_PROMPT_BASE = 800;
const MAX_PROMPT_TOKENS = 100000;
const RETRY_DELAYS = [100, 300, 900];
const MAX_RETRIES = 3;
const STREAM_TIMEOUT = 180000;

// ---- 内部工具函数 ----

function sanitizeRoutingMeta(meta) {
  if (!meta) return null;
  const { routedType, bestScore, coachCount, coaches, dimensions, debug } = meta;
  return {
    routedType,
    bestScore,
    coachCount,
    coaches: coaches?.map(c => ({ id: c.id, name: c.name, dimension: c.dimension, score: c.score })),
    dimensions,
    ...(debug ? { debug } : {})
  };
}

async function logGuardrailCheck(inputText, clientId, coachId, girlId, endpoint) {
  const text = typeof inputText === 'string' ? inputText.slice(0, 100) : '';
  try {
    const { results } = await runInputGuardrails(inputText || '');
    for (const r of results) {
      await prisma.guardrailLog.create({
        data: {
          clientId: clientId || null,
          coachId: coachId || 'unified',
          girlId: girlId || null,
          checkType: r.name.toLowerCase(),
          passed: r.passed,
          reason: r.reason || null,
          reasoning: r.info?.reasoning || null,
          inputText: text || null,
          endpoint: endpoint || null,
        }
      });
    }
  } catch (err) {
    logger.warn(`[Guardrail] 日志记录失败: ${err.message}`, { error: err.message });
  }
}

function calcContextBudget(coachSystemPrompt, situation, historyText) {
  const staticTokens = guardEstimateTokens(coachSystemPrompt)
    + guardEstimateTokens(situation)
    + guardEstimateTokens(historyText)
    + SYSTEM_PROMPT_BASE;
  const available = MAX_PROMPT_TOKENS - staticTokens - AI_RESPONSE_RESERVE;
  return Math.max(0, available * 4);
}

async function callAIStream(aiConfig, params, opts = {}) {
  const { onChunk, onMeta, onDone, onError, onReasoning, deduplicator } = opts;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 900;
      logger.info(`[AICoach] 重试 ${attempt}/${MAX_RETRIES}，等待 ${delay}ms`, { attempt, maxRetries: MAX_RETRIES, delay });
      await new Promise(r => setTimeout(r, delay));
    }

    try {
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
        const errorText = await response.text();
        logger.error(`[AICoach] AI provider 错误 (attempt ${attempt + 1}): ${response.status} ${errorText}`, { attempt, status: response.status });
        if (attempt === MAX_RETRIES) { onError?.(`AI服务请求失败 (${response.status})`); return; }
        continue;
      }

      onMeta?.();
      await processStreamResponse(response, { deduplicator, onChunk, onReasoning, onDone, onError });
      return;
    } catch (err) {
      if (err.name === 'AbortError') {
        onError?.(`请求超时（${STREAM_TIMEOUT / 1000}秒）`);
        return;
      }
      logger.error(`[AICoach] 流式调用异常 (attempt ${attempt + 1}): ${err.message}`, { attempt, error: err.message });
      if (attempt === MAX_RETRIES) { onError?.('网络异常，请稍后重试'); return; }
    }
  }

  onError?.('服务暂时不可用');
}

async function processStreamResponse(response, opts = {}) {
  const { deduplicator, onChunk, onReasoning, onDone, onError } = opts;

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let totalReasoningChars = 0;
    let totalContentChars = 0;

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
            logger.info(`[AICoach] 响应完成 | 思考: ${totalReasoningChars} chars | 正文: ${totalContentChars} chars | 正文约 ${Math.round(totalContentChars / 2.5)} tokens`);
            onDone?.(); return;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta || {};

            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === 'length') {
              logger.warn(`[AICoach] 响应被 max_tokens 截断！思考: ${totalReasoningChars} 正文: ${totalContentChars}`);
            } else if (finishReason === 'stop') {
              logger.info(`[AICoach] 模型主动停止 (finish_reason=stop) | 思考: ${totalReasoningChars} 正文: ${totalContentChars}`);
            }

            const reasoning = delta.reasoning_content || '';
            if (reasoning) {
              totalReasoningChars += reasoning.length;
              onReasoning?.(reasoning);
              continue;
            }

            let content = delta.content || '';
            if (!content) continue;
            totalContentChars += content.length;

            const guardResult = streamGuardrails(content);
            if (!guardResult.safe) {
              logger.warn(`[Guardrails] ${guardResult.reason}，已过滤`, { reason: guardResult.reason });
              content = guardResult.filtered;
            }
            if (!content) continue;

            if (deduplicator?.check(content)) continue;

            onChunk?.(content);
          } catch (e) { /* ignore parse errors */ }
        }
      }
    }

    onDone?.();
  } catch (err) {
    onError?.('流式读取异常');
  }
}

// ---- 女生档案提取（situation 端点特有）----

async function extractGirlProfileFromConversation(clientId, girlId, conversationText, situation) {
  // 使用简化 prompt 让 AI 提取女生档案更新
  const extractPrompt = `你是数据提取助手。从以下对话中提取关于女生的信息更新。

对话内容：
${conversationText.slice(-2000)}

用户描述的情况：
${situation}

请提取以下字段（仅提取有明确证据的信息，不要猜测）：
- personality: { openness, conscientiousness, extraversion, agreeableness, neuroticism } 0-10
- loveLanguages: [] 爱的语言（如 "精心时刻", "肯定言辞", "服务行动", "接受礼物", "身体接触"）
- attachmentStyle: 依恋类型（"安全型", "焦虑型", "回避型", "混乱型"）
- communicationStyle: 沟通风格
- interests: [] 兴趣爱好
- values: [] 价值观

返回 JSON 格式，没有信息的字段不要包含。`;

  try {
    const aiConfig = getAIConfig('flash');
    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: 'user', content: extractPrompt }],
        temperature: 0.1,
        max_tokens: 1000
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 提取 JSON 块
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.error(`[GirlProfile] AI 提取失败: ${err.message}`, { error: err.message });
    return null;
  }
}

async function applyGirlProfileUpdate(girlId, extracted) {
  try {
    const updateData = {};

    if (extracted.personality && typeof extracted.personality === 'object') {
      updateData.personality = JSON.stringify(extracted.personality);
    }
    if (Array.isArray(extracted.loveLanguages)) {
      updateData.loveLanguages = JSON.stringify(extracted.loveLanguages);
    }
    if (extracted.attachmentStyle) {
      updateData.attachmentStyle = extracted.attachmentStyle;
    }
    if (extracted.communicationStyle) {
      updateData.communicationStyle = extracted.communicationStyle;
    }
    if (Array.isArray(extracted.interests)) {
      updateData.interests = JSON.stringify(extracted.interests);
    }
    if (Array.isArray(extracted.values)) {
      updateData.values = JSON.stringify(extracted.values);
    }

    if (Object.keys(updateData).length === 0) return;

    await prisma.girl.update({
      where: { id: girlId },
      data: updateData
    });

    logger.info(`[GirlProfile] 已更新女生档案`, { girlId, fields: Object.keys(updateData) });
  } catch (err) {
    logger.error(`[GirlProfile] 更新失败: ${err.message}`, { error: err.message });
  }
}

// ---- 路由注册 ----

function registerSituationRoute(router, authMiddleware) {
  router.post('/situation', authMiddleware, async (req, res) => {
    try {
      // 允许 admin、client 访问
      if (!['admin', 'client'].includes(req.user.role)) {
        return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
      }

      // 试用限制检查（仅限 client）
      if (req.user.role === 'client') {
        try {
          await membershipService.checkTrialLimit(req.user.id, 'ai_coach');
          await membershipService.useTrialCount(req.user.id);
        } catch (e) {
          return res.status(403).json({ error: e.message });
        }
      }

      const { girlId, situation, stream = true, mode = 'pro' } = req.body;

      if (!situation) {
        return res.status(400).json({ error: { code: 'S0803', message: '情况描述是必需的' } });
      }

      // 安全：验证女生归属权
      if (girlId) {
        const girl = await prisma.girl.findUnique({ where: { id: girlId } });
        if (!girl) {
          return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
        }
        if (req.user.role === 'admin') {
          const session = await prisma.chatSession.findFirst({
            where: { operatorId: req.user.id, clientId: girl.clientId }
          });
          if (!session) {
            return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此女生数据' } });
          }
        }
      }

      const unifiedCoachId = 'unified';

      // 获取客户画像
      const clientProfile = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          emotionalMaturity: true,
          emotionalMaturityLevel: true,
          antiFrustrationLevel: true,
          pacePreference: true,
          clientType: true,
          coachCooperation: true,
          coachCooperationLevel: true,
          emotionalStable: true,
          eqLevel: true,
          learningAbility: true
        }
      });

      // 获取会话记忆
      const { memory: sessionMemory } = await getOrCreateSession(req.user.id, unifiedCoachId, girlId);

      if (req.body.regenerate) {
        await removeLastAssistantMessage(sessionMemory.id);
      }

      const history = await getConversationHistory(sessionMemory.id);

      let historyText = '';
      if (history.length > 0) {
        historyText = history.map(m =>
          `${m.role === 'system' ? '【系统】' : m.role === 'user' ? '用户' : '教练'}: ${m.content}`
        ).join('\n');
      }

      const contextBudget = calcContextBudget('', situation, historyText);
      const turnCount = history.length;
      const compactionCount = sessionMemory.compactionCount || 0;

      // 先构建无 wiki 的基础 context（此时尚无 routingMeta）
      const context = await buildAICoachContext(req.user.id, girlId, situation, {
        maxContextChars: contextBudget,
        turnCount,
        compactionCount,
        clientProfile
      });

      // 从 context 提取女生画像，再路由获取 routingMeta（含 coachIds）
      const girlProfile = context.girlInfo ? {
        tensionScore: context.girlInfo.tensionScore || 5.0,
        intimacyLevel: context.girlInfo.intimacyLevel || 1,
        stage: context.girlInfo.stage || '未知',
        personality: context.girlInfo.personality || {},
        recentSignals: context.recentSignals || [],
        relationshipStage: context.girlInfo.relationshipStage
      } : null;

      const { skills, meta: routingMeta } = getMultiDimensionalSkillsWithMeta(situation, {
        clientProfile,
        girlProfile
      });

      // 重新调用注入 wiki 知识库（此时有 routingMeta）
      const updatedContext = await buildAICoachContext(req.user.id, girlId, situation, {
        maxContextChars: contextBudget,
        turnCount,
        compactionCount,
        clientProfile,
        routingMeta
      });
      Object.assign(context, updatedContext);

      const basePrompt = await buildMasterPrompt(situation, context, {
        girlInfo: context.girlInfo,
        conversationHistory: history,
        turnCount,
        clientProfile,
        clientId: req.user.id
      });

      const personaSection = await buildFullPersona({ clientProfile, clientId: req.user.id, girlId });
      const systemPrompt = basePrompt + buildPersonaSection(personaSection);

      const promptChars = systemPrompt.length;
      const estimatedTokens = Math.round(promptChars / 2.5);
      logger.info(`[AICoach] Prompt 大小: ${promptChars} chars ≈ ${estimatedTokens} tokens | 路由: ${routingMeta.routedType} | 教练数: ${routingMeta.coachCount} | 历史轮次: ${turnCount} | 剩余预算: ${contextBudget} chars`);

      const aiConfig = getAIConfig(mode);
      logger.info(`[AICoach] mode=${mode} → 使用模型: ${aiConfig?.model}`);

      // 输入 Guardrail 检查（仅深度模式）
      let guardrailPassed = true;
      let guardrailResults = [];
      if (!stream) {
        try {
          const { passed, results, reason } = await runInputGuardrails(situation);
          guardrailPassed = passed;
          guardrailResults = results;
          if (!passed) {
            logGuardrailCheck(situation, req.user.id, unifiedCoachId, girlId, '/situation').catch(() => {});
            return res.json({ success: false, error: reason || '输入检查未通过', guardrailFailed: true });
          }
          logGuardrailCheck(situation, req.user.id, unifiedCoachId, girlId, '/situation').catch(() => {});
        } catch (err) {
          logger.warn(`[situation] Guardrail 检查异常: ${err.message}`, { error: err.message });
        }
      }

      // 添加用户消息到记忆
      if (!req.body.regenerate) {
        await addMessage(sessionMemory.id, 'user', situation);
      }

      // 流式模式
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Content-Encoding', 'identity');
        res.flushHeaders();

        const deduplicator = createChunkDeduplicator();

        let staleAlert = null;
        if (girlId) {
          const girl = await prisma.girl.findUnique({ where: { id: girlId }, select: { name: true, updatedAt: true } });
          if (girl?.updatedAt) {
            const hoursSince = Math.floor((Date.now() - girl.updatedAt.getTime()) / (1000 * 60 * 60));
            if (hoursSince >= 48) {
              staleAlert = { hoursSince, message: `和${girl.name || '该女生'}的资料已 ${hoursSince}h 未更新，建议先更新一下进展` };
            }
          }
        }

        const streamParams = {
          messages: [{ role: 'user', content: systemPrompt }],
          temperature: 0.7,
          max_tokens: 200000,
          stream: true
        };
        if (aiConfig.model === 'deepseek-v4-pro') {
          streamParams.thinking = { type: 'enabled' };
          logger.info(`[AICoach] 深度模式已启用 thinking，模型: ${aiConfig.model}`);
        } else {
          logger.info(`[AICoach] 快速模式无 thinking，模型: ${aiConfig.model}`);
        }

        await callAIStream(
          aiConfig,
          streamParams,
          {
            deduplicator,
            onMeta: () => {
              const meta = sanitizeRoutingMeta(routingMeta);
              if (staleAlert) meta.staleAlert = staleAlert;
              if (guardrailResults.length > 0) {
                meta.guardrail = guardrailResults.map(r => ({
                  name: r.name,
                  passed: r.passed,
                  reasoning: r.info?.reasoning || (r.passed ? '通过' : r.reason)
                }));
              }
              res.write(`data: ${JSON.stringify({ meta })}\n\n`);
            },
            onReasoning: (reasoning) => {
              logger.info(`[AICoach] 思考过程 chunk: ${reasoning.length} 字符`);
              res.write(`data: ${JSON.stringify({ reasoning })}\n\n`);
            },
            onChunk: (content) => {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            },
            onDone: () => {
              const fullResponse = deduplicator.getAccumulated();
              logger.info(`[AICoach] 流式完成`, { routedType: routingMeta.routedType, bestScore: routingMeta.bestScore, responseLength: fullResponse.length });

              if (fullResponse) {
                addMessage(sessionMemory.id, 'assistant', fullResponse)
                  .then(() => logger.info(`[AICoach] 保存AI响应到记忆`))
                  .catch(err => logger.error(`[AICoach] 保存记忆失败: ${err.message}`, { error: err.message }));

                extractLearningsFromConversation(req.user.id, fullResponse, girlId)
                  .then(saved => {
                    if (saved.length > 0) logger.info(`[AICoach] 自动提取 ${saved.length} 条 learnings`, { count: saved.length });
                  })
                  .catch(err => logger.error(`[AICoach] 自动提取 learnings 失败: ${err.message}`, { error: err.message }));
              }

              if (girlId && fullResponse) {
                prisma.girl.update({
                  where: { id: girlId },
                  data: { lastContact: new Date() }
                }).catch(err => logger.error(`[GirlProfile] lastContact 更新失败: ${err.message}`, { error: err.message }));

                extractGirlProfileFromConversation(req.user.id, girlId, fullResponse, situation)
                  .then(extracted => {
                    if (extracted && Object.keys(extracted).length > 0) {
                      return applyGirlProfileUpdate(girlId, extracted);
                    }
                  })
                  .catch(err => logger.error(`[GirlProfile] 提取失败: ${err.message}`, { error: err.message }));
              }

              if (req.user.role === 'client') {
                activityService.recordActivity(req.user.id, 'ai_coach', {
                  routedType: routingMeta.routedType,
                }).catch(err => logger.error(`[Activity] 记录ai_coach失败: ${err.message}`));
              }

              res.write('data: [DONE]\n\n');
              res.end();
            },
            onError: (msg) => {
              logger.error(`[AICoach] 流式咨询失败: ${msg}`);
              res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
              res.end();
            }
          }
        );
      } else {
        // 非流式模式
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: situation }
        ];

        try {
          const analysis = await chatWithTools(messages, {
            coachConfig: { id: 'unified', name: 'AI统一教练' },
            tools: toolDefinitions
          });

          await addMessage(sessionMemory.id, 'assistant', analysis);

          if (req.user.role === 'client') {
            activityService.recordActivity(req.user.id, 'ai_coach', {
              routedType: routingMeta?.routedType,
            }).catch(err => logger.error(`[Activity] 记录ai_coach失败: ${err.message}`));
          }

          res.json({
            success: true,
            coachName: 'AI统一教练',
            analysis,
            meta: sanitizeRoutingMeta(routingMeta)
          });
        } catch (error) {
          logger.error(`[AICoach] 非流式咨询失败: ${error.message}`, { error: error.message, stack: error.stack });
          res.status(500).json({ error: { code: 'S0802', message: 'AI分析失败，请稍后重试' } });
        }
      }
    } catch (error) {
      logger.error(`[AICoach] 情况咨询失败: ${error.message}`, { error: error.message, stack: error.stack });
      res.status(500).json({ error: { code: 'S0802', message: 'AI分析失败，请稍后重试' } });
    }
  });
}

module.exports = { registerSituationRoute };

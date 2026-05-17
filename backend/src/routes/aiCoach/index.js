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
const { buildAICoachContext } = require('../../services/contextBuilder');
const { buildMasterPrompt, getSkillsForQuestion, getMultiDimensionalSkillsWithMeta } = require('../../coaches');
const { chatWithTools, toolDefinitions } = require('../../services/coach-engine');
const { getOrCreateSession, addMessage, removeLastAssistantMessage, getConversationHistory, listSessions, getClientSessions, getSystemStats, getSessionDetail, addFeedback, getFeedbackStats, endSession } = require('../../services/memory');
const { streamGuardrails, runGuardrails, stripMarkdown, estimateTokens: guardEstimateTokens, createChunkDeduplicator } = require('../../services/guardrails');
const { runInputGuardrails } = require('../../guardrails/input');
const { triage } = require('../../agents');
const { recordFeedback, getClientCoachPreferences, getProfileSummary } = require('../../services/clientCoachProfile');
const { extractLearningsFromConversation } = require('../../services/learning');
const { buildDynamicPersona, buildPersonaSection, buildFullPersona } = require('../../services/coachPersona');
const { addStageContext, appendStageWarning, STAGE_LABELS } = require('../../services/stageGuard');
const { describeImage } = require('../../services/imageAnalyzer');
const { analyzeChatHistory } = require('../../services/chatAnalyzer');

const multer = require('multer');
const { JWT_SECRET, BASE_URL, getAIConfig, getVLModelConfig } = require('../../config');

// 截图导入常量
const IMPORT_VISION_TIMEOUT = 45000;  // 45秒超时
const IMPORT_MAX_RETRIES = 1;
const IMPORT_RETRY_DELAY = 2000;

/**
 * 压缩图片并转为 base64（复用 profileEngine 的策略）
 * 最长边 1920px、JPEG 80%
 */
function compressImageForImport(imagePath) {
  try {
    const sharp = require('sharp');
    const buffer = fs.readFileSync(imagePath);
    return sharp(buffer)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
      .then(compressed => `data:image/jpeg;base64,${compressed.toString('base64')}`);
  } catch {
    const buffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase().replace('.', '') || 'jpg';
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    return Promise.resolve(`data:${mime};base64,${buffer.toString('base64')}`);
  }
}
const prisma = require('../../prisma');

// 截图上传配置
const chatImportUploadDir = path.join(__dirname, '../../../uploads/chat-imports');
if (!fs.existsSync(chatImportUploadDir)) {
  fs.mkdirSync(chatImportUploadDir, { recursive: true });
}
const chatImportStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, chatImportUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const chatImportUpload = multer({
  storage: chatImportStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('只支持图片格式'));
  }
});
const membershipService = require('../../services/membershipService');
const activityService = require('../../services/activityService');
const { getCache, setCache, getOverviewCache, setOverviewCache } = require('../../services/girlSummaryCache');
const logger = require('../../utils/logger');

// ---- Token Budget Config ----
const AI_RESPONSE_RESERVE = 2000; // tokens reserved for AI response (提升以支持更长输出)
const SYSTEM_PROMPT_BASE = 800;  // rough overhead for coach persona + formatting
const MAX_PROMPT_TOKENS = 100000; // 充分利用 DeepSeek 128K 上下文
// streamRetry: 指数退避 (ms)
const RETRY_DELAYS = [100, 300, 900];
const MAX_RETRIES = 3;
// 流式超时配置（毫秒）
const STREAM_TIMEOUT = 180000; // 180 秒超时

// ---- 提取的路由模块 ----
const { registerSituationRoute } = require('./situation');

/**
 * 运行输入 Guardrail 检查（异步，非阻塞）
 * @param {string} inputText - 用户输入文本
 * @param {string} clientId - 客户ID
 * @param {string} coachId - 教练ID
 * @param {string} girlId - 女生ID（可选）
 * @param {string} endpoint - 端点名
 */
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

/**
 * 记录 Triage 路由结果到日志（用于统计）
 * @param {string} clientId - 客户ID
 * @param {string} girlId - 女生ID
 * @param {string} routeType - 路由类型
 * @param {number} confidence - 置信度 0-1
 * @param {string} method - 路由方法
 * @param {string} endpoint - 端点
 */
async function logTriageResult(clientId, girlId, routeType, confidence, method, endpoint = '/agent-chat') {
  try {
    await prisma.guardrailLog.create({
      data: {
        clientId: clientId || null,
        coachId: 'unified',
        girlId: girlId || null,
        checkType: 'triage',
        passed: true,
        routeType: routeType || null,
        confidence: confidence || null,
        method: method || null,
        endpoint: endpoint,
      }
    });
  } catch (err) {
    logger.warn(`[Triage] 日志记录失败: ${err.message}`, { error: err.message });
  }
}

/**
 * 计算剩余上下文预算（字符数）
 * Static parts consume: coach system prompt + user situation + history + overhead.
 * Static parts consume: coach system prompt + user situation + history + overhead.
 */
function calcContextBudget(coachSystemPrompt, situation, historyText) {
  // 使用中文自适应的 token 估算（中文 1.5 chars/token，英文 4 chars/token）
  const staticTokens = guardEstimateTokens(coachSystemPrompt)
    + guardEstimateTokens(situation)
    + guardEstimateTokens(historyText)
    + SYSTEM_PROMPT_BASE;
  const available = MAX_PROMPT_TOKENS - staticTokens - AI_RESPONSE_RESERVE;
  // Return remaining budget in chars
  return Math.max(0, available * 4);
}

/**
 * 通用流式 AI 调用（带指数退避重试）
 * @param {object} aiConfig - { url, key, model }
 * @param {object} params - { messages, temperature, max_tokens, stream }
 * @param {object} opts - { onChunk, onMeta, onDone, onError, deduplicator }
 * @returns {Promise<void>}
 */
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

/**
 * 通用流式读取循环（复用：situation / moment / overview / client-pool / girl-summary）
 * 包含：思考过程处理 + Guardrails 过滤 + Markdown strip + Chunk 去重
 * @param {Response} response - fetch Response 对象
 * @param {object} opts - { deduplicator, onChunk, onReasoning, onDone, onError }
 */
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

            // 检测截断
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === 'length') {
              logger.warn(`[AICoach] 响应被 max_tokens 截断！思考: ${totalReasoningChars} 正文: ${totalContentChars}`);
            } else if (finishReason === 'stop') {
              logger.info(`[AICoach] 模型主动停止 (finish_reason=stop) | 思考: ${totalReasoningChars} 正文: ${totalContentChars}`);
            }

            // DeepSeek 思考模式：reasoning_content 先于 content 到达
            const reasoning = delta.reasoning_content || '';
            if (reasoning) {
              totalReasoningChars += reasoning.length;
              onReasoning?.(reasoning);
              continue;
            }

            let content = delta.content || '';
            if (!content) continue;
            totalContentChars += content.length;

            // Guardrails: 过滤大师名字
            const guardResult = streamGuardrails(content);
            if (!guardResult.safe) {
              logger.warn(`[Guardrails] ${guardResult.reason}，已过滤`, { reason: guardResult.reason });
              content = guardResult.filtered;
            }
            if (!content) continue;

            // Chunk 去重
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

/**
 * 带指数退避重试的 fetch 流式调用（简化版，供 moment/overview/client-pool/girl-summary 使用）
 * @param {string} url
 * @param {string} key
 * @param {object} body - 请求体（不含 model，model 在这里单独注入）
 * @param {object} opts - { deduplicator, onChunk, onDone, onError }
 */
async function callAIFetchWithRetry(url, key, body, opts = {}) {
  const { onChunk, onReasoning, onDone, onError, deduplicator } = opts;
  const model = body.model;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 900;
      logger.info(`[AICoach] 重试 ${attempt}/${MAX_RETRIES}，等待 ${delay}ms`, { attempt, maxRetries: MAX_RETRIES, delay });
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, ...body })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`[AICoach] AI provider 错误 (attempt ${attempt + 1}): ${response.status} ${errorText}`, { attempt, status: response.status });
        if (attempt === MAX_RETRIES) { onError?.(`AI服务请求失败 (${response.status})`); return; }
        continue;
      }

      await processStreamResponse(response, { deduplicator, onChunk, onReasoning, onDone, onError });
      return;
    } catch (err) {
      logger.error(`[AICoach] 流式调用异常 (attempt ${attempt + 1}): ${err.message}`, { attempt, error: err.message });
      if (attempt === MAX_RETRIES) { onError?.('网络异常，请稍后重试'); return; }
    }
  }

  onError?.('服务暂时不可用');
}

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: { code: 'A0101', message: '未登录' } });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: { code: 'A0102', message: '认证令牌无效' } });
  }
};


// 注册提取的 /situation 路由
registerSituationRoute(router, authMiddleware);

/**
 * 新建对话 - 结束当前会话，开始新的上下文
 * POST /api/ai-coach/new-session
 *
 * 行为：
 * 1. 查找当前活跃会话（clientId + unified coach + 可选 girlId）
 * 2. 生成摘要并结束会话
 * 3. 返回成功；下次 /situation 会自动创建新会话
 */
router.post('/new-session', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    if (req.user.role === 'client') {
      try {
        await membershipService.checkTrialLimit(req.user.id, 'ai_coach');
      } catch (e) {
        // 根据错误消息返回对应的规范化错误码
        const msg = e.message || '';
        if (msg.includes('无会员权限')) {
          return res.status(403).json({ error: { code: 'T0904', message: msg } });
        } else if (msg.includes('试用次数已用完')) {
          return res.status(403).json({ error: { code: 'T0901', message: msg } });
        } else if (msg.includes('已到期')) {
          return res.status(403).json({ error: { code: 'T0902', message: msg } });
        }
        return res.status(403).json({ error: { code: 'A0108', message: msg } });
      }
    }

    const { girlId } = req.body;
    const unifiedCoachId = 'unified';

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
          return res.status(403).json({ error: { code: 'G0302', message: '无权限访问此女生数据' } });
        }
      }
    }

    // 查找当前活跃会话
    const currentSession = await prisma.conversationMemory.findFirst({
      where: {
        clientId: req.user.id,
        coachId: unifiedCoachId,
        girlId: girlId || null,
        summary: null // 必须是未压缩的活跃会话
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (currentSession) {
      // 生成摘要并结束会话（异步，不阻塞主流程）
      endSession(currentSession.id).catch(err => {
        logger.error(`[AICoach] 异步结束会话失败: ${err.message}`, { error: err.message });
      });
      logger.info(`[AICoach] 已开始新对话，上一个会话 ${currentSession.id} 摘要异步生成中`);
    }

    res.json({ success: true, message: '已开始新对话' });
  } catch (error) {
    if (error.message && error.message.includes('无会员权限')) {
      return res.status(403).json({ error: { code: 'A0108', message: error.message } });
    }
    logger.error(`[AICoach] 新建对话失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '新建对话失败' } });
  }
});


/**
 * 删除会话
 * DELETE /api/ai-coach/session/:sessionId
 */
router.delete('/session/:sessionId', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    if (req.user.role === 'client') {
      try {
        await membershipService.checkTrialLimit(req.user.id, 'ai_coach');
      } catch (e) {
        const msg = e.message || '';
        if (msg.includes('无会员权限')) {
          return res.status(403).json({ error: { code: 'T0904', message: msg } });
        } else if (msg.includes('试用次数已用完')) {
          return res.status(403).json({ error: { code: 'T0901', message: msg } });
        } else if (msg.includes('已到期')) {
          return res.status(403).json({ error: { code: 'T0902', message: msg } });
        }
        return res.status(403).json({ error: { code: 'A0108', message: msg || '无此操作权限' } });
      }
    }

    const { sessionId } = req.params;

    // 获取会话信息验证所有权
    const session = await prisma.conversationMemory.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      return res.status(404).json({ error: { code: 'H0401', message: '会话不存在' } });
    }

    // 验证权限：只能删除自己的会话
    if (session.clientId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无权限删除此会话' } });
    }

    // 删除会话及其关联的反馈记录（Cascade）
    await prisma.coachFeedback.deleteMany({ where: { memoryId: sessionId } });
    await prisma.conversationMemory.delete({ where: { id: sessionId } });

    logger.info(`[AICoach] 删除会话 ${sessionId} by user ${req.user.id}`);
    res.json({ success: true, message: '会话已删除' });
  } catch (error) {
    if (error.message && error.message.includes('无会员权限')) {
      return res.status(403).json({ error: { code: 'A0108', message: error.message } });
    }
    logger.error(`[AICoach] 删除会话失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '删除会话失败' } });
  }
});


/**
 * 侧边栏上下文数据（结构化 JSON，供前端女生上下文面板使用）
 * GET /api/ai-coach/girl-context/:girlId
 */
router.get('/girl-context/:girlId', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId } = req.params;
    const { cachedGirlHash } = req.query;

    // 安全验证
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });

    if (req.user.role === 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'G0302', message: '无权限访问此女生数据' } });
    } else if (req.user.role === 'client' && girl.clientId !== req.user.id) {
      return res.status(403).json({ error: { code: 'G0302', message: '无权限访问此女生数据' } });
    }

    const clientId = girl.clientId;

    // 检查缓存（以 girlDataHash 为维度）
    const currentGirlHash = computeGirlDataHash(girl);
    if (cachedGirlHash && cachedGirlHash === currentGirlHash) {
      try {
        const cacheKey = `context:${clientId}:${girlId}`;
        const cached = await prisma.girlSummaryCache.findUnique({ where: { cacheKey } });
        if (cached?.contextData) {
          const cachedContext = JSON.parse(cached.contextData);
          return res.json({ ...cachedContext, cached: true });
        }
      } catch {}
    }

    // 构建上下文
    const fullContext = await buildAICoachContext(clientId, girlId);
    const p = fullContext.girlInfo ? (fullContext.girlInfo.personality || {}) : {};
    const client = fullContext.client || {};

    const relStage = fullContext.girlInfo?.relationshipStage;
    const relStageLabel = relStage ? STAGE_LABELS[relStage] || relStage : null;

    const result = {
      cached: false,
      girlDataHash: currentGirlHash,
      girlInfo: {
        id: girl.id,
        name: girl.name,
        age: girl.age,
        occupation: girl.occupation,
        stage: girl.stage || '陌生',
        relationshipStage: relStage,
        relationshipStageLabel: relStageLabel,
        tensionScore: girl.tensionScore || 5,
        intimacyLevel: girl.intimacyLevel || 1,
        mbti: p.mbti || null,
        personality: {
          mbti: p.mbti || null,
          communicationStyle: p.communicationStyle || null,
          emotionalTriggers: p.emotionalTriggers || [],
          thingsToAvoid: p.thingsToAvoid || [],
          talkingTopics: p.talkingTopics || [],
        },
      },
      recentSignals: (fullContext.recentSignals || []).slice(0, 10),
      pendingActions: (fullContext.pendingActions || []).slice(0, 10),
      clientProfile: {
        clientType: client.clientType || '未设置',
        learningAbility: client.learningAbility || '未知',
        emotionalStable: client.emotionalStable || '未知',
        antiFrustrationLevel: client.antiFrustrationLevel || 3,
        coachCooperationLevel: client.coachCooperationLevel || 3,
        attachmentStyle: client.attachmentStyle || null,
        loveStyle: client.loveStyle || null,
        loveLanguage: [client.loveLanguage1, client.loveLanguage2, client.loveLanguage3].filter(Boolean).join('/') || null,
      },
      observations: (fullContext.observations || []).slice(0, 5),
    };

    res.json(result);
  } catch (error) {
    logger.error(`[girl-context] failed: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取失败' } });
  }
});

/**
 * 回复建议 - 基于女生人格生成回复选项
 * POST /api/ai-coach/reply-suggestions
 */
router.post('/reply-suggestions', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    if (req.user.role === 'client') {
      try {
        await membershipService.checkTrialLimit(req.user.id, 'ai_coach');
      } catch (e) {
        return res.status(403).json({ error: { code: 'A0108', message: e.message } });
      }
    }

    const { girlId, lastMessage, context, style, hiddenContext, combatMessages } = req.body;

    if (!lastMessage) {
      return res.status(400).json({ error: { code: 'S0803', message: '对方消息是必需的' } });
    }

    if (lastMessage.length > 2000) {
      return res.status(400).json({ error: { code: 'S0803', message: '消息内容不能超过2000字' } });
    }

    // 安全：验证女生归属权
    let clientProfile = null;
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
          return res.status(403).json({ error: { code: 'A0108', message: '无权限为该客户女生生成建议' } });
        }
      }
      // M007 S06: 加载客户人格画像
      const client = await prisma.user.findUnique({
        where: { id: girl.clientId },
        select: {
          clientType: true, learningAbility: true, antiFrustrationLevel: true,
          pacePreference: true, coachCooperationLevel: true, emotionalStable: true,
          attachmentStyle: true, loveStyle: true, loveLanguage1: true,
          loveLanguage2: true, loveLanguage3: true, loveLanguage4: true,
          loveLanguage5: true, clientBestApproach: true, clientRiskFactors: true,
          clientRecommendedTopics: true, clientStrategicNotes: true,
        }
      });
      if (client) clientProfile = client;
    }

    // 使用 contextBuilder 获取完整上下文
    const fullContext = await buildAICoachContext(req.user.id, girlId);
    const p = fullContext.girlInfo ? (fullContext.girlInfo.personality || {}) : {};

    // M007 S01: 获取关系阶段
    const relStage = fullContext.girlInfo?.relationshipStage;
    const relStageLabel = relStage ? STAGE_LABELS[relStage] || relStage : null;
    const stageContext = addStageContext(relStage);

    // M007: 构建对话历史上下文
    // combatMessages（带时间戳的实战聊天）优先于 hiddenContext.recentMessages
    const hasCombatContext = Array.isArray(combatMessages) && combatMessages.length > 0;
    let contextSection = '';

    // 实战聊天记录（带时间戳）
    if (hasCombatContext) {
      const combatText = combatMessages.map(m => {
        const ts = m.timestamp ? new Date(m.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-') : '';
        const role = m.role === 'user' ? '用户' : '女生';
        return ts ? `[${ts}] ${role}：${m.content}` : `${role}：${m.content}`;
      }).join('\n');
      contextSection += `\n【实战聊天记录（用户刚刚进行的实时对话）】\n${combatText}`;
    }

    // hiddenContext: chatSummary 和 importAnalysis 仍保留（与 combatMessages 无冲突）
    if (hiddenContext?.chatSummary) {
      contextSection += `\n【聊天摘要】\n${hiddenContext.chatSummary}`;
    }
    if (hiddenContext?.importAnalysis) {
      contextSection += `\n【对话分析】\n`;
      contextSection += `- 女生风格: ${hiddenContext.importAnalysis.girlStyle || '未知'}\n`;
      contextSection += `- 用户风格: ${hiddenContext.importAnalysis.userStyle || '未知'}\n`;
      if (hiddenContext.importAnalysis.problems?.length > 0) {
        contextSection += `- 问题点: ${hiddenContext.importAnalysis.problems.join(', ')}\n`;
      }
      if (hiddenContext.importAnalysis.suggestions?.length > 0) {
        contextSection += `- 改进建议: ${hiddenContext.importAnalysis.suggestions.join(', ')}\n`;
      }
    }

    // 无 combatMessages 时，降级使用 hiddenContext.recentMessages 或数据库历史
    if (!hasCombatContext) {
      if (hiddenContext?.recentMessages && hiddenContext.recentMessages.length > 0) {
        const recentChat = hiddenContext.recentMessages.map(m => {
          const role = m.role === 'girl' ? '女生' : '用户';
          return `${role}: ${m.content}`;
        }).join('\n');
        contextSection += `\n【最近聊天记录】\n${recentChat}`;
      } else if (girlId) {
        try {
          const chatHistory = await prisma.chatMessage.findMany({
            where: { girlId: girlId },
            orderBy: { createdAt: 'desc' },
            take: 20
          });
          if (chatHistory && chatHistory.length > 0) {
            const reversed = chatHistory.reverse();
            const historyText = reversed.map(m =>
              `${m.isFromUser ? '用户' : '女生'}: ${m.content}`
            ).join('\n');
            contextSection += `\n【最近对话历史】\n${historyText}`;
          }
        } catch (e) {
          logger.warn(`[reply-suggestions] 获取聊天历史失败: ${e.message}`);
        }
      }
    }

    // 获取动态路由的多位大师视角（带调试meta）
    const { skills, meta: routingMeta } = getMultiDimensionalSkillsWithMeta(lastMessage, { girlId, girlStage: fullContext.girlInfo?.stage });

    // 构建女生完整上下文
    let girlContextInfo = '';
    if (fullContext.girlInfo) {
      girlContextInfo = `
【女生完整档案】
昵称：${fullContext.girlInfo.name}
当前阶段（旧）：${fullContext.girlInfo.stage || '未知'}
关系阶段（新${relStage ? '★' : '☆'}）：${relStageLabel || '未设置'}
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
${hiddenContext?.keyInsights ? `\n【AI教练实时洞察】\n${hiddenContext.keyInsights}` : ''}
`;
    }

    // 统一教练：综合多位大师视角
    // 根据是否指定风格决定生成数量
    const styleInstruction = style
      ? `用户指定了回复风格「${style}」，请只生成该风格的回复选项。`
      : `请生成3个不同风格的回复选项。`;

    const styleOptions = style ? '' : `
1. 稳妥型：安全、礼貌的回复，维持舒适感，不冒进
2. 进攻型：稍微大胆、有攻势的回复，推进关系，制造暧昧
   - ⚠️ 仅在关系阶段为"暧昧期"或"推进期"时生成，其他阶段自动降级为稳妥型
3. 调侃型：轻松、幽默的回复，活跃气氛，试探对方反应
   - ⚠️ 禁止涉及对方外貌、身高、体重、年龄等敏感话题
   - ⚠️ 禁止使用可能引起误解的暧昧表达`;

    const systemPrompt = `你是AI情感大师，深谙男女交往之道。现在你的任务是：结合女生的档案和用户的情况，代用户生成回复——也就是帮用户想好怎么说，用户复制粘贴就能发给女生。你产出的每一条回复，就是用户要说的话。

【角色定位】
- 你是情感大师，有专业的分析和判断能力
- 但你产出的"回复内容"是代用户说的，用第一人称，像用户自己在发微信
- 不要以教练身份说话，不要出现"我建议""你可以说"这类引导词，直接给用户能发出去的原文

${girlContextInfo}
${stageContext}
${contextSection}
【对方最后一条消息】
${lastMessage}

${context ? `【对话背景】\n${context}` : ''}

${styleInstruction}
${styleOptions}

每个回复要求：15-30字、口语化、像用户本人在发微信。

回复风格适配阶段（关系阶段:${relStageLabel || '未设置'}），女生沟通风格（${p?.communicationStyle || '未知'}）。

请按以下 JSON 格式返回：
{
  "options": [
    { "type": "稳妥型", "reply": "回复内容（15-30字）", "intention": "意图说明", "riskNote": "无风险提示" },
    { "type": "进攻型", "reply": "回复内容（15-30字）", "intention": "意图说明", "riskNote": "风险提示或'无'" },
    { "type": "调侃型", "reply": "回复内容（15-30字）", "intention": "意图说明", "riskNote": "风险提示或'无'" }
  ]
}

只输出 JSON，不要其他内容。`;

    const aiConfig = getAIConfig('flash');
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
      suggestions,
      relationshipStage: relStage,
      relationshipStageLabel: relStageLabel,
      stageWarnings: relStage ? appendStageWarning(
        (suggestions.options || []).map(o => o.reply).join(' '),
        relStage
      ).match(/\[⚠️.*?\]/g) || [] : []
    });
  } catch (error) {
    if (error.message && error.message.includes('无会员权限')) {
      return res.status(403).json({ error: { code: 'A0108', message: error.message } });
    }
    logger.error(`[AICoach] 回复建议失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '生成失败' } });
  }
});

/**
 * 话术优化 - 优化操盘手已有的回复
 * POST /api/ai-coach/optimize-reply
 */
router.post('/optimize-reply', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    if (req.user.role === 'client') {
      try {
        await membershipService.checkTrialLimit(req.user.id, 'ai_coach');
      } catch (e) {
        return res.status(403).json({ error: { code: 'A0108', message: e.message } });
      }
    }

    const { originalReply, girlId, goal, hiddenContext, combatMessages } = req.body;

    if (!originalReply) {
      return res.status(400).json({ error: { code: 'S0803', message: '原始回复是必需的' } });
    }

    if (originalReply.length > 1000) {
      return res.status(400).json({ error: { code: 'S0803', message: '回复内容不能超过1000字' } });
    }

    // 安全：验证女生归属权
    let clientProfile = null;
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
          return res.status(403).json({ error: { code: 'A0108', message: '无权限优化该女生的回复' } });
        }
      }
      // M007 S06: 加载客户人格画像
      const client = await prisma.user.findUnique({
        where: { id: girl.clientId },
        select: {
          clientType: true, learningAbility: true, antiFrustrationLevel: true,
          pacePreference: true, coachCooperationLevel: true, emotionalStable: true,
          attachmentStyle: true, loveStyle: true, loveLanguage1: true,
          loveLanguage2: true, loveLanguage3: true, loveLanguage4: true,
          loveLanguage5: true, clientBestApproach: true, clientRiskFactors: true,
          clientRecommendedTopics: true, clientStrategicNotes: true,
        }
      });
      if (client) clientProfile = client;
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
      try { personality = typeof fullContext.girlInfo.personality === 'string' ? JSON.parse(fullContext.girlInfo.personality) : fullContext.girlInfo.personality; } catch (e) { logger.warn(`[AICoach] personality 解析失败: ${e.message}`, { error: { code: 'A0108', message: e.message } }); }
      if (typeof personality === 'string') {
        try { personality = JSON.parse(personality); } catch (e) { logger.warn(`[AICoach] personality 二次解析失败: ${e.message}`, { error: { code: 'A0108', message: e.message } }); personality = {}; }
      }
    }

// 获取动态路由的多位大师视角（带调试meta）
    const { skills, meta: routingMeta } = getMultiDimensionalSkillsWithMeta(originalReply, { girlId, girlStage: fullContext?.girlInfo?.stage });

    // M007: 构建对话历史上下文
    // combatMessages（带时间戳的实战聊天）优先于 hiddenContext.recentMessages
    const hasCombatContext = Array.isArray(combatMessages) && combatMessages.length > 0;
    let contextSection = '';

    // 实战聊天记录（带时间戳）
    if (hasCombatContext) {
      const combatText = combatMessages.map(m => {
        const ts = m.timestamp ? new Date(m.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-') : '';
        const role = m.role === 'user' ? '用户' : '女生';
        return ts ? `[${ts}] ${role}：${m.content}` : `${role}：${m.content}`;
      }).join('\n');
      contextSection += `\n【实战聊天记录（用户刚刚进行的实时对话）】\n${combatText}`;
    }

    // hiddenContext: chatSummary 和 importAnalysis 仍保留（与 combatMessages 无冲突）
    if (hiddenContext?.chatSummary) {
      contextSection += `\n【聊天摘要】\n${hiddenContext.chatSummary}`;
    }
    if (hiddenContext?.importAnalysis) {
      contextSection += `\n【对话分析】\n`;
      contextSection += `- 女生风格: ${hiddenContext.importAnalysis.girlStyle || '未知'}\n`;
      contextSection += `- 用户风格: ${hiddenContext.importAnalysis.userStyle || '未知'}\n`;
      if (hiddenContext.importAnalysis.problems?.length > 0) {
        contextSection += `- 问题点: ${hiddenContext.importAnalysis.problems.join(', ')}\n`;
      }
      if (hiddenContext.importAnalysis.suggestions?.length > 0) {
        contextSection += `- 改进建议: ${hiddenContext.importAnalysis.suggestions.join(', ')}\n`;
      }
    }

    // 无 combatMessages 时，降级使用 hiddenContext.recentMessages 或数据库历史
    if (!hasCombatContext) {
      if (hiddenContext?.recentMessages && hiddenContext.recentMessages.length > 0) {
        const recentChat = hiddenContext.recentMessages.map(m => {
          const role = m.role === 'girl' ? '女生' : '用户';
          return `${role}: ${m.content}`;
        }).join('\n');
        contextSection += `\n【最近聊天记录】\n${recentChat}`;
      } else if (girlId) {
        try {
          const chatHistory = await prisma.chatMessage.findMany({
            where: { girlId: girlId },
            orderBy: { createdAt: 'desc' },
            take: 20
          });
          if (chatHistory && chatHistory.length > 0) {
            const reversed = chatHistory.reverse();
            const historyText = reversed.map(m =>
              `${m.isFromUser ? '用户' : '女生'}: ${m.content}`
            ).join('\n');
            contextSection += `\n【最近对话历史】\n${historyText}`;
          }
        } catch (e) {
          logger.warn(`[optimize-reply] 获取聊天历史失败: ${e.message}`);
        }
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

    // M007 S01: 获取关系阶段
    const relStage = fullContext?.girlInfo?.relationshipStage;
    const relStageLabel = relStage ? STAGE_LABELS[relStage] || relStage : null;
    const stageContext = addStageContext(relStage);

    // 统一教练：综合多位大师视角 — 话术策略优化
    const systemPrompt = `你是缘分AI情感教练，专注话术策略优化。不是简单润色文字，而是从沟通策略、推拉节奏、关系阶段适配的角度，把一段话术打磨得更有效。

【女生档案】
昵称：${fullContext?.girlInfo?.name || '未知'}
阶段（旧）：${fullContext?.girlInfo?.stage || '未知'}
关系阶段（新${relStage ? '★' : '☆'}）：${relStageLabel || '未设置'}
性格：${personality?.communicationStyle || '未知'}
情绪触发点：${(personality?.emotionalTriggers || []).join('、') || '暂无'}
聊天禁忌：${(personality?.thingsToAvoid || []).join('、') || '暂无'}
喜欢话题：${(personality?.talkingTopics || []).join('、') || '未知'}
${stageContext}
${contextSection}

【用户想说的原文】
"${originalReply}"

${goalHint ? `【优化目标】${goal}` : `【诊断要求】先分析用户原文的意图和策略——他想达到什么效果？当前的表达是否契合女生的风格和关系阶段？存在什么问题（太直白/太模糊/暴露需求感/缺乏张力等）？然后给出策略更强的优化版本。`}

请生成3个优化版本，每个15-50字，从不同策略角度出发：
${goal ? `用户指定了优化方向「${goal}」，请按该方向给出3个不同表达方式的版本。` : `
1. 策略型：优化推拉节奏和框架感——哪里该推、哪里该拉、怎么建立主导框架
2. 升温型：增加暧昧感和情绪波动——用模糊性语言制造想象空间，不挑明但能心跳
3. 适配型：针对${personality?.communicationStyle || '未知'}风格的女生优化——用她能接住的表达方式，避免踩雷`}

⚠️ 安全红线：无论哪个版本，都不能包含：
- 对女生外貌的评论
- 可能被理解为骚扰的表达
- 强迫感强的追问或要求

请按以下 JSON 格式返回：
{
  "diagnosis": "对用户原文的诊断：意图是什么、策略是否合适、存在什么问题",
  "original": "${originalReply}",
  "optimizations": [
    { "text": "优化版本1", "point": "策略分析：为什么这样改更有效", "style": "策略型", "riskLevel": "低/中/高" },
    { "text": "优化版本2", "point": "策略分析：为什么这样改更有效", "style": "升温型", "riskLevel": "低/中/高" },
    { "text": "优化版本3", "point": "策略分析：为什么这样改更有效", "style": "适配型", "riskLevel": "低/中/高" }
  ]
}

只输出 JSON，不要其他内容。`;

    const aiConfig = getAIConfig('flash');
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
        max_tokens: 2000
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
      optimizations: optimized.optimizations,
      relationshipStage: relStage,
      relationshipStageLabel: relStageLabel,
      stageWarnings: relStage ? appendStageWarning(
        optimized.optimizations.map(o => o.text).join(' '),
        relStage
      ).match(/\[⚠️.*?\]/g) || [] : []
    });
  } catch (error) {
    if (error.message && error.message.includes('无会员权限')) {
      return res.status(403).json({ error: { code: 'A0108', message: error.message } });
    }
    logger.error(`[AICoach] 话术优化失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '优化失败' } });
  }
});

// ========== 聊天实战历史持久化 ==========

/**
 * GET /api/ai-coach/combat-history/:girlId
 * 获取指定女生的聊天实战历史（默认限制20条）
 */
router.get('/combat-history/:girlId', authMiddleware, async (req, res) => {
  try {
    const { girlId } = req.params;
    const { limit = 20, before } = req.query;
    const userId = req.user.id;

    const where = { girlId, userId };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await prisma.girlCombatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit),
      select: { id: true, role: true, content: true, createdAt: true }
    });

    res.json({
      success: true,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.createdAt
      }))
    });
  } catch (error) {
    logger.error(`[AICoach] 获取聊天实战历史失败: ${error.message}`);
    res.status(500).json({ error: { code: 'S0802', message: '获取历史失败' } });
  }
});

/**
 * POST /api/ai-coach/combat-history/:girlId
 * 批量追加聊天实战消息（因为一次交互会同时产生 girl + user 两条）
 */
router.post('/combat-history/:girlId', authMiddleware, async (req, res) => {
  try {
    const { girlId } = req.params;
    const userId = req.user.id;
    const { messages } = req.body; // [{ role, content }]

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: { code: 'S0803', message: '消息数组不能为空' } });
    }

    const created = await Promise.all(
      messages.map(msg =>
        prisma.girlCombatMessage.create({
          data: { girlId, userId, role: msg.role, content: msg.content }
        })
      )
    );

    res.json({
      success: true,
      messages: created.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.createdAt }))
    });
  } catch (error) {
    logger.error(`[AICoach] 保存聊天实战历史失败: ${error.message}`);
    res.status(500).json({ error: { code: 'S0802', message: '保存失败' } });
  }
});

/**
 * DELETE /api/ai-coach/combat-message/:girlId/:messageId
 * 删除单条聊天实战消息
 */
router.delete('/combat-message/:girlId/:messageId', authMiddleware, async (req, res) => {
  try {
    const { girlId, messageId } = req.params;
    const userId = req.user.id;

    const message = await prisma.girlCombatMessage.findUnique({
      where: { id: messageId, girlId }
    });

    if (!message) {
      return res.status(404).json({ error: { code: 'S0804', message: '消息不存在' } });
    }

    if (message.userId !== userId) {
      return res.status(403).json({ error: { code: 'A0108', message: '无权删除此消息' } });
    }

    await prisma.girlCombatMessage.delete({
      where: { id: messageId, girlId }
    });

    res.json({ success: true });
  } catch (error) {
    logger.error(`[AICoach] 删除聊天实战消息失败: ${error.message}`);
    res.status(500).json({ error: { code: 'S0802', message: '删除失败' } });
  }
});

// ========== 聊天截图导入 ==========

/**
 * POST /api/ai-coach/import-chat-screenshots
 * 上传聊天截图，AI 识别对话内容，返回结构化消息供前端确认
 */
router.post('/import-chat-screenshots', authMiddleware, chatImportUpload.array('images', 10), async (req, res) => {
  try {
    const { girlId, chatDate } = req.body;

    if (!girlId) {
      return res.status(400).json({ error: { code: 'S0803', message: '缺少 girlId' } });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: { code: 'U0701', message: '请上传至少一张截图' } });
    }

    // 检查 VL 模型配置
    const vlConfig = getVLModelConfig();
    if (!vlConfig) {
      return res.status(400).json({ error: { code: 'A0603', message: '视觉模型未配置，无法识别截图' } });
    }

    // 验证女生归属
    const girl = await prisma.girl.findUnique({
      where: { id: girlId },
      select: { id: true, name: true, clientId: true }
    });
    if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });

    const allMessages = [];
    const failedScreenshots = [];

    // 逐张识别截图
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const filePath = path.join(chatImportUploadDir, file.filename);
      try {
        // 压缩图片（最长边 1920px, JPEG 80%）
        const base64Image = await compressImageForImport(filePath);

        const prompt = `你是截图识别专家。请仔细识别这张截图。

首先判断这是什么类型的截图：
1. 聊天记录截图（微信等，左右两侧对话）
2. 朋友圈截图（有小红点、评论等）

【如果是聊天记录】
【判断谁是"我"、谁是"对方"的规则】
综合使用以下线索（按优先级）：
1. 气泡位置：右侧 = 我（user），左侧 = 对方（girl）
2. 气泡颜色：绿色/蓝色 = 我（user），白色/灰色 = 对方（girl）
3. 头像：通常右侧是我的头像，左侧是对方头像
4. 以上线索冲突时，以位置为准（右侧=user，左侧=girl）

请严格按此规则识别。只输出JSON，不要其他说明文字。

【消息内容识别细则】
1. 纯文字消息：content 原样输出文字。
2. 微信内置表情（如[微笑]、[捂脸]、[破涕为笑]、[强]、[爱心]等）：请将常见的内置表情转换为对应的 Unicode emoji（如😊🤦😂👍❤️），不要保留 `[表情名]` 格式。如果遇到无法对应 emoji 的表情，保留原 `[表情名]`。
3. 图片/照片/自定义表情包/GIF：如果某条消息是一张图片（而非文字），请在 content 中输出 `[图片:简短描述]`，其中"简短描述"用1-5个字概括图片内容（如 `[图片:风景照]`、`[图片:搞笑表情包]`、`[图片:自拍]`、`[图片:猫咪]`）。如果无法辨认内容，输出 `[图片]`。
4. 语音消息：输出 `[语音]`。
5. 视频消息：输出 `[视频]`。
6. 转账/红包/链接卡片：输出 `[转账]`、`[红包]`、`[链接]`。

输出格式：
{"type":"chat","messages":[{"role":"girl"|"user","content":"消息文本","time":"时间戳"}]}

【如果是朋友圈截图】
请识别：
- 朋友圈文字内容
- 评论内容（如果有）
JSON格式：
{"type":"moments","content":"朋友圈文字","comments":"评论内容（没有则为空）"}

只输出JSON，不要其他说明文字。`;

        // 带超时和重试的 API 调用
        let data = null;
        let lastError = null;
        for (let attempt = 0; attempt <= IMPORT_MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            logger.info(`[ImportChat] 重试第 ${attempt} 次，等待 ${IMPORT_RETRY_DELAY}ms`);
            await new Promise(r => setTimeout(r, IMPORT_RETRY_DELAY));
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), IMPORT_VISION_TIMEOUT);

          try {
            const response = await fetch(vlConfig.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${vlConfig.key}`
              },
              body: JSON.stringify({
                model: vlConfig.model,
                temperature: 0.3,
                max_tokens: 2000,
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: base64Image } }
                  ]
                }]
              }),
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              const errorText = await response.text();
              const err = new Error(`API ${response.status}: ${errorText.substring(0, 200)}`);
              if (response.status >= 400 && response.status < 500) throw err;
              lastError = err;
              continue;
            }

            data = await response.json();
            break;
          } catch (err) {
            clearTimeout(timeoutId);
            lastError = err;
            if (err.name === 'AbortError') {
              logger.warn(`[ImportChat] 第 ${i + 1} 张截图 API 超时 (${IMPORT_VISION_TIMEOUT}ms)`);
              lastError = new Error('AI 识别超时，请稍后重试');
              continue;
            }
            if (err.message?.includes('API 4')) throw err;
            continue;
          }
        }

        if (!data) {
          const errMsg = lastError?.message || '未知错误';
          logger.warn(`[ImportChat] 第 ${i + 1} 张截图识别失败: ${errMsg}`);
          failedScreenshots.push({ index: i + 1, error: errMsg });
          continue;
        }

        if (data.error) {
          const errMsg = data.error.message || JSON.stringify(data.error);
          logger.warn(`[ImportChat] VL模型返回错误: ${errMsg}`);
          failedScreenshots.push({ index: i + 1, error: errMsg });
          continue;
        }

        const content = data.choices?.[0]?.message?.content?.trim();
        if (!content) {
          failedScreenshots.push({ index: i + 1, error: 'AI 未返回内容' });
          continue;
        }

        // 尝试解析 JSON（兼容 markdown code block 包裹）
        let parsed;
        try {
          const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          parsed = JSON.parse(jsonStr);
        } catch (parseErr) {
          logger.warn(`[ImportChat] JSON 解析失败: ${content.substring(0, 200)}`);
          failedScreenshots.push({ index: i + 1, error: 'AI 返回内容无法解析' });
          continue;
        }

        if (Array.isArray(parsed)) {
          for (const msg of parsed) {
            if (msg.role && msg.content && ['girl', 'user'].includes(msg.role)) {
              allMessages.push({ role: msg.role, content: msg.content, time: msg.time || null });
            }
          }
        } else if (parsed && parsed.type === 'moments') {
          let momentContent = '';
          if (parsed.content) momentContent += parsed.content;
          if (parsed.comments) {
            momentContent += momentContent ? `\n\n评论：${parsed.comments}` : `评论：${parsed.comments}`;
          }
          if (momentContent) {
            allMessages.push({
              role: 'girl',
              content: `📱 她发了朋友圈：${momentContent}`,
              time: null
            });
          }
        } else if (parsed && parsed.type === 'chat' && parsed.messages) {
          for (const msg of parsed.messages) {
            if (msg.role && msg.content && ['girl', 'user'].includes(msg.role)) {
              allMessages.push({ role: msg.role, content: msg.content, time: msg.time || null });
            }
          }
        }
      } catch (error) {
        const errMsg = error.message || '未知错误';
        logger.error(`[ImportChat] 第 ${i + 1} 张截图处理异常: ${errMsg}`);
        failedScreenshots.push({ index: i + 1, error: errMsg });
      } finally {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }

    logger.info(`[ImportChat] 识别完成: ${req.files.length} 张截图, ${allMessages.length} 条消息, ${failedScreenshots.length} 张失败`, {
      girlId,
      userId: req.user.id,
      messageCount: allMessages.length,
      failedCount: failedScreenshots.length
    });

    res.json({
      success: true,
      messages: allMessages,
      failedScreenshots: failedScreenshots.length > 0 ? failedScreenshots : undefined,
      chatDate: chatDate || new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    logger.error(`[ImportChat] 截图导入失败: ${error.message}`);
    // 清理上传的文件
    if (req.files) {
      for (const file of req.files) {
        try { fs.unlinkSync(path.join(chatImportUploadDir, file.filename)); } catch (_) {}
      }
    }
    res.status(500).json({ error: { code: 'S0802', message: '识别失败，请重试' } });
  }
});

// ========== 聊天记录分析 ==========

/**
 * POST /api/ai-coach/analyze-chat-history
 * 分析聊天记录并给出建议
 */
router.post('/analyze-chat-history', authMiddleware, async (req, res) => {
  try {
    const { messages, girlProfile } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: { code: 'S0803', message: '请提供有效的聊天记录' } });
    }

    const result = await analyzeChatHistory(messages, girlProfile);

    res.json(result);
  } catch (error) {
    logger.error(`[AnalyzeChatHistory] 分析失败: ${error.message}`);
    res.status(500).json({ error: { code: 'S0802', message: '分析失败，请重试' } });
  }
});

// ========== 图片分析 ==========

/**
 * POST /api/ai-coach/analyze-image
 * 分析图片（聊天记录/朋友圈截图）并给出建议
 * 异步模式：立即返回taskId，后台分析，通过Socket.io通知结果
 */
/**
 * POST /api/ai-coach/analyze-image
 * 两步流式：VL快速识别图片 → 文本上下文流式输出
 */
router.post('/analyze-image', authMiddleware, chatImportUpload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: { code: 'U0701', message: '请上传图片' } });
  }

  const filePath = path.join(chatImportUploadDir, req.file.filename);
  const mime = req.file.mimetype;
  const userMessage = req.body.message || '';
  const girlId = req.body.girlId || null;
  const mode = req.body.mode || 'pro';
  let combatMessages = null;
  try { combatMessages = req.body.combatMessages ? JSON.parse(req.body.combatMessages) : null; } catch (e) { logger.warn('[AnalyzeImage] combatMessages parse failed'); }

  try {
    // ---- 设置 SSE 头 ----
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'identity');
    res.flushHeaders();

    // ---- Step 1: VL 快速识别图片内容 ----
    let imageDescription = '';
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const base64Image = `data:${mime};base64,${fileBuffer.toString('base64')}`;
      imageDescription = await describeImage(base64Image);
      logger.info(`[AnalyzeImage] 图片识别完成: ${imageDescription.length} 字符`);
    } catch (describeErr) {
      logger.warn(`[AnalyzeImage] 图片识别失败: ${describeErr.message}`);
      imageDescription = '（图片识别失败，请根据用户文字描述进行分析）';
    }

    // 发送图片识别完成的 meta 帧
    res.write(`data: ${JSON.stringify({
      meta: {
        step: 'image_recognition',
        done: true,
        imageDescription: imageDescription.substring(0, 200) + (imageDescription.length > 200 ? '...' : '')
      }
    })}\n\n`);

    // ---- Step 2: 组合 situation，走正常流式路径 ----
    const situation = userMessage
      ? `用户上传了一张图片并说：${userMessage}\n\n图片内容如下：\n${imageDescription}`
      : `用户上传了一张图片，图片内容如下：\n${imageDescription}`;

    // 安全验证
    if (girlId) {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) {
        res.write(`data: ${JSON.stringify({ error: { code: 'G0301', message: '女生不存在' } })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      if (req.user.role === 'admin') {
        const session = await prisma.chatSession.findFirst({
          where: { operatorId: req.user.id, clientId: girl.clientId }
        });
        if (!session) {
          res.write(`data: ${JSON.stringify({ error: { code: 'G0302', message: '无权限访问此女生数据' } })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
      }
    }

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

    // 会话记忆
    const unifiedCoachId = girlId ? `girl-${girlId}` : 'unified';
    const { memory: sessionMemory } = await getOrCreateSession(req.user.id, unifiedCoachId, girlId);
    const history = await getConversationHistory(sessionMemory.id);
    const turnCount = history.length;
    const compactionCount = sessionMemory.compactionCount || 0;

    // 添加用户消息到记忆
    await addMessage(sessionMemory.id, 'user', situation);

    // 构建上下文
    const contextBudget = calcContextBudget('', situation, history.map(m => m.content).join(''));
    let context = await buildAICoachContext(req.user.id, girlId, situation, {
      maxContextChars: contextBudget,
      turnCount,
      compactionCount,
      clientProfile
    });

    // 技能路由
    const { skills, meta: routingMeta } = getMultiDimensionalSkillsWithMeta(situation, {
      clientProfile,
      girlProfile: context.girlInfo || null
    });

    // 注入 wiki 知识库
    const updatedContext = await buildAICoachContext(req.user.id, girlId, situation, {
      maxContextChars: contextBudget,
      turnCount,
      compactionCount,
      clientProfile,
      routingMeta
    });
    Object.assign(context, updatedContext);

    // 构建 prompt
    const basePrompt = await buildMasterPrompt(situation, context, {
      girlInfo: context.girlInfo,
      conversationHistory: history,
      turnCount,
      clientProfile,
      clientId: req.user.id
    });

    const personaSection = await buildFullPersona({ clientProfile, clientId: req.user.id, girlId });
    let systemPrompt = basePrompt + buildPersonaSection(personaSection);

    // 注入实战聊天上下文
    const hasCombatContext = Array.isArray(combatMessages) && combatMessages.length > 0;
    if (hasCombatContext) {
      const combatText = combatMessages.map(m => {
        const ts = m.timestamp ? new Date(m.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-') : '';
        const role = m.role === 'user' ? '用户' : '女生';
        return ts ? `[${ts}] ${role}：${m.content}` : `${role}：${m.content}`;
      }).join('\n');
      systemPrompt += `\n【实战聊天记录（用户刚刚进行的实时对话）】\n${combatText}\n`;
    }

    // AI 模型配置
    const aiConfig = getAIConfig(mode);
    logger.info(`[AnalyzeImage] Step2 开始流式输出 | mode=${mode} → 模型: ${aiConfig?.model}`);

    // 流式 AI 调用
    const deduplicator = createChunkDeduplicator();

    const streamParams = {
      messages: [{ role: 'user', content: systemPrompt }],
      temperature: 0.7,
      max_tokens: 200000,
      stream: true
    };
    if (aiConfig.model === 'deepseek-v4-pro') {
      streamParams.thinking = { type: 'enabled' };
    }

    await callAIStream(
      aiConfig,
      streamParams,
      {
        deduplicator,
        onMeta: () => {
          const meta = {
            routedType: routingMeta.routedType,
            routedName: routingMeta.routedType === 'situation' ? '情况咨询'
              : routingMeta.routedType === 'chat_analysis' ? '聊天分析'
              : routingMeta.routedType === 'reply' ? '回复建议'
              : routingMeta.routedType === 'moment' ? '朋友圈分析'
              : routingMeta.routedType === 'overview' ? '全局概览'
              : routingMeta.routedType === 'optimize_reply' ? '话术优化'
              : '通用教练',
            confidence: routingMeta.bestScore,
            coachCount: routingMeta.coachCount
          };
          res.write(`data: ${JSON.stringify({ meta })}\n\n`);
        },
        onReasoning: (reasoning) => {
          res.write(`data: ${JSON.stringify({ reasoning })}\n\n`);
        },
        onChunk: (content) => {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        },
        onDone: () => {
          const fullResponse = deduplicator.getAccumulated();
          if (fullResponse) {
            addMessage(sessionMemory.id, 'assistant', fullResponse)
              .catch(err => logger.error(`[AnalyzeImage] 保存记忆失败: ${err.message}`));
            extractLearningsFromConversation(req.user.id, fullResponse, girlId)
              .catch(err => logger.error(`[AnalyzeImage] 提取 learnings 失败: ${err.message}`));
          }
          if (req.user.role === 'client') {
            activityService.recordActivity(req.user.id, 'ai_coach', {
              routedType: routingMeta.routedType,
            }).catch(() => {});
          }
          res.write('data: [DONE]\n\n');
          res.end();
        },
        onError: (msg) => {
          logger.error(`[AnalyzeImage] 流式输出错误: ${msg}`);
          res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: msg } })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }
    );

  } catch (err) {
    logger.error(`[AnalyzeImage] 图片分析流程异常: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'S0802', message: '图片分析失败，请稍后重试' } });
    } else {
      res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: err.message } })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } finally {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
});

// ============================================================
// 管理员监控 API（仅 admin）
// ============================================================

/**
 * 系统级监控统计
 * GET /api/ai-coach/monitoring/stats
 */
router.get('/monitoring/stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const stats = await getSystemStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error(`[AICoach] 监控统计失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取监控数据失败' } });
  }
});

/**
 * 会话列表（支持分页）
 * GET /api/ai-coach/monitoring/sessions?clientId=&girlId=&coachId=&activeOnly=&compressedOnly=&page=&pageSize=
 */
router.get('/monitoring/sessions', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
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

    // 安全：操盘手只能查询自己负责的客户/女生的会话
    if (req.user.role === 'admin') {
      if (clientId) {
        const session = await prisma.chatSession.findFirst({
          where: { operatorId: req.user.id, clientId }
        });
        if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此客户数据' } });
      } else if (girlId) {
        const girl = await prisma.girl.findUnique({ where: { id: girlId } });
        if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
        const session = await prisma.chatSession.findFirst({
          where: { operatorId: req.user.id, clientId: girl.clientId }
        });
        if (!session) return res.status(403).json({ error: { code: 'G0302', message: '无权限访问此女生数据' } });
      }
    }

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
    logger.error(`[AICoach] 会话列表失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取会话列表失败' } });
  }
});

/**
 * 客户维度会话详情（按女生分组）
 * GET /api/ai-coach/monitoring/client/:clientId
 */
router.get('/monitoring/client/:clientId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { clientId } = req.params;

    // 安全：操盘手只能访问自己负责的客户的数据
    if (req.user.role === 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此客户的数据' } });
    }

    const data = await getClientSessions(clientId);
    res.json({ success: true, data });
  } catch (error) {
    logger.error(`[AICoach] 客户会话详情失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取客户会话详情失败' } });
  }
});

/**
 * 单个会话详情
 * GET /api/ai-coach/monitoring/session/:memoryId
 */
router.get('/monitoring/session/:memoryId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { memoryId } = req.params;
    const detail = await getSessionDetail(memoryId);

    if (!detail) {
      return res.status(404).json({ error: { code: 'H0401', message: '会话不存在' } });
    }

    // 安全：操盘手只能访问自己负责的客户的会话
    if (req.user.role === 'admin') {
      // 从 MemorySession 找到关联的 clientId
      const memorySession = await prisma.memorySession.findUnique({ where: { id: memoryId } });
      if (!memorySession) return res.status(404).json({ error: { code: 'H0401', message: '会话不存在' } });
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: memorySession.clientId }
      });
      if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此会话' } });
    }

    res.json({ success: true, data: detail });
  } catch (error) {
    logger.error(`[AICoach] 会话详情失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取会话详情失败' } });
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
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    if (req.user.role === 'client') {
      try {
        await membershipService.checkTrialLimit(req.user.id, 'ai_coach');
      } catch (e) {
        return res.status(403).json({ error: { code: 'A0108', message: e.message } });
      }
    }

    const { girlId, momentText, momentImage, stream = true } = req.body;

    if (!momentText && !momentImage) {
      return res.status(400).json({ error: { code: 'S0803', message: '朋友圈文字或图片至少需要提供一个' } });
    }

    // 安全：验证女生归属权
    let clientProfile = null;
    let actualClientId = null;
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
          return res.status(403).json({ error: { code: 'A0108', message: '无权限分析此女生朋友圈' } });
        }
      }
      actualClientId = girl.clientId;
      // M007 S06: 加载客户人格画像
      const client = await prisma.user.findUnique({
        where: { id: girl.clientId },
        select: {
          clientType: true, learningAbility: true, antiFrustrationLevel: true,
          pacePreference: true, coachCooperationLevel: true, emotionalStable: true,
          attachmentStyle: true, loveStyle: true, loveLanguage1: true,
          loveLanguage2: true, loveLanguage3: true, loveLanguage4: true,
          loveLanguage5: true, clientBestApproach: true, clientRiskFactors: true,
          clientRecommendedTopics: true, clientStrategicNotes: true,
        }
      });
      if (client) clientProfile = client;
    }

    // 构建女生上下文
    const context = girlId
      ? await buildAICoachContext(req.user.id, girlId)
      : { girlInfo: null, recentSignals: [], pendingActions: [], observations: [], conversationSummary: '' };

    const { girlInfo, recentSignals, pendingActions, observations } = context;

    // 解析 personality
    let personality = {};
    if (girlInfo?.personality) {
      try { personality = typeof girlInfo.personality === 'string' ? JSON.parse(girlInfo.personality) : girlInfo.personality; } catch (e) { logger.warn(`[AICoach] personality 解析失败: ${e.message}`, { error: { code: 'A0108', message: e.message } }); }
      if (typeof personality === 'string') {
        try { personality = JSON.parse(personality); } catch (e) { logger.warn(`[AICoach] personality 二次解析失败: ${e.message}`, { error: { code: 'A0108', message: e.message } }); personality = {}; }
      }
    }

    const stage = girlInfo?.stage || '聊天';
    // M007 S01: 获取关系阶段
    const relStage = girlInfo?.relationshipStage;
    const relStageLabel = relStage ? STAGE_LABELS[relStage] || relStage : null;
    const stageContext = addStageContext(relStage);

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
    const systemPrompt = `你是缘分AI情感教练，帮助分析女生朋友圈，给出评论和私聊切入建议。

回答要求：
- 简洁口语化，像朋友聊天
- 直接给结论和建议，不要绕弯子
- 不要用任何加粗、斜体等格式
- 不要出现任何大师名字、称号、角色名
- 不要说置信度、框架、原则等专业术语
- 不要出现**符号

【女生档案】
昵称：${girlInfo?.name || '未知'}
阶段（旧）：${stage}
关系阶段（新${relStage ? '★' : '☆'}）：${relStageLabel || '未设置'}
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

${stageContext}
`;

    // ---- 输入 Guardrail 检查 ----
    const momentInput = momentText || (momentImage ? '（图片）' : '');
    try {
      const { passed, results, reason } = await runInputGuardrails(momentInput);
      if (!passed) {
        const failedCheck = results.find(r => !r.passed);
        logGuardrailCheck(momentInput, req.user.id, unifiedCoachId, girlId, '/moment').catch(() => {});
        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          res.flushHeaders();
          res.write(`data: ${JSON.stringify({ guardrail: { name: failedCheck?.name, passed: false, reason: reason || '输入检查未通过' } })}\n\n`);
          res.write(`data: ${JSON.stringify({ content: '抱歉，我无法分析与此无关的内容。请描述一下朋友圈的内容～' })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          res.status(400).json({ success: false, error: { code: 'S0803', message: reason || '输入检查未通过' }, guardrailFailed: true });
        }
        return;
      }
      logGuardrailCheck(momentInput, req.user.id, unifiedCoachId, girlId, '/moment').catch(() => {});
    } catch (err) {
      logger.warn(`[moment] Guardrail 检查异常: ${err.message}`, { error: err.message });
    }

    const aiConfig = getAIConfig();

    // 流式模式
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Content-Encoding', 'identity');
      res.flushHeaders();

      const modelConfig = momentImage ? (getVLModelConfig() || aiConfig) : aiConfig;
      const deduplicator = createChunkDeduplicator();

      // 构建请求体
      let fetchOptions;
      if (momentImage) {
        const vlConfig = getVLModelConfig();
        if (!vlConfig) {
          res.write(`data: ${JSON.stringify({ error: { code: 'A0602', message: '当前配置不支持图片分析' } })}\n\n`);
          res.end();
          return;
        }

        let imageUrl = momentImage;
        if (momentImage.startsWith('data:')) {
          imageUrl = momentImage;
        } else if (momentImage.startsWith('/uploads/')) {
          const uploadDir = path.join(__dirname, '..', '..', '..', 'uploads');
          const filePath = path.join(uploadDir, momentImage.replace('/uploads/', ''));
          try {
            const buffer = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'jpg';
            const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
            imageUrl = `data:${mime};base64,${buffer.toString('base64')}`;
          } catch (e) {
            res.write(`data: ${JSON.stringify({ error: { code: 'A0602', message: '图片读取失败' } })}\n\n`);
            res.end();
            return;
          }
        }

        fetchOptions = {
          url: vlConfig.url,
          key: vlConfig.key,
          body: {
            model: vlConfig.model,
            messages: [{ role: 'user', content: [
              { type: 'text', text: systemPrompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]}],
            temperature: 0.7,
            max_tokens: 600,
            stream: true
          }
        };
      } else {
        fetchOptions = {
          url: aiConfig.url,
          key: aiConfig.key,
          body: {
            model: aiConfig.model,
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.7,
            max_tokens: 600,
            stream: true
          }
        };
      }

      // 发起 fetch（带重试）
      await callAIFetchWithRetry(fetchOptions.url, fetchOptions.key, fetchOptions.body, {
        deduplicator,
        onChunk: (content) => res.write(`data: ${JSON.stringify({ content })}\n\n`),
        onDone: () => { res.write('data: [DONE]\n\n'); res.end(); },
        onError: (msg) => { logger.error(`[AICoach] 朋友圈分析失败: ${msg}`); res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: msg } })}\n\n`); res.end(); }
      });
    } else {
      // 非流式模式
      try {
        let response;
        if (momentImage) {
          const vlConfig = getVLModelConfig() || aiConfig;
          let imageUrl = momentImage;
          if (momentImage.startsWith('/uploads/')) {
            const uploadDir = path.join(__dirname, '..', '..', '..', 'uploads');
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

        // M007 S01: 附加阶段警告
        const contentWithWarnings = appendStageWarning(content, relStage);

        res.json({
          success: true,
          analysis: contentWithWarnings,
          relationshipStage: relStage,
          relationshipStageLabel: relStageLabel
        });
      } catch (error) {
        logger.error(`[AICoach] 朋友圈分析失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
        res.status(500).json({ error: { code: 'S0802', message: '分析失败' } });
      }
    }
  } catch (error) {
    if (error.message && error.message.includes('无会员权限')) {
      return res.status(403).json({ error: { code: 'A0108', message: error.message } });
    }
    logger.error(`[AICoach] 朋友圈分析失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '分析失败' } });
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
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    if (req.user.role === 'client') {
      try {
        await membershipService.checkTrialLimit(req.user.id, 'ai_coach');
      } catch (e) {
        return res.status(403).json({ error: { code: 'A0108', message: e.message } });
      }
    }

    const { memoryId, type, reason, routedType, coachesUsed, coachId, questionType } = req.body;

    if (!type) {
      return res.status(400).json({ error: { code: 'S0803', message: 'type 是必需的' } });
    }

    // memoryId 为可选；不传时从该客户的最近会话中查找
    let targetMemoryId = memoryId;
    if (!targetMemoryId) {
      const latestMemory = await prisma.conversationMemory.findFirst({
        where: { clientId: req.user.id },
        orderBy: { updatedAt: 'desc' }
      });
      targetMemoryId = latestMemory?.id || 'unknown';
    }

    if (!['helpful', 'not_helpful'].includes(type)) {
      return res.status(400).json({ error: { code: 'S0803', message: 'type 必须是 helpful 或 not_helpful' } });
    }

    // 验证 memory 归属权（仅当传入 memoryId 时验证）
    let memory = null;
    if (memoryId) {
      memory = await prisma.conversationMemory.findUnique({ where: { id: memoryId } });
      if (!memory) {
        return res.status(404).json({ error: { code: 'H0401', message: '会话不存在' } });
      }
      if (memory.clientId !== req.user.id && req.user.role === 'client') {
        return res.status(403).json({ error: { code: 'A0108', message: '无权评价此会话' } });
      }
    }

    await addFeedback(targetMemoryId, type, { reason, routedType, coachesUsed });

    // 闭环：更新客户教练画像权重
    // 支持单个 coachId 或 coachesUsed 数组
    const clientId = memory?.clientId || req.user.id;
    const targetQuestionType = questionType || routedType || '通用';
    const targetCoaches = coachId
      ? [coachId]
      : (coachesUsed ? (typeof coachesUsed === 'string' ? JSON.parse(coachesUsed) : coachesUsed) : []);

    if (targetCoaches.length > 0) {
      // 异步更新画像，不阻塞响应
      Promise.all(
        targetCoaches.map(c => recordFeedback({
          clientId,
          coachId: c,
          questionType: targetQuestionType,
          feedbackType: type
        }))
      ).catch(err => logger.error(`[Feedback] 画像更新失败: ${err.message}`, { error: err.message }));
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`[AICoach] 反馈记录失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '记录反馈失败' } });
  }
});

/**
 * 获取客户教练偏好（个性化权重摘要）
 * GET /api/ai-coach/coach-profile
 */
router.get('/coach-profile', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    if (req.user.role === 'client') {
      try {
        await membershipService.checkTrialLimit(req.user.id, 'ai_coach');
      } catch (e) {
        return res.status(403).json({ error: { code: 'A0108', message: e.message } });
      }
    }

    const summary = await getProfileSummary(req.user.id);
    const preferences = await getClientCoachPreferences(req.user.id);
    const persona = await buildDynamicPersona({ clientProfile: null, clientId: req.user.id });

    res.json({
      success: true,
      data: {
        summary,
        preferences,
        persona: {
          summary: persona.summary,
          learningStyle: persona.learningStyle,
          clientTypeBehavior: persona.clientTypeBehavior
        }
      }
    });
  } catch (error) {
    if (error.message && error.message.includes('无会员权限')) {
      return res.status(403).json({ error: { code: 'A0108', message: error.message } });
    }
    logger.error(`[AICoach] 获取教练偏好失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取教练偏好失败' } });
  }
});

/**
 * 获取当前用户的聊天历史
 * GET /api/ai-coach/history
 */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    if (req.user.role === 'client') {
      try {
        await membershipService.checkTrialLimit(req.user.id, 'ai_coach');
      } catch (e) {
        return res.status(403).json({ error: { code: 'A0108', message: e.message } });
      }
    }

    const { girlId, activeOnly } = req.query;
    const unifiedCoachId = 'unified';

    // 获取用户的会话
    const { getOrCreateSession, getConversationHistory, listSessions } = require('../../services/memory');

    // 获取所有相关会话（默认只返回活跃会话，传 activeOnly=false 可获取全部历史会话）
    const sessions = await listSessions({
      clientId: req.user.id,
      coachId: unifiedCoachId,
      girlId,
      activeOnly: activeOnly !== 'false',
      pageSize: 20
    });

    // 获取每个会话的消息（默认限制20条）
    const sessionsWithMessages = await Promise.all(
      (sessions.items || []).map(async (session) => {
        const messages = await getConversationHistory(session.id, { limit: 20 });
        return {
          id: session.id,
          girlId: session.girlId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          active: !session.summary,
          messages: messages.map((m, idx) => ({
            id: m.id || `msg-${idx}`,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt || session.createdAt
          }))
        };
      })
    );

    res.json({ success: true, sessions: sessionsWithMessages });
  } catch (error) {
    if (error.message && error.message.includes('无会员权限')) {
      return res.status(403).json({ error: { code: 'A0108', message: error.message } });
    }
    logger.error(`[AICoach] 获取聊天历史失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取聊天历史失败' } });
  }
});

/**
 * 获取反馈统计（仅 admin）
 * GET /api/ai-coach/feedback-stats
 */
router.get('/feedback-stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { startDate, endDate } = req.query;

    const stats = await getFeedbackStats({ startDate, endDate });

    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error(`[AICoach] 反馈统计失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取统计失败' } });
  }
});

/**
 * Guardrail 检查统计
 * GET /api/ai-coach/guardrail-stats
 */
router.get('/guardrail-stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { startDate, endDate, days = '7' } = req.query;
    const daysNum = parseInt(days, 10) || 7;

    const since = new Date();
    since.setDate(since.getDate() - daysNum);

    const where = {
      createdAt: { gte: since }
    };
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);

    const logs = await prisma.guardrailLog.findMany({
      where,
      select: {
        checkType: true,
        passed: true,
        reason: true,
        endpoint: true,
        createdAt: true
      }
    });

    const total = logs.length;
    const passed = logs.filter(l => l.passed).length;
    const failed = logs.filter(l => !l.passed).length;

    // 按检查类型统计
    const byType = {};
    for (const log of logs) {
      const key = log.checkType;
      if (!byType[key]) byType[key] = { total: 0, passed: 0, failed: 0 };
      byType[key].total++;
      if (log.passed) byType[key].passed++;
      else byType[key].failed++;
    }
    for (const key of Object.keys(byType)) {
      const t = byType[key];
      t.passRate = t.total > 0 ? Math.round((t.passed / t.total) * 100) : 0;
    }

    // 按端点统计
    const byEndpoint = {};
    for (const log of logs) {
      const key = log.endpoint || 'unknown';
      if (!byEndpoint[key]) byEndpoint[key] = { total: 0, passed: 0, failed: 0 };
      byEndpoint[key].total++;
      if (log.passed) byEndpoint[key].passed++;
      else byEndpoint[key].failed++;
    }
    for (const key of Object.keys(byEndpoint)) {
      const t = byEndpoint[key];
      t.passRate = t.total > 0 ? Math.round((t.passed / t.total) * 100) : 0;
    }

    // 失败原因分布（最近失败的前10个）
    const failureReasons = logs
      .filter(l => !l.passed && l.reason)
      .reduce((acc, l) => {
        const key = l.reason?.slice(0, 80) || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    const topFailureReasons = Object.entries(failureReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }));

    // 最近拦截记录
    const recentFailed = await prisma.guardrailLog.findMany({
      where: { passed: false, ...where },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        checkType: true,
        reason: true,
        inputText: true,
        endpoint: true,
        createdAt: true
      }
    });

    res.json({
      success: true,
      data: {
        period: { days: daysNum, since: since.toISOString() },
        summary: {
          total,
          passed,
          failed,
          passRate: total > 0 ? Math.round((passed / total) * 100) : 0
        },
        byType,
        byEndpoint,
        topFailureReasons,
        recentFailed
      }
    });
  } catch (error) {
    logger.error(`[AICoach] Guardrail 统计失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取统计失败' } });
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
    if (!['admin'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const operatorId = req.user.id;
    const { cachedUserHash, mode } = req.query;

    // 安全：获取当前操盘手负责的客户列表
    const sessions = await prisma.chatSession.findMany({
      where: { operatorId },
      select: { clientId: true }
    });
    const clientIds = sessions.map(s => s.clientId);

    // 计算当前 userDataHash（从当前操盘手的客户池整体状态）
    const allClients = await prisma.user.findMany({ where: { role: 'client', id: { in: clientIds } } });

    const allGirls = await prisma.girl.findMany({
      where: { clientId: { in: clientIds } },
      include: { client: { select: { id: true, nickname: true, username: true, age: true } } },
      orderBy: { tensionScore: 'desc' }
    });

    if (allGirls.length === 0) {
      // 检查是否有客户池但女生为空（还没捞鱼）
      const hasClients = allClients.length > 0;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ cached: false, userDataHash: '', changeReason: null, staleAlerts: [], isEmpty: true })}\n\n`);
      if (hasClients) {
        res.write(`data: ${JSON.stringify({ content: `你有 ${allClients.length} 个客户，但缘分是空的。去「女生资源」里添加第一个女生吧～` })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ content: '还没有客户，先去「客户管理」添加第一个客户吧～' })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // 有客户池但选中客户时女生为空（客户已选但该客户下没有女生）
    // 注意：overview 端点不看 selectedClient，只展示全局
    // 前端在有 selectedClient 但无女生时，应该在另一处显示
    // 这里只处理有女生的情况

    // 概览 hash 基于：总鱼数 + 各客户池整体热度分布
    const hotCount = allGirls.filter(g => (g.tensionScore || 5) >= 7).length;
    const warmCount = allGirls.filter(g => (g.tensionScore || 5) >= 5 && (g.tensionScore || 5) < 7).length;
    const coldCount = allGirls.filter(g => (g.tensionScore || 5) < 5).length;
    const overviewRaw = [allGirls.length, hotCount, warmCount, coldCount].join('|');
    const currentUserHash = crypto.createHash('md5').update(overviewRaw).digest('hex');

    // ---- 分支 1：缓存命中 ----
    if (cachedUserHash && cachedUserHash === currentUserHash) {
      logger.debug(`[overview] cache hit for operatorId=${operatorId}`);
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

    logger.debug(`[overview] cache miss for operatorId=${operatorId}, mode=${mode || 'normal'}`);

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

    const systemPrompt = `你是缘分AI情感教练，帮操盘手分析当前全局情况，主动给出学习和行动建议。

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

失联提醒：${staleAlerts.length > 0 ? staleAlerts.map(a => a).join(' | ') : '暂无'}

请主动分析（用聊天语气，像朋友一样给建议）：
1. 当前整体情况怎么样，哪些女生值得关注重点关注
2. 最需要推进的是哪1-2个，为什么
3. 操盘手今天应该重点做什么
4. 有没有需要学习/注意的情感知识点（结合当前实际案例讲）${promptSuffix}
5. 有没有特别需要关注的风险或异常情况（如失联超过3天、热度突然下降等）`;

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
      const deduplicator = createChunkDeduplicator();
      let fullContent = '';

      await callAIFetchWithRetry(aiConfig.url, aiConfig.key, {
        model: aiConfig.model,
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.7,
        max_tokens: mode === 'daily' ? 1000 : 800,
        stream: true
      }, {
        deduplicator,
        onChunk: (content) => { fullContent += content; res.write(`data: ${JSON.stringify({ content })}\n\n`); },
        onDone: () => { res.write('data: [DONE]\n\n'); res.end(); },
        onError: (msg) => { logger.error(`[AICoach] 全局概览失败: ${msg}`); res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: msg } })}\n\n`); res.end(); }
      });

      // 写缓存
      if (fullContent) {
        setOverviewCache(operatorId, {
          content: fullContent,
          userDataHash: currentUserHash,
          prevSnapshot: { hotCount, warmCount, coldCount, totalGirls: allGirls.length }
        }).catch(err => logger.error(`[overview] cache write failed: ${err.message}`, { error: err.message }));
      }
    } catch (error) {
      logger.error(`[AICoach] 全局概览失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
      res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: '分析失败' } })}\n\n`);
      res.end();
    }
  } catch (error) {
    logger.error(`[AICoach] 全局概览失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取概览失败' } });
  }
});

/**
 * 主动教练 - 客户池分析（选择了客户但没选女生时）
 * GET /api/ai-coach/client-pool/:clientId
 *
 * 展示该操盘手下指定客户的女生池整体情况
 */
router.get('/client-pool/:clientId', authMiddleware, async (req, res) => {
  try {
    if (!['admin'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { clientId } = req.params;
    const { cachedClientHash, mode } = req.query;

    // 安全：操盘手只能访问自己负责的客户的数据
    if (req.user.role === 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId }
      });
      if (!session) {
        return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此客户的数据' } });
      }
    }

    // 获取该客户下的所有女生
    const clientGirls = await prisma.girl.findMany({
      where: { clientId },
      include: { client: { select: { id: true, nickname: true, username: true, age: true } } },
      orderBy: { tensionScore: 'desc' }
    });

    if (clientGirls.length === 0) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ cached: false, clientDataHash: '', changeReason: null, staleAlerts: [] })}\n\n`);
      res.write(`data: ${JSON.stringify({ content: `这个客户还没有女生。去「女生资源」添加吧～` })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // 计算 clientDataHash（基于该客户池的热度分布）
    const hotCount = clientGirls.filter(g => (g.tensionScore || 5) >= 7).length;
    const warmCount = clientGirls.filter(g => (g.tensionScore || 5) >= 5 && (g.tensionScore || 5) < 7).length;
    const coldCount = clientGirls.filter(g => (g.tensionScore || 5) < 5).length;
    const clientRaw = [clientGirls.length, hotCount, warmCount, coldCount].join('|');
    const currentClientHash = crypto.createHash('md5').update(clientRaw).digest('hex');

    // 缓存命中检查
    if (cachedClientHash && cachedClientHash === currentClientHash) {
      logger.debug(`[client-pool] cache hit for clientId=${clientId}`);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const staleAlerts = clientGirls.map(g => computeStaleAlert(g)).filter(Boolean);

      res.write(`data: ${JSON.stringify({
        cached: true, clientDataHash: currentClientHash,
        changeReason: null, staleAlerts
      })}\n\n`);

      const cached = await getClientPoolCache(req.user.id, clientId);
      if (cached) {
        const content = cached.content;
        const chunkSize = 100;
        for (let i = 0; i < content.length; i += chunkSize) {
          res.write(`data: ${JSON.stringify({ content: content.slice(i, i + chunkSize) })}\n\n`);
          await new Promise(r => setTimeout(r, 10));
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    logger.debug(`[client-pool] cache miss for clientId=${clientId}`);

    // 构建该客户池的摘要
    const clientInfo = clientGirls[0]?.client;
    const poolSummary = clientGirls.map(g => {
      let personality = {};
      if (g.personality) {
        try { personality = typeof g.personality === 'string' ? JSON.parse(g.personality) : g.personality; } catch (e) {}
      }
      return `【${g.name}】
  阶段：${g.stage}
  热度：${g.tensionScore || 5}/10
  亲密度：${g.intimacyLevel || 1}
  回复规律：${g.responsePattern || '未知'}
  备注：${g.notes?.slice(0, 30) || ''}`;
    }).join('\n\n');

    const hotGirls = clientGirls.filter(g => (g.tensionScore || 5) >= 7);
    const warmGirls = clientGirls.filter(g => (g.tensionScore || 5) >= 5 && (g.tensionScore || 5) < 7);
    const coldGirls = clientGirls.filter(g => (g.tensionScore || 5) < 5);
    const staleAlerts = clientGirls.map(g => computeStaleAlert(g)).filter(Boolean);

    const systemPrompt = `你是缘分AI情感教练，帮操盘手分析当前选中客户的女生池情况，给出针对这个客户的整体建议。

要求：
- 简洁口语化，像朋友聊天
- 直接给结论和建议，不要绕弯子
- 不要用任何加粗、斜体等格式
- 不要出现任何大师名字、称号、角色名
- 不要说置信度、框架、原则等专业术语
- 不要出现**符号

【客户信息】
客户：${clientInfo?.nickname || clientInfo?.username || '未知'}
女生数量：${clientGirls.length} 个

【女生池热度分布】
🔥 热度高（7+）：${hotGirls.length} 个
🌡️ 热度中（5-6）：${warmGirls.length} 个
❄️ 热度低（<5）：${coldGirls.length} 个

【女生资源清单】
${poolSummary}

失联提醒：${staleAlerts.length > 0 ? staleAlerts.map(a => a).join(' | ') : '暂无'}

请分析（用聊天语气，像朋友一样给建议）：
1. 这个客户的整体情况如何？女生池质量怎么样？
2. 最值得重点关注的是哪1-2个女生？为什么？
3. 近期有没有值得注意的信号或风险？
4. 今天应该重点推进什么？

要言之有物，针对这个具体客户的实际情况分析，不要泛泛而谈。`;

    const aiConfig = getAIConfig();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'identity');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({
      cached: false, clientDataHash: currentClientHash,
      changeReason: '数据更新', staleAlerts
    })}\n\n`);

    try {
      const deduplicator = createChunkDeduplicator();
      let fullContent = '';

      await callAIFetchWithRetry(aiConfig.url, aiConfig.key, {
        model: aiConfig.model,
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.7,
        max_tokens: 800,
        stream: true
      }, {
        deduplicator,
        onChunk: (content) => { fullContent += content; res.write(`data: ${JSON.stringify({ content })}\n\n`); },
        onDone: () => { res.write('data: [DONE]\n\n'); res.end(); },
        onError: (msg) => { logger.error(`[AICoach] 客户池分析失败: ${msg}`); res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: msg } })}\n\n`); res.end(); }
      });

      if (fullContent) {
        setClientPoolCache(req.user.id, clientId, {
          content: fullContent,
          clientDataHash: currentClientHash
        }).catch(err => logger.error(`[client-pool] cache write failed: ${err.message}`, { error: err.message }));
      }
    } catch (error) {
      logger.error(`[AICoach] 客户池分析失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
      res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: '分析失败' } })}\n\n`);
      res.end();
    }
  } catch (error) {
    logger.error(`[AICoach] 客户池分析失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取客户池分析失败' } });
  }
});

// 需要新增的缓存函数
async function getClientPoolCache(operatorId, clientId) {
  try {
    const cache = await prisma.girlSummaryCache.findFirst({
      where: { operatorId, girlId: `client-pool:${clientId}` }
    });
    return cache;
  } catch { return null; }
}

async function setClientPoolCache(operatorId, clientId, data) {
  try {
    await prisma.girlSummaryCache.upsert({
      where: { id: `${operatorId}:client-pool:${clientId}` },
      create: {
        id: `${operatorId}:client-pool:${clientId}`,
        operatorId,
        girlId: `client-pool:${clientId}`,
        content: data.content,
        girlDataHash: data.clientDataHash,
        userDataHash: '',
        prevSnapshot: null
      },
      update: {
        content: data.content,
        girlDataHash: data.clientDataHash
      }
    });
  } catch (e) { logger.error(`[client-pool] cache write error: ${e.message}`, { error: { code: 'A0108', message: e.message } }); }
}

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
router.post('/girl-summary/:girlId', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { girlId } = req.params;
    const { cachedGirlHash, cachedUserHash, combatMessages } = req.body || {};

    // 安全验证
    const girl = await prisma.girl.findUnique({
      where: { id: girlId },
      include: {
        client: { select: { id: true, nickname: true, username: true, age: true } },
        chatLogs: { orderBy: { createdAt: 'desc' }, take: 5 }
      }
    });

    if (!girl) {
      return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    }

    // 安全：操盘手只能访问自己负责的客户的女生
    if (req.user.role === 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: girl.clientId }
      });
      if (!session) {
        return res.status(403).json({ error: { code: 'G0302', message: '无权限访问此女生数据' } });
      }
    } else if (req.user.role === 'client' && girl.clientId !== req.user.id) {
      return res.status(403).json({ error: { code: 'G0302', message: '无权限访问此女生数据' } });
    }

    const clientId = girl.clientId;

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

    // ---- 分支 1：缓存命中（有实战聊天上下文时跳过缓存） ----
    if (!hasCombatContext && cachedGirlHash && cachedUserHash &&
        cachedGirlHash === currentGirlHash &&
        cachedUserHash === currentUserHash) {
      logger.debug(`[girl-summary] cache hit for girlId=${girlId}, clientId=${clientId}`);
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

    logger.debug(`[girl-summary] cache miss for girlId=${girlId}, clientId=${clientId}, reason: ${changeReason}`);

    // 解析 personality
    let personality = {};
    if (girl.personality) {
      try { personality = typeof girl.personality === 'string' ? JSON.parse(girl.personality) : girl.personality; } catch (e) {}
    }

    // 获取近期信号（signals 存储为 JSON 字符串，需 parse）
    const signalsArray = parseJson(girl.signals);
    const recentSignals = signalsArray.slice(0, 5);
    const signalsText = recentSignals.length > 0
      ? recentSignals.map(s => {
          const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
          return `${icon} ${s.event} — ${new Date(s.createdAt).toLocaleDateString()}`;
        }).join('\n')
      : '暂无记录';

    // 获取最近聊天
    const recentChats = girl.chatLogs.length > 0
      ? girl.chatLogs.map(l => `${l.isFromUser ? '用户' : '女生'}：${l.content.slice(0, 50)}`).join('\n')
      : '暂无聊天记录';

    // 实战聊天上下文（前端传入的实时聊天记录）
    const hasCombatContext = Array.isArray(combatMessages) && combatMessages.length > 0;
    const combatText = hasCombatContext
      ? combatMessages.map(m => `${m.role === 'user' ? '用户' : '女生'}：${m.content}`).join('\n')
      : '';

    // 失联提醒（不参与 hash）
    const staleAlert = computeStaleAlert(girl);

    // 解析 relationshipAttitude, bestApproach 等战略字段
    const strategyFields = {
      relationshipAttitude: girl.relationshipAttitude || '',
      bestApproach: girl.bestApproach || '',
      recommendedTopics: girl.recommendedTopics || '',
      upgradeConditions: girl.upgradeConditions || '',
      riskFactors: girl.riskFactors || '',
      strategicNotes: girl.strategicNotes || '',
      responsePattern: girl.responsePattern || '',
    };

    const systemPrompt = `你是缘分AI情感教练，帮操盘手分析当前选中的女生，给出针对这个女生的具体、可操作的行动建议。

要求：
- 简洁口语化，像朋友聊天
- 直接给结论和建议，不要绕弯子
- 不要用任何加粗、斜体等格式
- 不要出现任何大师名字、称号、角色名
- 不要说置信度、框架、原则等专业术语
- 不要出现**符号
- 针对【${girl.name}】给出具体建议，不是泛泛而谈

${changeReason !== '数据更新' ? `【数据变化原因】\n${changeReason}\n\n` : ''}
【女生档案】
昵称：${girl.name}
阶段：${girl.stage}
热度：${girl.tensionScore || 5}/10
亲密度：${girl.intimacyLevel || 1}
回复规律：${girl.responsePattern || '未知'}
回复速度：${girl.responsePattern === '秒回' ? '秒回型，需要保持节奏' : girl.responsePattern === '慢' ? '慢热型，需要耐心，不能逼太紧' : '正常型，保持稳定节奏'}

【性格画像】
MBTI：${personality.mbti || '未知'}
沟通风格：${personality.communicationStyle || '未知'}
情绪触发点：${(personality.emotionalTriggers || []).join('、') || '暂无'}
聊天禁忌：${(personality.thingsToAvoid || []).join('、') || '暂无'}
擅长话题：${(personality.talkingTopics || []).join('、') || '未知'}
${girl.interests ? `兴趣爱好：${girl.interests}` : ''}

【战略分析】
策略类型：${strategyFields.bestApproach || '未知'}
推荐话题：${strategyFields.recommendedTopics || '暂无'}
升级条件：${strategyFields.upgradeConditions || '暂无'}
风险因素：${strategyFields.riskFactors || '暂无'}
战略备注：${strategyFields.strategicNotes || '暂无'}

【近期关键信号】
${signalsText}

【最近聊天】
${recentChats}
${hasCombatContext ? `\n【实战聊天记录（用户刚刚进行的实时对话）】\n${combatText}\n` : ''}

【女生备注】
${girl.notes || '暂无'}

请针对【${girl.name}】给出具体分析和建议：

1. 【${girl.name}】现在处于什么状态？关系进展到哪一步了？和别的女生有什么不同？
2. 最近有什么值得注意的信号？有没有风险需要提前规避？
3. 现在最应该做什么？优先级是什么？
4. 如果要聊天的话，切入点是什么？具体说什么？（给出1-2句具体的话）
5. 这个女生和客户的匹配度如何？

用聊天语气说，像朋友一样给建议。要言之有物，不能泛泛而谈。`;

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
      const deduplicator = createChunkDeduplicator();
      let fullContent = '';

      const reqBody = {
        model: aiConfig.model,
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.7,
        max_tokens: 2000,
        stream: true
      };
      // deepseek-v4-pro 启用思考过程
      if (aiConfig.model === 'deepseek-v4-pro') {
        reqBody.thinking = { type: 'enabled' };
      }

      await callAIFetchWithRetry(aiConfig.url, aiConfig.key, reqBody, {
        deduplicator,
        onChunk: (content) => { fullContent += content; res.write(`data: ${JSON.stringify({ content })}\n\n`); },
        onReasoning: (reasoning) => { res.write(`data: ${JSON.stringify({ reasoning })}\n\n`); },
        onDone: () => { res.write('data: [DONE]\n\n'); res.end(); },
        onError: (msg) => { logger.error(`[AICoach] 女生专项分析失败: ${msg}`); res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: msg } })}\n\n`); res.end(); }
      });

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
        }).catch(err => logger.error(`[girl-summary] cache write failed: ${err.message}`, { error: err.message }));
      }
    } catch (error) {
      logger.error(`[AICoach] 女生专项分析失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
      res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: '分析失败' } })}\n\n`);
      res.end();
    }
  } catch (error) {
    logger.error(`[AICoach] 女生专项分析失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取女生分析失败' } });
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

// (extractGirlProfileFromConversation / applyGirlProfileUpdate 已提取到 situation.js)

/**
 * 获取女生档案字段的新鲜度信息（用于 system prompt 注入）
 * @param {object} girlInfo - 女生档案对象
 * @returns {object} - { tensionAgeHours, intimacyAgeHours, hasStaleField, warnings[] }
 */
function getProfileFreshnessInfo(girlInfo) {
  const warnings = [];
  const now = Date.now();

  let tensionAgeHours = null;
  let intimacyAgeHours = null;

  if (girlInfo?.tensionScoreUpdatedAt) {
    tensionAgeHours = Math.round((now - new Date(girlInfo.tensionScoreUpdatedAt).getTime()) / (1000 * 60 * 60));
    if (tensionAgeHours >= 24) {
      warnings.push(`[注意]热度评分基于 ${tensionAgeHours}h 前的信息，可能已过时`);
    }
  }

  if (girlInfo?.intimacyLevelUpdatedAt) {
    intimacyAgeHours = Math.round((now - new Date(girlInfo.intimacyLevelUpdatedAt).getTime()) / (1000 * 60 * 60));
    if (intimacyAgeHours >= 24) {
      warnings.push(`[注意]亲密度评估基于 ${intimacyAgeHours}h 前的信息，可能已过时`);
    }
  }

  const hasStaleField = warnings.length > 0;

  return { tensionAgeHours, intimacyAgeHours, hasStaleField, warnings };
}

/**
 * Agent 统一入口 - 流式对话端点
 * POST /api/ai-coach/agent-chat
 *
 * 统一入口：Triage Agent 自动识别意图 → 路由到专业 Agent → 流式返回结果
 *
 * 请求体：
 * {
 *   message: string,          // 用户输入
 *   girlId?: string,          // 女生ID（可选）
 *   sessionMemoryId?: string,  // 记忆会话ID（可选）
 *   conversationHistory?: Array<{role, content}>, // 对话历史（可选，优先用 sessionMemoryId）
 *   stream?: boolean           // 是否流式（默认 true）
 * }
 *
 * SSE meta 帧结构：
 * { meta: {
 *     guardrail: { name, passed, reasoning },
 *     triage: { routeType, confidence, method, keywordMatch },
 *     handoff: { from, to, reason },
 *     agent: { current, turnCount, compactionCount },
 *     ...
 *   }
 * }
 */
router.post('/agent-chat', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    // 试用限制检查
    try {
      await membershipService.checkTrialLimit(req.user.id, 'ai_coach');
      await membershipService.useTrialCount(req.user.id);
    } catch (e) {
      return res.status(403).json({ error: { code: 'A0108', message: e.message } });
    }

    const { message, girlId, sessionMemoryId, conversationHistory: providedHistory, stream = true } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: { code: 'S0803', message: '消息内容是必需的' } });
    }

    const trimmedMessage = message.trim();

    // 安全：验证女生归属权
    if (girlId) {
      const girl = await prisma.girl.findUnique({ where: { id: girlId } });
      if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
      if (req.user.role === 'admin') {
        const session = await prisma.chatSession.findFirst({
          where: { operatorId: req.user.id, clientId: girl.clientId }
        });
        if (!session) return res.status(403).json({ error: { code: 'G0302', message: '无权限访问此女生数据' } });
      }
    }

    // ---- 输入 Guardrail ----
    let guardrailPassed = true;
    let guardrailResults = [];
    try {
      const result = await runInputGuardrails(trimmedMessage);
      guardrailPassed = result.passed;
      guardrailResults = result.results;
      if (!guardrailPassed) {
        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          res.flushHeaders();
          const failed = result.results?.find(r => !r.passed);
          res.write(`data: ${JSON.stringify({
            meta: { guardrail: { name: failed?.name || 'unknown', passed: false, reason: result.reason || '检查未通过' } }
          })}\n\n`);
          res.write(`data: ${JSON.stringify({ content: '抱歉，我无法回答与情感咨询无关的问题。请换个方式描述你的情况～' })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          res.json({ success: false, error: result.reason || '输入检查未通过', guardrailFailed: true });
        }
        logGuardrailCheck(trimmedMessage, req.user.id, 'unified', girlId, '/agent-chat').catch(() => {});
        return;
      }
      logGuardrailCheck(trimmedMessage, req.user.id, 'unified', girlId, '/agent-chat').catch(() => {});
    } catch (err) {
      logger.warn(`[agent-chat] Guardrail 异常: ${err.message}`, { error: err.message });
    }

    // ---- 构建 UnifiedContext ----
    const { memory: sessionMemory } = await getOrCreateSession(req.user.id, 'unified', girlId);
    const memSessionId = sessionMemoryId || sessionMemory.id;
    const history = providedHistory?.length > 0
      ? providedHistory
      : await getConversationHistory(memSessionId);

    const aiConfig = getAIConfig();

    // ---- Triage 路由 ----
    const triageResult = await triage(trimmedMessage, {
      girlId,
      girlProfile: null,
      clientProfile: null,
      recentSignals: [],
    }, aiConfig);

    const routeType = triageResult.routeType;
    const routeName = triageResult.routeType.replace('_', ' ');

    // ---- 记录 Triage 结果到日志 ----
    logTriageResult(req.user.id, girlId, triageResult.routeType, triageResult.confidence, triageResult.method, '/agent-chat').catch(() => {});

    // ---- 追加用户消息到记忆 ----
    await addMessage(memSessionId, 'user', trimmedMessage);

    // 流式模式
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const deduplicator = createChunkDeduplicator();

      // 构建上下文（用于各 Agent）
      const context = await buildAICoachContext(req.user.id, girlId, trimmedMessage, {
        maxContextChars: calcContextBudget('', trimmedMessage, history.map(m => m.content).join('')),
        turnCount: history.length,
        compactionCount: sessionMemory.compactionCount || 0,
      });

      // 根据路由类型构建 system prompt
      const agentPrompts = await buildAgentPrompt(routeType, trimmedMessage, context, {
        history,
        turnCount: history.length,
        compactionCount: sessionMemory.compactionCount || 0,
        userId: req.user.id,
      });

      const systemPrompt = agentPrompts.systemPrompt;
      const userPrompt = agentPrompts.userPrompt;

      // 发送初始 meta（guardrail + triage + agent 信息）
      res.write(`data: ${JSON.stringify({
        meta: {
          guardrail: guardrailResults.map(r => ({ name: r.name, passed: r.passed })),
          triage: {
            routeType: triageResult.routeType,
            routeName: triageResult.routeType === 'situation' ? '情况咨询'
              : triageResult.routeType === 'chat_analysis' ? '聊天分析'
              : triageResult.routeType === 'reply' ? '回复建议'
              : triageResult.routeType === 'moment' ? '朋友圈分析'
              : triageResult.routeType === 'overview' ? '全局概览'
              : triageResult.routeType === 'optimize_reply' ? '话术优化'
              : '通用教练',
            confidence: triageResult.confidence,
            method: triageResult.method,
            meta: triageResult.meta
          },
          agent: {
            current: routeType,
            sessionId: memSessionId,
            turnCount: history.length + 1,
            compactionCount: sessionMemory.compactionCount || 0,
          }
        }
      })}\n\n`);

      // 流式 AI 调用
      await callAIStream(
        aiConfig,
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 500,
          stream: true
        },
        {
          deduplicator,
          onChunk: (content) => {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          },
          onDone: async () => {
            // 记录 AI 响应到记忆
            // 注意：由于是流式，我们只记录一条 assistant 消息占位
            // 完整内容需要客户端上传，这里不做处理

            // 记录活跃度（仅客户端用户）
            if (req.user.role === 'client') {
              activityService.recordActivity(req.user.id, 'ai_coach', {
                routeType,
              }).catch(err => logger.error(`[Activity] 记录ai_coach失败: ${err.message}`));
            }

            res.write('data: [DONE]\n\n');
            res.end();
          },
          onError: (err) => {
            res.write(`data: ${JSON.stringify({ error: { code: 'S0802', message: err?.message || String(err) } })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          }
        }
      );
    } else {
      // 非流式模式
      const context = await buildAICoachContext(req.user.id, girlId, trimmedMessage);
      const agentPrompts = await buildAgentPrompt(routeType, trimmedMessage, context, {
        history,
        userId: req.user.id,
      });

      const response = await fetch(aiConfig.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { role: 'system', content: agentPrompts.systemPrompt },
            { role: 'user', content: agentPrompts.userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 500,
          stream: false
        })
      });

      if (!response.ok) {
        return res.status(502).json({ error: { code: 'A0601', message: 'AI 服务请求失败' } });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      await addMessage(memSessionId, 'assistant', content);

      // 记录活跃度（仅客户端用户）
      if (req.user.role === 'client') {
        activityService.recordActivity(req.user.id, 'ai_coach', {
          routeType: triageResult.routeType,
        }).catch(err => logger.error(`[Activity] 记录ai_coach失败: ${err.message}`));
      }

      res.json({
        success: true,
        data: {
          content,
          routeType: triageResult.routeType,
          meta: {
            triage: triageResult,
            agent: { current: routeType, sessionId: memSessionId }
          }
        }
      });
    }
  } catch (error) {
    logger.error(`[AICoach] agent-chat 异常: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'A0601', message: '服务暂时不可用' } });
  }
});

/**
 * 根据路由类型构建 Agent 对应的 prompt
 *
 * S03 变更：路由到独立 Agent 模块，各 Agent 自己构建 prompt
 * @param {string} routeType - 路由类型
 * @param {string} message - 用户输入
 * @param {object} context - 上下文
 * @param {object} opts - { history, turnCount, compactionCount, userId }
 */
async function buildAgentPrompt(routeType, message, context, opts) {
  const { history, turnCount = 0, compactionCount = 0, userId } = opts;

  // 构建 UnifiedContext（用于专业 Agent）
  const { UnifiedContext, AGENT_MAP } = require('../../agents');
  const ctx = new UnifiedContext(userId);
  ctx.girlProfile = context.girlInfo ? {
    ...context.girlInfo,
    personality: (() => {
      try {
        return typeof context.girlInfo.personality === 'string'
          ? JSON.parse(context.girlInfo.personality)
          : context.girlInfo.personality || {};
      } catch (e) { return {}; }
    })(),
  } : null;
  ctx.recentSignals = context.recentSignals || [];
  ctx.conversationHistory = history || [];
  ctx.turnCount = turnCount;
  ctx.compactionCount = compactionCount;
  ctx.conversationSummary = context.conversationSummary || null;
  ctx.clientProfile = context.clientProfile || null;

  const agentModule = AGENT_MAP[routeType];
  if (!agentModule) {
    // fallback 到 SituationAgent
    return AGENT_MAP['situation'].buildPrompt(message, ctx, { clientId: userId });
  }

  // ReplyAgent 需要区分普通回复和优化模式
  if (agentModule === require('../../agents/ReplyAgent') && routeType === 'optimize_reply') {
    return agentModule.buildOptimizePrompt(message, null, ctx, { clientId: userId });
  }

  return agentModule.buildPrompt(message, ctx, { clientId: userId });
}

/**
 * Triage 路由统计
 * GET /api/ai-coach/triage-stats
 *
 * 返回：按路由类型分布、置信度分布、平均置信度
 */
router.get('/triage-stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { days = '7' } = req.query;
    const daysNum = parseInt(days, 10) || 7;
    const since = new Date();
    since.setDate(since.getDate() - daysNum);

    // 从 GuardrailLog 中查询 Triage 记录（checkType='triage'）
    // agent-chat 端点每次调用会记录一条 triage 类型的日志
    const triageLogs = await prisma.guardrailLog.findMany({
      where: {
        checkType: 'triage',
        createdAt: { gte: since }
      },
      select: {
        routeType: true,
        confidence: true,
        method: true,
        endpoint: true,
        passed: true,
        reason: true,
        createdAt: true
      }
    });

    const totalRequests = triageLogs.length;

    // 按路由类型统计
    const byRouteType = {};
    let confidenceSum = 0;
    let confidenceCount = 0;
    let methodCounts = {};
    let endpointCounts = {};

    for (const log of triageLogs) {
      const rt = log.routeType || 'unknown';
      if (!byRouteType[rt]) byRouteType[rt] = { total: 0, passed: 0, failed: 0 };
      byRouteType[rt].total++;
      if (log.passed) byRouteType[rt].passed++;
      else byRouteType[rt].failed++;

      if (log.confidence != null) {
        confidenceSum += log.confidence;
        confidenceCount++;
      }

      if (log.method) methodCounts[log.method] = (methodCounts[log.method] || 0) + 1;
      if (log.endpoint) endpointCounts[log.endpoint] = (endpointCounts[log.endpoint] || 0) + 1;
    }

    const avgConfidence = confidenceCount > 0 ? Math.round((confidenceSum / confidenceCount) * 100) / 100 : null;

    // 排序：按总量降序
    const topRouteTypes = Object.entries(byRouteType)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([routeType, stats]) => ({
        routeType,
        total: stats.total,
        passed: stats.passed,
        failed: stats.failed,
        passRate: stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0
      }));

    // 方法分布
    const methodDistribution = Object.entries(methodCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([method, count]) => ({ method, count, percent: totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0 }));

    // 端点分布
    const endpointDistribution = Object.entries(endpointCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([endpoint, count]) => ({ endpoint, count, percent: totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0 }));

    // 失败原因（用于调试 Triage 分类质量）
    const failureReasons = triageLogs
      .filter(l => !l.passed && l.reason)
      .reduce((acc, l) => {
        const key = l.reason?.slice(0, 80) || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    const topFailureReasons = Object.entries(failureReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }));

    res.json({
      success: true,
      data: {
        period: { days: daysNum, since: since.toISOString() },
        summary: {
          totalRequests,
          avgConfidence,
          totalMethods: Object.keys(methodCounts).length,
          totalEndpoints: Object.keys(endpointCounts).length
        },
        byRouteType: topRouteTypes,
        methodDistribution,
        endpointDistribution,
        topFailureReasons,
        note: 'Triage 统计基于 checkType=triage 的日志记录。需要 /agent-chat 端点启用 triage 日志记录。'
      }
    });
  } catch (error) {
    logger.error(`[AICoach] Triage 统计失败: ${error.message}`, { error: { code: 'A0108', message: error.message } });
    res.status(500).json({ error: { code: 'S0802', message: '获取统计失败' } });
  }
});

module.exports = router;

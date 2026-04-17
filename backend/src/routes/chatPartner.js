/**
 * 实战聊天路由 - 操盘手帮客户和女生聊天的 AI 军师
 *
 * 核心功能：
 * - 粘贴女生发来的消息
 * - AI 分析意图 + 生成多条回复建议
 * - 操盘手选择建议后，可以直接"发送"到代聊记录
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'yutang-secret-key-2024';

// AI Provider 配置
const AI_PROVIDER = process.env.AI_PROVIDER || 'dashscope';
const DASHSCOPE_API_KEY = process.env.DASH_SCOPE_API_KEY;
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const ZHIPU_API_KEY = process.env.ZHIPUAI_API_KEY || "60bb0c8311af4755ba87b749353354d8.OePtWEfG8VYlmrtf";
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

function getAIConfig() {
  if (AI_PROVIDER === 'dashscope' && DASHSCOPE_API_KEY) {
    return {
      url: DASHSCOPE_API_URL,
      key: DASHSCOPE_API_KEY,
      model: 'qwen3.6-plus-2026-04-02'
    };
  }
  return {
    url: ZHIPU_API_URL,
    key: ZHIPU_API_KEY,
    model: 'glm-4'
  };
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
 * AI 分析 + 建议回复（实战聊天核心 API）
 * POST /api/chat-partner/analyze
 */
router.post('/analyze', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId, message, history = [], context } = req.body;

    if (!message) {
      return res.status(400).json({ error: '消息内容是必需的' });
    }

    // 获取女生信息
    let girlInfo = {};
    if (girlId) {
      const girl = await prisma.girl.findUnique({
        where: { id: girlId }
      });
      if (girl) {
        girlInfo = {
          name: girl.name,
          stage: girl.stage,
          age: girl.age,
          occupation: girl.occupation,
          personality: (() => {
            if (!girl.personality) return {};
            try { return JSON.parse(girl.personality); }
            catch { return { raw: girl.personality }; }
          })(),
          empathy: girl.empathy,
          selfAwareness: girl.selfAwareness,
          communication: girl.communication,
          relationship: girl.relationship,
          conflictRes: girl.conflictRes
        };
      }
    }

    // 构建聊天历史字符串
    const historyString = history.slice(-10).map(m => {
      const role = m.role === 'user' ? '我（客户）' : girlInfo.name || '女生';
      return `${role}: ${m.content}`;
    }).join('\n');

    // 构建女生画像
    let girlPersonaString = '';
    if (girlInfo.name) {
      girlPersonaString = `
【女生信息】
姓名：${girlInfo.name}
年龄：${girlInfo.age || '未知'}
职业：${girlInfo.occupation || '未知'}
当前阶段：${girlInfo.stage || '未知'}
亲密度：${'❤️'.repeat(girlInfo.intimacyLevel || 1)}
性格特点：${JSON.stringify(girlInfo.personality || {})}
情商维度：共情${girlInfo.empathy || '?'}/自省${girlInfo.selfAwareness || '?'}/沟通${girlInfo.communication || '?'}/关系${girlInfo.relationship || '?'}/冲突解决${girlInfo.conflictRes || '?'}
`;
    }

    // 构建提示词
    const prompt = `你是一个专业的恋爱军师/沟通顾问，擅长分析女生聊天对话并提供高情商回复建议。

${girlPersonaString}

【聊天历史】
${historyString || '（暂无历史记录）'}

【上下文备注】
${context || '无'}

对方（女生）刚刚发来消息："${message}"

请你：
1. 分析对方这句话的意图、情绪和潜台词
2. 结合上下文和女生性格，给出 3 条回复建议
3. 每条建议要口语化、15-30字、有明确的意图导向

请按以下 JSON 格式返回：
{
  "analysis": "分析内容（80-150字），包括：意图、情绪、潜台词、建议策略",
  "suggestions": [
    {"text": "回复内容1", "style": "稳妥型", "intention": "维持舒适感"},
    {"text": "回复内容2", "style": "进攻型", "intention": "推进关系"},
    {"text": "回复内容3", "style": "调侃型", "intention": "制造暧昧"}
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
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 1200
      })
    });

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || '';

    // 尝试解析 JSON 响应
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
      analysis: result?.analysis || '分析中...',
      suggestions: result?.suggestions || [
        { text: '嗯嗯，我在呢~', style: '稳妥型', intention: '维持联系' },
        { text: '想我啦？', style: '调侃型', intention: '制造暧昧' },
        { text: '怎么突然找我呀？', style: '进攻型', intention: '试探对方' }
      ]
    });

  } catch (error) {
    console.error('[ChatPartner] 分析失败:', error);
    res.status(500).json({ error: '分析失败' });
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

    // 转换为对话格式
    const history = logs.reverse().map(log => ({
      role: 'user', // 代聊出去的消息视为"我"
      content: log.content,
      timestamp: log.createdAt
    }));

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('[ChatPartner] 获取历史失败:', error);
    res.status(500).json({ error: '获取历史失败' });
  }
});

/**
 * 保存代聊消息
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

    res.json({
      success: true,
      log
    });
  } catch (error) {
    console.error('[ChatPartner] 保存失败:', error);
    res.status(500).json({ error: '保存失败' });
  }
});

module.exports = router;

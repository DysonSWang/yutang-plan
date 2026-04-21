/**
 * Learning Service - 经验学习管理
 * 支持语义检索和自动提取
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { getAIConfig } = require('../config');

/**
 * 搜索历史经验
 */
async function searchLearnings(clientId, query, girlId = null, limit = 5) {
  const where = {
    clientId,
    OR: [
      { content: { contains: query } },
      { scene: { contains: query } },
      { type: { contains: query } }
    ]
  };

  if (girlId) {
    where.girlId = girlId;
  }

  const learnings = await prisma.clientLearning.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  return {
    count: learnings.length,
    learnings: learnings.map(l => ({
      id: l.id,
      type: l.type,
      scene: l.scene,
      content: l.content,
      girlId: l.girlId,
      createdAt: l.createdAt
    }))
  };
}

/**
 * 获取所有经验（按类型分组）
 */
async function getAllLearnings(clientId, girlId = null) {
  const where = { clientId };
  if (girlId) {
    where.girlId = girlId;
  }

  const learnings = await prisma.clientLearning.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  return learnings;
}

/**
 * 从对话中提取经验教训
 */
async function extractLearningsFromConversation(clientId, conversationText, girlId = null) {
  const prompt = `你是童锦程，情感咨询领域的老中医，擅长从实战对话中提炼可复用的经验。

从以下对话中提取有价值的经验教训，每个经验要能从这段对话中学到真实可操作的东西，不是泛泛的道理。

【对话内容】
${conversationText}

经验类型定义：
- **技巧**：具体的操作方法、话术、时机判断、互动技巧（如"女生发照片时不要只夸，要互动问问题"）
- **心态**：认知调整、心理建设、情绪管理（如"进度不顺时不要追，等她主动"）
- **案例**：可参考的完整互动模式、成功或失败的正反案例

提取标准：
1. 要有具体场景，不能是放之四海皆准的废话
2. 要有可操作性，不能只是"要真诚"这种空话
3. 要么是别人没做好的教训，要么是别人做对了值得学习的技巧
4. 每个经验不超过50字，内容要精准

只提取最重要的2-3条，不要堆砌。

输出 JSON 数组格式：
[
  {"type": "技巧|心态|案例", "scene": "场景描述（10字内）", "content": "具体学习内容（50字内）"}
]

只输出 JSON，不要其他内容。`;

  const aiConfig = getAIConfig();

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
        temperature: 0.5,
        max_tokens: 500
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    let learnings = [];
    try {
      learnings = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      if (!Array.isArray(learnings)) learnings = [];
    } catch {
      learnings = [];
    }

    // 保存到数据库
    const saved = [];
    for (const learning of learnings) {
      if (learning.type && learning.content) {
        const record = await prisma.clientLearning.create({
          data: {
            clientId,
            girlId: girlId || null,
            type: learning.type,
            scene: learning.scene || '',
            content: learning.content
          }
        });
        saved.push(record);
      }
    }

    console.log(`[Learning] Extracted ${saved.length} learnings from conversation`);
    return saved;
  } catch (error) {
    console.error('[Learning] Extract failed:', error);
    return [];
  }
}

/**
 * 格式化经验为文本（用于注入到prompt）
 */
function formatLearningsForPrompt(learnings) {
  if (!learnings || learnings.length === 0) {
    return '暂无相关经验';
  }

  return learnings.map(l =>
    `[${l.type}] ${l.scene}: ${l.content}`
  ).join('\n');
}

module.exports = {
  searchLearnings,
  getAllLearnings,
  extractLearningsFromConversation,
  formatLearningsForPrompt
};

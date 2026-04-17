/**
 * Memory Service - 多轮对话记忆管理
 * 使用 ConversationMemory 表存储对话历史
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MAX_MESSAGES_BEFORE_SUMMARIZE = 10;
const MAX_STORED_MESSAGES = 20;

/**
 * 创建或获取会话记忆
 */
async function getOrCreateMemory(clientId, coachId, girlId = null) {
  let memory = await prisma.conversationMemory.findFirst({
    where: {
      clientId,
      coachId,
      girlId: girlId || null,
      summary: null  // 没有摘要的才是活跃会话
    },
    orderBy: { updatedAt: 'desc' }
  });

  if (!memory) {
    memory = await prisma.conversationMemory.create({
      data: {
        clientId,
        coachId,
        girlId: girlId || null,
        messages: '[]',
        summary: null,
        signals: null,
        stageChanged: false
      }
    });
    console.log(`[Memory] Created new session: ${memory.id}`);
  }

  return memory;
}

/**
 * 添加消息到会话记忆
 */
async function addMessage(memoryId, role, content) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });

  if (!memory) return null;

  let messages = [];
  try {
    messages = JSON.parse(memory.messages || '[]');
  } catch {}

  messages.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });

  // 超过最大消息数时截断
  if (messages.length > MAX_STORED_MESSAGES) {
    messages = messages.slice(-MAX_STORED_MESSAGES);
  }

  await prisma.conversationMemory.update({
    where: { id: memoryId },
    data: { messages: JSON.stringify(messages) }
  });

  return messages.length;
}

/**
 * 检查是否需要摘要
 */
async function shouldSummarize(memoryId) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });

  if (!memory || memory.summary) return false;

  let messages = [];
  try {
    messages = JSON.parse(memory.messages || '[]');
  } catch {}

  return messages.length >= MAX_MESSAGES_BEFORE_SUMMARIZE;
}

/**
 * 生成对话摘要
 */
async function summarizeMemory(memoryId, aiSummary) {
  await prisma.conversationMemory.update({
    where: { id: memoryId },
    data: { summary: aiSummary }
  });
  console.log(`[Memory] Summarized session ${memoryId}`);
}

/**
 * 获取对话历史（摘要 + 最近消息）
 */
async function getConversationHistory(memoryId) {
  const memory = await prisma.conversationMemory.findUnique({
    where: { id: memoryId }
  });

  if (!memory) return [];

  let messages = [];
  try {
    messages = JSON.parse(memory.messages || '[]');
  } catch {}

  if (memory.summary) {
    // 有摘要时，只返回最近5条 + 摘要
    const recent = messages.slice(-5);
    return [
      { role: 'system', content: `[对话摘要] ${memory.summary}` },
      ...recent
    ];
  }

  // 没有摘要时，返回所有消息
  return messages;
}

/**
 * 获取或创建会话并返回对话历史
 */
async function getOrCreateSession(clientId, coachId, girlId = null) {
  const memory = await getOrCreateMemory(clientId, coachId, girlId);
  const history = await getConversationHistory(memory.id);

  return { memory, history };
}

/**
 * 结束会话（生成摘要）
 */
async function endSession(memoryId, summary) {
  await summarizeMemory(memoryId, summary);
}

module.exports = {
  getOrCreateMemory,
  addMessage,
  shouldSummarize,
  summarizeMemory,
  getConversationHistory,
  getOrCreateSession,
  endSession
};

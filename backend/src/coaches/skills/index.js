/**
 * Tool Registry - 工具注册表
 * 定义所有可用的工具及其处理函数
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const tools = {};

// ============ Tool Definitions (for AI) ============

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_girl_context',
      description: '获取女生的完整上下文信息，包括档案、信号、待推进事项等',
      parameters: {
        type: 'object',
        properties: {
          girlId: { type: 'string', description: '女生ID' }
        },
        required: ['girlId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_tension',
      description: '调整女生的热度评分',
      parameters: {
        type: 'object',
        properties: {
          girlId: { type: 'string', description: '女生ID' },
          adjustment: { type: 'number', description: '调整值 (-2 到 +2)' },
          reason: { type: 'string', description: '调整原因' }
        },
        required: ['girlId', 'adjustment', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_signal',
      description: '为女生添加一个新的信号记录',
      parameters: {
        type: 'object',
        properties: {
          girlId: { type: 'string', description: '女生ID' },
          type: { type: 'string', enum: ['positive', 'negative', 'neutral'], description: '信号类型' },
          event: { type: 'string', description: '事件描述' }
        },
        required: ['girlId', 'type', 'event']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'record_learning',
      description: '记录一条经验教训到学习库',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: '客户ID' },
          girlId: { type: 'string', description: '女生ID（可选）' },
          type: { type: 'string', description: '类型：技巧/心态/案例' },
          scene: { type: 'string', description: '场景描述' },
          content: { type: 'string', description: '具体学习内容' }
        },
        required: ['clientId', 'type', 'scene', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_history',
      description: '搜索历史经验记录',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: '客户ID' },
          query: { type: 'string', description: '搜索关键词' },
          limit: { type: 'number', description: '返回数量（默认5）' }
        },
        required: ['clientId', 'query']
      }
    }
  }
];

// ============ Tool Handlers ============

// get_girl_context
async function getGirlContext({ girlId }) {
  try {
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return { error: '女生不存在' };
    }

    let signals = [];
    let pendingActions = [];
    let observations = [];

    try { signals = JSON.parse(girl.signals || '[]'); } catch {}
    try { pendingActions = JSON.parse(girl.pendingActions || '[]'); } catch {}
    try { observations = JSON.parse(girl.observations || '[]'); } catch {}

    let personality = {};
    try { personality = JSON.parse(girl.personality || '{}'); } catch {}

    return {
      name: girl.name,
      stage: girl.stage,
      tensionScore: girl.tensionScore,
      intimacyLevel: girl.intimacyLevel,
      personality,
      signals: signals.slice(-10),
      pendingActions,
      observations,
      notes: girl.notes
    };
  } catch (error) {
    console.error('[Tools] get_girl_context error:', error);
    return { error: '获取女生上下文失败' };
  }
}
tools.get_girl_context = getGirlContext;

// update_tension
async function updateTension({ girlId, adjustment, reason }) {
  try {
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return { error: '女生不存在' };
    }

    const newScore = Math.max(1, Math.min(10, (girl.tensionScore || 5) + adjustment));

    await prisma.girl.update({
      where: { id: girlId },
      data: { tensionScore: newScore }
    });

    console.log(`[Tools] tension updated: ${girl.name} ${girl.tensionScore} -> ${newScore} (${reason})`);

    return {
      success: true,
      girlId,
      oldScore: girl.tensionScore,
      newScore,
      reason
    };
  } catch (error) {
    console.error('[Tools] update_tension error:', error);
    return { error: '更新热度失败' };
  }
}
tools.update_tension = updateTension;

// add_signal
async function addSignal({ girlId, type, event }) {
  try {
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return { error: '女生不存在' };
    }

    let signals = [];
    try { signals = JSON.parse(girl.signals || '[]'); } catch {}

    signals.push({
      date: new Date().toLocaleDateString('zh-CN'),
      type,
      event
    });

    // 保留最近30天
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    signals = signals.filter(s => new Date(s.date) >= thirtyDaysAgo);

    await prisma.girl.update({
      where: { id: girlId },
      data: { signals: JSON.stringify(signals) }
    });

    console.log(`[Tools] signal added: ${girl.name} [${type}] ${event}`);

    return { success: true, signalCount: signals.length };
  } catch (error) {
    console.error('[Tools] add_signal error:', error);
    return { error: '添加信号失败' };
  }
}
tools.add_signal = addSignal;

// record_learning
async function recordLearning({ clientId, girlId, type, scene, content }) {
  try {
    const learning = await prisma.clientLearning.create({
      data: {
        clientId,
        girlId: girlId || null,
        type,
        scene,
        content
      }
    });

    console.log(`[Tools] learning recorded: ${type} - ${scene}`);

    return { success: true, id: learning.id };
  } catch (error) {
    console.error('[Tools] record_learning error:', error);
    return { error: '记录经验失败' };
  }
}
tools.record_learning = recordLearning;

// search_history
async function searchHistory({ clientId, query, limit = 5 }) {
  try {
    const learnings = await prisma.clientLearning.findMany({
      where: {
        clientId,
        OR: [
          { content: { contains: query } },
          { scene: { contains: query } },
          { type: { contains: query } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return {
      count: learnings.length,
      learnings: learnings.map(l => ({
        type: l.type,
        scene: l.scene,
        content: l.content,
        createdAt: l.createdAt
      }))
    };
  } catch (error) {
    console.error('[Tools] search_history error:', error);
    return { error: '搜索历史失败', learnings: [] };
  }
}
tools.search_history = searchHistory;

// ============ Tool Executor ============

async function executeTool(toolName, arguments_) {
  const handler = tools[toolName];
  if (!handler) {
    return { error: `未知工具: ${toolName}` };
  }

  try {
    const args = typeof arguments_ === 'string' ? JSON.parse(arguments_) : arguments_;
    console.log(`[Tools] executing ${toolName}:`, JSON.stringify(args).substring(0, 100));
    const result = await handler(args);
    console.log(`[Tools] ${toolName} result:`, JSON.stringify(result).substring(0, 100));
    return result;
  } catch (error) {
    console.error(`[Tools] ${toolName} error:`, error);
    return { error: `工具执行失败: ${error.message}` };
  }
}

module.exports = {
  tools,
  toolDefinitions,
  executeTool
};

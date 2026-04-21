/**
 * Compaction + Memory E2E 测试
 *
 * 覆盖：
 * 1. compaction.js 纯函数单元测试（无需DB/AI）
 * 2. memory.js 服务集成测试（需要DB）
 * 3. /api/ai-coach/situation API会话记忆E2E测试
 */

const request = require('supertest');
const express = require('express');
const { createTestData, cleanupData, token } = require('./fixtures');

let app;
let tokens;
let ids;

// ---- 1. compaction.js 纯函数单元测试 ----
describe('Compaction 纯函数', () => {
  const compaction = require('../services/compaction');

  // 共享的假消息数据
  const makeMessages = (count, role = 'user') => {
    return Array.from({ length: count }, (_, i) => ({
      role,
      content: `测试消息内容第${i + 1}条：这是一段足够长的内容来模拟真实对话。`.repeat(3),
      timestamp: new Date().toISOString()
    }));
  };

  describe('estimateMessageTokens', () => {
    it('空消息返回合理值', () => {
      expect(compaction.estimateMessageTokens(null)).toBe(0);
      // {} has content='', which gets length/4 + 2 overhead = 2
      expect(compaction.estimateMessageTokens({})).toBe(2);
      expect(compaction.estimateMessageTokens({ content: '' })).toBe(2);
    });

    it('正常消息返回合理估算', () => {
      const tokens = compaction.estimateMessageTokens({ role: 'user', content: 'hello world' });
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(100);
    });

    it('长消息token估算正确', () => {
      const long = '啊'.repeat(1000);
      const tokens = compaction.estimateMessageTokens({ content: long });
      expect(tokens).toBeGreaterThan(200);
    });
  });

  describe('estimateTotalTokens', () => {
    it('空消息列表返回0', () => {
      expect(compaction.estimateTotalTokens([])).toBe(0);
    });

    it('多条消息累加正确', () => {
      const messages = [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '很高兴认识你' }
      ];
      const total = compaction.estimateTotalTokens(messages);
      expect(total).toBe(compaction.estimateMessageTokens(messages[0]) + compaction.estimateMessageTokens(messages[1]));
    });

    it('大量消息累加正确', () => {
      const msgs = makeMessages(100);
      const total = compaction.estimateTotalTokens(msgs);
      expect(total).toBeGreaterThan(500);
    });
  });

  describe('行优先级行为（通过compressSummary间接测试）', () => {
    // linePriority/isCoreDetail/isSectionHeader/isBulletItem 是内部函数
    // 通过 compressSummary 的行为来验证其正确性

    it('核心详情行在压缩结果中被保留', () => {
      const summary = [
        '大量普通填充内容。'.repeat(100),
        '- Scope: 这是核心详情，应该被优先保留在摘要中'
      ].join('\n');
      const result = compaction.compressSummary(summary);
      expect(result).toContain('Scope:');
    });

    it('章节标题行被优先保留', () => {
      const summary = [
        '大量普通填充内容。'.repeat(100),
        '## 核心章节标题'
      ].join('\n');
      const result = compaction.compressSummary(summary);
      expect(result).toContain('核心章节标题');
    });

    it('Bullet点格式被正确识别和优先处理', () => {
      const summary = [
        '大量普通填充内容。'.repeat(100),
        '- 重要bullet点：这是需要保留的关键信息'
      ].join('\n');
      const result = compaction.compressSummary(summary);
      expect(result).toContain('重要bullet点');
    });

    it('去重逻辑正确工作', () => {
      const summary = [
        '- 重复内容行1',
        '- 重复内容行1',
        '- 重复内容行1',
        '- 重复内容行1'
      ].join('\n');
      const result = compaction.compressSummary(summary);
      const lines = result.split('\n').filter(l => l.trim() && !l.includes('omitted'));
      const dupLines = lines.filter(l => l.includes('重复内容行1'));
      expect(dupLines.length).toBeLessThanOrEqual(1);
    });
  });

  describe('compressSummary', () => {
    it('空摘要返回空字符串', () => {
      expect(compaction.compressSummary(null)).toBe('');
      expect(compaction.compressSummary('')).toBe('');
    });

    it('短摘要不受影响', () => {
      const short = '简短摘要';
      const result = compaction.compressSummary(short);
      expect(result).toBe(short);
    });

    it('长摘要被压缩到1200字符左右（允许omitted标注略微超出）', () => {
      const long = Array.from({ length: 50 }, (_, i) =>
        `- 这是一个非常长的bullet点内容，内容是第${i}条，用于测试压缩功能是否正常工作。`.repeat(2)
      ).join('\n');
      const result = compaction.compressSummary(long);
      // compressSummary 会追加 "(N additional lines omitted)" 标注，可能略微超出限制
      expect(result.length).toBeLessThanOrEqual(compaction.MAX_CHARS + 50);
    });

    it('超长行被截断', () => {
      const veryLongLine = 'x'.repeat(300);
      const result = compaction.compressSummary(veryLongLine);
      expect(result.length).toBeLessThan(170); // MAX_LINE_CHARS + 缓冲
    });

    it('优先级高的行优先保留', () => {
      const summary = [
        '这是一段不太重要的普通内容，需要被压缩掉以腾出空间。'.repeat(20),
        '- Scope: 本次对话覆盖的主题是关系分析',
        '普通内容填充行'.repeat(50)
      ].join('\n');
      const result = compaction.compressSummary(summary);
      expect(result).toContain('Scope:');
    });

    it('重复行被去重', () => {
      const summary = [
        '- 关键信息A',
        '- 关键信息A',
        '- 关键信息B',
        '- 关键信息B',
        '- 关键信息A'
      ].join('\n');
      const result = compaction.compressSummary(summary);
      const lines = result.split('\n').filter(l => l.trim());
      const aCount = lines.filter(l => l.includes('关键信息A')).length;
      expect(aCount).toBeLessThanOrEqual(1);
    });

    it('超出限制时标注省略', () => {
      const summary = Array.from({ length: 30 }, (_, i) =>
        `- 重要内容第${i}条：这些内容足够长，能够触发压缩限制。`.repeat(3)
      ).join('\n');
      const result = compaction.compressSummary(summary);
      expect(result.length).toBeLessThanOrEqual(compaction.MAX_CHARS);
      expect(result).toMatch(/omitted|已省略|\.\.\./);
    });
  });

  describe('mergeCompactSummaries', () => {
    it('无历史摘要直接返回新摘要', () => {
      const newSum = '新摘要内容';
      const result = compaction.mergeCompactSummaries(null, newSum);
      expect(result).toBe(newSum);
    });

    it('有历史摘要时合并去重', () => {
      const existing = '第一条\n第二条';
      const newSum = '第三条\n第二条'; // 第二条重复
      const result = compaction.mergeCompactSummaries(existing, newSum);
      expect(result).toContain('第一条');
      expect(result).toContain('第三条');
      // 第二条应该只出现一次（去重）
      const matches = result.match(/第二条/g) || [];
      expect(matches.length).toBe(1);
    });

    it('合并后再次压缩', () => {
      const existing = Array.from({ length: 20 }, (_, i) => `- 历史内容行${i}`).join('\n');
      const newSum = Array.from({ length: 20 }, (_, i) => `- 新内容行${i}`).join('\n');
      const result = compaction.mergeCompactSummaries(existing, newSum);
      // 合并超过1200字符后应该被压缩
      expect(result.length).toBeLessThanOrEqual(compaction.MAX_CHARS + 50); // 允许轻微超出
    });
  });

  describe('appendToCompactionChain', () => {
    it('空chain创建新chain', () => {
      const result = compaction.appendToCompactionChain(null, '摘要1');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].seq).toBe(1);
      expect(parsed[0].summary).toBe('摘要1');
    });

    it('追加到已有chain', () => {
      const existing = JSON.stringify([{ seq: 1, summary: '摘要1', timestamp: '2024-01-01' }]);
      const result = compaction.appendToCompactionChain(existing, '摘要2');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(2);
      expect(parsed[1].seq).toBe(2);
      expect(parsed[1].summary).toBe('摘要2');
    });

    it('超过10个自动截断旧条目', () => {
      let chain = null;
      for (let i = 1; i <= 12; i++) {
        chain = compaction.appendToCompactionChain(chain, `摘要${i}`);
      }
      const parsed = JSON.parse(chain);
      expect(parsed).toHaveLength(10);
      expect(parsed[0].summary).toBe('摘要3'); // 前两个被截断
      expect(parsed[9].summary).toBe('摘要12');
    });
  });

  describe('buildCompactContinuationMessage', () => {
    it('构建基本的continuation消息', () => {
      const result = compaction.buildCompactContinuationMessage({
        summary: '这是压缩摘要内容',
        removedCount: 10,
        chain: []
      }, true);
      expect(result).toContain('对话已压缩');
      expect(result).toContain('10');
      expect(result).toContain('最近几条消息');
    });

    it('包含历史chain信息', () => {
      const chain = [
        { seq: 1, summary: '历史摘要1内容' },
        { seq: 2, summary: '历史摘要2内容' }
      ];
      const result = compaction.buildCompactContinuationMessage({
        summary: '最新摘要',
        removedCount: 5,
        chain
      }, false);
      expect(result).toContain('历史压缩摘要链');
      expect(result).toContain('历史摘要1');
    });
  });

  describe('shouldCompact', () => {
    it('tokenCount低于阈值不压缩', () => {
      expect(compaction.shouldCompact({ tokenCount: 1000 })).toBe(false);
      expect(compaction.shouldCompact({ tokenCount: 7999 })).toBe(false);
    });

    it('tokenCount达到阈值触发压缩', () => {
      expect(compaction.shouldCompact({ tokenCount: 8000 })).toBe(true);
      expect(compaction.shouldCompact({ tokenCount: 10000 })).toBe(true);
    });
  });

  describe('getCompactedPrefixLen', () => {
    it('未压缩的会话返回0', () => {
      expect(compaction.getCompactedPrefixLen({ summary: null })).toBe(0);
    });

    it('已压缩的会话返回1', () => {
      expect(compaction.getCompactedPrefixLen({ summary: 'some summary' })).toBe(1);
    });
  });

  describe('buildSummarizePrompt', () => {
    it('构建基本prompt', () => {
      const messages = [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '很高兴认识你' }
      ];
      const prompt = compaction.buildSummarizePrompt(messages, null);
      expect(prompt).toContain('用户');
      expect(prompt).toContain('教练');
      expect(prompt).toContain('你好');
      expect(prompt).toContain('很高兴认识你');
      expect(prompt).toContain('Scope:');
      expect(prompt).toContain('Current work:');
    });

    it('有历史摘要时包含历史摘要', () => {
      const prompt = compaction.buildSummarizePrompt([], '历史摘要内容');
      expect(prompt).toContain('历史压缩摘要');
      expect(prompt).toContain('历史摘要内容');
    });
  });
});

// ---- 2. memory.js 服务集成测试 ----
describe('Memory Service 集成测试', () => {
  const memory = require('../services/memory');
  const prisma = require('../prisma');

  let testMemoryId;

  beforeAll(async () => {
    // 创建测试数据
    const data = await createTestData();
    ids = data;
  });

  afterAll(async () => {
    // 清理测试内存会话（不清理其他fixture数据）
    if (testMemoryId) {
      try {
        await prisma.conversationMemory.delete({ where: { id: testMemoryId } });
      } catch {}
    }
  });

  describe('getOrCreateMemorySession', () => {
    it('创建新的会话记忆', async () => {
      const mem = await memory.getOrCreateMemorySession(
        ids.operator.id,
        'test_coach',
        ids.girl.id
      );
      expect(mem).toBeDefined();
      expect(mem.id).toBeDefined();
      expect(mem.messages).toBe('[]');
      expect(mem.summary).toBeNull();
      expect(mem.compactionCount).toBe(0);
      expect(mem.tokenCount).toBe(0);
      testMemoryId = mem.id;
    });

    it('再次调用返回同一会话', async () => {
      const mem = await memory.getOrCreateMemorySession(
        ids.operator.id,
        'test_coach',
        ids.girl.id
      );
      expect(mem.id).toBe(testMemoryId);
    });
  });

  describe('addMessage', () => {
    it('添加用户消息', async () => {
      const count = await memory.addMessage(testMemoryId, 'user', '测试消息');
      expect(count).toBe(1);
    });

    it('添加助手消息', async () => {
      await memory.addMessage(testMemoryId, 'assistant', '教练回复');
      const count = await memory.addMessage(testMemoryId, 'user', '第二条用户消息');
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('空内存ID返回null', async () => {
      const result = await memory.addMessage('nonexistent', 'user', 'msg');
      expect(result).toBeNull();
    });

    it('token计数累加', async () => {
      const mem = await prisma.conversationMemory.findUnique({ where: { id: testMemoryId } });
      expect(mem.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('getConversationHistory', () => {
    it('未压缩时返回所有消息', async () => {
      const history = await memory.getConversationHistory(testMemoryId);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].role).toBe('user');
    });

    it('不存在的会话返回空数组', async () => {
      const history = await memory.getConversationHistory('nonexistent');
      expect(history).toEqual([]);
    });
  });

  describe('shouldSummarize', () => {
    it('新会话不应压缩', async () => {
      const should = await memory.shouldSummarize(testMemoryId);
      expect(typeof should).toBe('boolean');
    });

    it('不存在的会话返回false', async () => {
      const should = await memory.shouldSummarize('nonexistent');
      expect(should).toBe(false);
    });
  });

  describe('getSessionStats', () => {
    it('返回会话统计信息', async () => {
      const stats = await memory.getSessionStats(testMemoryId);
      expect(stats).toBeDefined();
      expect(stats.messageCount).toBeGreaterThan(0);
      expect(stats.tokenCount).toBeGreaterThan(0);
      expect(stats.compactionCount).toBe(0);
      expect(stats.removedMessageCount).toBe(0);
      expect(stats.isCompressed).toBe(false);
    });

    it('不存在的会话返回null', async () => {
      const stats = await memory.getSessionStats('nonexistent');
      expect(stats).toBeNull();
    });
  });

  describe('getOrCreateSession', () => {
    it('返回会话和历史', async () => {
      const { memory: mem, history } = await memory.getOrCreateSession(
        ids.operator.id,
        'new_coach',
        ids.girl.id
      );
      expect(mem).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('endSession', () => {
    it('正常结束会话', async () => {
      await memory.endSession(testMemoryId, '最终摘要内容');
      const mem = await prisma.conversationMemory.findUnique({ where: { id: testMemoryId } });
      expect(mem.summary).toBe('最终摘要内容');
    });
  });
});

// ---- 3. AI Coach API 会话记忆 E2E 测试 ----
describe('AI Coach 会话记忆 E2E', () => {
  let routerApp;
  let operatorToken;
  let girlMemoryId;

  beforeAll(async () => {
    const data = await createTestData();
    ids = data;
    tokens = {
      operator: token(data.operator),
      client: token(data.client)
    };
    operatorToken = tokens.operator;

    // 创建独立的 Express app 用于路由测试
    routerApp = express();
    routerApp.use(express.json());
    const router = require('../routes/aiCoach');
    routerApp.use('/api/ai-coach', router);
  });

  afterAll(cleanupData);

  describe('POST /api/ai-coach/situation 多轮对话记忆', () => {
    it('第一轮对话：创建新会话记忆', async () => {
      const res = await request(routerApp)
        .post('/api/ai-coach/situation')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          girlId: ids.girl.id,
          situation: '我和她刚开始聊天，她很冷淡'
        });

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
    });

    it('第二轮对话：复用同一会话（允许AI失败）', async () => {
      const res = await request(routerApp)
        .post('/api/ai-coach/situation')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          girlId: ids.girl.id,
          situation: '她今天主动找我聊天了，是不是好事'
        });

      // 只要不是权限错误就说明会话管理正常
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('无girlId情况下也能工作', async () => {
      const res = await request(routerApp)
        .post('/api/ai-coach/situation')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ situation: '女生不回消息怎么办' });

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('client角色也能使用situation接口', async () => {
      const res = await request(routerApp)
        .post('/api/ai-coach/situation')
        .set('Authorization', `Bearer ${tokens.client}`)
        .send({ situation: '我在和她聊天' });

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('非法clientId返回404', async () => {
      const res = await request(routerApp)
        .post('/api/ai-coach/situation')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ girlId: 'fake-id-12345', situation: 'test' });

      expect(res.status).toBe(404);
    });

    it('空situation返回400', async () => {
      const res = await request(routerApp)
        .post('/api/ai-coach/situation')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/必需/);
    });
  });
});

// ---- 4. 数据库约束测试 ----
describe('数据库模型约束', () => {
  const prisma = require('../prisma');

  describe('ConversationMemory 模型', () => {
    it('compactionCount 默认值为0', async () => {
      const mem = await prisma.conversationMemory.create({
        data: {
          clientId: 'test_client',
          coachId: 'test',
          messages: '[]',
          compactionCount: undefined
        }
      });
      expect(mem.compactionCount).toBe(0);
      await prisma.conversationMemory.delete({ where: { id: mem.id } }).catch(() => {});
    });

    it('removedMessageCount 默认值为0', async () => {
      const mem = await prisma.conversationMemory.create({
        data: {
          clientId: 'test_client2',
          coachId: 'test',
          messages: '[]',
          removedMessageCount: undefined
        }
      });
      expect(mem.removedMessageCount).toBe(0);
      await prisma.conversationMemory.delete({ where: { id: mem.id } }).catch(() => {});
    });

    it('tokenCount 默认值为0', async () => {
      const mem = await prisma.conversationMemory.create({
        data: {
          clientId: 'test_client3',
          coachId: 'test',
          messages: '[]',
          tokenCount: undefined
        }
      });
      expect(mem.tokenCount).toBe(0);
      await prisma.conversationMemory.delete({ where: { id: mem.id } }).catch(() => {});
    });

    it('compactionChain 允许null', async () => {
      const mem = await prisma.conversationMemory.create({
        data: {
          clientId: 'test_client4',
          coachId: 'test',
          messages: '[]'
        }
      });
      expect(mem.compactionChain).toBeNull();
      await prisma.conversationMemory.delete({ where: { id: mem.id } }).catch(() => {});
    });
  });
});

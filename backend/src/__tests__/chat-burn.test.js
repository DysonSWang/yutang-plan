/**
 * 阅后即焚功能 TDD HTTP 测试
 *
 * TDD 周期:
 *   RED  → 写测试，定义期望行为，测试 FAIL（功能不存在）
 *   GREEN → 实现功能，测试 PASS
 *
 * 测试 HTTP 路由层，使用 supertest + mock Socket.IO
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:../data/database.db' } }
});

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
let app;
let operatorToken;
let clientToken;
let operatorId;
let clientId;
let sessionId;

// Mock Socket.IO
const mockIo = {
  to: () => ({
    emit: () => {}
  })
};

beforeAll(async () => {
  // 找到已有的 operator 和 client 用户
  const operator = await prisma.user.findFirst({ where: { role: 'operator' } });
  const client = await prisma.user.findFirst({ where: { role: 'client' } });

  if (!operator || !client) {
    throw new Error('测试需要至少一个 operator 和一个 client 用户');
  }

  operatorId = operator.id;
  clientId = client.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);

  // 创建或复用测试会话
  const existing = await prisma.chatSession.findUnique({
    where: { operatorId_clientId: { operatorId, clientId } }
  });
  sessionId = existing?.id || (await prisma.chatSession.create({
    data: { operatorId, clientId }
  })).id;

  // 动态导入 chat 路由（每次测试前清空测试数据）
  const chatRouter = require('../routes/chat')(mockIo);

  // 创建测试 Express app
  app = express();
  app.use(express.json());
  app.use('/api/chat', chatRouter);
});

afterAll(async () => {
  // 清理测试消息
  const testContent = ['阅后即焚', '待销毁', '待撤回', '已被撤回', '私密内容', '普通消息', '倒计时字段验证'];
  for (const content of testContent) {
    await prisma.message.deleteMany({
      where: {
        sessionId,
        content: { contains: content }
      }
    });
  }
  await prisma.$disconnect();
});

// ========== 阅后即焚功能测试 ==========

describe('阅后即焚功能测试', () => {

  describe('TDD-1: 发送阅后即焚消息', () => {
    it('应该能发送 isBurnAfterRead=true 的消息', async () => {
      const res = await request(app)
        .post('/api/chat/messages')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          sessionId,
          content: '这是一条阅后即焚消息',
          isBurnAfterRead: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message.isBurnAfterRead).toBe(true);
      expect(res.body.message.content).toBe('这是一条阅后即焚消息');
    });

    it('阅后即焚消息的 burnedAt 初始应为 null', async () => {
      const res = await request(app)
        .post('/api/chat/messages')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          sessionId,
          content: '另一条阅后即焚消息',
          isBurnAfterRead: true
        });

      expect(res.body.message.burnedAt).toBeNull();
      expect(res.body.message.recalledAt).toBeNull();
    });

    it('普通消息的 isBurnAfterRead 默认为 false', async () => {
      const res = await request(app)
        .post('/api/chat/messages')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          sessionId,
          content: '普通消息'
        });

      expect(res.body.message.isBurnAfterRead).toBe(false);
    });
  });

  describe('TDD-2: 销毁阅后即焚消息 (burn)', () => {
    let burnMessageId;

    beforeEach(async () => {
      const msg = await prisma.message.create({
        data: {
          sessionId,
          senderRole: 'operator',
          senderId: operatorId,
          content: '待销毁消息-' + Date.now(),
          isBurnAfterRead: true
        }
      });
      burnMessageId = msg.id;
    });

    it('接收方(client)调用 burn 接口应该成功', async () => {
      const res = await request(app)
        .post(`/api/chat/messages/${burnMessageId}/burn`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('burn 后内容应变为 [消息已销毁]', async () => {
      const res = await request(app)
        .post(`/api/chat/messages/${burnMessageId}/burn`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.body.message.content).toBe('[消息已销毁]');
    });

    it('burn 后 mediaUrl 应为 null', async () => {
      const msgWithMedia = await prisma.message.create({
        data: {
          sessionId,
          senderRole: 'operator',
          senderId: operatorId,
          content: '带图片',
          type: 'image',
          mediaUrl: '/uploads/test.jpg',
          isBurnAfterRead: true
        }
      });

      const res = await request(app)
        .post(`/api/chat/messages/${msgWithMedia.id}/burn`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.body.message.mediaUrl).toBeNull();
    });

    it('burn 后 burnedAt 应有时间戳', async () => {
      const res = await request(app)
        .post(`/api/chat/messages/${burnMessageId}/burn`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.body.message.burnedAt).not.toBeNull();
    });

    it('burn 不存在消息应返回 404', async () => {
      const res = await request(app)
        .post('/api/chat/messages/nonexistent-id-burn-test/burn')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('TDD-3: 撤回自己的消息 (recall)', () => {
    let recallMessageId;

    beforeEach(async () => {
      const msg = await prisma.message.create({
        data: {
          sessionId,
          senderRole: 'client',
          senderId: clientId,
          content: '待撤回消息-' + Date.now()
        }
      });
      recallMessageId = msg.id;
    });

    it('发送方调用 recall 接口应该成功', async () => {
      const res = await request(app)
        .post(`/api/chat/messages/${recallMessageId}/recall`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('recall 后内容应变为 [消息已撤回]', async () => {
      const res = await request(app)
        .post(`/api/chat/messages/${recallMessageId}/recall`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.body.message.content).toBe('[消息已撤回]');
    });

    it('recall 后 mediaUrl 应为 null', async () => {
      const msgWithMedia = await prisma.message.create({
        data: {
          sessionId,
          senderRole: 'client',
          senderId: clientId,
          content: '带图撤回-' + Date.now(),
          type: 'image',
          mediaUrl: '/uploads/test.jpg'
        }
      });

      const res = await request(app)
        .post(`/api/chat/messages/${msgWithMedia.id}/recall`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.body.message.mediaUrl).toBeNull();
    });

    it('recall 后 recalledAt 应有时间戳', async () => {
      const res = await request(app)
        .post(`/api/chat/messages/${recallMessageId}/recall`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.body.message.recalledAt).not.toBeNull();
    });

    it('不能撤回他人的消息', async () => {
      const msg = await prisma.message.create({
        data: {
          sessionId,
          senderRole: 'operator',
          senderId: operatorId,
          content: '别人发的消息-' + Date.now()
        }
      });

      const res = await request(app)
        .post(`/api/chat/messages/${msg.id}/recall`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('不能重复撤回消息', async () => {
      await request(app)
        .post(`/api/chat/messages/${recallMessageId}/recall`)
        .set('Authorization', `Bearer ${clientToken}`);

      const res = await request(app)
        .post(`/api/chat/messages/${recallMessageId}/recall`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('消息已被撤回');
    });
  });

  describe('TDD-4: 消息历史包含销毁/撤回字段', () => {
    it('消息历史应返回 burnedAt/recalledAt/isBurnAfterRead 字段', async () => {
      const res = await request(app)
        .get(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.messages)).toBe(true);

      for (const msg of res.body.messages) {
        expect(msg).toHaveProperty('burnedAt');
        expect(msg).toHaveProperty('recalledAt');
        expect(msg).toHaveProperty('isBurnAfterRead');
      }
    });
  });

  describe('TDD-5: 阅后即焚内容可见性', () => {

    it('阅后即焚消息被销毁前内容可读', async () => {
      const uniqueContent = '私密内容-' + Date.now();
      const msg = await prisma.message.create({
        data: {
          sessionId,
          senderRole: 'operator',
          senderId: operatorId,
          content: uniqueContent,
          isBurnAfterRead: true
        }
      });

      const res = await request(app)
        .get(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${clientToken}`);

      const fetchedMsg = res.body.messages.find(m => m.id === msg.id);
      expect(fetchedMsg.content).toBe(uniqueContent);
      expect(fetchedMsg.burnedAt).toBeNull();
    });

    it('阅后即焚消息被销毁后内容不可读', async () => {
      const uniqueContent = '私密内容2-' + Date.now();
      const msg = await prisma.message.create({
        data: {
          sessionId,
          senderRole: 'operator',
          senderId: operatorId,
          content: uniqueContent,
          isBurnAfterRead: true
        }
      });

      await request(app)
        .post(`/api/chat/messages/${msg.id}/burn`)
        .set('Authorization', `Bearer ${clientToken}`);

      const res = await request(app)
        .get(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${clientToken}`);

      const fetchedMsg = res.body.messages.find(m => m.id === msg.id);
      expect(fetchedMsg.content).toBe('[消息已销毁]');
    });
  });

  describe('TDD-6: 自动倒计时销毁 (burnAfterSeconds)', () => {
    it('应该能发送带 burnAfterSeconds 的阅后即焚消息', async () => {
      const res = await request(app)
        .post('/api/chat/messages')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          sessionId,
          content: '5秒后自动销毁',
          isBurnAfterRead: true,
          burnAfterSeconds: 5
        });

      expect(res.status).toBe(200);
      expect(res.body.message.isBurnAfterRead).toBe(true);
      expect(res.body.message.burnAfterSeconds).toBe(5);
    });

    it('发送时不传 burnAfterSeconds 应为 null', async () => {
      const res = await request(app)
        .post('/api/chat/messages')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          sessionId,
          content: '手动销毁消息',
          isBurnAfterRead: true
        });

      expect(res.body.message.burnAfterSeconds).toBeNull();
    });

    it('非阅后即焚消息不应有 burnAfterSeconds', async () => {
      const res = await request(app)
        .post('/api/chat/messages')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          sessionId,
          content: '普通消息',
          isBurnAfterRead: false,
          burnAfterSeconds: 10
        });

      expect(res.body.message.isBurnAfterRead).toBe(false);
      expect(res.body.message.burnAfterSeconds).toBeNull();
    });

    it('消息历史应返回 burnAfterSeconds 字段', async () => {
      const uniqueContent = '倒计时字段验证-' + Date.now();
      const createRes = await request(app)
        .post('/api/chat/messages')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          sessionId,
          content: uniqueContent,
          isBurnAfterRead: true,
          burnAfterSeconds: 10
        });

      const msgId = createRes.body.message.id;
      const res = await request(app)
        .get(`/api/chat/sessions/${sessionId}/messages`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      const burnMsg = res.body.messages.find(m => m.id === msgId);
      expect(burnMsg).toBeDefined();
      expect(burnMsg.burnAfterSeconds).toBe(10);
    });

    it('重复销毁消息应返回 400', async () => {
      const msg = await prisma.message.create({
        data: {
          sessionId,
          senderRole: 'operator',
          senderId: operatorId,
          content: '待重复销毁-' + Date.now(),
          isBurnAfterRead: true
        }
      });

      // 第一次销毁
      await request(app)
        .post(`/api/chat/messages/${msg.id}/burn`)
        .set('Authorization', `Bearer ${clientToken}`);

      // 第二次销毁应失败
      const res = await request(app)
        .post(`/api/chat/messages/${msg.id}/burn`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('消息已被销毁');
    });
  });
});

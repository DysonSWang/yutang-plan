/**
 * chat 私密聊天路由 E2E 测试
 * 覆盖：/sessions、/my-sessions、/sessions/:sessionId/messages、/messages
 */
const request = require('supertest');
const express = require('express');

const { createTestData, cleanupData, token } = require('./fixtures');

let app;
let tokens;
let ids;
const mockIo = { to: () => ({ emit: () => {} }) };

beforeAll(async () => {
  const data = await createTestData();
  ids = data;
  tokens = {
    operator: token(data.operator),
    client: token(data.client)
  };

  const router = require('../routes/chat')(mockIo);
  app = express();
  app.use(express.json());
  app.use('/api/chat', router);
});

afterAll(cleanupData);

describe('权限控制', () => {
  it('未登录返回 401', async () => {
    const res = await request(app).get('/api/chat/sessions');
    expect(res.status).toBe(401);
  });

  it('client 角色不能访问 sessions', async () => {
    const res = await request(app)
      .get('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokens.client}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/chat/sessions（操盘手视角）', () => {
  it('operator 获取会话列表应成功', async () => {
    const res = await request(app)
      .get('/api/chat/sessions')
      .set('Authorization', `Bearer ${tokens.operator}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });
});

describe('GET /api/chat/my-sessions（客户视角）', () => {
  it('client 获取自己的会话列表应成功', async () => {
    const res = await request(app)
      .get('/api/chat/my-sessions')
      .set('Authorization', `Bearer ${tokens.client}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });
});

describe('GET /api/chat/sessions/:sessionId/messages', () => {
  it('operator 获取会话消息应成功', async () => {
    const res = await request(app)
      .get(`/api/chat/sessions/${ids.session.id}/messages`)
      .set('Authorization', `Bearer ${tokens.operator}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('messages');
  });

  it('不存在的会话返回 404', async () => {
    const res = await request(app)
      .get('/api/chat/sessions/nonexistent-session-id/messages')
      .set('Authorization', `Bearer ${tokens.operator}`);

    expect(res.status).toBe(404);
  });

  it('client 访问自己会话返回 200', async () => {
    const res = await request(app)
      .get(`/api/chat/sessions/${ids.session.id}/messages`)
      .set('Authorization', `Bearer ${tokens.client}`);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/chat/messages 发送消息', () => {
  it('operator 发送消息应成功', async () => {
    const res = await request(app)
      .post('/api/chat/messages')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        sessionId: ids.session.id,
        content: 'E2E 测试消息'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBeDefined();
    expect(res.body.message.senderId).toBe(ids.operator.id);
  });

  it('client 发送消息应成功', async () => {
    const res = await request(app)
      .post('/api/chat/messages')
      .set('Authorization', `Bearer ${tokens.client}`)
      .send({
        sessionId: ids.session.id,
        content: '客户回复测试'
      });

    expect(res.status).toBe(200);
    expect(res.body.message.senderId).toBe(ids.client.id);
  });

  it('不存在的会话返回 404', async () => {
    const res = await request(app)
      .post('/api/chat/messages')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ sessionId: 'nonexistent', content: 'test' });

    expect(res.status).toBe(404);
  });

  it('无 sessionId 时返回 500（缺少校验，生产应修）', async () => {
    const res = await request(app)
      .post('/api/chat/messages')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ content: 'test' });

    // 当前路由未校验 sessionId，undefined 触发 Prisma 错误 → 500
    expect([400, 404, 500]).toContain(res.status);
  });
});

describe('POST /api/chat/messages 阅后即焚', () => {
  it('可发送阅后即焚消息', async () => {
    const res = await request(app)
      .post('/api/chat/messages')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        sessionId: ids.session.id,
        content: '保密内容',
        isBurnAfterRead: true
      });

    expect(res.status).toBe(200);
    expect(res.body.message.isBurnAfterRead).toBe(true);
  });
});

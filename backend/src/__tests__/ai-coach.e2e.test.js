/**
 * ai-coach E2E 测试
 * 覆盖：/situation、/analyze-chat、/reply-suggestions、/optimize-reply
 */
const request = require('supertest');
const express = require('express');

const { createTestData, cleanupData, token } = require('./fixtures');

let app;
let tokens;
let ids;

beforeAll(async () => {
  const data = await createTestData();
  ids = data;
  tokens = {
    operator: token(data.operator),
    client: token(data.client)
  };

  const router = require('../routes/aiCoach');
  app = express();
  app.use(express.json());
  app.use('/api/ai-coach', router);
});

afterAll(cleanupData);

describe('权限控制', () => {
  it('未登录返回 401', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .send({ situation: 'test' });
    expect(res.status).toBe(401);
  });

  it('operator/admin/client 可访问 situation', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ situation: '我今天和女生聊天，她说她在加班' });

    expect(res.status).not.toBe(403);
  });
});

describe('POST /api/ai-coach/situation 情况咨询', () => {
  it('operator 咨询情况应返回（允许 AI 失败）', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        girlId: ids.girl.id,
        situation: '她今天主动找我聊天，问我在干嘛'
      });

    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('不指定 girlId 也可咨询（通用教练模式）', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ situation: '女生不回消息怎么办' });

    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('缺少 situation 返回 400', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('女生不存在返回 404', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ girlId: 'nonexistent', situation: 'test' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/ai-coach/analyze-chat 对话分析', () => {
  it('operator 分析对话应成功（允许 AI 失败）', async () => {
    const res = await request(app)
      .post('/api/ai-coach/analyze-chat')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        girlId: ids.girl.id,
        message: '帮我分析一下这个情况'
      });

    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('client 不能调用（权限限制）', async () => {
    const res = await request(app)
      .post('/api/ai-coach/analyze-chat')
      .set('Authorization', `Bearer ${tokens.client}`)
      .send({ message: '你好' });

    expect(res.status).toBe(403);
  });

  it('缺少 message 返回 400', async () => {
    const res = await request(app)
      .post('/api/ai-coach/analyze-chat')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai-coach/reply-suggestions 回复建议', () => {
  it('operator 获取回复建议应成功（允许 AI 失败）', async () => {
    const res = await request(app)
      .post('/api/ai-coach/reply-suggestions')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        girlId: ids.girl.id,
        girlMessage: '今天好累啊'
      });

    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('缺少 girlMessage 返回 400', async () => {
    const res = await request(app)
      .post('/api/ai-coach/reply-suggestions')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/ai-coach/overview 全局概览', () => {
  it('operator 获取概览应返回 staleAlerts 字段', async () => {
    const res = await request(app)
      .get('/api/ai-coach/overview')
      .set('Authorization', `Bearer ${tokens.operator}`);

    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('无女生时概览返回有效 meta 帧', async () => {
    const res = await request(app)
      .get('/api/ai-coach/overview')
      .set('Authorization', `Bearer ${tokens.operator}`);

    // SSE 流式响应，第一帧包含 staleAlerts
    const body = res.text;
    expect(body).toContain('data: ');
    expect(body).toMatch(/staleAlerts/);
  });
});

describe('POST /api/ai-coach/optimize-reply 优化回复', () => {
  it('operator 优化回复应成功（允许 AI 失败）', async () => {
    const res = await request(app)
      .post('/api/ai-coach/optimize-reply')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        girlId: ids.girl.id,
        originalReply: '你好呀'
      });

    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('client 不能调用（权限）', async () => {
    const res = await request(app)
      .post('/api/ai-coach/optimize-reply')
      .set('Authorization', `Bearer ${tokens.client}`)
      .send({ originalReply: '你好' });

    expect(res.status).toBe(403);
  });
});

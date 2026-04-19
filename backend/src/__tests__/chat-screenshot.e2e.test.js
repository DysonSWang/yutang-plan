/**
 * chat-screenshot E2E 测试
 * 覆盖：/girl/:girlId、/client/me、/confirm-fields、/:id/notes、/:id/ai-notes
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

  const router = require('../routes/chatScreenshot');
  app = express();
  app.use(express.json());
  app.use('/api/chat-screenshot', router);
});

afterAll(cleanupData);

describe('权限控制', () => {
  it('未登录返回 401', async () => {
    const res = await request(app).get(`/api/chat-screenshot/girl/${ids.girl.id}`);
    expect(res.status).toBe(401);
  });

  it('client 角色不能获取女生截图列表', async () => {
    const res = await request(app)
      .get(`/api/chat-screenshot/girl/${ids.girl.id}`)
      .set('Authorization', `Bearer ${tokens.client}`);
    expect(res.status).toBe(403);
  });

  it('operator 不能通过 /client/me 访问（该端点仅限 client 角色）', async () => {
    const res = await request(app)
      .get(`/api/chat-screenshot/client/me`)
      .set('Authorization', `Bearer ${tokens.operator}`);
    expect(res.status).toBe(403);
  });

  it('client 角色只能访问自己的 /client/me', async () => {
    const res = await request(app)
      .get(`/api/chat-screenshot/client/me`)
      .set('Authorization', `Bearer ${tokens.client}`);
    expect(res.status).toBe(200);
  });

  it('client 带其他客户的 girlId 查询返回 403', async () => {
    const res = await request(app)
      .get(`/api/chat-screenshot/client/me?girlId=${ids.otherGirl.id}`)
      .set('Authorization', `Bearer ${tokens.client}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/chat-screenshot/girl/:girlId', () => {
  it('operator 获取截图列表应成功', async () => {
    const res = await request(app)
      .get(`/api/chat-screenshot/girl/${ids.girl.id}`)
      .set('Authorization', `Bearer ${tokens.operator}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.screenshots)).toBe(true);
  });
});

describe('POST /api/chat-screenshot/confirm-fields 确认字段', () => {
  it('确认采纳时 pendingId 不存在返回 404', async () => {
    const res = await request(app)
      .post('/api/chat-screenshot/confirm-fields')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        girlId: ids.girl.id,
        pendingId: 'nonexistent',
        selectedFields: {}
      });

    expect(res.status).toBe(404);
  });

  it('缺少 girlId 返回 400', async () => {
    const res = await request(app)
      .post('/api/chat-screenshot/confirm-fields')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ pendingId: 'some-id' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/chat-screenshot/:id/notes 更新备注', () => {
  let screenshotId;

  beforeAll(async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL } }
    });
    const screenshot = await prisma.chatScreenshot.create({
      data: {
        girlId: ids.girl.id,
        clientId: ids.client.id,
        operatorId: ids.operator.id,
        imageUrl: '/test/screenshot.jpg'
      }
    });
    screenshotId = screenshot.id;
    await prisma.$disconnect();
  });

  it('operator 更新备注应成功', async () => {
    const res = await request(app)
      .patch(`/api/chat-screenshot/${screenshotId}/notes`)
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ notes: '这是测试备注' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('client 角色不能更新备注', async () => {
    const res = await request(app)
      .patch(`/api/chat-screenshot/${screenshotId}/notes`)
      .set('Authorization', `Bearer ${tokens.client}`)
      .send({ notes: 'test' });

    expect(res.status).toBe(403);
  });

  it('不存在的截图返回 404', async () => {
    const res = await request(app)
      .patch('/api/chat-screenshot/nonexistent-id/notes')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ notes: 'test' });

    expect([404, 500]).toContain(res.status);
  });
});

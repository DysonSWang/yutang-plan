/**
 * dashboard E2E 测试
 * 覆盖：/stats、/brief、/today-tasks、/week-tasks、/alerts、/analyze-all
 */
const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { createTestData, cleanupData, token } = require('./fixtures');
const prisma = require('../prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

let app;
let tokens;
let ids;

beforeAll(async () => {
  const data = await createTestData();
  ids = data;

  // 确保有 admin 用户
  let admin = await prisma.user.findFirst({ where: { username: 'admin_e2e' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        username: 'admin_e2e',
        password: await bcrypt.hash('admin123456', 10),
        role: 'admin',
        nickname: 'E2E管理员',
        phone: '13900000000'
      }
    });
  }

  // Admin 也需要关联到 client 才能访问 dashboard
  let adminSession = await prisma.chatSession.findUnique({
    where: { operatorId_clientId: { operatorId: admin.id, clientId: data.client.id } }
  });
  if (!adminSession) {
    await prisma.chatSession.create({ data: { operatorId: admin.id, clientId: data.client.id } });
  }

  tokens = {
    operator: token(data.operator),
    client: token(data.client),
    admin: jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, JWT_SECRET)
  };

  const router = require('../routes/dashboard');
  app = express();
  app.use(express.json());
  app.use('/api/dashboard', router);
});

afterAll(cleanupData);

describe('权限控制', () => {
  it('未登录返回 401', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(401);
  });

  it('client 角色不能访问统计', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${tokens.client}`);
    expect(res.status).toBe(403);
  });

  it('client 角色不能访问简报', async () => {
    const res = await request(app)
      .get('/api/dashboard/brief')
      .set('Authorization', `Bearer ${tokens.client}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/dashboard/stats', () => {
  it('operator 获取统计数据应成功', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('girlCount');
    expect(res.body).toHaveProperty('clientCount');
    expect(res.body).toHaveProperty('avgTension');
    expect(res.body).toHaveProperty('girlStageStats');
    expect(res.body).toHaveProperty('clientStageStats');
  });

  it('可按 clientId 过滤', async () => {
    const res = await request(app)
      .get(`/api/dashboard/stats?clientId=${ids.client.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/dashboard/brief', () => {
  it('operator 获取简报应成功', async () => {
    const res = await request(app)
      .get('/api/dashboard/brief')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('tasks');
    expect(res.body).toHaveProperty('alerts');
    expect(res.body).toHaveProperty('weekTasks');
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });

  it('可按 clientId 过滤', async () => {
    const res = await request(app)
      .get(`/api/dashboard/brief?clientId=${ids.client.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/dashboard/today-tasks', () => {
  it('返回今日任务列表', async () => {
    const res = await request(app)
      .get('/api/dashboard/today-tasks')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });
});

describe('GET /api/dashboard/week-tasks', () => {
  it('返回本周任务列表', async () => {
    const res = await request(app)
      .get('/api/dashboard/week-tasks')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });
});

describe('GET /api/dashboard/alerts', () => {
  it('返回告警列表', async () => {
    const res = await request(app)
      .get('/api/dashboard/alerts')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });
});

describe('POST /api/dashboard/analyze-all 批量分析', () => {
  it('批量分析任务创建成功', async () => {
    const res = await request(app)
      .post('/api/dashboard/analyze-all')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ clientId: ids.client.id });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('jobId');
  });
});

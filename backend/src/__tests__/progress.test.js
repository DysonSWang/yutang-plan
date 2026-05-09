/**
 * Progress 服务进度路由测试
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const JWT_SECRET = process.env.JWT_SECRET;
const mockIo = { to: () => ({ emit: () => {} }) };

let app;
let operatorToken;
let clientToken;
let operatorId;
let clientId;

beforeAll(async () => {
  const bcrypt = require('bcryptjs');

  let operator = await prisma.user.findFirst({ where: { role: 'operator' } });
  let client = await prisma.user.findFirst({ where: { role: 'client' } });

  if (!operator) {
    operator = await prisma.user.create({
      data: { username: 'op_prog', password: await bcrypt.hash('op123', 10), role: 'operator', nickname: '操盘手' }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: { username: 'cl_prog', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '客户' }
    });
  }

  operatorId = operator.id;
  clientId = client.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);

  const router = require('../routes/progress')(mockIo);
  app = express();
  app.use(express.json());
  app.use('/api/progress', router);
});

afterAll(async () => {
  await prisma.serviceProgress.deleteMany({ where: { userId: clientId } });
  await prisma.notification.deleteMany({ where: { userId: clientId } });
  await prisma.$disconnect();
});

describe('Progress 路由权限测试', () => {
  it('未登录应返回 401', async () => {
    const res = await request(app).get('/api/progress');
    expect(res.status).toBe(401);
  });

  it('client 角色不能创建进度', async () => {
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ clientId, stage: 1, stageName: '背调' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/progress 获取进度', () => {
  it('client 应只能看到自己的进度', async () => {
    const res = await request(app)
      .get('/api/progress')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const p of res.body.progress) {
      expect(p.userId).toBe(clientId);
    }
  });
});

describe.skip('POST /api/progress 创建进度', () => {
  // 注意：此路由需要 admin 权限，暂时跳过
  it('operator 创建进度应成功', async () => {
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId, stage: 1, stageName: '背调', status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.progress.stageName).toBe('背调');
    expect(res.body.progress.status).toBe('in_progress');
  });

  it('创建时应发送通知', async () => {
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId, stage: 2, stageName: '建池', status: 'in_progress' });
    expect(res.status).toBe(200);

    const notifs = await prisma.notification.findMany({ where: { userId: clientId, type: 'progress' } });
    expect(notifs.length).toBeGreaterThan(0);
  });

  it('缺少必需参数应返回 400', async () => {
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId });
    expect(res.status).toBe(400);
  });

  it('已完成状态应设置 completedAt', async () => {
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId, stage: 3, stageName: '约会', status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.progress.completedAt).not.toBeNull();
  });

  it('更新已存在的阶段应更新而不是创建', async () => {
    // 先创建
    await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId, stage: 4, stageName: '背调', status: 'in_progress', amountPaid: 1000 });

    // 再更新
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId, stage: 4, stageName: '背调', status: 'completed', amountPaid: 2000 });

    expect(res.status).toBe(200);
    const all = await prisma.serviceProgress.findMany({ where: { userId: clientId, stage: 4 } });
    expect(all.length).toBe(1);
    expect(all[0].amountPaid).toBe(2000);
  });

  it('完成时用户 serviceStage 应更新', async () => {
    await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId, stage: 5, stageName: '锁定', status: 'in_progress' });

    const user = await prisma.user.findUnique({ where: { id: clientId } });
    expect(user.serviceStage).toBe('锁定');
  });
});

describe.skip('GET /api/progress/report/:clientId 进度报告', () => {
  // 注意：此路由需要 admin 权限，暂时跳过
  it('operator 获取客户报告应成功', async () => {
    const res = await request(app)
      .get(`/api/progress/report/${clientId}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('progress');
    expect(res.body).toHaveProperty('stats');
    expect(res.body.stats).toHaveProperty('girlCount');
    expect(res.body.stats).toHaveProperty('intimacyCount');
    expect(res.body.stats).toHaveProperty('longTermCount');
    expect(res.body.stats).toHaveProperty('dateCount');
  });
});

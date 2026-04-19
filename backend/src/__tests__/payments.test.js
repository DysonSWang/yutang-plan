/**
 * Payments 阶段付款路由测试
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
      data: { username: 'op_pay', password: await bcrypt.hash('op123', 10), role: 'operator', nickname: '操盘手' }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: { username: 'cl_pay', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '客户' }
    });
  }

  operatorId = operator.id;
  clientId = client.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);

  const router = require('../routes/payments');
  app = express();
  app.use(express.json());
  app.use('/api/payments', router);
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { userId: clientId } });
  await prisma.$disconnect();
});

describe('Payments 路由权限测试', () => {
  it('未登录应返回 401', async () => {
    const res = await request(app).get('/api/payments');
    expect(res.status).toBe(401);
  });

  it('client 角色不能创建付款记录', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ clientId: 'test', stage: 1, amount: 1000 });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/payments 获取付款记录', () => {
  it('operator 应能看到所有付款记录', async () => {
    const res = await request(app)
      .get('/api/payments')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.payments)).toBe(true);
  });

  it('client 应只能看到自己的付款记录', async () => {
    const res = await request(app)
      .get('/api/payments')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    for (const payment of res.body.payments) {
      expect(payment.userId).toBe(clientId);
    }
  });
});

describe('POST /api/payments 创建付款记录', () => {
  it('operator 创建付款记录应成功', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId, stage: 1, amount: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment.stage).toBe(1);
    expect(res.body.payment.amount).toBe(5000);
    expect(res.body.payment.status).toBe('paid');
    expect(res.body.payment.paidAt).not.toBeNull();
  });

  it('缺少必需参数应返回 400', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId });
    expect(res.status).toBe(400);
  });

  it('创建时应更新用户余额', async () => {
    const userBefore = await prisma.user.findUnique({ where: { id: clientId } });
    await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId, stage: 2, amount: 3000 });
    const userAfter = await prisma.user.findUnique({ where: { id: clientId } });
    expect(Number(userAfter.balance)).toBe(Number(userBefore.balance) + 3000);
  });
});

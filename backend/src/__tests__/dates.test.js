/**
 * Dates 约会管理路由测试
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
let testGirlId;

beforeAll(async () => {
  const bcrypt = require('bcryptjs');

  let operator = await prisma.user.findFirst({ where: { role: 'operator' } });
  let client = await prisma.user.findFirst({ where: { role: 'client' } });

  if (!operator) {
    operator = await prisma.user.create({
      data: { username: 'op_dates', password: await bcrypt.hash('op123', 10), role: 'operator', nickname: '操盘手' }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: { username: 'cl_dates', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '客户' }
    });
  }

  operatorId = operator.id;
  clientId = client.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);

  // 创建测试女生
  let girl = await prisma.girl.findFirst({ where: { clientId } });
  if (!girl) {
    girl = await prisma.girl.create({ data: { clientId, name: '测试女生' } });
  }
  testGirlId = girl.id;

  const router = require('../routes/dates');
  app = express();
  app.use(express.json());
  app.use('/api/dates', router);
});

afterAll(async () => {
  await prisma.date.deleteMany({ where: { userId: clientId } });
  await prisma.$disconnect();
});

describe('Dates 路由权限测试', () => {
  it('未登录应返回 401', async () => {
    const res = await request(app).get('/api/dates');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/dates 约会列表', () => {
  it('client 应能看到自己的约会', async () => {
    const res = await request(app)
      .get('/api/dates')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.dates)).toBe(true);
  });
});

describe('POST /api/dates 创建约会', () => {
  it('operator 创建约会应成功', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const res = await request(app)
      .post('/api/dates')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        clientId,
        girlId: testGirlId,
        dateTime: futureDate.toISOString(),
        title: '第一次约会',
        location: '咖啡厅'
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.date.userId).toBe(clientId);
    expect(res.body.date.girlId).toBe(testGirlId);
    expect(res.body.date.title).toBe('第一次约会');
    expect(res.body.date.status).toBe('pending_plan');
  });

  it('client 不能创建约会', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const res = await request(app)
      .post('/api/dates')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ userId: clientId, girlId: testGirlId, dateTime: futureDate.toISOString() });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/dates/:id 约会详情', () => {
  let dateId;

  beforeAll(async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const date = await prisma.date.create({
      data: { userId: clientId, girlId: testGirlId, dateTime: futureDate, title: '详情测试约会' }
    });
    dateId = date.id;
  });

  it('获取约会详情应成功', async () => {
    const res = await request(app)
      .get(`/api/dates/${dateId}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.date.id).toBe(dateId);
  });

  it('获取不存在约会应返回 404', async () => {
    const res = await request(app)
      .get('/api/dates/nonexistent-id')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/dates/:id 更新约会', () => {
  let updateDateId;

  beforeAll(async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const date = await prisma.date.create({
      data: { userId: clientId, girlId: testGirlId, dateTime: futureDate, title: '待更新约会' }
    });
    updateDateId = date.id;
  });

  it('operator 更新约会应成功', async () => {
    const res = await request(app)
      .put(`/api/dates/${updateDateId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ title: '已更新约会', status: 'planned' });
    expect(res.status).toBe(200);
    expect(res.body.date.title).toBe('已更新约会');
  });
});

describe('PUT /api/dates/:id/checklist 更新检查清单', () => {
  let checklistDateId;

  beforeAll(async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const date = await prisma.date.create({
      data: { userId: clientId, girlId: testGirlId, dateTime: futureDate }
    });
    checklistDateId = date.id;
  });

  it('operator 更新检查清单应成功', async () => {
    const checklist = JSON.stringify([
      { category: '外形', items: [{ id: 'a', label: '理发', checked: true }] }
    ]);
    const res = await request(app)
      .put(`/api/dates/${checklistDateId}/checklist`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ checklist });
    expect(res.status).toBe(200);
    expect(res.body.date.preDateChecklist).toBe(checklist);
  });
});

describe('DELETE /api/dates/:id 删除约会', () => {
  let deleteDateId;

  beforeAll(async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const date = await prisma.date.create({
      data: { userId: clientId, girlId: testGirlId, dateTime: futureDate }
    });
    deleteDateId = date.id;
  });

  it('operator 删除约会应成功', async () => {
    const res = await request(app)
      .delete(`/api/dates/${deleteDateId}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('client 不能删除约会', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const date = await prisma.date.create({
      data: { userId: clientId, girlId: testGirlId, dateTime: futureDate }
    });
    const res = await request(app)
      .delete(`/api/dates/${date.id}`)
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/dates/:id/client-confirm 客户确认方案', () => {
  let confirmDateId;

  beforeAll(async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const date = await prisma.date.create({
      data: { userId: clientId, girlId: testGirlId, dateTime: futureDate, status: 'pending_client_confirm', planStatus: 'generated' }
    });
    confirmDateId = date.id;
  });

  it('client 确认约会方案应成功', async () => {
    const res = await request(app)
      .post(`/api/dates/${confirmDateId}/client-confirm`)
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('方案已确认，祝约会顺利！');
  });
});

describe('GET /api/dates/client-pending 客户待确认约会', () => {
  it('client 获取待确认约会应成功', async () => {
    // 先创建一个待确认约会
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.date.create({
      data: { userId: clientId, girlId: testGirlId, dateTime: futureDate, status: 'pending_client_confirm' }
    });

    const res = await request(app)
      .get('/api/dates/client-pending')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.dates)).toBe(true);
    expect(res.body.dates.length).toBeGreaterThan(0);
  });
});

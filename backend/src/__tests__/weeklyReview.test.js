/**
 * 每周复盘报告测试 - M007 S04
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const mockIo = { to: () => ({ emit: () => {} }) };

let app;
let operatorToken;
let adminToken;
let clientToken;
let operatorId;
let clientId;

beforeAll(async () => {
  let operator = await prisma.user.findUnique({ where: { username: 'op_weekly_test' } });
  let client = await prisma.user.findUnique({ where: { username: 'cl_weekly_test' } });
  let admin = await prisma.user.findUnique({ where: { username: 'admin_weekly_test' } });

  if (!operator) {
    operator = await prisma.user.create({
      data: { username: 'op_weekly_test', password: await bcrypt.hash('op123', 10), role: 'operator', nickname: '周报测试操盘手' }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: { username: 'cl_weekly_test', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '周报测试客户' }
    });
  }
  if (!admin) {
    admin = await prisma.user.create({
      data: { username: 'admin_weekly_test', password: await bcrypt.hash('admin123', 10), role: 'admin', nickname: '周报测试管理员' }
    });
  }

  operatorId = operator.id;
  clientId = client.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  adminToken = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);

  let session = await prisma.chatSession.findUnique({
    where: { operatorId_clientId: { operatorId, clientId } }
  });
  if (!session) {
    await prisma.chatSession.create({ data: { operatorId, clientId } });
  }

  const router = require('../routes/weeklyReview');
  app = express();
  app.use(express.json());
  app.use('/api/clients', router);
});

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { username: { in: ['op_weekly_test', 'cl_weekly_test', 'admin_weekly_test'] } },
    select: { id: true }
  });
  const testIds = testUsers.map(u => u.id);
  await prisma.serviceProgress.deleteMany({ where: { userId: { in: testIds } } });
  await prisma.chatSession.deleteMany({ where: { operatorId } });
  await prisma.user.deleteMany({ where: { username: { in: ['op_weekly_test', 'cl_weekly_test', 'admin_weekly_test'] } } });
  await prisma.$disconnect();
});

describe('周报路由权限测试', () => {
  it('未登录应返回 401', async () => {
    const res = await request(app).get(`/api/clients/${clientId}/weekly-review`);
    expect(res.status).toBe(401);
  });

  it('client 角色不能访问', async () => {
    const res = await request(app)
      .get(`/api/clients/${clientId}/weekly-review`)
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('operator 无权限访问未关联客户的周报', async () => {
    const otherClient = await prisma.user.create({
      data: { username: 'cl_other_weekly', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '其他客户' }
    });
    const res = await request(app)
      .get(`/api/clients/${otherClient.id}/weekly-review`)
      .set('Authorization', `Bearer ${operatorToken}`);
    await prisma.user.delete({ where: { id: otherClient.id } });
    expect(res.status).toBe(403);
  });

  it('operator 获取周报成功', async () => {
    const res = await request(app)
      .get(`/api/clients/${clientId}/weekly-review`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalGirls');
    expect(res.body.data).toHaveProperty('chatLogsThisWeek');
    expect(res.body.data).toHaveProperty('weekStart');
    expect(res.body.data).toHaveProperty('weekEnd');
  });

  it('admin 可以获取任意客户周报', async () => {
    const res = await request(app)
      .get(`/api/clients/${clientId}/weekly-review`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('获取历史周报成功', async () => {
    const res = await request(app)
      .get(`/api/clients/${clientId}/weekly-review/history?limit=4`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('手动触发周报生成成功', async () => {
    const res = await request(app)
      .post(`/api/clients/${clientId}/weekly-review/generate`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('weekStart');
    expect(res.body.data).toHaveProperty('generatedAt');
  });
});

describe('周报服务单元测试', () => {
  const { getWeekRange, aggregateWeekData } = require('../services/weeklyReview');

  it('getWeekRange 返回周一起止时间', () => {
    const { weekStart, weekEnd } = getWeekRange();
    expect(weekStart.getDay()).toBe(1); // 周一
    expect(weekEnd.getTime() - weekStart.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('getWeekRange 带日期参数正常工作', () => {
    const { weekStart, weekEnd } = getWeekRange(new Date('2026-01-15'));
    expect(weekStart.getDay()).toBe(1);
    expect(weekEnd > weekStart).toBe(true);
  });

  it('aggregateWeekData 返回完整数据对象', async () => {
    const data = await aggregateWeekData(clientId);
    expect(data).toHaveProperty('totalGirls');
    expect(data).toHaveProperty('newGirlsThisWeek');
    expect(data).toHaveProperty('datesThisWeek');
    expect(data).toHaveProperty('completedDates');
    expect(data).toHaveProperty('chatLogsThisWeek');
    expect(data).toHaveProperty('chatLogsLastWeek');
    expect(data).toHaveProperty('chatTrend');
    expect(data).toHaveProperty('avgTension');
    expect(data).toHaveProperty('alertStats');
    expect(data).toHaveProperty('activeAlerts');
    expect(data).toHaveProperty('stageChanges');
    expect(typeof data.chatTrend).toBe('number');
    expect(typeof data.avgTension).toBe('string');
  });

  it('aggregateWeekData 无人时返回零值', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001';
    const data = await aggregateWeekData(fakeId);
    expect(data.totalGirls).toBe(0);
    expect(data.newGirlsThisWeek).toBe(0);
    expect(data.avgTension).toBe('5.0');
  });

  it('stageChanges 包含 upgrades 和 downgrades', async () => {
    const data = await aggregateWeekData(clientId);
    expect(data.stageChanges).toHaveProperty('total');
    expect(data.stageChanges).toHaveProperty('upgrades');
    expect(data.stageChanges).toHaveProperty('downgrades');
    expect(Array.isArray(data.stageChanges.details)).toBe(true);
  });
});

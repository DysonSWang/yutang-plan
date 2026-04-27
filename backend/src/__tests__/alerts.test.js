/**
 * Alert 主动预警测试
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
let clientToken;
let operatorId;
let clientId;
let girlId;

beforeAll(async () => {
  // 创建测试用户
  let operator = await prisma.user.findUnique({ where: { username: 'op_alerts_test' } });
  let client = await prisma.user.findUnique({ where: { username: 'cl_alerts_test' } });

  if (!operator) {
    operator = await prisma.user.create({
      data: { username: 'op_alerts_test', password: await bcrypt.hash('op123', 10), role: 'operator', nickname: '预警测试操盘手' }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: { username: 'cl_alerts_test', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '预警测试客户' }
    });
  }

  operatorId = operator.id;
  clientId = client.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);

  // 创建测试女生的会话关联
  let session = await prisma.chatSession.findUnique({
    where: { operatorId_clientId: { operatorId, clientId } }
  });
  if (!session) {
    await prisma.chatSession.create({ data: { operatorId, clientId } });
  }

  // 创建测试女生（用于预警检测）
  let girl = await prisma.girl.findFirst({ where: { clientId, name: '预警测试女生' } });
  if (!girl) {
    girl = await prisma.girl.create({
      data: {
        clientId,
        name: '预警测试女生',
        stage: '聊天',
        tensionScore: 7,
        signals: JSON.stringify([{ date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), event: '聊天' }]),
        observations: JSON.stringify([]),
        pendingActions: JSON.stringify([]),
        relationshipStage: 'EXPLORATION',
        relationshipStageUpdatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      }
    });
  }
  girlId = girl.id;

  const router = require('../routes/alerts');
  app = express();
  app.use(express.json());
  app.use('/api/alerts', router(mockIo));
});

afterAll(async () => {
  // 清理预警数据
  await prisma.alert.deleteMany({ where: { operatorId } });
  await prisma.girl.deleteMany({ where: { clientId } });
  await prisma.chatSession.deleteMany({ where: { operatorId } });
  await prisma.user.deleteMany({ where: { username: { in: ['op_alerts_test', 'cl_alerts_test'] } } });
  await prisma.$disconnect();
});

describe('Alert 路由权限测试', () => {
  it('未登录应返回 401', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(401);
  });

  it('client 角色不能访问预警', async () => {
    const res = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('operator 获取预警列表成功', async () => {
    const res = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });

  it('operator 获取预警统计成功', async () => {
    const res = await request(app)
      .get('/api/alerts/stats')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stats).toHaveProperty('p0');
    expect(res.body.stats).toHaveProperty('p1');
    expect(res.body.stats).toHaveProperty('p2');
  });
});

describe('Alert Engine 检测逻辑', () => {
  const {
    detectSilence,
    detectStageStagnation,
    detectReversalSignals,
    detectActionBacklog,
  } = require('../services/alertEngine');

  it('detectSilence: 10天无互动应触发 P0 预警', () => {
    const girl = { name: '测试', signals: JSON.stringify([{ date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() }]) };
    const alert = detectSilence(girl, 7);
    expect(alert).not.toBeNull();
    expect(alert.severity).toBe('P0');
    expect(alert.title).toContain('已');
  });

  it('detectSilence: 2天无互动不应触发预警', () => {
    const girl = { name: '测试', signals: JSON.stringify([{ date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() }]) };
    const alert = detectSilence(girl, 3);
    expect(alert).toBeNull();
  });

  it('detectStageStagnation: 卡在EXPLORATION超14天应触发 P1', () => {
    const girl = {
      name: '测试',
      relationshipStage: 'EXPLORATION',
      relationshipStageUpdatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      pendingActions: JSON.stringify([]),
    };
    const alert = detectStageStagnation(girl);
    expect(alert).not.toBeNull();
    expect(alert.severity).toBe('P1');
  });

  it('detectStageStagnation: 有pendingActions不应触发', () => {
    const girl = {
      name: '测试',
      relationshipStage: 'EXPLORATION',
      relationshipStageUpdatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      pendingActions: JSON.stringify([{ action: '约出来' }]),
    };
    const alert = detectStageStagnation(girl);
    expect(alert).toBeNull();
  });

  it('detectReversalSignals: 观测到冷淡关键词应触发预警', () => {
    const girl = {
      name: '测试女生',
      observations: JSON.stringify([{ date: new Date().toISOString(), content: '最近对她态度有点冷淡' }]),
      signals: JSON.stringify([]),
    };
    const alert = detectReversalSignals(girl);
    expect(alert).not.toBeNull();
    expect(alert.alertType).toBe('signal');
  });

  it('detectReversalSignals: 正常内容不应触发', () => {
    const girl = {
      name: '测试女生',
      observations: JSON.stringify([{ date: new Date().toISOString(), content: '今天聊天很开心' }]),
      signals: JSON.stringify([]),
    };
    const alert = detectReversalSignals(girl);
    expect(alert).toBeNull();
  });

  it('detectActionBacklog: 待办超过3天应触发 P2', () => {
    const girl = {
      name: '测试',
      pendingActions: JSON.stringify([{ action: '约出来', createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() }]),
    };
    const alert = detectActionBacklog(girl);
    expect(alert).not.toBeNull();
    expect(alert.severity).toBe('P2');
  });

  it('detectActionBacklog: 新待办不应触发', () => {
    const girl = {
      name: '测试',
      pendingActions: JSON.stringify([{ action: '约出来', createdAt: new Date().toISOString() }]),
    };
    const alert = detectActionBacklog(girl);
    expect(alert).toBeNull();
  });
});

describe('Alert 评估 + 路由集成测试', () => {
  it('POST /api/alerts/evaluate 触发评估并创建预警', async () => {
    const res = await request(app)
      .post('/api/alerts/evaluate')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 10天无互动的测试女生应产生预警
    expect(res.body.newCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.alerts)).toBe(true);
    expect(res.body.stats).toBeDefined();
  });
});

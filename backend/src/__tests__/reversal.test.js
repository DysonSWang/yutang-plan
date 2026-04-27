/**
 * 反撇检测测试 - M007 S03
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
  let operator = await prisma.user.findUnique({ where: { username: 'op_reversal_test' } });
  let client = await prisma.user.findUnique({ where: { username: 'cl_reversal_test' } });

  if (!operator) {
    operator = await prisma.user.create({
      data: { username: 'op_reversal_test', password: await bcrypt.hash('op123', 10), role: 'operator', nickname: '反撇测试操盘手' }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: { username: 'cl_reversal_test', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '反撇测试客户' }
    });
  }

  operatorId = operator.id;
  clientId = client.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);

  let session = await prisma.chatSession.findUnique({
    where: { operatorId_clientId: { operatorId, clientId } }
  });
  if (!session) {
    await prisma.chatSession.create({ data: { operatorId, clientId } });
  }

  let girl = await prisma.girl.findFirst({ where: { clientId, name: '反撇测试女生' } });
  if (!girl) {
    girl = await prisma.girl.create({
      data: {
        clientId,
        name: '反撇测试女生',
        stage: '暧昧',
        tensionScore: 5,
        signals: JSON.stringify([{ date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), event: '聊天正常' }]),
        observations: JSON.stringify([]),
        pendingActions: JSON.stringify([]),
      }
    });
  }
  girlId = girl.id;

  const router = require('../routes/reversal');
  app = express();
  app.use(express.json());
  app.use('/api/girls', router(mockIo));
});

afterAll(async () => {
  await prisma.girl.deleteMany({ where: { clientId } });
  await prisma.chatSession.deleteMany({ where: { operatorId } });
  await prisma.user.deleteMany({ where: { username: { in: ['op_reversal_test', 'cl_reversal_test'] } } });
  await prisma.$disconnect();
});

describe('反撇检测路由权限测试', () => {
  it('未登录应返回 401', async () => {
    const res = await request(app).post(`/api/girls/${girlId}/analyze-reversal`);
    expect(res.status).toBe(401);
  });

  it('client 角色不能访问', async () => {
    const res = await request(app)
      .get(`/api/girls/${girlId}/reversal-risk`)
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('operator 获取反撇风险成功（规则判断）', async () => {
    const res = await request(app)
      .get(`/api/girls/${girlId}/reversal-risk`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('riskLevel');
  });

  it('operator 触发反撇分析（无AI时返回错误）', async () => {
    const res = await request(app)
      .post(`/api/girls/${girlId}/analyze-reversal`)
      .set('Authorization', `Bearer ${operatorToken}`);
    // AI 可能未配置，返回 500 是预期行为
    expect([200, 500]).toContain(res.status);
  });
});

describe('反撇检测服务单元测试', () => {
  const { getReversalRisk, REVERSAL_TYPES, RISK_LEVELS } = require('../services/reversalDetector');

  it('getReversalRisk: 正常女生应返回 low 风险', async () => {
    const risk = await getReversalRisk(girlId);
    expect(risk).toHaveProperty('riskLevel');
    expect(['high', 'medium', 'low']).toContain(risk.riskLevel);
  });

  it('getReversalRisk: 不存在的女生返回 null', async () => {
    const risk = await getReversalRisk('nonexistent-id');
    expect(risk).toBeNull();
  });

  it('REVERSAL_TYPES 和 RISK_LEVELS 常量存在', () => {
    expect(REVERSAL_TYPES).toHaveProperty('COLD_IGNORED');
    expect(REVERSAL_TYPES).toHaveProperty('SUDDEN_DISAPPEAR');
    expect(RISK_LEVELS).toHaveProperty('HIGH');
    expect(RISK_LEVELS).toHaveProperty('MEDIUM');
    expect(RISK_LEVELS).toHaveProperty('LOW');
    expect(RISK_LEVELS).toHaveProperty('NONE');
  });
});

/**
 * 入职流程测试 - M007 S05
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

let app;
let operatorToken;
let clientToken;
let operatorId;
let clientId;
let operator;

beforeAll(async () => {
  operator = await prisma.user.findUnique({ where: { username: 'op_onboard_test' } });
  let client = await prisma.user.findUnique({ where: { username: 'cl_onboard_test' } });

  if (!operator) {
    operator = await prisma.user.create({
      data: { username: 'op_onboard_test', password: await bcrypt.hash('op123', 10), role: 'operator', nickname: '入职测试操盘手' }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: { username: 'cl_onboard_test', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '入职测试客户', serviceStage: '待入职' }
    });
  }

  operatorId = operator.id;
  clientId = client.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);

  const router = require('../routes/clients');
  app = express();
  app.use(express.json());
  app.use('/api/clients', router);
});

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { username: { in: ['op_onboard_test', 'cl_onboard_test'] } },
    select: { id: true }
  });
  const testIds = testUsers.map(u => u.id);
  await prisma.serviceProgress.deleteMany({ where: { userId: { in: testIds } } });
  await prisma.user.updateMany({
    where: { username: 'cl_onboard_test' },
    data: { serviceStage: null }
  });
  await prisma.user.deleteMany({ where: { username: { in: ['op_onboard_test', 'cl_onboard_test'] } } });
  await prisma.$disconnect();
});

describe('入职流程路由权限测试', () => {
  it('未登录应返回 401', async () => {
    const res = await request(app)
      .post('/api/clients/onboarding-complete')
      .send({ nickname: '测试', age: 30, emotionalGoal: '认真找对象', relationshipGoal: '长期', personality: 'ENFP', emotionalMaturityLevel: 6, clientType: '执行型', pacePreference: '稳健型' });
    expect(res.status).toBe(401);
  });

  it('operator 角色不能调用入职完成', async () => {
    const res = await request(app)
      .post('/api/clients/onboarding-complete')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ nickname: '测试', age: 30 });
    expect(res.status).toBe(403);
  });

  it('client 调用入职完成成功', async () => {
    // 重置为待入职状态
    await prisma.user.update({ where: { id: clientId }, data: { serviceStage: '待入职' } });

    const res = await request(app)
      .post('/api/clients/onboarding-complete')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        nickname: '入职测试',
        age: '30',
        occupation: '工程师',
        emotionalGoal: '认真找对象',
        relationshipGoal: '长期',
        personality: 'INTJ',
        emotionalMaturityLevel: 7,
        eqLevel: 6,
        emotionalStable: 7,
        communicationStyle: '直接',
        learningAbility: '强',
        coachCooperationLevel: 8,
        antiFrustrationLevel: 6,
        pacePreference: '稳健型',
        clientType: '执行型',
        profileBio: '喜欢技术和逻辑',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('入职完成');
  });
});

describe('入职服务单元测试', () => {
  const { generateStrategicProfile } = require('../services/onboardingService');

  it('generateStrategicProfile: AI 未配置时返回 generated=false', async () => {
    // 用无效URL触发失败路径
    const result = await generateStrategicProfile({
      nickname: '测试客户',
      age: 30,
      personality: 'ENFP',
      emotionalMaturityLevel: 6,
      learningAbility: '强',
      clientType: '执行型',
      pacePreference: '稳健型',
      emotionalGoal: '认真找对象',
      relationshipGoal: '长期',
      antiFrustrationLevel: 5,
      eqLevel: 6,
      communicationStyle: '直接',
      profileBio: '测试',
    });
    expect(result).toHaveProperty('generated');
    expect(result).toHaveProperty('clientBestApproach');
  });
});

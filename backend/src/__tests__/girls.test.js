/**
 * Girls 女生资源池路由测试
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
      data: { username: 'op_girls', password: await bcrypt.hash('op123', 10), role: 'operator', nickname: '操盘手' }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: { username: 'cl_girls', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '客户' }
    });
  }

  operatorId = operator.id;
  clientId = client.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);

  const router = require('../routes/girls');
  app = express();
  app.use(express.json());
  app.use('/api/girls', router);
});

afterAll(async () => {
  // 清理测试女生
  await prisma.girl.deleteMany({ where: { clientId: { in: [clientId, 'nonexistent-id'] } } });
  await prisma.$disconnect();
});

describe('Girls 路由权限测试', () => {
  it('未登录应返回 401', async () => {
    const res = await request(app).get('/api/girls');
    expect(res.status).toBe(401);
  });

  it('client 角色不能创建女生', async () => {
    const res = await request(app)
      .post('/api/girls')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ clientId, name: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/girls 列表', () => {
  it('operator 应能看到所有女生', async () => {
    const res = await request(app)
      .get('/api/girls')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.girls)).toBe(true);
  });

  it('client 应只能看到自己的女生', async () => {
    const res = await request(app)
      .get('/api/girls')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    for (const girl of res.body.girls) {
      expect(girl.clientId).toBe(clientId);
    }
  });

  it('可按 stage 过滤', async () => {
    const res = await request(app)
      .get('/api/girls?stage=陌生')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    for (const girl of res.body.girls) {
      expect(girl.stage).toBe('陌生');
    }
  });
});

describe('POST /api/girls 创建女生', () => {
  it('operator 创建女生应成功', async () => {
    const res = await request(app)
      .post('/api/girls')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId, name: '测试女生' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.girl.name).toBe('测试女生');
    expect(res.body.girl.stage).toBe('陌生');
  });

  it('缺少必需字段应返回 400', async () => {
    const res = await request(app)
      .post('/api/girls')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId });
    expect(res.status).toBe(400);
  });

  it('可设置完整的女生画像字段', async () => {
    const res = await request(app)
      .post('/api/girls')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        clientId,
        name: '完整女生',
        age: 25,
        occupation: '设计师',
        education: '本科',
        stage: '暧昧',
        status: 'active',
        intimacyLevel: 5,
        tensionScore: 7.5,
        isKinkOriented: true,
        kinkIdentity: 'sub',
        attachmentStyle: '安全型',
        personality: 'INTJ'
      });
    expect(res.status).toBe(200);
    expect(res.body.girl.age).toBe(25);
    expect(res.body.girl.occupation).toBe('设计师');
    expect(res.body.girl.stage).toBe('暧昧');
    expect(res.body.girl.intimacyLevel).toBe(5);
    expect(res.body.girl.tensionScore).toBe(7.5);
    expect(res.body.girl.isKinkOriented).toBe(true);
  });
});

describe('PUT /api/girls/:id 更新女生', () => {
  let girlId;

  beforeAll(async () => {
    const girl = await prisma.girl.create({
      data: { clientId, name: '待更新女生' }
    });
    girlId = girl.id;
  });

  it('operator 更新女生应成功', async () => {
    const res = await request(app)
      .put(`/api/girls/${girlId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ name: '已更新', stage: '暧昧', intimacyLevel: 3 });
    expect(res.status).toBe(200);
    expect(res.body.girl.name).toBe('已更新');
    expect(res.body.girl.stage).toBe('暧昧');
  });

  it('更新不存在女生应返回 404', async () => {
    const res = await request(app)
      .put('/api/girls/nonexistent-id')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ name: 'test' });
    expect(res.status).toBe(404);
  });

  it('client 不能更新女生', async () => {
    const res = await request(app)
      .put(`/api/girls/${girlId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ name: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/girls/:id 删除女生', () => {
  let deleteGirlId;

  beforeAll(async () => {
    const girl = await prisma.girl.create({
      data: { clientId, name: '待删除女生' }
    });
    deleteGirlId = girl.id;
  });

  it('operator 删除女生应成功', async () => {
    const res = await request(app)
      .delete(`/api/girls/${deleteGirlId}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('client 不能删除女生', async () => {
    const res = await request(app)
      .delete(`/api/girls/${deleteGirlId}`)
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/girls/:id/intimacy 更新亲密度', () => {
  let intimacyGirlId;

  beforeAll(async () => {
    const girl = await prisma.girl.create({
      data: { clientId, name: '亲密度测试', intimacyLevel: 1 }
    });
    intimacyGirlId = girl.id;
  });

  it('operator 更新亲密度应成功', async () => {
    const res = await request(app)
      .post(`/api/girls/${intimacyGirlId}/intimacy`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ level: 7 });
    expect(res.status).toBe(200);
    expect(res.body.girl.intimacyLevel).toBe(7);
  });
});

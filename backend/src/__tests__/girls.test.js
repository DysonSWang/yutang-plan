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
let adminToken;
let operatorId;
let clientId;
let adminId;

beforeAll(async () => {
  const bcrypt = require('bcryptjs');

  let operator = await prisma.user.findFirst({ where: { role: 'operator' } });
  let client = await prisma.user.findFirst({ where: { role: 'client' } });
  let admin = await prisma.user.findFirst({ where: { role: 'admin' } });

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
  if (!admin) {
    admin = await prisma.user.create({
      data: { username: 'ad_girls', password: await bcrypt.hash('ad123', 10), role: 'admin', nickname: '管理员' }
    });
  }

  operatorId = operator.id;
  clientId = client.id;
  adminId = admin.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);
  adminToken = jwt.sign({ id: adminId, role: 'admin' }, JWT_SECRET);

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
  it('admin 创建女生应成功', async () => {
    const res = await request(app)
      .post('/api/girls')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId, name: '测试女生' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.girl.name).toBe('测试女生');
    expect(res.body.girl.stage).toBe('陌生');
  });

  it('operator 不能创建女生', async () => {
    const res = await request(app)
      .post('/api/girls')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ clientId, name: '测试女生' });
    expect(res.status).toBe(403);
  });

  it('缺少必需字段应返回 400', async () => {
    const res = await request(app)
      .post('/api/girls')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId });
    expect(res.status).toBe(400);
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

  it('admin 更新女生应成功', async () => {
    const res = await request(app)
      .put(`/api/girls/${girlId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '已更新', stage: '暧昧', intimacyLevel: 3 });
    expect(res.status).toBe(200);
    expect(res.body.girl.name).toBe('已更新');
    expect(res.body.girl.stage).toBe('暧昧');
  });

  it('operator 不能更新女生', async () => {
    const res = await request(app)
      .put(`/api/girls/${girlId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ name: '已更新', stage: '暧昧', intimacyLevel: 3 });
    expect(res.status).toBe(403);
  });

  it('更新不存在女生应返回 404', async () => {
    const res = await request(app)
      .put('/api/girls/nonexistent-id')
      .set('Authorization', `Bearer ${adminToken}`)
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

  it('admin 删除女生应成功', async () => {
    const res = await request(app)
      .delete(`/api/girls/${deleteGirlId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('operator 不能删除女生', async () => {
    const girl = await prisma.girl.create({
      data: { clientId, name: '待删除女生2' }
    });
    const res = await request(app)
      .delete(`/api/girls/${girl.id}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(403);
  });

  it('client 不能删除女生', async () => {
    const girl = await prisma.girl.create({
      data: { clientId, name: '待删除女生3' }
    });
    const res = await request(app)
      .delete(`/api/girls/${girl.id}`)
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

  it('admin 更新亲密度应成功', async () => {
    const res = await request(app)
      .post(`/api/girls/${intimacyGirlId}/intimacy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ level: 7 });
    expect(res.status).toBe(200);
    expect(res.body.girl.intimacyLevel).toBe(7);
  });

  it('operator 不能更新亲密度', async () => {
    const res = await request(app)
      .post(`/api/girls/${intimacyGirlId}/intimacy`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ level: 7 });
    expect(res.status).toBe(403);
  });
});

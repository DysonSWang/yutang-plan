/**
 * Clients 客户管理路由测试
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const JWT_SECRET = process.env.JWT_SECRET;

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
      data: { username: 'op_clients', password: await bcrypt.hash('op123', 10), role: 'operator', nickname: '操盘手' }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: { username: 'cl_clients', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '客户' }
    });
  }
  if (!admin) {
    admin = await prisma.user.create({
      data: { username: 'ad_clients', password: await bcrypt.hash('ad123', 10), role: 'admin', nickname: '管理员' }
    });
  }

  operatorId = operator.id;
  clientId = client.id;
  adminId = admin.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);
  adminToken = jwt.sign({ id: adminId, role: 'admin' }, JWT_SECRET);

  const router = require('../routes/clients');
  app = express();
  app.use(express.json());
  app.use('/api/clients', router);
});

afterAll(async () => {
  // 不清理测试客户，因为其他测试可能依赖它们
  await prisma.$disconnect();
});

describe('Clients 路由权限测试', () => {
  it('未登录应返回 401', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(401);
  });

  it('client 角色不能获取客户列表', async () => {
    const res = await request(app)
      .get('/api/clients')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/clients 客户列表', () => {
  it('operator 应能看到客户列表', async () => {
    const res = await request(app)
      .get('/api/clients')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.clients)).toBe(true);
  });

  it('admin 应能看到客户列表', async () => {
    const res = await request(app)
      .get('/api/clients')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('可按 serviceStage 过滤', async () => {
    const res = await request(app)
      .get('/api/clients?serviceStage=背调')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    for (const c of res.body.clients) {
      expect(c.serviceStage).toBe('背调');
    }
  });
});

describe('GET /api/clients/me', () => {
  it('client 获取自己信息应成功', async () => {
    const res = await request(app)
      .get('/api/clients/me')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.client.id).toBe(clientId);
    expect(res.body.client).not.toHaveProperty('password');
    expect(res.body.client).toHaveProperty('girlCount');
    expect(res.body.client).toHaveProperty('dateCount');
  });
});

describe('POST /api/clients 创建客户', () => {
  let testUsername;

  beforeAll(() => {
    testUsername = 'newclient_' + Date.now();
  });

  it('operator 创建客户应成功', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        username: testUsername,
        password: 'password123',
        nickname: '新客户',
        phone: '13900000099',
        occupation: '企业主',
        income: '100-300万'
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.client.username).toBe(testUsername);
    expect(res.body.client).not.toHaveProperty('password');
    expect(res.body.client.role).toBe('client');
  });

  it('缺少必需字段应返回 400', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ username: 'test' });
    expect(res.status).toBe(400);
  });

  it('client 不能创建客户', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ username: 'x', password: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/clients/:id 更新客户', () => {
  it('operator 更新客户应成功', async () => {
    const res = await request(app)
      .put(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ nickname: '已更新昵称', occupation: '医生' });
    expect(res.status).toBe(200);
    expect(res.body.client.nickname).toBe('已更新昵称');
    expect(res.body.client.occupation).toBe('医生');
  });

  it('client 自我更新应只允许公开字段', async () => {
    const res = await request(app)
      .put(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ nickname: '客户自改', balance: 99999 });
    expect(res.status).toBe(200);
    expect(res.body.client.nickname).toBe('客户自改');
  });

  it('client 不能修改他人信息', async () => {
    const res = await request(app)
      .put(`/api/clients/${operatorId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ nickname: 'hack' });
    expect(res.status).toBe(403);
  });

  it('更新不存在客户应返回 404', async () => {
    const res = await request(app)
      .put('/api/clients/nonexistent-id')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ nickname: 'test' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/clients/:id 删除客户', () => {
  it('operator 不能删除客户', async () => {
    const res = await request(app)
      .delete(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(403);
  });

  it('client 不能删除客户', async () => {
    const res = await request(app)
      .delete(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('admin 可删除客户', async () => {
    const bcrypt = require('bcryptjs');
    const toDelete = await prisma.user.create({
      data: { username: 'del_' + Date.now(), password: await bcrypt.hash('x', 10), role: 'client' }
    });
    const res = await request(app)
      .delete(`/api/clients/${toDelete.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/clients/:id/learnings 学习记录', () => {
  it('operator 添加学习记录应成功', async () => {
    const res = await request(app)
      .post(`/api/clients/${clientId}/learnings`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ type: 'date_tips', scene: 'first_date', content: '第一次约会要轻松，不要给压力' });
    expect(res.status).toBe(200);
    expect(res.body.learning.type).toBe('date_tips');
    expect(res.body.learning.content).toBe('第一次约会要轻松，不要给压力');
  });

  it('缺少必需字段应返回 400', async () => {
    const res = await request(app)
      .post(`/api/clients/${clientId}/learnings`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ type: 'test' });
    expect(res.status).toBe(400);
  });

  it('client 不能添加学习记录', async () => {
    const res = await request(app)
      .post(`/api/clients/${clientId}/learnings`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ type: 'test', scene: 'x', content: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/clients/:id/learnings 获取学习记录', () => {
  it('operator 获取学习记录应成功', async () => {
    const res = await request(app)
      .get(`/api/clients/${clientId}/learnings`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.learnings)).toBe(true);
  });

  it('client 不能获取学习记录', async () => {
    const res = await request(app)
      .get(`/api/clients/${clientId}/learnings`)
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });
});

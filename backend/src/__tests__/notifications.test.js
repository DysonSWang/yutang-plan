/**
 * Notifications 通知路由测试
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const JWT_SECRET = process.env.JWT_SECRET;
const mockIo = { to: () => ({ emit: () => {} }) };

let app;
let operatorToken;
let adminToken;
let clientToken;
let operatorId;
let clientId;

beforeAll(async () => {
  const bcrypt = require('bcryptjs');

  let operator = await prisma.user.findFirst({ where: { role: 'operator' } });
  let client = await prisma.user.findFirst({ where: { role: 'client' } });
  let admin = await prisma.user.findFirst({ where: { role: 'admin' } });

  if (!operator) {
    operator = await prisma.user.create({
      data: { username: 'op_notif', password: await bcrypt.hash('op123', 10), role: 'operator', nickname: '操盘手' }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: { username: 'cl_notif', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '客户' }
    });
  }
  if (!admin) {
    admin = await prisma.user.create({
      data: { username: 'admin_notif', password: await bcrypt.hash('admin123', 10), role: 'admin', nickname: '管理员' }
    });
  }

  operatorId = operator.id;
  clientId = client.id;
  operatorToken = jwt.sign({ id: operatorId, role: 'operator' }, JWT_SECRET);
  adminToken = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET);
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);

  // Admin 需要关联到 client 才能发送通知
  let adminSession = await prisma.chatSession.findUnique({
    where: { operatorId_clientId: { operatorId: admin.id, clientId } }
  });
  if (!adminSession) {
    await prisma.chatSession.create({ data: { operatorId: admin.id, clientId } });
  }

  const router = require('../routes/notifications')(mockIo);
  app = express();
  app.use(express.json());
  app.use('/api/notifications', router);
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: clientId } });
  await prisma.$disconnect();
});

describe('Notifications 路由权限测试', () => {
  it('未登录应返回 401', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('client 角色不能创建通知', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ userId: clientId, type: 'test', title: 'test', content: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/notifications 获取通知列表', () => {
  beforeAll(async () => {
    await prisma.notification.createMany({
      data: [
        { userId: clientId, type: 'test', title: '通知1', content: '内容1', isRead: false },
        { userId: clientId, type: 'test', title: '通知2', content: '内容2', isRead: true },
        { userId: clientId, type: 'test', title: '通知3', content: '内容3', isRead: false }
      ]
    });
  });

  it('应返回通知列表', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.notifications)).toBe(true);
    expect(res.body).toHaveProperty('unreadCount');
  });

  it('unreadOnly=true 应只返回未读通知', async () => {
    const res = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    for (const n of res.body.notifications) {
      expect(n.isRead).toBe(false);
    }
  });
});

describe('POST /api/notifications 创建通知', () => {
  it('operator 创建通知应成功', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: clientId, type: 'test', title: '测试通知', content: '测试内容' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.notification.userId).toBe(clientId);
    expect(res.body.notification.title).toBe('测试通知');
  });

  it('缺少必需参数应返回 400', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: clientId });
    expect(res.status).toBe(400);
  });

  it('可包含 metadata', async () => {
    const meta = { stage: 1, stageName: '背调' };
    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: clientId, type: 'progress', title: '进度更新', content: '测试', metadata: meta });
    expect(res.status).toBe(200);
    expect(res.body.notification.metadata).not.toBeNull();
  });
});

describe('POST /api/notifications/:id/read 标记已读', () => {
  let notifId;

  beforeAll(async () => {
    const n = await prisma.notification.create({
      data: { userId: clientId, type: 'test', title: '待读', content: 'test', isRead: false }
    });
    notifId = n.id;
  });

  it('标记已读应成功', async () => {
    const res = await request(app)
      .post(`/api/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.notification.isRead).toBe(true);
  });
});

describe('POST /api/notifications/read-all 标记全部已读', () => {
  beforeAll(async () => {
    await prisma.notification.createMany({
      data: [
        { userId: clientId, type: 'test', title: '未读1', content: 'c', isRead: false },
        { userId: clientId, type: 'test', title: '未读2', content: 'c', isRead: false }
      ]
    });
  });

  it('标记全部已读应成功', async () => {
    const res = await request(app)
      .post('/api/notifications/read-all')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const unread = await prisma.notification.count({
      where: { userId: clientId, isRead: false }
    });
    expect(unread).toBe(0);
  });
});

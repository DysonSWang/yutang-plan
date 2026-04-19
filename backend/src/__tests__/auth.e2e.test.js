/**
 * auth E2E 测试
 * 覆盖：/register、/login、/verify、/me
 */
const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');

const router = require('../routes/auth');
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

let app;
let uniqueId = Date.now(); // 保证并发测试不冲突

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/auth', router);
});

describe('POST /api/auth/register', () => {
  it('注册成功返回 token 和用户信息', async () => {
    const username = `user_${uniqueId}`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username, password: '12345678', nickname: '测试用户' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe(username);
    expect(res.body.user.role).toBe('client'); // 所有注册都是 client
    expect(res.body.user.nickname).toBe('测试用户');
  });

  it('密码少于8位应返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: `user_short_${uniqueId}`, password: '1234567' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('密码至少8位');
  });

  it('缺少用户名返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: '12345678' });

    expect(res.status).toBe(400);
  });

  it('用户名已存在返回 400', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: `dup_${uniqueId}`, password: '12345678' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: `dup_${uniqueId}`, password: '12345678' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('用户名已存在');
  });
});

describe('POST /api/auth/login', () => {
  it('登录成功返回 token', async () => {
    const username = `login_${uniqueId}`;
    await request(app)
      .post('/api/auth/register')
      .send({ username, password: '12345678' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username, password: '12345678' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe(username);
  });

  it('密码错误返回 401', async () => {
    const username = `wrong_${uniqueId}`;
    await request(app)
      .post('/api/auth/register')
      .send({ username, password: '12345678' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('用户名或密码错误');
  });

  it('用户不存在返回 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: `nonexist_${uniqueId}`, password: '12345678' });

    expect(res.status).toBe(401);
  });

  it('缺少字段返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: `incomplete_${uniqueId}` });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/verify', () => {
  let userToken;

  beforeAll(async () => {
    const username = `verify_${uniqueId}`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username, password: '12345678' });
    userToken = res.body.token;
  });

  it('有效 token 验证通过', async () => {
    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('client');
  });

  it('无 token 返回 401', async () => {
    const res = await request(app).get('/api/auth/verify');
    expect(res.status).toBe(401);
  });

  it('无效 token 返回 401', async () => {
    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', 'Bearer invalid_token_xyz');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  let userToken;

  beforeAll(async () => {
    const username = `me_${uniqueId}`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username, password: '12345678', phone: '13800138000' });
    userToken = res.body.token;
  });

  it('返回完整用户信息', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.phone).toBe('13800138000');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('无 token 返回 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

/**
 * upload E2E 测试
 * 覆盖：/image、/video、/audio
 */
const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

const { createTestData, cleanupData, token } = require('./fixtures');

let app;
let tokens;
let ids;

// 创建小型测试文件
const createTestFile = (name, content, mimetype) => {
  const tmpDir = '/tmp/yutang-e2e-uploads';
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const filepath = path.join(tmpDir, name);
  fs.writeFileSync(filepath, content);
  return filepath;
};

beforeAll(async () => {
  const data = await createTestData();
  ids = data;
  tokens = {
    operator: token(data.operator),
    client: token(data.client)
  };

  const router = require('../routes/upload');
  app = express();
  app.use(express.json());
  app.use('/api/upload', router);
});

afterAll(async () => {
  cleanupData();
  // 清理测试文件
  const tmpDir = '/tmp/yutang-e2e-uploads';
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('权限控制', () => {
  it('未登录返回 401', async () => {
    const file = createTestFile('test.png', Buffer.from([0x89, 0x50, 0x4E, 0x47]), 'image/png');
    const res = await request(app)
      .post('/api/upload/image')
      .attach('file', file);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/upload/image', () => {
  it('上传图片应成功', async () => {
    const file = createTestFile('test.png', Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), 'image/png');

    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .attach('file', file);

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\//);
    expect(res.body.filename).toBeDefined();
  });

  it('未上传文件返回 400', async () => {
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${tokens.operator}`);

    expect(res.status).toBe(400);
  });

  it('上传非图片文件返回 400', async () => {
    const file = createTestFile('test.txt', Buffer.from('hello'), 'text/plain');

    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .attach('file', file);

    expect(res.status).toBe(400);
  });
});

describe('POST /api/upload/video', () => {
  it('上传视频应成功', async () => {
    const file = createTestFile('test.mp4', Buffer.from('fake video'), 'video/mp4');

    const res = await request(app)
      .post('/api/upload/video')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .attach('file', file);

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\//);
  });
});

describe('POST /api/upload/audio', () => {
  it('上传音频应成功', async () => {
    const file = createTestFile('test.mp3', Buffer.from('fake audio'), 'audio/mpeg');

    const res = await request(app)
      .post('/api/upload/audio')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .attach('file', file);

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\//);
  });
});

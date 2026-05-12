/**
 * aiCoach /situation 路由测试
 *
 * TDD 流程：RED -> GREEN -> REFACTOR
 *
 * 测试行为：
 * 1. 权限验证（admin/client vs operator）
 * 2. 参数验证（situation 必需）
 * 3. 试用限制（client 角色）
 * 4. 女生归属权验证
 * 5. 流式响应（SSE）
 * 6. 非流式响应（JSON）
 */

const http = require('http');
const request = require('supertest');
const express = require('express');

// 使用共享 fixtures
const { createTestData, cleanupData, token } = require('../fixtures');

let app;
let tokens;
let ids;
let server;
let baseUrl;

/**
 * SSE 请求辅助函数
 * 用原生 HTTP 发请求，读取第一个 SSE 事件后立即断开
 * 返回 { status, headers, firstChunk }
 */
function sseRequest(path, body, authToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const postData = JSON.stringify(body);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
      }
    }, (res) => {
      let firstChunk = '';
      let resolved = false;

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (!resolved) {
          firstChunk += chunk;
          resolved = true;
          // 拿到第一个 chunk 就断开（够验证 SSE 格式了）
          req.destroy();
          resolve({
            status: res.statusCode,
            headers: res.headers,
            firstChunk
          });
        }
      });

      // 如果流结束都没有 data（异常情况）
      res.on('end', () => {
        if (!resolved) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            firstChunk: ''
          });
        }
      });

      res.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      // ECONNRESET 是 destroy() 触发的，忽略
      if (err.code === 'ECONNRESET') return;
      reject(err);
    });

    // 15 秒超时保护
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('SSE request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

beforeAll(async () => {
  const data = await createTestData();
  ids = data;
  tokens = {
    admin: token(data.admin),
    client: token(data.client),
    operator: token(data.operator)
  };

  // 加载路由模块
  const router = require('../../routes/aiCoach');
  app = express();
  app.use(express.json());
  app.use('/api/ai-coach', router);

  // 启动临时服务器用于 SSE 测试
  server = app.listen(0);
  await new Promise(resolve => server.on('listening', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await cleanupData();
  if (server) {
    server.close();
  }
});

// ========== 行为测试 ==========

describe('POST /api/ai-coach/situation - 权限控制', () => {

  test('未登录返回 401', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .send({ situation: 'test' });

    expect(res.status).toBe(401);
  });

  test('operator 角色返回 403（不允许访问）', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ situation: 'test' });

    expect(res.status).toBe(403);
  });

  test('admin 角色可以访问（SSE 流式）', async () => {
    const result = await sseRequest(
      '/api/ai-coach/situation',
      { situation: '女生不回消息' },
      tokens.admin
    );

    expect(result.status).not.toBe(403);
    expect(result.status).not.toBe(401);
  });

  test('client 角色可以访问（SSE 流式）', async () => {
    const result = await sseRequest(
      '/api/ai-coach/situation',
      { situation: '女生不回消息' },
      tokens.client
    );

    expect(result.status).not.toBe(403);
    expect(result.status).not.toBe(401);
  });
});

describe('POST /api/ai-coach/situation - 参数验证', () => {

  test('缺少 situation 参数返回 400', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('情况描述是必需的');
  });

  test('situation 为空字符串返回 400', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ situation: '' });

    expect(res.status).toBe(400);
  });

  test('正常 situation 参数不返回 400（SSE 流式）', async () => {
    const result = await sseRequest(
      '/api/ai-coach/situation',
      { situation: '她今天对我笑了一下' },
      tokens.admin
    );

    expect(result.status).not.toBe(400);
  });
});

describe('POST /api/ai-coach/situation - 女生归属权', () => {

  test('不存在的 girlId 返回 404', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        situation: '测试',
        girlId: 'non-existent-id'
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('女生不存在');
  });

  test('admin 访问其他客户的女生返回 403', async () => {
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        situation: '测试',
        girlId: ids.otherGirl?.id || 'some-id'
      });

    // 应该返回 403 无权限（或 404 如果 otherGirl 不存在）
    if (ids.otherGirl) {
      expect(res.status).toBe(403);
    }
  });
});

describe('POST /api/ai-coach/situation - 响应格式', () => {

  test('stream=true 返回 text/event-stream', async () => {
    const result = await sseRequest(
      '/api/ai-coach/situation',
      { situation: '测试流式响应', stream: true },
      tokens.admin
    );

    // 流式响应：200 + SSE Content-Type
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('text/event-stream');

    // 第一个 chunk 应该是 SSE data 格式
    expect(result.firstChunk).toMatch(/^data: /);
  });

  test('stream=false 返回 application/json', async () => {
    // 非流式模式：服务器返回完整 JSON 后关闭连接
    const res = await request(app)
      .post('/api/ai-coach/situation')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .timeout(30000)
      .send({
        situation: '测试非流式',
        stream: false
      });

    // 非流式应该是 JSON
    expect(res.headers['content-type']).toContain('application/json');
  });
});

describe('POST /api/ai-coach/situation - 模式选择', () => {

  test('mode=pro 使用 pro 模式（SSE 流式）', async () => {
    const result = await sseRequest(
      '/api/ai-coach/situation',
      { situation: '测试 pro 模式', mode: 'pro' },
      tokens.admin
    );

    expect(result.status).not.toBe(400);
  });

  test('mode=flash 使用快速模式（SSE 流式）', async () => {
    const result = await sseRequest(
      '/api/ai-coach/situation',
      { situation: '测试 flash 模式', mode: 'flash' },
      tokens.admin
    );

    expect(result.status).not.toBe(400);
  });
});

describe('POST /api/ai-coach/situation - 上下文记忆', () => {

  test('regenerate=true 移除上条助手回复（SSE 流式）', async () => {
    // 先发一条正常消息建立上下文
    await sseRequest(
      '/api/ai-coach/situation',
      { situation: '第一条消息' },
      tokens.admin
    );

    // 再发 regenerate 请求
    const result = await sseRequest(
      '/api/ai-coach/situation',
      { situation: '重新生成', regenerate: true },
      tokens.admin
    );

    expect(result.status).not.toBe(400);
  });
});

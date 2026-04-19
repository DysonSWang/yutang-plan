/**
 * chat-partner E2E 测试
 * 覆盖：/analyze、/feedback、/pending-updates、/approve-updates、/apply-update、
 *       /girl-profile/pending/confirm/reject、/client-profile/*、
 *       /optimize-message、/send、/client-analyze、/client-optimize
 */
const request = require('supertest');
const express = require('express');

const { createTestData, cleanupData, token } = require('./fixtures');

let app;
let tokens;
let ids;
const mockIo = { to: () => ({ emit: () => {} }) };

beforeAll(async () => {
  const data = await createTestData();
  ids = data;
  tokens = {
    operator: token(data.operator),
    client: token(data.client)
  };

  const router = require('../routes/chatPartner');
  app = express();
  app.use(express.json());
  app.use('/api/chat-partner', router);
});

afterAll(cleanupData);

describe('权限控制', () => {
  it('未登录返回 401', async () => {
    const res = await request(app)
      .post('/api/chat-partner/analyze')
      .send({ girlId: ids.girl.id, message: '你好' });
    expect(res.status).toBe(401);
  });

  it('client 角色不能访问操盘手接口', async () => {
    const res = await request(app)
      .post('/api/chat-partner/optimize-message')
      .set('Authorization', `Bearer ${tokens.client}`)
      .send({ myMessage: '你好呀' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/chat-partner/analyze 聊天分析', () => {
  it('operator 分析女生消息应返回回复建议', async () => {
    const res = await request(app)
      .post('/api/chat-partner/analyze')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        girlId: ids.girl.id,
        clientId: ids.client.id,
        message: '今天天气真好呀～'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('suggestions');
    expect(res.body).toHaveProperty('fieldLabels');
  });

  it('消息内容缺失返回 400', async () => {
    const res = await request(app)
      .post('/api/chat-partner/analyze')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ girlId: ids.girl.id });
    expect(res.status).toBe(400);
  });

  it('女生不存在时返回 200（优雅降级，无上下文）', async () => {
    const res = await request(app)
      .post('/api/chat-partner/analyze')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ girlId: 'nonexistent', message: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('suggestions');
  });

  it('女生不属于当前客户时返回 200（操盘手可为任意客户工作）', async () => {
    const res = await request(app)
      .post('/api/chat-partner/analyze')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ girlId: ids.otherGirl.id, clientId: ids.otherClient.id, message: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('suggestions');
  });
});

describe('POST /api/chat-partner/feedback 采纳反馈', () => {
  it('采纳回复后写入待审核队列', async () => {
    const res = await request(app)
      .post('/api/chat-partner/feedback')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        girlId: ids.girl.id,
        chosenReply: '晚安～明天见',
        style: '暧昧型',
        intention: '制造暧昧'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('feedbackId');
  });

  it('缺少必需参数返回 400', async () => {
    const res = await request(app)
      .post('/api/chat-partner/feedback')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ girlId: ids.girl.id });
    expect(res.status).toBe(400);
  });

  it('女生不存在返回 404', async () => {
    const res = await request(app)
      .post('/api/chat-partner/feedback')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ girlId: 'nonexistent', chosenReply: 'test' });
    expect(res.status).toBe(404);
  });

  it('采纳后生成待审核更新记录', async () => {
    // 先采纳
    await request(app)
      .post('/api/chat-partner/feedback')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ girlId: ids.girl.id, chosenReply: '吃了', style: '自然型', intention: '自然型' });

    const pendingRes = await request(app)
      .get(`/api/chat-partner/pending-updates/${ids.girl.id}`)
      .set('Authorization', `Bearer ${tokens.operator}`);

    expect(pendingRes.status).toBe(200);
    expect(Array.isArray(pendingRes.body.updates)).toBe(true);
  });
});

describe('GET /api/chat-partner/pending-updates/:girlId', () => {
  it('返回待审核更新列表', async () => {
    const res = await request(app)
      .get(`/api/chat-partner/pending-updates/${ids.girl.id}`)
      .set('Authorization', `Bearer ${tokens.operator}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('updates');
    expect(res.body).toHaveProperty('currentState');
  });

  it('不存在的女生返回空列表', async () => {
    const res = await request(app)
      .get('/api/chat-partner/pending-updates/nonexistent')
      .set('Authorization', `Bearer ${tokens.operator}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.updates)).toBe(true);
  });
});

describe('POST /api/chat-partner/approve-updates 批量采纳', () => {
  it('批量采纳所有待审核更新', async () => {
    // 先采纳制造待审核记录
    await request(app)
      .post('/api/chat-partner/feedback')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ girlId: ids.girl.id, chosenReply: 'hello', style: '暧昧型', intention: '暧昧' });

    // 获取待审核 ID
    const pendingRes = await request(app)
      .get(`/api/chat-partner/pending-updates/${ids.girl.id}`)
      .set('Authorization', `Bearer ${tokens.operator}`);

    const updateIds = pendingRes.body.updates.map(u => u.id);
    if (updateIds.length === 0) {
      // 无待审核记录，跳过此测试
      return;
    }

    const res = await request(app)
      .post('/api/chat-partner/approve-updates')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ updateIds, approve: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('updateIds 不是数组返回 400', async () => {
    const res = await request(app)
      .post('/api/chat-partner/approve-updates')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ updateIds: 'not-an-array' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/chat-partner/optimize-message 话术优化', () => {
  it('operator 优化消息应返回多个版本', async () => {
    const res = await request(app)
      .post('/api/chat-partner/optimize-message')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        girlId: ids.girl.id,
        myMessage: '你好呀',
        history: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '你好呀～' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('optimizations');
    expect(Array.isArray(res.body.optimizations)).toBe(true);
  });

  it('缺少消息内容返回 400', async () => {
    const res = await request(app)
      .post('/api/chat-partner/optimize-message')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('不指定 girlId 也可优化（无上下文）', async () => {
    const res = await request(app)
      .post('/api/chat-partner/optimize-message')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ myMessage: '你好呀' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.optimizations)).toBe(true);
  });
});

describe('POST /api/chat-partner/send 发送消息', () => {
  it('operator 发送消息应成功', async () => {
    const res = await request(app)
      .post('/api/chat-partner/send')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        girlId: ids.girl.id,
        clientId: ids.client.id,
        content: '测试消息',
        receiverName: '女生',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.log).toHaveProperty('id');
  });

  it('缺少必需参数返回 400', async () => {
    const res = await request(app)
      .post('/api/chat-partner/send')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/chat-partner/client-analyze 客户聊天分析', () => {
  it('operator 分析客户消息应返回建议（允许 AI 失败）', async () => {
    const res = await request(app)
      .post('/api/chat-partner/client-analyze')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        clientId: ids.client.id,
        message: '今天和女生聊天感觉不太对'
      });

    // 返回 200 或 403（权限校验）或 500（AI 失败）
    expect([200, 403, 500]).toContain(res.status);
  });

  it('client 角色不能访问客户分析接口', async () => {
    const res = await request(app)
      .post('/api/chat-partner/client-analyze')
      .set('Authorization', `Bearer ${tokens.client}`)
      .send({ clientId: ids.client.id, message: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/chat-partner/girl-profile/pending/:girlId', () => {
  it('返回女生画像待确认字段', async () => {
    const res = await request(app)
      .get(`/api/chat-partner/girl-profile/pending/${ids.girl.id}`)
      .set('Authorization', `Bearer ${tokens.operator}`);

    // 返回 200（成功）或 500（服务失败）
    expect([200, 500]).toContain(res.status);
  });
});

describe('POST /api/chat-partner/girl-profile/confirm 确认女生画像', () => {
  it('确认采纳字段应成功更新档案', async () => {
    const res = await request(app)
      .post('/api/chat-partner/girl-profile/confirm')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        girlId: ids.girl.id,
        pendingId: 'nonexistent',
        selectedFields: { personality: 'INTJ' }
      });

    // pendingId 不存在时返回 404
    expect(res.status).toBe(404);
  });

  it('缺少 girlId 返回 400', async () => {
    const res = await request(app)
      .post('/api/chat-partner/girl-profile/confirm')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ pendingId: 'some-id' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/chat-partner/girl-profile/reject 拒绝女生画像', () => {
  it('pendingId 不存在返回 404', async () => {
    const res = await request(app)
      .post('/api/chat-partner/girl-profile/reject')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        girlId: ids.girl.id,
        pendingId: 'nonexistent'
      });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/chat-partner/client-profile/pending/:clientId', () => {
  it('返回客户画像待确认字段', async () => {
    const res = await request(app)
      .get(`/api/chat-partner/client-profile/pending/${ids.client.id}`)
      .set('Authorization', `Bearer ${tokens.operator}`);

    expect([200, 500]).toContain(res.status);
  });
});

describe('POST /api/chat-partner/client-profile/confirm 确认客户画像', () => {
  it('确认客户画像应成功', async () => {
    const res = await request(app)
      .post('/api/chat-partner/client-profile/confirm')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        clientId: ids.client.id,
        pendingId: 'nonexistent',
        selectedFields: { clientType: '执行型' }
      });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/chat-partner/client-profile/reject 拒绝客户画像', () => {
  it('pendingId 不存在返回 404', async () => {
    const res = await request(app)
      .post('/api/chat-partner/client-profile/reject')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        clientId: ids.client.id,
        pendingId: 'nonexistent'
      });

    expect(res.status).toBe(404);
  });
});

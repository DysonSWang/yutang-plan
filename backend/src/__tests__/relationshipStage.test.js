/**
 * 关系阶段感知测试 - M007 S01
 *
 * 覆盖: relationshipStage.js + stageGuard.js + 相关路由端点
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
  let operator = await prisma.user.findUnique({ where: { username: 'op_stage_test' } });
  let client = await prisma.user.findUnique({ where: { username: 'cl_stage_test' } });

  if (!operator) {
    operator = await prisma.user.create({
      data: { username: 'op_stage_test', password: await bcrypt.hash('op123', 10), role: 'operator', nickname: '阶段测试操盘手' }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: { username: 'cl_stage_test', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '阶段测试客户' }
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

  let girl = await prisma.girl.findFirst({ where: { clientId, name: '阶段测试女生' } });
  if (!girl) {
    girl = await prisma.girl.create({
      data: {
        clientId,
        name: '阶段测试女生',
        stage: '聊天',
        tensionScore: 7,
        signals: JSON.stringify([{ date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), event: '聊天正常', type: 'positive' }]),
        observations: JSON.stringify([]),
        pendingActions: JSON.stringify([]),
        relationshipStage: 'EXPLORATION',
        relationshipStageUpdatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      }
    });
  }
  girlId = girl.id;

  const router = require('../routes/girls');
  app = express();
  app.use(express.json());
  app.use('/api/girls', router);
});

afterAll(async () => {
  // 清理测试女生阶段历史
  await prisma.relationshipStageHistory.deleteMany({
    where: { girlId }
  });
  await prisma.girl.deleteMany({ where: { clientId } });
  await prisma.chatSession.deleteMany({ where: { operatorId } });
  await prisma.user.deleteMany({ where: { username: { in: ['op_stage_test', 'cl_stage_test'] } } });
  await prisma.$disconnect();
});

// ========================================================================
// stageGuard.js 单元测试
// ========================================================================

describe('stageGuard 单元测试', () => {
  const {
    addStageContext,
    validateRecommendation,
    appendStageWarning,
    getStageColor,
    STAGE_DESCRIPTIONS,
    STAGE_ADVICE_BY_STAGE
  } = require('../services/stageGuard');

  it('STAGE_DESCRIPTIONS 包含5个阶段的描述', () => {
    expect(Object.keys(STAGE_DESCRIPTIONS)).toHaveLength(5);
    expect(STAGE_DESCRIPTIONS).toHaveProperty('EXPLORATION');
    expect(STAGE_DESCRIPTIONS).toHaveProperty('FLIRTING');
    expect(STAGE_DESCRIPTIONS).toHaveProperty('ADVANCEMENT');
    expect(STAGE_DESCRIPTIONS).toHaveProperty('CONFIRMATION');
    expect(STAGE_DESCRIPTIONS).toHaveProperty('STABLE');
  });

  it('STAGE_ADVICE_BY_STAGE 每个阶段都有建议列表', () => {
    for (const stage of Object.keys(STAGE_DESCRIPTIONS)) {
      expect(Array.isArray(STAGE_ADVICE_BY_STAGE[stage])).toBe(true);
      expect(STAGE_ADVICE_BY_STAGE[stage].length).toBeGreaterThan(0);
    }
  });

  it('addStageContext: 无阶段时返回空字符串', () => {
    const result = addStageContext(null);
    expect(result).toBe('');
    const result2 = addStageContext('');
    expect(result2).toBe('');
    const result3 = addStageContext('INVALID_STAGE');
    expect(result3).toBe('');
  });

  it('addStageContext: EXPLORATION 阶段正确生成约束文本', () => {
    const result = addStageContext('EXPLORATION');
    expect(result).toContain('探索期');
    expect(result).toContain('【关系阶段约束】');
    expect(result).toContain('不要急于表白');
  });

  it('addStageContext: FLIRTING 阶段约束文本', () => {
    const result = addStageContext('FLIRTING');
    expect(result).toContain('暧昧期');
    expect(result).toContain('可以适当调情');
    expect(result).toContain('不要用力过猛');
  });

  it('addStageContext: ADVANCEMENT 阶段约束文本', () => {
    const result = addStageContext('ADVANCEMENT');
    expect(result).toContain('推进期');
    expect(result).toContain('增加约会频率');
    expect(result).toContain('准备好表白');
  });

  it('addStageContext: CONFIRMATION 阶段约束文本', () => {
    const result = addStageContext('CONFIRMATION');
    expect(result).toContain('确认期');
    expect(result).toContain('正式表白');
  });

  it('addStageContext: STABLE 阶段约束文本', () => {
    const result = addStageContext('STABLE');
    expect(result).toContain('稳定期');
    expect(result).toContain('关系已经确立');
  });

  it('addStageContext: 支持额外上下文参数', () => {
    const result = addStageContext('EXPLORATION', '用户当前情绪：积极');
    expect(result).toContain('用户当前情绪：积极');
  });

  it('getStageColor: 各阶段返回正确颜色', () => {
    expect(getStageColor('EXPLORATION')).toBe('gray');
    expect(getStageColor('FLIRTING')).toBe('pink');
    expect(getStageColor('ADVANCEMENT')).toBe('orange');
    expect(getStageColor('CONFIRMATION')).toBe('green');
    expect(getStageColor('STABLE')).toBe('blue');
    expect(getStageColor('INVALID')).toBe('gray');
  });

  it('validateRecommendation: EXPLORATION 阶段不应出现表白关键词', () => {
    const result = validateRecommendation('你应该尽快表白确认关系', 'EXPLORATION');
    expect(result.isAppropriate).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('阶段警告');
  });

  it('validateRecommendation: FLIRTING 阶段不应出现表白关键词', () => {
    const result = validateRecommendation('现在表白是最好的时机', 'FLIRTING');
    expect(result.isAppropriate).toBe(false);
    expect(result.warnings.some(w => w.includes('表白'))).toBe(true);
  });

  it('validateRecommendation: STABLE 阶段不限制表白关键词', () => {
    const result = validateRecommendation('你们应该确认正式交往关系', 'STABLE');
    expect(result.isAppropriate).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('validateRecommendation: CONFIRMATION 阶段不限制牵手/接吻', () => {
    const result = validateRecommendation('约会有机会可以牵手', 'CONFIRMATION');
    expect(result.isAppropriate).toBe(true);
  });

  it('validateRecommendation: EXPLORATION 阶段限制牵手/接吻/亲密', () => {
    const result = validateRecommendation('约会时可以牵手试试', 'EXPLORATION');
    expect(result.isAppropriate).toBe(false);
    expect(result.warnings.some(w => w.includes('牵手'))).toBe(true);
  });

  it('validateRecommendation: ADVANCEMENT 阶段不限制牵手', () => {
    const result = validateRecommendation('约会中牵手是正常的', 'ADVANCEMENT');
    expect(result.isAppropriate).toBe(true);
  });

  it('validateRecommendation: ADVANCEMENT 阶段限制订婚/结婚', () => {
    const result = validateRecommendation('你们可以考虑结婚了', 'ADVANCEMENT');
    expect(result.isAppropriate).toBe(false);
    expect(result.warnings.some(w => w.includes('结婚'))).toBe(true);
  });

  it('validateRecommendation: CONFIRMATION 阶段限制订婚/结婚/同居', () => {
    const result = validateRecommendation('可以开始讨论订婚计划', 'CONFIRMATION');
    expect(result.isAppropriate).toBe(false);
  });

  it('validateRecommendation: 无阶段时返回 isAppropriate=true', () => {
    expect(validateRecommendation('任何建议', null).isAppropriate).toBe(true);
    expect(validateRecommendation('任何建议', '').isAppropriate).toBe(true);
  });

  it('validateRecommendation: 大小写不敏感', () => {
    const result = validateRecommendation('应该 表白 确认关系', 'EXPLORATION');
    expect(result.isAppropriate).toBe(false);
  });

  it('validateRecommendation: 返回阶段信息', () => {
    const result = validateRecommendation('建议内容', 'FLIRTING');
    expect(result.currentStage).toBe('FLIRTING');
    expect(result.currentStageLabel).toBe('暧昧期');
  });

  it('appendStageWarning: 无关阶段警告时原样返回', () => {
    const ai = '继续保持聊天频率即可';
    const result = appendStageWarning(ai, 'EXPLORATION');
    expect(result).toBe(ai);
  });

  it('appendStageWarning: 有阶段警告时追加警告文本', () => {
    const ai = '建议你尽快表白';
    const result = appendStageWarning(ai, 'EXPLORATION');
    expect(result).toBe(ai + '\n\n---\n' + result.split('\n\n---\n')[1]);
    expect(result).toContain('阶段警告');
  });

  it('appendStageWarning: 无阶段时原样返回', () => {
    const ai = '建议持续推进';
    expect(appendStageWarning(ai, null)).toBe(ai);
    expect(appendStageWarning(ai, '')).toBe(ai);
  });
});

// ========================================================================
// relationshipStage.js 单元测试
// ========================================================================

describe('relationshipStage 单元测试', () => {
  const {
    VALID_STAGES,
    STAGE_LABELS,
    STAGE_ORDER,
    setRelationshipStage,
    getStageHistory,
    buildStageContext
  } = require('../services/relationshipStage');

  it('VALID_STAGES 包含全部5个阶段', () => {
    expect(VALID_STAGES).toHaveLength(5);
    expect(VALID_STAGES).toContain('EXPLORATION');
    expect(VALID_STAGES).toContain('FLIRTING');
    expect(VALID_STAGES).toContain('ADVANCEMENT');
    expect(VALID_STAGES).toContain('CONFIRMATION');
    expect(VALID_STAGES).toContain('STABLE');
  });

  it('STAGE_LABELS 各阶段有中文标签', () => {
    expect(STAGE_LABELS['EXPLORATION']).toBe('探索期');
    expect(STAGE_LABELS['FLIRTING']).toBe('暧昧期');
    expect(STAGE_LABELS['ADVANCEMENT']).toBe('推进期');
    expect(STAGE_LABELS['CONFIRMATION']).toBe('确认期');
    expect(STAGE_LABELS['STABLE']).toBe('稳定期');
  });

  it('STAGE_ORDER 各阶段有正确的顺序值', () => {
    expect(STAGE_ORDER['EXPLORATION']).toBe(1);
    expect(STAGE_ORDER['FLIRTING']).toBe(2);
    expect(STAGE_ORDER['ADVANCEMENT']).toBe(3);
    expect(STAGE_ORDER['CONFIRMATION']).toBe(4);
    expect(STAGE_ORDER['STABLE']).toBe(5);
  });

  it('setRelationshipStage: 无效阶段值抛出错误', async () => {
    await expect(setRelationshipStage(girlId, 'INVALID', 'test', operatorId))
      .rejects.toThrow('无效阶段值');
  });

  it('setRelationshipStage: 不存在的女生抛出错误', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001';
    await expect(setRelationshipStage(fakeId, 'EXPLORATION', 'test', operatorId))
      .rejects.toThrow('女生不存在');
  });

  it('setRelationshipStage: 写入 DB 并记录历史', async () => {
    const result = await setRelationshipStage(girlId, 'FLIRTING', '测试设置阶段', operatorId, 'manual');

    expect(result).toHaveProperty('girl');
    expect(result.girl.relationshipStage).toBe('FLIRTING');
    expect(result.fromStage).toBe('EXPLORATION');
    expect(result.toStage).toBe('FLIRTING');
    expect(result.toStageLabel).toBe('暧昧期');

    // 验证历史记录
    const history = await prisma.relationshipStageHistory.findMany({
      where: { girlId }
    });
    expect(history.length).toBeGreaterThan(0);
    const latest = history.find(h => h.toStage === 'FLIRTING');
    expect(latest).toBeDefined();
    expect(latest.source).toBe('manual');
    expect(latest.changedBy).toBe(operatorId);
  });

  it('setRelationshipStage: ai_evaluate 来源正确', async () => {
    const result = await setRelationshipStage(girlId, 'ADVANCEMENT', 'AI评估建议', operatorId, 'ai_evaluate');
    expect(result.girl.relationshipStage).toBe('ADVANCEMENT');

    const history = await prisma.relationshipStageHistory.findFirst({
      where: { girlId, toStage: 'ADVANCEMENT' }
    });
    expect(history.source).toBe('ai_evaluate');
  });

  it('getStageHistory: 返回历史记录列表', async () => {
    const history = await getStageHistory(girlId);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);

    // 最新记录应该在最前
    const latest = history[0];
    expect(latest).toHaveProperty('fromStage');
    expect(latest).toHaveProperty('toStage');
    expect(latest).toHaveProperty('toStageLabel');
    expect(latest).toHaveProperty('reason');
    expect(latest).toHaveProperty('source');
    expect(latest).toHaveProperty('createdAt');
  });

  it('buildStageContext: 返回完整上下文对象', async () => {
    const ctx = await buildStageContext(girlId);
    expect(ctx).not.toBeNull();
    expect(ctx).toHaveProperty('girl');
    expect(ctx.girl.id).toBe(girlId);
    expect(ctx.girl.name).toBe('阶段测试女生');
    expect(ctx.girl.relationshipStage).toBe('ADVANCEMENT'); // 上一个测试设置为ADVANCEMENT
    expect(ctx).toHaveProperty('chatSummary');
    expect(ctx).toHaveProperty('dateSummary');
    expect(ctx).toHaveProperty('eventSummary');
    expect(ctx).toHaveProperty('stats');
    expect(ctx.stats).toHaveProperty('chatLogCount');
    expect(ctx.stats).toHaveProperty('signalCount');
    expect(ctx.stats).toHaveProperty('lastContactHoursAgo');
  });

  it('buildStageContext: 不存在的女生返回 null', async () => {
    const ctx = await buildStageContext('00000000-0000-0000-0000-000000000001');
    expect(ctx).toBeNull();
  });

  it('buildStageContext: signals 解析正确', async () => {
    const ctx = await buildStageContext(girlId);
    // signals 应该是解析后的数组
    expect(Array.isArray(ctx.girl.signals)).toBe(true);
  });
});

// ========================================================================
// 路由端点集成测试
// ========================================================================

describe('关系阶段路由端点集成测试', () => {
  it('未登录应返回 401', async () => {
    const res = await request(app).get(`/api/girls/${girlId}/stage-history`);
    expect(res.status).toBe(401);
  });

  it('client 角色能访问自己女生的阶段历史（无 role 限制）', async () => {
    const res = await request(app)
      .get(`/api/girls/${girlId}/stage-history`)
      .set('Authorization', `Bearer ${clientToken}`);
    // 阶段历史端点无 role 限制，client 可以访问自己的女生数据
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.history)).toBe(true);
  });

  it('client 角色不能评估阶段', async () => {
    const res = await request(app)
      .post(`/api/girls/${girlId}/evaluate-stage`)
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('client 角色不能设置阶段', async () => {
    const res = await request(app)
      .put(`/api/girls/${girlId}/relationship-stage`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ stage: 'FLIRTING', reason: '测试' });
    expect(res.status).toBe(403);
  });

  it('GET /api/girls/:id/stage-history 返回历史记录', async () => {
    const res = await request(app)
      .get(`/api/girls/${girlId}/stage-history`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBeGreaterThan(0);
  });

  it('POST /api/girls/:id/evaluate-stage: AI 未配置时返回错误', async () => {
    const res = await request(app)
      .post(`/api/girls/${girlId}/evaluate-stage`)
      .set('Authorization', `Bearer ${operatorToken}`);
    // AI 未配置时应返回 500（无 API key）
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.evaluation).toHaveProperty('recommendedStage');
      expect(res.body.validStages).toHaveLength(5);
    } else {
      expect(res.body).toHaveProperty('error');
    }
  });

  it('PUT /api/girls/:id/relationship-stage: 成功设置阶段', async () => {
    const res = await request(app)
      .put(`/api/girls/${girlId}/relationship-stage`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ stage: 'STABLE', reason: '关系确认', source: 'manual' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.girl.relationshipStage).toBe('STABLE');
    expect(res.body.toStageLabel).toBe('稳定期');
  });

  it('PUT /api/girls/:id/relationship-stage: 无效阶段返回 400', async () => {
    const res = await request(app)
      .put(`/api/girls/${girlId}/relationship-stage`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ stage: 'INVALID_STAGE' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('无效阶段值');
  });

  it('PUT /api/girls/:id/relationship-stage: 缺少 stage 参数返回 400', async () => {
    const res = await request(app)
      .put(`/api/girls/${girlId}/relationship-stage`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('stage 是必需的');
  });

  it('PUT /api/girls/:id/relationship-stage: 无权访问其他客户女生返回 403', async () => {
    // 先创建一个其他客户的女生
    const otherClient = await prisma.user.create({
      data: { username: 'cl_other_stage_test', password: await bcrypt.hash('cl123', 10), role: 'client', nickname: '其他客户阶段' }
    });
    const otherGirl = await prisma.girl.create({
      data: { clientId: otherClient.id, name: '其他客户女生阶段', stage: '聊天', relationshipStage: 'EXPLORATION' }
    });

    const res = await request(app)
      .put(`/api/girls/${otherGirl.id}/relationship-stage`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ stage: 'FLIRTING' });

    await prisma.girl.delete({ where: { id: otherGirl.id } });
    await prisma.user.delete({ where: { id: otherClient.id } });

    expect(res.status).toBe(403);
  });

  it('stageHistory 包含 fromStage 和 toStage 标签', async () => {
    const res = await request(app)
      .get(`/api/girls/${girlId}/stage-history`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    const history = res.body.history;
    const latest = history[0];
    expect(latest).toHaveProperty('fromStageLabel');
    expect(latest).toHaveProperty('toStageLabel');
  });
});
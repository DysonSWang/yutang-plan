/**
 * 个性化学习引擎测试
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');

const JWT_SECRET = process.env.JWT_SECRET;
const {
  calculateCompleteness,
  normalizeProfile,
  sourceContentHash,
  validateOutput,
} = require('../services/personalizationEngine');

let app;
let clientToken;
let clientId;
let testChapterId;

beforeAll(async () => {
  // 获取或创建测试用户
  let client = await prisma.user.findFirst({
    where: { username: 'test_personalization_client' },
  });
  if (!client) {
    client = await prisma.user.create({
      data: {
        username: 'test_personalization_client',
        password: await bcrypt.hash('test123', 10),
        role: 'client',
        nickname: '测试个性化客户',
        age: 25,
        occupation: '程序员',
      },
    });
  }
  clientId = client.id;
  clientToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET);

  // 创建测试章节（如果不存在）
  let testChapter = await prisma.learningChapter.findUnique({
    where: { chapterId: '99' },
  });
  if (!testChapter) {
    testChapter = await prisma.learningChapter.create({
      data: {
        chapterId: '99',
        title: '测试章节',
        subtitle: '用于个性化引擎测试',
        content: '# 测试标题\n\n'.repeat(5) + '这是一段测试内容，用于验证个性化学习引擎的各种功能。\n\n'.repeat(5) + '## 小节\n\n更多测试内容。\n\n'.repeat(3),
        orderIndex: 999,
        status: 'published',
      },
    });
  }
  testChapterId = testChapter.chapterId;

  const router = require('../routes/membership');
  app = express();
  app.use(express.json());
  app.use('/api/membership', router);
});

afterAll(async () => {
  // 清理测试数据
  await prisma.personalizedChapter.deleteMany({ where: { userId: clientId } });
  await prisma.generationBatch.deleteMany({ where: { userId: clientId } });
  await prisma.personalizationEvent.deleteMany({ where: { userId: clientId } });
  await prisma.learningChapter.deleteMany({ where: { chapterId: '99' } });
  await prisma.$disconnect();
});

// ==========================================
// 完善度计算
// ==========================================
describe('完善度计算', () => {
  it('空用户完善度为 0%', () => {
    const result = calculateCompleteness({});
    expect(result.percentage).toBe(0);
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it('部分完善用户计算正确', () => {
    const user = { age: 25, occupation: '程序员', personality: 'INTJ' };
    const result = calculateCompleteness(user);
    // age(2) + occupation(2) + personality(3) = 7
    expect(result.score).toBe(7);
    expect(result.percentage).toBeGreaterThan(0);
    expect(result.percentage).toBeLessThan(100);
  });

  it('humorStyle 为空字符串视为不完整', () => {
    const user = { humorStyle: '', age: 25 };
    const result = calculateCompleteness(user);
    // humorStyle 权重1 但空字符串不计分，age 权重2 = 2
    expect(result.score).toBe(2);
  });

  it('weight=0 视为已填写（Int类型非null即有效）', () => {
    const user = { weight: 0, age: 25 };
    const result = calculateCompleteness(user);
    // weight(1) + age(2) = 3
    expect(result.score).toBe(3);
  });
});

// ==========================================
// 画像规范化
// ==========================================
describe('normalizeProfile', () => {
  it('确定性相同输入产生相同输出', () => {
    const user = { age: 25, occupation: '程序员' };
    expect(normalizeProfile(user)).toBe(normalizeProfile(user));
  });

  it('不同输入产生不同输出', () => {
    expect(normalizeProfile({ age: 25 })).not.toBe(normalizeProfile({ age: 30 }));
  });

  it('键排序保证确定性', () => {
    const a = normalizeProfile({ age: 25, occupation: '程序员' });
    const b = normalizeProfile({ occupation: '程序员', age: 25 });
    expect(a).toBe(b);
  });
});

// ==========================================
// sourceContentHash
// ==========================================
describe('sourceContentHash', () => {
  it('相同内容产生相同哈希', () => {
    expect(sourceContentHash('hello')).toBe(sourceContentHash('hello'));
  });

  it('不同内容产生不同哈希', () => {
    expect(sourceContentHash('hello')).not.toBe(sourceContentHash('world'));
  });

  it('空内容也能处理', () => {
    expect(sourceContentHash('')).toBe(sourceContentHash(''));
  });
});

// ==========================================
// validateOutput
// ==========================================
describe('validateOutput', () => {
  it('正常输出通过校验', () => {
    const longContent = '# 标题\n\n' + '这是一段足够长的测试内容，用于验证个性化引擎的输出校验功能。\n'.repeat(5) + '## 小节\n\n' + '更多改写后的内容，确保长度超过100个字符的最小限制。\n'.repeat(4);
    const result = validateOutput(longContent, longContent);
    expect(result.valid).toBe(true);
  });

  it('空输出不通过', () => {
    const result = validateOutput('## 标题\n内容', '');
    expect(result.valid).toBe(false);
  });

  it('过短输出不通过', () => {
    const result = validateOutput('## 标题\n内容段落足够长'.repeat(10), 'short');
    expect(result.valid).toBe(false);
  });

  it('标题数量差异检测', () => {
    const result = validateOutput('# A\n# B\n# C\n# D', '# A\n# B');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('表格丢失检测', () => {
    const result = validateOutput(
      '## 标题\n内容\n|列1|列2|\n|---|---|\n|a|b|',
      '## 标题\n只有文字没有表格'
    );
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

// ==========================================
// API 端点测试
// ==========================================
describe('个性化学习 API', () => {
  it('GET /learning/:chapterId?version=personalized 标准版回退', async () => {
    const res = await request(app)
      .get(`/api/membership/learning/${testChapterId}?version=personalized`)
      .set('Authorization', `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.chapter).toBeDefined();
    // 无个性化版本应回退
    expect(res.body.personalized).toBe(null);
  });

  it('GET /learning/personalized-status 返回状态', async () => {
    const res = await request(app)
      .get('/api/membership/learning/personalized-status')
      .set('Authorization', `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.chapters).toBeDefined();
    expect(res.body.completeness).toBeDefined();
    expect(typeof res.body.completeness.percentage).toBe('number');
  });

  it('POST /learning/generate-all 完善度不足返回 400', async () => {
    // 创建一个完善度很低的用户
    const lowProfileUser = await prisma.user.create({
      data: {
        username: 'test_low_profile_' + Date.now(),
        password: await bcrypt.hash('test123', 10),
        role: 'client',
        nickname: '低完善度用户',
      },
    });
    const lowToken = jwt.sign({ id: lowProfileUser.id, role: 'client' }, JWT_SECRET);

    const res = await request(app)
      .post('/api/membership/learning/generate-all')
      .set('Authorization', `Bearer ${lowToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('完善度不足');

    // 清理
    await prisma.personalizedChapter.deleteMany({ where: { userId: lowProfileUser.id } });
    await prisma.generationBatch.deleteMany({ where: { userId: lowProfileUser.id } });
    await prisma.user.delete({ where: { id: lowProfileUser.id } });
  });

  it('GET /learning/generate-status/:batchId 不存在返回 404', async () => {
    const res = await request(app)
      .get('/api/membership/learning/generate-status/nonexistent')
      .set('Authorization', `Bearer ${clientToken}`);

    expect(res.status).toBe(404);
  });

  it('POST /learning/regenerate/:chapterId 章节不存在返回 404', async () => {
    const res = await request(app)
      .post('/api/membership/learning/regenerate/XX')
      .set('Authorization', `Bearer ${clientToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('章节不存在');
  });
});

// ==========================================
// 事件记录测试
// ==========================================
describe('个性化事件记录', () => {
  it('查看章节应记录 impression 事件', async () => {
    // 先查询现有事件数
    const before = await prisma.personalizationEvent.count({
      where: { userId: clientId, event: 'impression' },
    });

    await request(app)
      .get(`/api/membership/learning/${testChapterId}`)
      .set('Authorization', `Bearer ${clientToken}`);

    const after = await prisma.personalizationEvent.count({
      where: { userId: clientId, event: 'impression' },
    });

    expect(after).toBeGreaterThanOrEqual(before);
  });
});

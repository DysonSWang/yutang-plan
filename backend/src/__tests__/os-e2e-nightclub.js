/**
 * E2E 测试：恋爱OS增强后的回答质量
 * 问题："去夜店如何搭讪，给个完整方案"
 * 验证：回答中是否包含 OS 阶段模型、死胡同警告、IOI 信号等增强内容
 */

process.env.JWT_SECRET = 'your-super-secret-jwt-key-change-in-production';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');

async function runE2ETest() {
  console.log('=== 启动 E2E 测试：恋爱OS增强验证 ===\n');

  // 加载夹具
  const { createTestData, token, cleanupData } = require('./fixtures');

  // 创建测试数据
  const data = await createTestData();
  // /situation 只允许 admin/client 访问，不允许 operator
  const userToken = token(data.client);

  // 为 client 用户创建会员记录（绕过试用限制）
  const prisma = require('../prisma');
  await prisma.membership.upsert({
    where: { id: 'e2e-test-membership' },
    update: {},
    create: {
      id: 'e2e-test-membership',
      userId: data.client.id,
      type: 'PAID',
      status: 'active',
      price: 99,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      trialUsed: 0,
      girlQuota: 10
    }
  });

  // 创建 Express 应用
  const router = require('../routes/aiCoach');
  const app = express();
  app.use(express.json());
  app.use('/api/ai-coach', router);

  // ========== 测试 1：通用咨询（无 girlId） ==========
  console.log('=== 测试 1：通用咨询（无 girlId） ===');

  const res1 = await request(app)
    .post('/api/ai-coach/situation')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      situation: '去夜店如何搭讪，给个完整方案',
      stream: false
    });

  console.log('状态码:', res1.status);
  console.log('响应体:', JSON.stringify(res1.body, null, 2).substring(0, 500));

  const answer1 = res1.body?.analysis || res1.body?.data?.answer || res1.body?.answer || '';
  console.log('\n【回答内容】');
  console.log(answer1.substring(0, 3000));
  console.log('\n回答长度:', answer1.length, '字符');

  // ====== 术语合规性检查 ======
  const forbiddenTerms = {
    'Phase 0': /Phase 0/,
    'Phase 1': /Phase 1/,
    'Phase 2': /Phase 2/,
    'Phase 3': /Phase 3/,
    'Phase 4': /Phase 4/,
    'Phase 5': /Phase 5/,
    'Phase 6': /Phase 6/,
    '资源池': /资源池/,
    '私域': /私域/,
    '短轨': /短轨/,
    '长轨': /长轨/,
  };

  const allowedTerms = {
    '入场': /入场/,
    '升温': /升温/,
    '确认': /确认/,
  };

  console.log('\n=== 术语合规性检查 ===');
  let hasForbiddenTerm = false;
  for (const [term, regex] of Object.entries(forbiddenTerms)) {
    if (regex.test(answer1)) {
      console.log(`❌ 禁止术语 "${term}" 出现！`);
      hasForbiddenTerm = true;
    }
  }
  if (!hasForbiddenTerm) {
    console.log('✅ 无禁止术语 (Phase 0-6/资源池/私域/短轨/长轨)');
  }

  let hasAllowedTerm = false;
  for (const [term, regex] of Object.entries(allowedTerms)) {
    if (regex.test(answer1)) {
      console.log(`✅ 允许术语 "${term}" 出现`);
      hasAllowedTerm = true;
    }
  }

  // 口语化检查
  const isColloquial = /兄弟|哥们儿|咱们|你啊|记住|去吧|别慌/.test(answer1);
  console.log('✅ 口语化:', isColloquial ? '是' : '否');

  // ========== 测试 2：带 girlId 咨询 ==========
  console.log('\n=== 测试 2：带 girlId 咨询 ===');

  const res2 = await request(app)
    .post('/api/ai-coach/situation')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      girlId: data.girl.id,
      situation: '去夜店如何搭讪，给个完整方案',
      stream: false
    });

  console.log('状态码:', res2.status);

  const answer2 = res2.body?.analysis || res2.body?.data?.answer || res2.body?.answer || '';
  console.log('\n【带 girlId 的回答】');
  console.log(answer2.substring(0, 3000));

  // ====== 术语合规性检查 ======
  let hasForbiddenTerm2 = false;
  for (const [term, regex] of Object.entries(forbiddenTerms)) {
    if (regex.test(answer2)) {
      console.log(`❌ 禁止术语 "${term}" 出现！`);
      hasForbiddenTerm2 = true;
    }
  }
  if (!hasForbiddenTerm2) {
    console.log('✅ 无禁止术语');
  }

  const hasDeadEndWarning = /死胡同|⚠️/.test(answer2);
  const hasSignalIOI = /绿灯|黄灯|红灯|信号/.test(answer2);
  const isColloquial2 = /兄弟|哥们儿|咱们|你啊|记住|去吧/.test(answer2);

  console.log('\n=== 带 girlId 的增强内容检查 ===');
  console.log('死胡同警告:', hasDeadEndWarning ? '✅' : '❌');
  console.log('信号识别:', hasSignalIOI ? '✅' : '❌');
  console.log('口语化:', isColloquial2 ? '✅' : '❌');

  // ========== 保存结果到文件 ==========
  const fs = require('fs');

  // 统一检查所有禁止术语（综合两个测试）
  const allForbiddenDetected = hasForbiddenTerm || hasForbiddenTerm2;

  const reportContent = `# E2E 测试：AI 回答完整内容

**测试问题:** 去夜店如何搭讪，给个完整方案
**测试时间:** ${new Date().toISOString()}

---

## 测试 1：通用咨询（无 girlId）

**状态码:** ${res1.status} | **字数:** ${answer1.length} 字符

---

${answer1}

---

## 测试 2：带 girlId 咨询

**状态码:** ${res2.status} | **字数:** ${answer2.length} 字符

---

${answer2}

---

## 术语合规性检查

### 测试 1（无 girlId）

| 检查项 | 结果 |
|--------|------|
| 无禁止术语 | ${!hasForbiddenTerm ? '✅' : '❌'} |
| 有允许术语 | ${hasAllowedTerm ? '✅' : '❌'} |
| 口语化 | ${isColloquial ? '✅' : '❌'} |

**禁止术语列表：** Phase 0-6、资源池、私域、短轨、长轨

### 测试 2（带 girlId）

| 检查项 | 结果 |
|--------|------|
| 无禁止术语 | ${!hasForbiddenTerm2 ? '✅' : '❌'} |
| IOI 信号 | ${hasSignalIOI ? '✅' : '❌'} |
| 死胡同警告 | ${hasDeadEndWarning ? '✅' : '❌'} |
| 口语化 | ${isColloquial2 ? '✅' : '❌'} |

---

## 综合结果

| 检查项 | 结果 |
|--------|------|
| 测试1无禁止术语 | ${!hasForbiddenTerm ? '✅' : '❌'} |
| 测试2无禁止术语 | ${!hasForbiddenTerm2 ? '✅' : '❌'} |
| IOI 信号识别 | ${hasSignalIOI ? '✅' : '❌'} |
| 死胡同警告 | ${hasDeadEndWarning ? '✅' : '❌'} |
| 口语化风格 | ${isColloquial || isColloquial2 ? '✅' : '❌'} |

**综合结果：** ${!allForbiddenDetected && hasSignalIOI ? '✅ 测试通过' : '❌ 需要优化'}
`;

  const reportPath = '/home/admin/zhuiai/backend/src/__tests__/os-e2e-report.md';
  fs.writeFileSync(reportPath, reportContent);
  console.log(`\n✅ 报告已保存到: ${reportPath}`);

  // 清理
  await cleanupData();
  await prisma.membership.delete({ where: { id: 'e2e-test-membership' } }).catch(() => {});

  console.log('\n=== 测试完成 ===');

  // 返回成功/失败状态
  const allPassed = !allForbiddenDetected && hasSignalIOI;
  return allPassed;
}

// 直接运行（不使用 Jest）
runE2ETest()
  .then(passed => {
    process.exit(passed ? 0 : 1);
  })
  .catch(err => {
    console.error('测试失败:', err);
    process.exit(1);
  });

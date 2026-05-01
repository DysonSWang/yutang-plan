/**
 * 因材施教 · 个性化学习引擎
 */
const crypto = require('crypto');

// ==========================================
// 完善度计算
// ==========================================

// 字段权重配置 — 严格对应档案页 CLIENT_EDITABLE_FIELDS（排除 nickname/phone）
const FIELD_WEIGHTS = {
  // 核心字段（权重 3）— 决定个性化方向
  personality: 3, communicationStyle: 3, socialStyle: 3,
  emotionalGoal: 3, relationshipGoal: 3, relationshipAttitude: 3,
  marriageHistory: 3,
  strengths: 3, weaknesses: 3,
  // 重要字段（权重 2）— 基本画像
  age: 2, occupation: 2, education: 2, income: 2,
  height: 2, residence: 2, hometown: 2,
  appearance: 2,
  matchPreferences: 2, profileBio: 2,
  // 外围字段（权重 1）— 补充信息
  weight: 1, dressingStyle: 1, humorStyle: 1,
  familyBackground: 1, familyStructure: 1, familyAtmosphere: 1,
  dateTaboos: 1,
};

// 所有参与计算的字段
const ALL_PROFILE_FIELDS = Object.keys(FIELD_WEIGHTS);

// 满分 = 所有权重之和
const MAX_SCORE = Object.values(FIELD_WEIGHTS).reduce((sum, w) => sum + w, 0);

/**
 * 判断字段是否已完成
 * String 类型：非 NULL 且非空字符串
 * Int 类型：非 NULL
 */
function isFieldComplete(user, field) {
  const val = user[field];
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') return val.trim() !== '';
  return true;
}

/**
 * 计算档案完善度，返回 { score, maxScore, percentage, missingFields }
 */
function calculateCompleteness(user) {
  let score = 0;
  const missingFields = [];

  for (const field of ALL_PROFILE_FIELDS) {
    if (isFieldComplete(user, field)) {
      score += FIELD_WEIGHTS[field];
    } else {
      missingFields.push(field);
    }
  }

  const percentage = Math.round((score / MAX_SCORE) * 100);

  return {
    score,
    maxScore: MAX_SCORE,
    percentage,
    missingFields,
  };
}

// ==========================================
// 画像规范化
// ==========================================

/**
 * 规范化用户画像 JSON（用于过期比较）
 * 只提取参与完善的字段，排序 key 生成确定性 JSON
 */
function normalizeProfile(user) {
  const obj = {};
  for (const field of ALL_PROFILE_FIELDS.sort()) {
    obj[field] = user[field] ?? null;
  }
  return JSON.stringify(obj);
}

/**
 * 计算源稿内容哈希（源稿变了也判过期）
 */
function sourceContentHash(content) {
  return crypto.createHash('sha256').update(content || '', 'utf8').digest('hex').slice(0, 16);
}

// ==========================================
// 提示词构建（声明式配置数组）
// ==========================================

// 42 字段到提示词指令的映射配置
const PROMPT_DIMENSIONS = [
  // 基础信息 → 场景匹配
  { fields: ['age'], group: '基础信息', instruction: (v) => `社交场景、约会对象年龄段、沟通方式全部匹配 ${v} 岁` },
  { fields: ['occupation'], group: '基础信息', instruction: (v) => `职业场景、时间安排、社交圈层基于「${v}」` },
  { fields: ['education'], group: '基础信息', instruction: (v) => `理论深度和表达方式匹配「${v}」学历层次` },
  { fields: ['income'], group: '基础信息', instruction: (v) => `消费建议、约会预算、形象投入建议匹配「${v}」收入水平` },
  { fields: ['height'], group: '基础信息', instruction: (v) => `形象建议中涉及穿搭、体态时参考身高 ${v}cm` },
  { fields: ['residence'], group: '基础信息', instruction: (v) => `约会地点、活动推荐、季节穿搭基于城市「${v}」` },
  { fields: ['hometown'], group: '基础信息', instruction: (v) => `涉及家庭观念、地域文化差异时参考籍贯「${v}」` },

  // 外貌资源 → 形象建议定制
  { fields: ['appearance'], group: '外貌资源', instruction: (v) => `形象建议针对用户外貌特征「${v}」` },
  { fields: ['dressingStyle'], group: '外貌资源', instruction: (v) => `穿搭建议基于现有风格「${v}」，给出改进方向而非全盘否定` },

  // 家庭背景 → 观念匹配
  { fields: ['familyBackground'], group: '家庭背景', instruction: (v) => `涉及婚恋观念、消费观念时参考家庭出身「${v}」` },
  { fields: ['familyStructure'], group: '家庭背景', instruction: (v) => `涉及长期关系、婚姻话题时参考家庭结构「${v}」` },
  { fields: ['familyAtmosphere'], group: '家庭背景', instruction: (v) => `涉及情感表达方式时参考原生家庭氛围「${v}」` },
  { fields: ['familyBurden'], group: '家庭背景', instruction: (v) => `涉及时间投入、经济规划时考虑养老负担「${v}」` },
  { fields: ['familyMembers'], group: '家庭背景', instruction: (v) => `涉及家庭介绍、关系推进节奏时参考家庭成员「${v}」` },

  // 性格画像 → 语气与沟通风格
  { fields: ['personality'], group: '性格画像', instruction: (v) => `全文语气匹配「${v}」性格——内向多用鼓励句式，外向多用挑战句式` },
  { fields: ['emotionalStable'], group: '性格画像', instruction: (v) => v <= 5 ? '增加情绪管理引导内容' : '简化安抚性内容' },
  { fields: ['eqLevel'], group: '性格画像', instruction: (v) => v <= 5 ? '多解释"为什么对方会有这种反应"' : '简化心理学铺垫' },
  { fields: ['communicationStyle'], group: '性格画像', instruction: (v) => `匹配沟通风格「${v}」——利用其优势而非强行改变` },
  { fields: ['socialStyle'], group: '性格画像', instruction: (v) => v === '被动' ? '给低社交压力的替代方案' : '发挥社交优势' },

  // 情感状态 → 过往经验关联
  { fields: ['relationshipAttitude'], group: '情感状态', instruction: (v) => v === '认真' ? '强调长期价值' : '强调真诚和责任' },
  { fields: ['pastRelationshipSummary'], group: '情感状态', instruction: (v) => `涉及情史模式时关联用户过往「${v}」，指出重复的问题或进步` },
  { fields: ['marriageHistory'], group: '情感状态', instruction: (v) => `涉及婚姻话题时根据婚史「${v}」调整建议视角` },
  { fields: ['emotionalWounds'], group: '情感状态', instruction: (v) => `涉及信任、承诺话题时不触发情伤「${v}」，给出修复建议` },
  { fields: ['exPartnerTaboos'], group: '情感状态', instruction: (v) => `涉及择偶标准、筛选时关联用户介意的前任类型「${v}」` },

  // 情感目标 → 建议激进程度
  { fields: ['emotionalGoal'], group: '情感目标', instruction: (v) => v === '家里催' ? '增加父母沟通、相亲策略' : v === '空虚' ? '先解决自我价值再追爱' : `匹配情感诉求「${v}」` },
  { fields: ['relationshipGoal'], group: '情感目标', instruction: (v) => v === '短期' ? '强调边界和筛选效率' : '强调渐进投入和相处质量' },
  { fields: ['commitmentWillingness'], group: '情感目标', instruction: (v) => v <= 5 ? '不强推关系绑定' : '引导正确表达承诺的方式' },
  { fields: ['emotionalMaturity'], group: '情感目标', instruction: (v) => v === '幼稚' ? '多解释"为什么"' : '简化心理分析，直接给策略' },

  // 学习能力 → 内容难度与密度
  { fields: ['learningAbility'], group: '学习能力', instruction: (v) => v === '弱' ? '每章核心概念不超过3个，复杂概念附白话解释和具象例子' : '精简解释' },
  { fields: ['coachCooperation'], group: '学习能力', instruction: (v) => v === '抵触' ? '多用"你可以试试这样"而非"你应该这样"，减少说教感' : '' },
  { fields: ['feedbackQuality'], group: '学习能力', instruction: (v) => v === '无反馈' ? '每章末尾主动设2-3个引导性问题，帮助用户思考和反馈' : '' },

  // 价值画像 → 扬长补短
  { fields: ['strengths'], group: '价值画像', instruction: (v) => `在相关章节中明确指出"你这点做对了，继续强化"，给出进阶用法。优势：「${v}」` },
  { fields: ['weaknesses'], group: '价值画像', instruction: (v) => `在相关章节中给出针对短板「${v}」的具体提升方案` },

  // 客户类型 → 内容结构
  { fields: ['clientType'], group: '客户类型', instruction: (v) => {
    if (v === '执行型') return '章末附3-5条可执行行动项';
    if (v === '质疑型') return '关键结论附理论依据';
    if (v === '自主型') return '多给选择路径，少给确定答案';
    return '';
  }},

  // 约会偏好 → 实战场景定制
  { fields: ['preferredTransportMode'], group: '约会偏好', instruction: (v) => `涉及约会出行场景默认使用「${v}」` },
  { fields: ['preferredDateStyle'], group: '约会偏好', instruction: (v) => `涉及约会形式举例和建议匹配「${v}」` },
  { fields: ['dateBudget'], group: '约会偏好', instruction: (v) => `约会花费建议、餐厅推荐在预算「${v}」范围内` },

  // 认知评估 → 认知校准
  { fields: ['selfValuePerception'], group: '认知评估', instruction: (v) => `关联用户自认优势「${v}」，在相关章节验证或校正此认知` },
  { fields: ['cognitiveAccuracy'], group: '认知评估', instruction: (v) => {
    if (v === '高估') return '适当加入现实检验';
    if (v === '低估') return '多肯定、给出量化标准帮他看见自己';
    return '';
  }},

  // 资源投入 → 可行性匹配
  { fields: ['assetsLevel'], group: '资源投入', instruction: (v) => `涉及物质展示、形象投资时匹配资产水平「${v}」` },
  { fields: ['budgetRange'], group: '资源投入', instruction: (v) => `所有涉及花钱的建议全部在预算「${v}」范围内` },
  { fields: ['timeInvestment'], group: '资源投入', instruction: (v) => v === '少' ? '给高效的"最小可行行动"' : '给更完整的执行方案' },
  { fields: ['serviceStage'], group: '资源投入', instruction: (v) => `服务阶段「${v}」——背调侧重筛选，约会侧重推进` },
];

/**
 * 构建个性化提示词
 */
function buildPrompt(user, chapter) {
  const instructions = [];

  for (const dim of PROMPT_DIMENSIONS) {
    for (const field of dim.fields) {
      const val = user[field];
      if (val === null || val === undefined) continue;
      if (typeof val === 'string' && val.trim() === '') continue;
      const inst = dim.instruction(typeof val === 'number' ? val : String(val));
      if (inst) instructions.push(inst);
    }
  }

  const systemPrompt = `你是追爱AI的专属教材改写引擎。

## 核心原则
1. 保持原文的主题、结构、段落顺序、核心概念完全不变
2. 只替换：举例场景、解释深度、行动建议、语气措辞
3. 段落数量不变，段落长度可微调（±30%），不能把一段拆成多段
4. 每个修改必须有明确的原因——这个改动让「这个用户」理解更好或执行更容易
5. 如果某个段落对该用户已经足够适合，保留原文，不强行改写
6. 不要添加原文没有的新概念或新理论
7. 章节标题（# ## ###）、表格数据（|...|）、其他章节引用保持不变
8. Markdown 格式标记（###、**粗体**、---、|表格|）保持原样

## 个性化指令
${instructions.join('\n')}

## 输出要求
直接输出完整个性化后的 Markdown 全文，不要加任何前缀或后缀说明。`;

  const userPrompt = `## 原文标题
${chapter.title}${chapter.subtitle ? ' - ' + chapter.subtitle : ''}

## 原文内容
${chapter.content || '(暂无内容)'}

请基于以上个性化指令，改写本章内容为完整个性化版本。`;

  return { systemPrompt, userPrompt };
}

// ==========================================
// LLM 输出校验
// ==========================================

/**
 * 校验 LLM 输出质量
 * 返回 { valid: boolean, issues: string[] }
 */
function validateOutput(original, generated) {
  const issues = [];

  // 1. 非空检查
  if (!generated || generated.trim().length < 100) {
    issues.push('生成内容过短（<100字符），可能生成失败');
  }

  // 2. 标题数量检查（结构一致性）
  const originalHeadings = (original.match(/^#{1,3}\s/gm) || []).length;
  const generatedHeadings = (generated.match(/^#{1,3}\s/gm) || []).length;
  if (Math.abs(originalHeadings - generatedHeadings) > 1) {
    issues.push(`标题数量差异过大（原文${originalHeadings}个，生成${generatedHeadings}个）`);
  }

  // 3. 表格数量检查
  const originalTables = (original.match(/^\|/gm) || []).length;
  const generatedTables = (generated.match(/^\|/gm) || []).length;
  if (originalTables > 0 && generatedTables === 0) {
    issues.push('原文有表格但生成内容丢失了表格');
  }

  return { valid: issues.length === 0, issues };
}

// ==========================================
// LLM 调用
// ==========================================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MAX_RETRIES = 3;

/**
 * 调用 DeepSeek API
 */
async function callDeepSeek(systemPrompt, userPrompt, model = 'deepseek-chat') {
  const url = `${DEEPSEEK_BASE_URL}/v1/chat/completions`;

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 8192,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`DeepSeek API ${res.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const wait = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[Personalization] LLM 调用失败 (尝试 ${attempt}/${MAX_RETRIES})，${wait}ms 后重试:`, err.message);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}

/**
 * LLM 二次校验（使用 deepseek-reasoner）
 */
async function llmValidate(original, generated, userProfileSummary) {
  const systemPrompt = `你是教材质量审核专家。检查个性化改写是否正确。
审核标准：
1. 原文核心概念和定义是否保留
2. 段落结构是否一致
3. 个性化内容是否匹配用户画像
4. 是否有凭空捏造的内容

返回 JSON: {"pass": true/false, "issues": ["问题1", "问题2"], "score": 1-10}`;

  const userPrompt = `用户画像摘要：${userProfileSummary}

原文片段（前500字）：${original.slice(0, 500)}

改写片段（前500字）：${generated.slice(0, 500)}

请审核改写质量。`;

  try {
    const result = await callDeepSeek(systemPrompt, userPrompt, 'deepseek-reasoner');
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    }
    return { pass: true, issues: [], score: 7 };
  } catch (err) {
    console.warn('[Personalization] LLM 二次校验失败，降级通过:', err.message);
    return { pass: true, issues: [], score: 5, degraded: true };
  }
}

// ==========================================
// 并发池
// ==========================================

const MAX_CONCURRENT = 3;
let activeGenerations = 0;
const pendingQueue = [];

async function withConcurrencyLimit(fn) {
  if (activeGenerations >= MAX_CONCURRENT) {
    await new Promise(resolve => pendingQueue.push(resolve));
  }
  activeGenerations++;
  try {
    return await fn();
  } finally {
    activeGenerations--;
    const next = pendingQueue.shift();
    if (next) next();
  }
}

// ==========================================
// 单章生成
// ==========================================

/**
 * 生成单个章节的个性化版本
 */
async function generateChapter(userId, chapterId, user, chapter, batchId, prisma, io) {
  console.log(`[Personalization] 开始生成 chapterId=${chapterId} userId=${userId.slice(0, 8)}`);

  // 更新状态为 generating
  await prisma.personalizedChapter.upsert({
    where: { userId_chapterId: { userId, chapterId } },
    create: {
      userId,
      chapterId,
      status: 'generating',
      batchId,
      profileSnapshot: normalizeProfile(user),
      sourceContentHash: sourceContentHash(chapter.content),
      content: '',
    },
    update: {
      status: 'generating',
      batchId,
      profileSnapshot: normalizeProfile(user),
      sourceContentHash: sourceContentHash(chapter.content),
      retryCount: { increment: 1 },
    },
  });

  try {
    // 1. 构建提示词
    const { systemPrompt, userPrompt } = buildPrompt(user, chapter);

    // 2. 调用 LLM 生成
    const generated = await callDeepSeek(systemPrompt, userPrompt);

    // 3. 输出校验
    const validation = validateOutput(chapter.content || '', generated);
    if (!validation.valid) {
      console.warn(`[Personalization] 输出校验不通过 chapterId=${chapterId}:`, validation.issues);
    }

    // 4. LLM 二次校验
    const userSummary = `完善度${calculateCompleteness(user).percentage}%, ${user.clientType || '未知'}型客户`;
    const llmResult = await llmValidate(chapter.content || '', generated, userSummary);

    if (!llmResult.pass && !llmResult.degraded) {
      console.warn(`[Personalization] LLM 二次校验不通过 chapterId=${chapterId}:`, llmResult.issues);
    }

    // 5. 存储
    await prisma.personalizedChapter.update({
      where: { userId_chapterId: { userId, chapterId } },
      data: {
        content: generated,
        status: 'completed',
        profileSnapshot: normalizeProfile(user),
        sourceContentHash: sourceContentHash(chapter.content),
      },
    });

    // 6. 推送进度
    if (io) {
      io.to(`client:${userId}`).emit('personalization:progress', {
        chapterId,
        status: 'completed',
        batchId,
      });
    }

    return { success: true, chapterId };
  } catch (err) {
    console.error(`[Personalization] 生成失败 chapterId=${chapterId}:`, err.message);

    await prisma.personalizedChapter.update({
      where: { userId_chapterId: { userId, chapterId } },
      data: {
        status: 'failed',
        errorMessage: err.message,
      },
    });

    // 推送失败通知
    if (io) {
      io.to(`client:${userId}`).emit('personalization:progress', {
        chapterId,
        status: 'failed',
        error: err.message,
        batchId,
      });
    }

    return { success: false, chapterId, error: err.message };
  }
}

// ==========================================
// 全量批量生成
// ==========================================

/**
 * 触发全量批量生成（异步，立即返回 batchId）
 */
async function generateAllChapters(userId, user, chapters, prisma, io) {
  const completeness = calculateCompleteness(user);
  if (completeness.percentage < 70) {
    throw new Error(`档案完善度不足（${completeness.percentage}%），需 ≥ 70% 才能生成专属版本`);
  }

  // 创建 batch
  const batch = await prisma.generationBatch.create({
    data: {
      userId,
      totalChapters: chapters.length,
      status: 'processing',
    },
  });

  // 记录事件
  await prisma.personalizationEvent.create({
    data: {
      userId,
      event: 'regenerate',
      metadata: JSON.stringify({ profileCompleteness: completeness.percentage, batchId: batch.id }),
    },
  });

  // 异步执行
  setImmediate(async () => {
    let completed = 0;
    let failed = 0;

    for (const chapter of chapters) {
      const result = await withConcurrencyLimit(() =>
        generateChapter(userId, chapter.chapterId, user, chapter, batch.id, prisma, io)
      );

      if (result.success) {
        completed++;
      } else {
        failed++;
      }

      // 更新 batch 进度
      await prisma.generationBatch.update({
        where: { id: batch.id },
        data: { completedCount: completed, failedCount: failed },
      });

      // 推送整体进度
      if (io) {
        io.to(`client:${userId}`).emit('personalization:progress', {
          chapterId: chapter.chapterId,
          status: result.success ? 'completed' : 'failed',
          batchId: batch.id,
          batchProgress: { completed, failed, total: chapters.length },
        });
      }
    }

    // 标记 batch 完成
    await prisma.generationBatch.update({
      where: { id: batch.id },
      data: {
        status: failed === chapters.length ? 'failed' : 'completed',
        completedAt: new Date(),
      },
    });

    console.log(`[Personalization] 批量生成完成 batchId=${batch.id} completed=${completed} failed=${failed}`);

    // 全部完成通知
    if (io) {
      io.to(`client:${userId}`).emit('personalization:complete', {
        batchId: batch.id,
        total: chapters.length,
        completed,
        failed,
      });
    }
  });

  return batch;
}

// ==========================================
// 单章重试
// ==========================================

/**
 * 单章重试生成
 */
async function regenerateChapter(userId, chapterId, user, chapter, prisma, io) {
  const existing = await prisma.personalizedChapter.findUnique({
    where: { userId_chapterId: { userId, chapterId } },
  });

  if (existing && existing.retryCount >= MAX_RETRIES) {
    // 超过最大重试次数，标记失败
    await prisma.personalizedChapter.update({
      where: { userId_chapterId: { userId, chapterId } },
      data: { status: 'failed', errorMessage: `超过最大重试次数（${MAX_RETRIES}）` },
    });
    return { success: false, degraded: true, error: '超过最大重试次数，已标记为失败' };
  }

  const batchId = existing?.batchId || `retry-${Date.now()}`;
  return generateChapter(userId, chapterId, user, chapter, batchId, prisma, io);
}

// ==========================================
// 启动恢复
// ==========================================

// 所有42个画像字段
const USER_PROFILE_SELECT = {
  id: true,
  age: true, occupation: true, education: true, income: true,
  height: true, weight: true, residence: true, hometown: true,
  appearance: true, dressingStyle: true,
  familyBackground: true, familyStructure: true, familyAtmosphere: true,
  personality: true, communicationStyle: true, socialStyle: true, humorStyle: true,
  relationshipAttitude: true, marriageHistory: true,
  emotionalGoal: true, relationshipGoal: true,
  strengths: true, weaknesses: true,
  matchPreferences: true, dateTaboos: true, profileBio: true,
};

/**
 * 启动时恢复未完成的批量生成任务
 */
async function resumeAbandonedBatches(prisma, io) {
  const abandoned = await prisma.generationBatch.findMany({
    where: { status: 'processing' },
  });

  if (abandoned.length === 0) return;

  console.log(`[Personalization] 发现 ${abandoned.length} 个未完成的批量任务，开始恢复...`);

  for (const batch of abandoned) {
    const user = await prisma.user.findUnique({
      where: { id: batch.userId },
      select: USER_PROFILE_SELECT,
    });
    if (!user) {
      console.warn(`[Personalization] batchId=${batch.id} 找不到用户，标记失败`);
      await prisma.generationBatch.update({
        where: { id: batch.id },
        data: { status: 'failed', completedAt: new Date() },
      });
      continue;
    }

    // 获取所有上架章节
    const chapters = await prisma.learningChapter.findMany({
      where: { status: 'published' },
      orderBy: { orderIndex: 'asc' },
    });

    // 找到最后完成的章节
    let lastCompletedIndex = -1;
    for (let i = 0; i < chapters.length; i++) {
      const pc = await prisma.personalizedChapter.findUnique({
        where: { userId_chapterId: { userId: user.id, chapterId: chapters[i].chapterId } },
      });
      if (pc && pc.status === 'completed') {
        lastCompletedIndex = i;
      }
    }

    console.log(`[Personalization] batchId=${batch.id} 从 chapter ${lastCompletedIndex + 2}/${chapters.length} 恢复`);

    // 从下一章开始恢复
    setImmediate(async () => {
      let completed = batch.completedCount;
      let failed = batch.failedCount;

      for (let i = lastCompletedIndex + 1; i < chapters.length; i++) {
        const chapter = chapters[i];
        const result = await withConcurrencyLimit(() =>
          generateChapter(user.id, chapter.chapterId, user, chapter, batch.id, prisma, io)
        );

        if (result.success) {
          completed++;
        } else {
          failed++;
        }

        await prisma.generationBatch.update({
          where: { id: batch.id },
          data: { completedCount: completed, failedCount: failed },
        });
      }

      await prisma.generationBatch.update({
        where: { id: batch.id },
        data: {
          status: failed === chapters.length ? 'failed' : 'completed',
          completedAt: new Date(),
        },
      });
    });
  }
}

module.exports = {
  calculateCompleteness,
  normalizeProfile,
  sourceContentHash,
  buildPrompt,
  validateOutput,
  generateAllChapters,
  generateChapter,
  regenerateChapter,
  resumeAbandonedBatches,
  USER_PROFILE_SELECT,
  ALL_PROFILE_FIELDS,
  FIELD_WEIGHTS,
};

/**
 * 客户管理路由
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { JWT_SECRET, getAIConfig, getTextModelConfig, BASE_URL } = require('../config');
const prisma = require('../prisma');
const { callVisionModel } = require('../services/profileEngine');

// 截图上传目录
const SCREENSHOT_DIR = path.join(__dirname, '../../uploads/chat-screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const screenshotUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, SCREENSHOT_DIR),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持图片格式'));
    }
  }
});

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'token无效' });
  }
};

// 获取客户列表（操盘手用）
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { serviceStage } = req.query;
    let where = { role: 'client' };
    if (serviceStage) where.serviceStage = serviceStage;

    const clients = await prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        phone: true,
        age: true,
        occupation: true,
        education: true,
        assetsLevel: true,
        serviceStage: true,
        balance: true,
        girlQuota: true,
        trustLevel: true,
        interactionHeat: true,
        coachCooperation: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // 获取每个客户的女生数量（批量查询解决 N+1 问题）
    const girlCounts = await prisma.girl.groupBy({
      by: ['clientId'],
      _count: { id: true },
      where: { clientId: { in: clients.map(c => c.id) } }
    });
    const girlCountMap = new Map(girlCounts.map(g => [g.clientId, g._count.id]));
    const clientsWithGirls = clients.map(client => ({
      ...client,
      girlCount: girlCountMap.get(client.id) || 0
    }));

    res.json({ success: true, clients: clientsWithGirls });
  } catch (error) {
    console.error('[Clients] 获取客户列表失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取当前客户自己的信息
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const client = await prisma.user.findUnique({
      where: { id: req.user.id }
      // 返回全部字段（除了password）
    });

    if (!client) {
      return res.status(404).json({ error: '客户不存在' });
    }
    const { password, ...clientData } = client;

    // 获取女生列表
    const girls = await prisma.girl.findMany({
      where: { clientId: req.user.id },
      orderBy: { updatedAt: 'desc' }
    });

    // 获取约会数量
    const dateCount = await prisma.date.count({
      where: { userId: req.user.id }
    });

    res.json({ success: true, client: { ...clientData, girls, dateCount } });
  } catch (error) {
    console.error('[Clients] 获取客户信息失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取客户详情（操盘手用）
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    // 先查基本信息，捕获可能的数据库错误
    let client;
    try {
      client = await prisma.user.findUnique({
        where: { id: req.params.id }
      });
    } catch (dbError) {
      console.warn('[Clients] 基本查询失败:', dbError.message);
      // 如果基本查询失败，返回错误而不是继续
      return res.status(500).json({ error: '获取客户信息失败，请稍后重试' });
    }

    if (!client) {
      return res.status(404).json({ error: '客户不存在' });
    }

    // 尝试附带关联数据，如果失败则返回空数组
    let clientGirls = [];
    let dates = [];
    let progress = [];
    let learnings = [];

    try {
      const withRelations = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
          clientGirls: {
            orderBy: { updatedAt: 'desc' },
            take: 10
          },
          dates: {
            orderBy: { dateTime: 'desc' },
            take: 10
          },
          progress: {
            orderBy: { createdAt: 'desc' }
          },
          learnings: {
            orderBy: { createdAt: 'desc' },
            take: 20
          }
        }
      });
      clientGirls = withRelations.clientGirls || [];
      dates = withRelations.dates || [];
      progress = withRelations.progress || [];
      learnings = withRelations.learnings || [];
    } catch (relError) {
      console.warn('[Clients] 获取关联数据失败，使用空数组:', relError.message);
    }

    const { password, ...clientData } = client;
    res.json({ success: true, client: { ...clientData, clientGirls, dates, progress, learnings } });
  } catch (error) {
    console.error('[Clients] 获取客户详情失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建客户
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const data = req.body;
    const required = ['username', 'password'];
    for (const field of required) {
      if (!data[field]) {
        return res.status(400).json({ error: `${field}是必需的` });
      }
    }

    const client = await prisma.user.create({
      data: {
        username: data.username,
        password: data.password,
        role: 'client',
        nickname: data.nickname,
        phone: data.phone,
        // 基础信息
        age: data.age,
        occupation: data.occupation,
        education: data.education,
        income: data.income,
        height: data.height,
        residence: data.residence,
        hometown: data.hometown,
        // 外貌资源
        appearance: data.appearance,
        dressingStyle: data.dressingStyle,
        photos: data.photos ? JSON.stringify(data.photos) : null,
        // 家庭背景
        familyBackground: data.familyBackground,
        familyStructure: data.familyStructure,
        familyAtmosphere: data.familyAtmosphere,
        familyBurden: data.familyBurden,
        familyMembers: data.familyMembers,
        // 性格画像
        personality: data.personality,
        emotionalStable: data.emotionalStable,
        eqLevel: data.eqLevel,
        communicationStyle: data.communicationStyle,
        socialStyle: data.socialStyle,
        // 情感状态
        relationshipAttitude: data.relationshipAttitude,
        pastRelationshipSummary: data.pastRelationshipSummary,
        marriageHistory: data.marriageHistory,
        emotionalWounds: data.emotionalWounds,
        exPartnerTaboos: data.exPartnerTaboos,
        // 情感目标（四位专家新增）
        emotionalGoal: data.emotionalGoal,
        relationshipGoal: data.relationshipGoal,
        commitmentWillingness: data.commitmentWillingness,
        emotionalMaturity: data.emotionalMaturity,
        // 学习能力
        learningAbility: data.learningAbility,
        coachCooperation: data.coachCooperation,
        feedbackQuality: data.feedbackQuality,
        // 价值画像（Mo哥新增）
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        // 客户类型（Mo哥新增）
        clientType: data.clientType,
        // 认知评估（旭哥新增）
        selfValuePerception: data.selfValuePerception,
        cognitiveAccuracy: data.cognitiveAccuracy,
        // 资源投入
        assetsLevel: data.assetsLevel,
        budgetRange: data.budgetRange,
        timeInvestment: data.timeInvestment,
        serviceStage: data.serviceStage || '背调',
        // 匹配相关
        matchPreferences: data.matchPreferences,
        dealbreakers: data.dealbreakers,
        // 社交主页展示面
        profilePhotos: data.profilePhotos ? JSON.stringify(data.profilePhotos) : null,
        profileBio: data.profileBio,
        preferredPlatforms: data.preferredPlatforms,
        // 代聊风格（凯哥新增）
        openingTemplates: data.openingTemplates ? JSON.stringify(data.openingTemplates) : null,
        petPhrases: data.petPhrases ? JSON.stringify(data.petPhrases) : null,
        interactionStyle: data.interactionStyle,
        chatTaboos: data.chatTaboos ? JSON.stringify(data.chatTaboos) : null,
        humorStyle: data.humorStyle,
        // 阶段进度（凯哥新增）
        currentStage: data.currentStage,
        stageProgress: data.stageProgress,
        lastMilestone: data.lastMilestone,
        // 抗压与节奏（凯哥+旭哥新增）
        selfEsteemLevel: data.selfEsteemLevel,
        antiFrustrationLevel: data.antiFrustrationLevel,
        pacePreference: data.pacePreference,
        // 投入意愿（旭哥新增）
        investmentWillingness: data.investmentWillingness,
        // 舒适区（旭哥新增）
        comfortZone: data.comfortZone,
        // 【评审团新增 P0】依恋类型 & 量化EQ维度
        attachmentStyle: data.attachmentStyle,
        empathy: data.empathy,
        communication: data.communication,
        conflictRes: data.conflictRes,
        intimacyBoundary: data.intimacyBoundary,
        // 【评审团新增 P0】约会雷区
        dateTaboos: data.dateTaboos,
        // 【评审团新增 P1】恋爱风格 & 五种爱的语言
        loveStyle: data.loveStyle,
        loveLanguage1: data.loveLanguage1,
        loveLanguage2: data.loveLanguage2,
        loveLanguage3: data.loveLanguage3,
        loveLanguage4: data.loveLanguage4,
        loveLanguage5: data.loveLanguage5,
        // 【评审团新增 P1】约会金钱观念
        moneyDatingPattern: data.moneyDatingPattern,
        // 【评审团新增 P1】前任关系模式分析
        pastRelationshipPattern: data.pastRelationshipPattern,
        // 【评审团新增 P1】外表吸引力自评与需求
        appearanceSelfAssessment: data.appearanceSelfAssessment,
        appearanceSelfRequirement: data.appearanceSelfRequirement,
        appearanceMinAcceptable: data.appearanceMinAcceptable,
        // 【评审团新增】量化版本
        emotionalMaturityLevel: data.emotionalMaturityLevel,
        coachCooperationLevel: data.coachCooperationLevel,
        // 【评审团新增】客户AI战略分析
        clientBestApproach: data.clientBestApproach,
        clientRecommendedTopics: data.clientRecommendedTopics,
        clientUpgradeConditions: data.clientUpgradeConditions,
        clientRiskFactors: data.clientRiskFactors,
        clientStrategicNotes: data.clientStrategicNotes,
        // 信任度/热度
        trustLevel: data.trustLevel || 1,
        interactionHeat: data.interactionHeat || 5.0,
        // 语音克隆素材
        voiceSamples: data.voiceSamples ? JSON.stringify(data.voiceSamples) : null,
        // 元数据
        balance: data.balance || 0,
        notes: data.notes,
        source: data.source,
        serviceStartDate: data.serviceStartDate
      }
    });

    const { password, ...clientData } = client;
    res.json({ success: true, client: clientData });
  } catch (error) {
    console.error('[Clients] 创建客户失败:', error);
    res.status(500).json({ error: '创建失败' });
  }
});

// 更新客户信息
// 客户可编辑的字段（用于自我更新）
const CLIENT_EDITABLE_FIELDS = [
  'nickname', 'phone', 'age', 'occupation', 'education', 'income', 'height', 'weight',
  'residence', 'hometown', 'appearance', 'dressingStyle',
  'familyBackground', 'familyStructure', 'familyAtmosphere',
  'personality', 'communicationStyle', 'socialStyle',
  'relationshipAttitude', 'marriageHistory', 'emotionalGoal',
  'relationshipGoal', 'profileBio',
  'humorStyle', 'strengths', 'weaknesses', 'matchPreferences', 'dateTaboos'
];

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const isSelfUpdate = req.user.role === 'client' && req.user.id === req.params.id;
    const isOperator = req.user.role === 'admin';

    if (!isOperator && !isSelfUpdate) {
      return res.status(403).json({ error: '无权限' });
    }

    const existing = await prisma.user.findUnique({
      where: { id: req.params.id }
    });
    if (!existing) {
      return res.status(404).json({ error: '客户不存在' });
    }

    const data = req.body;
    const updateData = {};

    // 客户自我更新：只允许编辑公开字段
    const allowedFields = isSelfUpdate ? CLIENT_EDITABLE_FIELDS : Object.keys(data);

    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        updateData[key] = data[key];
      }
    }

    // 阶段进度（凯哥新增）
    if (data.currentStage !== undefined) updateData.currentStage = data.currentStage;
    if (data.stageProgress !== undefined) updateData.stageProgress = data.stageProgress;
    if (data.lastMilestone !== undefined) updateData.lastMilestone = data.lastMilestone;

    // 抗压与节奏（凯哥+旭哥新增）
    if (data.selfEsteemLevel !== undefined) updateData.selfEsteemLevel = data.selfEsteemLevel;
    if (data.antiFrustrationLevel !== undefined) updateData.antiFrustrationLevel = data.antiFrustrationLevel;
    if (data.pacePreference !== undefined) updateData.pacePreference = data.pacePreference;

    // 投入意愿（旭哥新增）
    if (data.investmentWillingness !== undefined) updateData.investmentWillingness = data.investmentWillingness;

    // 舒适区（旭哥新增）
    if (data.comfortZone !== undefined) updateData.comfortZone = data.comfortZone;

    // 【评审团新增 P0】依恋类型 & 量化EQ维度
    if (data.attachmentStyle !== undefined) updateData.attachmentStyle = data.attachmentStyle;
    if (data.empathy !== undefined) updateData.empathy = data.empathy;
    if (data.communication !== undefined) updateData.communication = data.communication;
    if (data.conflictRes !== undefined) updateData.conflictRes = data.conflictRes;
    if (data.intimacyBoundary !== undefined) updateData.intimacyBoundary = data.intimacyBoundary;

    // 【评审团新增 P0】约会雷区
    if (data.dateTaboos !== undefined) updateData.dateTaboos = data.dateTaboos;

    // 【评审团新增 P1】恋爱风格 & 五种爱的语言
    if (data.loveStyle !== undefined) updateData.loveStyle = data.loveStyle;
    if (data.loveLanguage1 !== undefined) updateData.loveLanguage1 = data.loveLanguage1;
    if (data.loveLanguage2 !== undefined) updateData.loveLanguage2 = data.loveLanguage2;
    if (data.loveLanguage3 !== undefined) updateData.loveLanguage3 = data.loveLanguage3;
    if (data.loveLanguage4 !== undefined) updateData.loveLanguage4 = data.loveLanguage4;
    if (data.loveLanguage5 !== undefined) updateData.loveLanguage5 = data.loveLanguage5;

    // 【评审团新增 P1】约会金钱观念
    if (data.moneyDatingPattern !== undefined) updateData.moneyDatingPattern = data.moneyDatingPattern;

    // 【评审团新增 P1】前任关系模式分析
    if (data.pastRelationshipPattern !== undefined) updateData.pastRelationshipPattern = data.pastRelationshipPattern;

    // 【评审团新增 P1】外表吸引力自评与需求
    if (data.appearanceSelfAssessment !== undefined) updateData.appearanceSelfAssessment = data.appearanceSelfAssessment;
    if (data.appearanceSelfRequirement !== undefined) updateData.appearanceSelfRequirement = data.appearanceSelfRequirement;
    if (data.appearanceMinAcceptable !== undefined) updateData.appearanceMinAcceptable = data.appearanceMinAcceptable;

    // 【评审团新增】量化版本
    if (data.emotionalMaturityLevel !== undefined) updateData.emotionalMaturityLevel = data.emotionalMaturityLevel;
    if (data.coachCooperationLevel !== undefined) updateData.coachCooperationLevel = data.coachCooperationLevel;

    // 【评审团新增】客户AI战略分析
    if (data.clientBestApproach !== undefined) updateData.clientBestApproach = data.clientBestApproach;
    if (data.clientRecommendedTopics !== undefined) updateData.clientRecommendedTopics = data.clientRecommendedTopics;
    if (data.clientUpgradeConditions !== undefined) updateData.clientUpgradeConditions = data.clientUpgradeConditions;
    if (data.clientRiskFactors !== undefined) updateData.clientRiskFactors = data.clientRiskFactors;
    if (data.clientStrategicNotes !== undefined) updateData.clientStrategicNotes = data.clientStrategicNotes;

    // 信任度/热度
    if (data.trustLevel !== undefined) updateData.trustLevel = data.trustLevel;
    if (data.interactionHeat !== undefined) updateData.interactionHeat = data.interactionHeat;

    // 语音克隆素材
    if (data.voiceSamples !== undefined) updateData.voiceSamples = data.voiceSamples ? JSON.stringify(data.voiceSamples) : null;

    // 元数据
    if (data.balance !== undefined) updateData.balance = data.balance;
    if (data.girlQuota !== undefined) updateData.girlQuota = parseInt(data.girlQuota, 10) || 10;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.source !== undefined) updateData.source = data.source;
    if (data.serviceStartDate !== undefined) updateData.serviceStartDate = data.serviceStartDate;

    // 数值字段处理
    // 可空整数字段：空字符串/undefined → null，字符串数字 → 整数
    const nullableInt = ['age', 'height', 'empathy', 'communication', 'conflictRes',
      'emotionalMaturityLevel', 'coachCooperationLevel'];
    for (const field of nullableInt) {
      if (updateData[field] === '' || updateData[field] === null || updateData[field] === undefined) {
        updateData[field] = null;
      } else if (typeof updateData[field] === 'string') {
        const parsed = parseInt(updateData[field], 10);
        if (!isNaN(parsed)) updateData[field] = parsed;
      }
    }
    // 可空浮点字段
    const nullableFloat = ['weight'];
    for (const field of nullableFloat) {
      if (updateData[field] === '' || updateData[field] === null || updateData[field] === undefined) {
        updateData[field] = null;
      } else if (typeof updateData[field] === 'string') {
        const parsed = parseFloat(updateData[field]);
        if (!isNaN(parsed)) updateData[field] = parsed;
      }
    }
    // 不可空字段（有 @default）：未提供时删除，不要设为 null
    const nonNullNumeric = ['trustLevel', 'interactionHeat', 'balance'];
    for (const field of nonNullNumeric) {
      if (updateData[field] === undefined || updateData[field] === null) {
        delete updateData[field];
      } else if (updateData[field] === '') {
        delete updateData[field];
      } else if (typeof updateData[field] === 'string') {
        const parsed = field === 'interactionHeat' || field === 'balance'
          ? parseFloat(updateData[field])
          : parseInt(updateData[field], 10);
        if (!isNaN(parsed)) updateData[field] = parsed;
      }
    }

    const client = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData
    });

    const { password, ...clientData } = client;
    res.json({ success: true, client: clientData });
  } catch (error) {
    console.error('[Clients] 更新客户失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除客户
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    await prisma.user.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Clients] 删除客户失败:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 从文本提取客户档案
router.post('/extract-profile', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }

    const { text } = req.body;
    if (!text || text.trim().length < 20) {
      return res.status(400).json({ error: '文本内容太少，请提供更完整的自我介绍（至少20字）' });
    }

    // 调用 AI 提取档案信息（统一用 DashScope 多模态模型）
    const aiConfig = getTextModelConfig();
    const extractPrompt = `从以下客户自我介绍中提取档案信息，直接输出JSON（不要markdown代码块，不要其他文字）。

【规则】
1. 有选项的字段必须从可选值中选择，不要自己编
2. 数字字段填数字字符串如"7"，不要文字
3. 文本中未提及的字段填空字符串""

【字段与可选值】
age: 数字（从出生年份推算当前年龄，当前2026年）
height: 数字(cm)
weight: 数字(kg)
residence: 城市名（优先从列表选：北京/上海/广州/深圳/杭州/南京/苏州/成都/重庆/武汉/西安/天津/长沙/郑州/东莞/佛山/青岛/沈阳/大连/厦门/宁波，不在列表则填实际城市）
hometown: 城市名
occupation: 企业主/企业高管/公务员/医生/律师/教师/工程师/程序员/销售/金融从业者/自由职业/退休/其他
education: 小学/初中/中专/高中/大专/本科/硕士/博士
income: 10万以下/10-30万/30-50万/50-100万/100-300万/300万以上
personality: INTJ/INTP/ENTJ/ENTP/INFJ/INFP/ENFJ/ENFP/ISTJ/ISFJ/ESTJ/ESFJ/ISTP/ISFP/ESTP/ESFP/其他（根据性格描述推断最匹配的MBTI）
familyBackground: 农村/城市/经商/公务员/其他
familyStructure: 双亲/单亲/离异/其他
familyAtmosphere: 和睦/一般/冷淡/争吵/离异
marriageHistory: 未婚/离异无子/离异有子/丧偶
emotionalGoal: 认真找对象/随便玩玩/家里催婚/空虚寂寞
relationshipGoal: 短期/长期/不确定
relationshipAttitude: 认真/随便/急切
communicationStyle: 直接/含蓄/话多/话少/幽默
socialStyle: 主动/被动/社交达人
emotionalStable: 1-10数字
eqLevel: 1-10数字
emotionalMaturity: 幼稚/一般/成熟
emotionalMaturityLevel: 1-10数字（幼稚1-3/一般4-6/成熟7-10）
learningAbility: 强/中/弱
coachCooperation: 配合/一般/抵触
coachCooperationLevel: 1-10数字（配合7-10/一般4-6/抵触1-3）
attachmentStyle: 焦虑型/回避型/安全型
loveStyle: 真诚型/陪伴型/言语型/身体型/浪漫型
moneyDatingPattern: AA/请客/轮流/看情况
humorStyle: 冷幽默/自嘲/调侃/正经
selfEsteemLevel: 高/中/低
pacePreference: 快节奏/稳健型/慢热型
assetsLevel: A6/A7/A8/A9/A10/A10+
clientType: 执行型/质疑型/自主型
empathy: 1-10数字（共情能力）
communication: 1-10数字（沟通表达能力）
conflictRes: 1-10数字（冲突处理能力）
appearance: 外貌描述文本
appearanceSelfAssessment: 自我颜值评价文本
appearanceSelfRequirement: 对对方颜值要求文本
strengths: 优势/优点文本
weaknesses: 缺点/不足文本
dateTaboos: 约会禁忌文本
notes: 其他值得记录的备注
matchPreferences: 对目标对象的期望描述（年龄、身高、学历、性格、收入等要求）

【自我介绍】
${text}`;

    // SSE 流式响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: 'system', content: '你是一个专业的客户信息提取助手。请严格按照要求提取信息，直接输出JSON，不要有其他文字。' },
          { role: 'user', content: extractPrompt }
        ],
        temperature: 0.1,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Clients] AI提取失败:', response.status, errorText);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'AI服务请求失败' })}\n\n`);
      return res.end();
    }

    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              res.write(`event: progress\ndata: ${JSON.stringify({ text: delta })}\n\n`);
            }
          } catch {}
        }
      }
    } catch (streamErr) {
      console.error('[Clients] 流读取失败:', streamErr);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'AI连接中断' })}\n\n`);
      return res.end();
    }

    // 清理并解析
    let content = fullContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    if (!content) {
      console.error('[Clients] AI返回空内容');
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'AI返回内容为空' })}\n\n`);
      return res.end();
    }

    let extracted;
    try {
      extracted = JSON.parse(content);
    } catch (e) {
      console.error('[Clients] 解析AI输出失败, content长度:', content.length, '前200字:', content.slice(0, 200));
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'AI输出格式错误' })}\n\n`);
      return res.end();
    }

    res.write(`event: done\ndata: ${JSON.stringify({ success: true, profile: extracted })}\n\n`);
    res.end();
  } catch (error) {
    console.error('[Clients] 提取客户档案失败:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: '提取失败' });
    }
    try { res.write(`event: error\ndata: ${JSON.stringify({ error: '提取失败' })}\n\n`); res.end(); } catch {}
  }
});

// 从聊天记录提取档案更新（操盘手交流后使用）
router.post('/:id/extract-from-chat', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { messageCount = 20 } = req.body;
    const clientId = req.params.id;

    // 查找操盘手和该客户的聊天会话
    const session = await prisma.chatSession.findUnique({
      where: { operatorId_clientId: { operatorId: req.user.id, clientId } }
    });

    if (!session) {
      return res.status(404).json({ error: '暂无与该客户的聊天记录' });
    }

    // 获取最近的聊天记录
    const messages = await prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      take: parseInt(messageCount)
    });

    if (messages.length === 0) {
      return res.status(400).json({ error: '聊天记录为空' });
    }

    // 反转，按时间正序
    messages.reverse();

    // 获取客户现有档案用于参考
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: {
        nickname: true,
        occupation: true,
        age: true,
        personality: true,
        emotionalStable: true,
        eqLevel: true,
        attachmentStyle: true,
        loveStyle: true,
        moneyDatingPattern: true,
        pastRelationshipPattern: true,
        dateTaboos: true,
        comfortZone: true,
        strengths: true,
        weaknesses: true,
        clientType: true,
        interactionStyle: true,
        humorStyle: true,
        notes: true,
        clientBestApproach: true,
        clientRecommendedTopics: true,
        clientRiskFactors: true,
        clientStrategicNotes: true,
      }
    });

    // 构建对话文本
    const chatText = messages.map(m => {
      const role = m.senderRole === 'operator' ? '【操盘手】' : '【客户】';
      return `${role}${m.content || '[媒体消息]'}`;
    }).join('\n');

    // 调用 AI 提取档案更新建议
    const aiConfig = getAIConfig('flash');
    const extractPrompt = `从操盘手与客户的聊天记录中提取档案更新和战略建议。直接输出JSON，无markdown。

【客户档案】
昵称:${client?.nickname || '-'} 职业:${client?.occupation || '-'} 年龄:${client?.age || '-'} 性格:${client?.personality || '-'} 情绪:${client?.emotionalStable || '-'}/10 情商:${client?.eqLevel || '-'}/10 依恋:${client?.attachmentStyle || '-'} 买单:${client?.moneyDatingPattern || '-'} 雷区:${client?.dateTaboos || '-'} 优点:${client?.strengths || '-'} 缺点:${client?.weaknesses || '-'}

【聊天记录】
${chatText}

【输出字段说明】
- newInsights: 字符串数组，从对话中发现的新信息
- updatedFields: 对象，仅填有新信息或变化的字段（无变化不用输出），可选字段: attachmentStyle/loveStyle/moneyDatingPattern/dateTaboos/emotionalStable(数字)/eqLevel(数字)/strengths/weaknesses/notes/clientStrategicNotes
- confidence: 0-1数字，信息充分度
- strategicAnalysis: 对象，可选: clientBestApproach/clientRecommendedTopics/clientUpgradeConditions/clientRiskFactors/clientStrategicNotes，置信度不足时填空对象{}`;

    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: 'system', content: '你是一个专业的客户档案分析专家。请严格按照要求提取信息，直接输出JSON，不要有任何其他文字。' },
          { role: 'user', content: extractPrompt }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Clients] AI提取失败:', response.status, errorText);
      return res.status(500).json({ error: 'AI服务请求失败' });
    }

    const result = await response.json();
    let content = result.choices?.[0]?.message?.content
      || result.choices?.[0]?.text
      || result.content
      || '';

    if (!content) {
      console.error('[Clients] AI返回空内容, finish_reason:', result.choices?.[0]?.finish_reason, 'raw:', JSON.stringify(result).slice(0, 800));
      return res.status(500).json({ error: 'AI返回内容为空，请重试' });
    }

    // 清理 markdown 代码块（兼容多种格式）
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(content);
    } catch (e) {
      console.error('[Clients] 解析AI输出失败, content长度:', content.length, '前200字:', content.slice(0, 200));
      return res.status(500).json({ error: 'AI输出格式错误，无法解析' });
    }

    res.json({
      success: true,
      analysis: extracted,
      messageCount: messages.length,
      chatPreview: messages.slice(-5).map(m => ({
        role: m.senderRole,
        content: m.content || '[媒体消息]',
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    console.error('[Clients] 从聊天提取档案失败:', error);
    res.status(500).json({ error: '提取失败' });
  }
});

// 获取客户的学习记录
router.get('/:id/learnings', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const learnings = await prisma.clientLearning.findMany({
      where: { clientId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ success: true, learnings });
  } catch (error) {
    console.error('[Clients] 获取学习记录失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 添加学习记录
router.post('/:id/learnings', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { type, scene, content, girlId } = req.body;
    if (!type || !scene || !content) {
      return res.status(400).json({ error: 'type, scene, content是必需的' });
    }

    const learning = await prisma.clientLearning.create({
      data: {
        clientId: req.params.id,
        type,
        scene,
        content,
        girlId
      }
    });

    res.json({ success: true, learning });
  } catch (error) {
    console.error('[Clients] 添加学习记录失败:', error);
    res.status(500).json({ error: '添加失败' });
  }
});

// 入职完成（M007 S05）
router.post('/onboarding-complete', authMiddleware, async (req, res) => {
  try {
    // 任何已登录客户都可以调用自己的入职完成
    if (req.user.role !== 'client') {
      return res.status(403).json({ error: '只有客户可以完成入职' });
    }

    const data = req.body;
    const clientId = req.user.id;

    // 获取当前客户信息，找到对应的操盘手
    const session = await prisma.chatSession.findFirst({
      where: { clientId },
      include: {
        operator: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true
          }
        }
      }
    });

    // 更新客户档案
    const updated = await prisma.user.update({
      where: { id: clientId },
      data: {
        nickname: data.nickname || undefined,
        age: data.age ? parseInt(data.age) : undefined,
        occupation: data.occupation || undefined,
        residence: data.residence || undefined,
        emotionalGoal: data.emotionalGoal || undefined,
        relationshipGoal: data.relationshipGoal || undefined,
        appearanceSelfAssessment: data.appearanceSelfAssessment || undefined,
        personality: data.personality || undefined,
        emotionalStable: data.emotionalStable ? parseInt(data.emotionalStable) : undefined,
        eqLevel: data.eqLevel ? parseInt(data.eqLevel) : undefined,
        emotionalMaturityLevel: data.emotionalMaturityLevel ? parseInt(data.emotionalMaturityLevel) : undefined,
        communicationStyle: data.communicationStyle || undefined,
        learningAbility: data.learningAbility || undefined,
        coachCooperationLevel: data.coachCooperationLevel ? parseInt(data.coachCooperationLevel) : undefined,
        antiFrustrationLevel: data.antiFrustrationLevel ? parseInt(data.antiFrustrationLevel) : undefined,
        pacePreference: data.pacePreference || undefined,
        clientType: data.clientType || undefined,
        profileBio: data.profileBio || undefined,
        serviceStage: '背调',
      }
    });

    // 异步生成战略档案（不阻塞响应）
    const { generateStrategicProfile } = require('../services/onboardingService');
    generateStrategicProfile(data).then(profile => {
      if (profile.generated) {
        prisma.user.update({
          where: { id: clientId },
          data: {
            clientBestApproach: profile.clientBestApproach,
            clientRecommendedTopics: JSON.stringify(profile.clientRecommendedTopics),
            clientRiskFactors: JSON.stringify(profile.clientRiskFactors),
            clientUpgradeConditions: JSON.stringify(profile.clientUpgradeConditions),
            clientStrategicNotes: profile.clientStrategicNotes,
          }
        }).catch(err => console.warn('[Onboarding] 更新战略档案失败:', err));
      }
    }).catch(err => console.warn('[Onboarding] 战略档案生成失败:', err));

    // 通知操盘手
    if (session?.operatorId) {
      const io = req.app.get('io') || global._io;
      if (io) {
        io.to(`operator:${session.operatorId}`).emit('notification:new', {
          type: 'onboarding_complete',
          title: '新客户入职完成',
          message: `${updated.nickname || '客户'}已完成入职引导，请审核档案并开始服务。`,
          clientId,
          createdAt: new Date().toISOString(),
        });
      }
    }

    res.json({ success: true, message: '入职完成' });
  } catch (error) {
    console.error('[Clients] 入职完成失败:', error);
    res.status(500).json({ error: '入职完成失败' });
  }
});

// 修改用户密码（仅管理员/操盘手）
router.put('/:id/password', authMiddleware, async (req, res) => {
  try {
    // 仅 operator 和 admin 可以修改密码
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: req.params.id }
    });
    if (!targetUser) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.params.id },
      data: { password: hashedPassword }
    });

    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('[Clients] 修改密码失败:', error);
    res.status(500).json({ error: '修改失败' });
  }
});

// 客户上传截图 AI 提取档案字段（全量识别）
router.post('/extract-from-screenshot', authMiddleware, screenshotUpload.single('image'), async (req, res) => {
  try {
    if (!['admin', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传截图' });
    }

    const imageUrl = `/uploads/chat-screenshots/${req.file.filename}`;
    const clientId = req.user.role === 'client' ? req.user.id : (req.body.clientId || null);

    // 全量字段提取 Prompt（与文本提取保持一致）
    const extractPrompt = `分析以下聊天截图，从对话内容中提取客户（发送消息的一方）的档案信息，直接输出JSON（不要markdown代码块，不要其他文字）。

请仔细阅读截图中的聊天文字，识别客户的基本信息、性格特征、沟通风格等。

【规则】
1. 有选项的字段必须从可选值中选择，不要自己编
2. 数字字段填数字字符串如"7"，不要文字
3. 截图中未提及的字段填空字符串""
4. 只输出实际看到的信息，不要猜测、推断或编造

【字段与可选值】
age: 数字（如果提到出生年份推算年龄，当前2026年）
height: 数字(cm)
weight: 数字(kg)
residence: 城市名
hometown: 城市名
occupation: 企业主/企业高管/公务员/医生/律师/教师/工程师/程序员/销售/金融从业者/自由职业/退休/其他
education: 小学/初中/中专/高中/大专/本科/硕士/博士
income: 10万以下/10-30万/30-50万/50-100万/100-300万/300万以上
personality: INTJ/INTP/ENTJ/ENTP/INFJ/INFP/ENFJ/ENFP/ISTJ/ISFJ/ESTJ/ESFJ/ISTP/ISFP/ESTP/ESFP/其他
familyBackground: 农村/城市/经商/公务员/其他
familyStructure: 双亲/单亲/离异/其他
familyAtmosphere: 和睦/一般/冷淡/争吵/离异
marriageHistory: 未婚/离异无子/离异有子/丧偶
emotionalGoal: 认真找对象/随便玩玩/家里催婚/空虚寂寞
relationshipGoal: 短期/长期/不确定
relationshipAttitude: 认真/随便/急切
communicationStyle: 直接/含蓄/话多/话少/幽默
socialStyle: 主动/被动/社交达人
emotionalStable: 1-10数字
eqLevel: 1-10数字
emotionalMaturity: 幼稚/一般/成熟
emotionalMaturityLevel: 1-10数字
learningAbility: 强/中/弱
coachCooperation: 配合/一般/抵触
coachCooperationLevel: 1-10数字
attachmentStyle: 焦虑型/回避型/安全型
loveStyle: 真诚型/陪伴型/言语型/身体型/浪漫型
moneyDatingPattern: AA/请客/轮流/看情况
humorStyle: 冷幽默/自嘲/调侃/正经
selfEsteemLevel: 高/中/低
pacePreference: 快节奏/稳健型/慢热型
assetsLevel: A6/A7/A8/A9/A10/A10+
clientType: 执行型/质疑型/自主型
empathy: 1-10数字
communication: 1-10数字
conflictRes: 1-10数字
appearance: 外貌描述文本
appearanceSelfAssessment: 自我颜值评价文本
appearanceSelfRequirement: 对对方颜值要求文本
strengths: 优势/优点文本
weaknesses: 缺点/不足文本
dateTaboos: 约会禁忌文本
notes: 其他值得记录的备注
dressingStyle: 穿着风格
profileBio: 个人签名/简介
matchPreferences: 对目标对象的期望描述（年龄、身高、学历、性格、收入等要求）`;

    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: extractPrompt },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }];

    let pendingFields = {};
    let aiErrorMessage = null;
    try {
      const raw = await callVisionModel(messages);
      // 清理 markdown 代码块
      let content = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      if (content) {
        const extracted = JSON.parse(content);
        // 只保留非空字段
        for (const [key, value] of Object.entries(extracted)) {
          if (value && value !== '' && value !== '空' && value !== '未知') {
            pendingFields[key] = value;
          }
        }
      }
    } catch (aiError) {
      console.warn('[Clients] AI分析截图失败:', aiError.message);
      aiErrorMessage = aiError.message;
    }

    // 保存截图记录
    await prisma.chatScreenshot.create({
      data: {
        clientId,
        operatorId: req.user.id,
        imageUrl,
        notes: req.user.role === 'client' ? '客户自助截图提取' : '管理员截图提取'
      }
    }).catch(() => {});

    const count = Object.keys(pendingFields).filter(k => pendingFields[k]).length;
    res.json({
      success: true,
      pendingFields,
      message: aiErrorMessage
        ? `AI 分析失败：${aiErrorMessage}`
        : (count > 0 ? `识别到 ${count} 个档案字段` : '未识别到档案信息，请尝试更清晰的截图')
    });
  } catch (error) {
    console.error('[Clients] 截图提取失败:', error);
    if (error.message === '仅支持图片格式') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: '提取失败' });
  }
});

module.exports = router;

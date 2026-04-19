/**
 * 客户管理路由
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const { JWT_SECRET, getAIConfig } = require('../config');

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
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
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
        trustLevel: true,
        interactionHeat: true,
        coachCooperation: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // 获取每个客户的女生数量
    const clientsWithGirls = await Promise.all(
      clients.map(async (client) => {
        const girlCount = await prisma.girl.count({
          where: { clientId: client.id }
        });
        return { ...client, girlCount };
      })
    );

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

    // 获取女生数量
    const girlCount = await prisma.girl.count({
      where: { clientId: req.user.id }
    });

    // 获取约会数量
    const dateCount = await prisma.date.count({
      where: { userId: req.user.id }
    });

    res.json({ success: true, client: { ...clientData, girlCount, dateCount } });
  } catch (error) {
    console.error('[Clients] 获取客户信息失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取客户详情（操盘手用）
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const client = await prisma.user.findUnique({
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

    if (!client) {
      return res.status(404).json({ error: '客户不存在' });
    }

    const { password, ...clientData } = client;
    res.json({ success: true, client: clientData });
  } catch (error) {
    console.error('[Clients] 获取客户详情失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建客户
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
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
  'nickname', 'phone', 'age', 'occupation', 'education', 'income', 'height',
  'residence', 'hometown', 'appearance', 'dressingStyle',
  'familyBackground', 'familyStructure', 'familyAtmosphere',
  'personality', 'communicationStyle', 'socialStyle',
  'relationshipAttitude', 'marriageHistory', 'emotionalGoal',
  'relationshipGoal', 'profileBio'
];

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const isSelfUpdate = req.user.role === 'client' && req.user.id === req.params.id;
    const isOperator = req.user.role === 'operator' || req.user.role === 'admin';

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
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.source !== undefined) updateData.source = data.source;
    if (data.serviceStartDate !== undefined) updateData.serviceStartDate = data.serviceStartDate;

    // 将空字符串转换为 null，避免 Prisma Int 字段类型错误
    const numericFields = ['age', 'height', 'trustLevel', 'interactionHeat', 'balance',
      'empathy', 'communication', 'conflictRes',
      'emotionalMaturityLevel', 'coachCooperationLevel'];
    for (const field of numericFields) {
      if (updateData[field] === '') {
        updateData[field] = null;
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
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { text } = req.body;
    if (!text || text.trim().length < 20) {
      return res.status(400).json({ error: '文本内容太少，请提供更完整的自我介绍（至少20字）' });
    }

    // 调用 AI 提取档案信息
    const aiConfig = getAIConfig();
    const extractPrompt = `你是一个客户档案信息提取专家。请从以下客户自我介绍文本中提取关键信息，生成结构化的档案字段。

【提取要求】
1. 严格按照提供的选项值提取或推断
2. 如果某项信息文本中未提及，填入空字符串
3. 年龄用数字，婚姻状况用选项中的英文标签
4. 所有文本字段用中文

【可选值】
- education: 小学/初中/中专/高中/大专/本科/硕士/博士
- income: 10万以下/10-30万/30-50万/50-100万/100-300万/300万以上
- familyBackground: 农村/城市/经商/公务员/其他
- familyStructure: 双亲/单亲/离异/其他
- familyAtmosphere: 和睦/一般/冷淡/争吵/离异
- personality: INTJ/INTP/ENTJ/ENTP/INFJ/INFP/ENFJ/ENFP/ISTJ/ISFJ/ESTJ/ESFJ/ISTP/ISFP/ESTP/ESFP/其他
- emotionalStable: 1-10的数字
- eqLevel: 1-10的数字
- communicationStyle: 直接/含蓄/话多/话少/幽默
- socialStyle: 主动/被动/社交达人
- relationshipAttitude: 认真/随便/急切
- marriageHistory: 未婚/离异无子/离异有子/丧偶
- emotionalGoal: 认真找对象/随便玩玩/家里催婚/空虚寂寞
- relationshipGoal: 短期/长期/不确定
- emotionalMaturity: 幼稚/一般/成熟
- emotionalMaturityLevel: 1-10的数字（根据文字描述推断：幼稚=1-3，一般=4-6，成熟=7-10）
- learningAbility: 强/中/弱
- coachCooperation: 配合/一般/抵触
- coachCooperationLevel: 1-10的数字（配合=7-10，一般=4-6，抵触=1-3）
- assetsLevel: A6/A7/A8/A9/A10/A10+
- clientType: 执行型/质疑型/自主型
- humorStyle: 冷幽默/自嘲/调侃/正经
- selfEsteemLevel: 高/中/低
- pacePreference: 快节奏/稳健型/慢热型
- residence: 北京/上海/广州/深圳/杭州/南京/苏州/成都/重庆/武汉/西安/天津/长沙/郑州/东莞/佛山/青岛/沈阳/大连/厦门/宁波/其他
- occupation: 企业主/企业高管/公务员/医生/律师/教师/工程师/程序员/销售/金融从业者/自由职业/退休/其他
- attachmentStyle: 焦虑型/回避型/安全型（根据文字描述推断）
- empathy: 1-10的数字
- communication: 1-10的数字
- conflictRes: 1-10的数字
- loveStyle: 真诚型/陪伴型/言语型/身体型/浪漫型
- moneyDatingPattern: AA/请客/轮流/看情况
- appearanceSelfAssessment: 根据外貌描述推断颜值区间，如"中等偏上"/"普通"/"帅气"/"其貌不扬"
- appearanceSelfRequirement: 对女生颜值的要求，如"中等即可"/"要漂亮的"/"不看重外表"
- dateTaboos: 约会雷区，如"不能太快"/"不能AA"/"不能问职业"

【输出格式】
请直接输出 JSON，不要有其他解释文字：
{
  "age": "38",
  "occupation": "制造业老板",
  "education": "本科",
  "income": "100-300万",
  "height": "175",
  "residence": "上海",
  "hometown": "浙江温州",
  "appearance": "微胖，戴眼镜，偏商务休闲风",
  "familyBackground": "城市",
  "familyStructure": "双亲",
  "familyAtmosphere": "和睦",
  "personality": "ENFP",
  "emotionalStable": "7",
  "eqLevel": "6",
  "communicationStyle": "直接",
  "socialStyle": "社交达人",
  "relationshipAttitude": "认真",
  "marriageHistory": "未婚",
  "emotionalGoal": "认真找对象",
  "relationshipGoal": "长期",
  "learningAbility": "强",
  "coachCooperation": "配合",
  "assetsLevel": "A8",
  "clientType": "执行型",
  "humorStyle": "冷幽默",
  "selfEsteemLevel": "高",
  "pacePreference": "稳健型",
  "strengths": "有钱/幽默/真诚",
  "weaknesses": "情商低/不会聊天",
  "attachmentStyle": "安全型",
  "empathy": "6",
  "communication": "5",
  "conflictRes": "4",
  "loveStyle": "浪漫型",
  "moneyDatingPattern": "请客",
  "appearanceSelfAssessment": "普通",
  "appearanceSelfRequirement": "不看重外表，聊得来就行",
  "dateTaboos": "不能问收入",
  "notes": "从文本中提取的其他备注信息"
}

【客户自我介绍文本】
${text}

请直接输出 JSON：`;

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
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Clients] AI提取失败:', response.status, errorText);
      return res.status(500).json({ error: 'AI服务请求失败' });
    }

    const result = await response.json();
    let content = result.choices?.[0]?.message?.content || '';

    // 清理 markdown 代码块
    content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(content);
    } catch (e) {
      console.error('[Clients] 解析AI输出失败:', content);
      return res.status(500).json({ error: 'AI输出格式错误，无法解析' });
    }

    res.json({ success: true, profile: extracted });
  } catch (error) {
    console.error('[Clients] 提取客户档案失败:', error);
    res.status(500).json({ error: '提取失败' });
  }
});

// 从聊天记录提取档案更新（操盘手交流后使用）
router.post('/:id/extract-from-chat', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
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
    const aiConfig = getAIConfig();
    const extractPrompt = `你是客户档案分析专家。操盘手刚刚和客户进行了一次深度交流，请从聊天记录中提取档案更新信息。

【当前客户档案】（供参考，如字段有值说明已有信息）
- 昵称：${client?.nickname || '未知'}
- 职业：${client?.occupation || '未知'}
- 年龄：${client?.age || '未知'}
- 性格：${client?.personality || '未知'}
- 情绪稳定：${client?.emotionalStable || '未知'}/10
- 情商：${client?.eqLevel || '未知'}/10
- 依恋类型：${client?.attachmentStyle || '未知'}
- 恋爱风格：${client?.loveStyle || '未知'}
- 买单观念：${client?.moneyDatingPattern || '未知'}
- 前任模式：${client?.pastRelationshipPattern || '未知'}
- 约会雷区：${client?.dateTaboos || '未知'}
- 舒适区：${client?.comfortZone || '未知'}
- 优点：${client?.strengths || '未知'}
- 缺点：${client?.weaknesses || '未知'}
- 客户类型：${client?.clientType || '未知'}
- 互动风格：${client?.interactionStyle || '未知'}
- 幽默风格：${client?.humorStyle || '未知'}
- 最佳策略：${client?.clientBestApproach || '未知'}
- 推荐话题：${client?.clientRecommendedTopics || '未知'}
- 风险因素：${client?.clientRiskFactors || '未知'}
- 战略备注：${client?.clientStrategicNotes || '未知'}
- 现有备注：${client?.notes || '无'}

【聊天记录】
${chatText}

【提取要求】
请从聊天记录中分析并提取以下内容：
1. 客户透露的新信息（之前档案没有的）
2. 客户的态度/情绪变化（对服务的配合度、对女生、对关系的看法等）
3. 客户的新雷区或新需求
4. 建议更新的现有字段值（如果有变化）
5. 给操盘手的战略建议（最佳策略/话题/风险/升级条件）

【输出格式】请直接输出 JSON，不要有任何其他文字：
{
  "newInsights": ["发现1", "发现2", ...],
  "updatedFields": {
    "attachmentStyle": "安全型",
    "emotionalStable": 7,
    "dateTaboos": "补充的新雷区内容",
    "loveStyle": "浪漫型",
    "clientStrategicNotes": "操盘手战略建议"
  },
  "confidence": 0.85,
  "strategicAnalysis": {
    "clientBestApproach": "真诚型",
    "clientRecommendedTopics": "健身,创业,旅行",
    "clientUpgradeConditions": "需要更多正向反馈",
    "clientRiskFactors": "容易在关系中退缩",
    "clientStrategicNotes": "多给正面鼓励，少施压"
  }
}

注意：
- 只输出JSON，不要有markdown代码块
- 如果某个字段在聊天记录中没有新的信息，不要输出它
- confidence表示这次分析的置信度（0-1），如果聊天记录信息量少就低一些
- strategicAnalysis为空对象表示AI分析部分置信度不足`;

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
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Clients] AI提取失败:', response.status, errorText);
      return res.status(500).json({ error: 'AI服务请求失败' });
    }

    const result = await response.json();
    let content = result.choices?.[0]?.message?.content || '';

    // 清理 markdown 代码块
    content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(content);
    } catch (e) {
      console.error('[Clients] 解析AI输出失败:', content);
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
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
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
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
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

module.exports = router;

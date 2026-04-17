/**
 * 客户管理路由
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'yutang-secret-key-2024';

// AI Provider 配置
const AI_PROVIDER = process.env.AI_PROVIDER || 'dashscope';
const ZHIPU_API_KEY = process.env.ZHIPUAI_API_KEY || "60bb0c8311af4755ba87b749353354d8.OePtWEfG8VYlmrtf";
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const DASHSCOPE_API_KEY = process.env.DASH_SCOPE_API_KEY;
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

function getAIConfig() {
  if (AI_PROVIDER === 'dashscope' && DASHSCOPE_API_KEY) {
    return {
      url: DASHSCOPE_API_URL,
      key: DASHSCOPE_API_KEY,
      model: 'qwen3.6-plus-2026-04-02'
    };
  }
  return {
    url: ZHIPU_API_URL,
    key: ZHIPU_API_KEY,
    model: 'glm-4'
  };
}

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
    const numericFields = ['age', 'height', 'trustLevel', 'interactionHeat', 'balance'];
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
- learningAbility: 强/中/弱
- coachCooperation: 配合/一般/抵触
- assetsLevel: A6/A7/A8/A9/A10/A10+
- clientType: 执行型/质疑型/自主型
- humorStyle: 冷幽默/自嘲/调侃/正经
- selfEsteemLevel: 高/中/低
- pacePreference: 快节奏/稳健型/慢热型
- residence: 北京/上海/广州/深圳/杭州/南京/苏州/成都/重庆/武汉/西安/天津/长沙/郑州/东莞/佛山/青岛/沈阳/大连/厦门/宁波/其他
- occupation: 企业主/企业高管/公务员/医生/律师/教师/工程师/程序员/销售/金融从业者/自由职业/退休/其他

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

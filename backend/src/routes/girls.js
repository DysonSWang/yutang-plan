/**
 * 女生资源池路由
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');
const activityService = require('../services/activityService');
const { evaluateRelationshipStage, setRelationshipStage, getStageHistory, VALID_STAGES, STAGE_LABELS } = require('../services/relationshipStage');
const { analyzeGirlText, analyzeGirlImage } = require('../services/profileEngine');

// ---- 截图上传 multer 配置 ----
const GIRL_SCREENSHOT_DIR = path.join(__dirname, '../../uploads/girl-screenshots');
if (!fs.existsSync(GIRL_SCREENSHOT_DIR)) {
  fs.mkdirSync(GIRL_SCREENSHOT_DIR, { recursive: true });
}
const girlScreenshotUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, GIRL_SCREENSHOT_DIR),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('仅支持图片格式：jpeg, jpg, png, gif, webp'));
  }
});

// ---- 快速记录图片上传 multer 配置 ----
const GIRL_NOTE_IMAGE_DIR = path.join(__dirname, '../../uploads/girl-note-images');
if (!fs.existsSync(GIRL_NOTE_IMAGE_DIR)) {
  fs.mkdirSync(GIRL_NOTE_IMAGE_DIR, { recursive: true });
}
const girlNoteImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, GIRL_NOTE_IMAGE_DIR),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('仅支持图片格式：jpeg, jpg, png, gif, webp'));
  }
});

// 客户可编辑的女生档案字段（不含系统分析/AI生成字段）
const GIRL_CLIENT_EDITABLE_FIELDS = new Set([
  'name', 'age', 'occupation', 'education', 'major', 'hometown', 'residence', 'workplace',
  'appearance', 'height', 'weight', 'bodyType', 'styleTags', 'photos', 'avatar', 'homepageUrl', 'videos',
  'familyBackground', 'familyAtmosphere', 'familyBurden', 'familyComments',
  'workSchedule', 'socialActivity', 'financialHabits',
  'interests', 'dietPreferences', 'dietRestrictions', 'hobbiesDetail',
  'relationshipAttitude', 'pastRelationshipSummary', 'emotionalWounds', 'attachmentStyle', 'dealbreakers',
  'isKinkOriented', 'kinkIdentity', 'kinkBoundaries', 'kinkInterests', 'kinkExperience', 'kinkNotes',
  'sourcePlatform', 'sourceUrl', 'notes', 'momentPhotos', 'infoNotes'
]);

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: { code: 'A0101', message: '未提供认证令牌' } });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: { code: 'A0102', message: '认证令牌无效' } });
  }
};

// 获取客户的所有女生
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { clientId, status, stage } = req.query;

    let where = {};
    if (req.user.role === 'client') {
      where.clientId = req.user.id;
    } else if (clientId) {
      // 安全：操盘手只能查询自己负责的客户（admin 跳过）
      if (req.user.role !== 'admin') {
        const session = await prisma.chatSession.findFirst({
          where: { operatorId: req.user.id, clientId }
        });
        if (!session) {
          return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此客户的数据' } });
        }
      }
      where.clientId = clientId;
    }

    if (status) where.status = status;
    if (stage) where.stage = stage;

    const girls = await prisma.girl.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ success: true, girls });
  } catch (error) {
    console.error('[Girls] 获取女生列表失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '获取女生列表失败，请稍后重试' } });
  }
});

// 获取女生详情
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    // 先查基本信息
    let girl;
    try {
      girl = await prisma.girl.findUnique({
        where: { id: req.params.id }
      });
    } catch (dbError) {
      console.warn('[Girls] 基本查询失败:', dbError.message);
      return res.status(500).json({ error: { code: 'S0802', message: '获取女生信息失败，请稍后重试' } });
    }

    if (!girl) {
      return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    }

    if (req.user.role === 'client' && girl.clientId !== req.user.id) {
      return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此女生数据' } });
    }

    // 尝试附带关联数据，如果失败则返回空数组
    let chatLogs = [];
    let dates = [];

    try {
      const withRelations = await prisma.girl.findUnique({
        where: { id: req.params.id },
        include: {
          chatLogs: {
            orderBy: { createdAt: 'desc' },
            take: 20
          },
          dates: {
            orderBy: { dateTime: 'desc' },
            take: 10
          }
        }
      });
      chatLogs = withRelations.chatLogs || [];
      dates = withRelations.dates || [];
    } catch (relError) {
      console.warn('[Girls] 获取关联数据失败，使用空数组:', relError.message);
    }

    res.json({ success: true, girl: { ...girl, chatLogs, dates } });
  } catch (error) {
    console.error('[Girls] 获取女生详情失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '获取女生详情失败，请稍后重试' } });
  }
});

// 创建女生
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const data = req.body;
    const required = ['clientId', 'name'];
    for (const field of required) {
      if (!data[field]) {
        return res.status(400).json({ error: { code: 'S0803', message: `${field}是必需的` } });
      }
    }

    // 安全：操盘手只能为自己的客户创建女生（admin 跳过）
    if (req.user.role !== 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: data.clientId }
      });
      if (!session) {
        return res.status(403).json({ error: { code: 'A0108', message: '无权为该客户创建女生' } });
      }
    }

    // 检查客户女生配额
    const client = await prisma.user.findUnique({ where: { id: data.clientId } });
    if (!client) {
      return res.status(404).json({ error: { code: 'C0201', message: '客户不存在' } });
    }
    const currentCount = await prisma.girl.count({ where: { clientId: data.clientId } });
    const quota = client.girlQuota || 999;
    if (currentCount >= quota) {
      return res.status(403).json({ error: { code: 'C0202', message: `该客户女生额度已用完（${quota}人），请先调整配额` } });
    }

    const girl = await prisma.girl.create({
      data: {
        clientId: data.clientId,
        name: data.name,
        age: data.age,
        occupation: data.occupation,
        education: data.education,
        major: data.major,
        hometown: data.hometown,
        residence: data.residence,
        workplace: data.workplace,
        appearance: data.appearance,
        height: data.height ? parseInt(data.height) : null,
        bodyType: data.bodyType,
        photos: data.photos ? JSON.stringify(data.photos) : null,
        styleTags: data.styleTags,
        familyBackground: data.familyBackground,
        familyAtmosphere: data.familyAtmosphere,
        familyBurden: data.familyBurden,
        familyComments: data.familyComments,
        workSchedule: data.workSchedule,
        socialActivity: data.socialActivity,
        financialHabits: data.financialHabits,
        interests: data.interests,
        dietPreferences: data.dietPreferences,
        dietRestrictions: data.dietRestrictions,
        hobbiesDetail: data.hobbiesDetail,
        relationshipAttitude: data.relationshipAttitude,
        pastRelationshipSummary: data.pastRelationshipSummary,
        emotionalWounds: data.emotionalWounds,
        attachmentStyle: data.attachmentStyle,
        dealbreakers: data.dealbreakers,
        isKinkOriented: data.isKinkOriented || false,
        kinkIdentity: data.kinkIdentity,
        kinkBoundaries: data.kinkBoundaries,
        kinkInterests: data.kinkInterests,
        kinkExperience: data.kinkExperience,
        kinkNotes: data.kinkNotes,
        personality: data.personality,
        values_: data.values,
        communicationStyle: data.communicationStyle,
        emotionalTriggers: data.emotionalTriggers,
        talkingTopics: data.talkingTopics,
        thingsToAvoid: data.thingsToAvoid,
        stage: data.stage || '陌生',
        status: data.status || 'available',
        intimacyLevel: data.intimacyLevel || 1,
        tensionScore: data.tensionScore || 5.0,
        lastContact: data.lastContact || null,
        responsePattern: data.responsePattern,
        signals: data.signals ? JSON.stringify(data.signals) : null,
        pendingActions: data.pendingActions ? JSON.stringify(data.pendingActions) : null,
        observations: data.observations ? JSON.stringify(data.observations) : null,
        conversationSummary: data.conversationSummary,
        bestApproach: data.bestApproach,
        recommendedTopics: data.recommendedTopics,
        upgradeConditions: data.upgradeConditions,
        estimatedTimeline: data.estimatedTimeline,
        riskFactors: data.riskFactors,
        strategicNotes: data.strategicNotes,
        chatPartnerId: data.chatPartnerId,
        empathy: data.empathy,
        selfAwareness: data.selfAwareness,
        communication: data.communication,
        relationship: data.relationship,
        conflictRes: data.conflictRes,
        matchScore: data.matchScore,
        matchScoreBasis: data.matchScoreBasis,
        matePreferences: data.matePreferences,
        sourcePlatform: data.sourcePlatform,
        sourceUrl: data.sourceUrl,
        notes: data.notes
      }
    });

    res.json({ success: true, girl });
  } catch (error) {
    console.error('[Girls] 创建女生失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '创建女生失败，请稍后重试' } });
  }
});

// 更新女生
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const existing = await prisma.girl.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    }

    // 安全：操盘手只能操作自己负责的客户的女生（admin 跳过）
    if (req.user.role !== 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: existing.clientId }
      });
      if (!session) {
        return res.status(403).json({ error: { code: 'A0108', message: '无权操作此女生数据' } });
      }
    }

    const data = req.body;
    const updateData = {};

    // 基础信息
    if (data.name !== undefined) updateData.name = data.name;
    if (data.age !== undefined) updateData.age = data.age;
    if (data.occupation !== undefined) updateData.occupation = data.occupation;
    if (data.education !== undefined) updateData.education = data.education;
    if (data.major !== undefined) updateData.major = data.major;
    if (data.hometown !== undefined) updateData.hometown = data.hometown;
    if (data.residence !== undefined) updateData.residence = data.residence;
    if (data.workplace !== undefined) updateData.workplace = data.workplace;

    // 外貌特征
    if (data.appearance !== undefined) updateData.appearance = data.appearance;
    if (data.height !== undefined) updateData.height = data.height ? parseInt(data.height) : null;
    if (data.bodyType !== undefined) updateData.bodyType = data.bodyType || null;
    if (data.photos !== undefined) updateData.photos = data.photos ? JSON.stringify(data.photos) : null;
    if (data.momentPhotos !== undefined) updateData.momentPhotos = data.momentPhotos ? JSON.stringify(data.momentPhotos) : null;
    if (data.styleTags !== undefined) updateData.styleTags = data.styleTags;

    // 家庭背景
    if (data.familyBackground !== undefined) updateData.familyBackground = data.familyBackground;
    if (data.familyAtmosphere !== undefined) updateData.familyAtmosphere = data.familyAtmosphere;
    if (data.familyBurden !== undefined) updateData.familyBurden = data.familyBurden;
    if (data.familyComments !== undefined) updateData.familyComments = data.familyComments;

    // 生活状态
    if (data.workSchedule !== undefined) updateData.workSchedule = data.workSchedule;
    if (data.socialActivity !== undefined) updateData.socialActivity = data.socialActivity;
    if (data.financialHabits !== undefined) updateData.financialHabits = data.financialHabits;

    // 兴趣爱好
    if (data.interests !== undefined) updateData.interests = data.interests;
    if (data.dietPreferences !== undefined) updateData.dietPreferences = data.dietPreferences;
    if (data.dietRestrictions !== undefined) updateData.dietRestrictions = data.dietRestrictions;
    if (data.hobbiesDetail !== undefined) updateData.hobbiesDetail = data.hobbiesDetail;

    // 情感状态
    if (data.relationshipAttitude !== undefined) updateData.relationshipAttitude = data.relationshipAttitude;
    if (data.pastRelationshipSummary !== undefined) updateData.pastRelationshipSummary = data.pastRelationshipSummary;
    if (data.emotionalWounds !== undefined) updateData.emotionalWounds = data.emotionalWounds;
    if (data.attachmentStyle !== undefined) updateData.attachmentStyle = data.attachmentStyle;
    if (data.dealbreakers !== undefined) updateData.dealbreakers = data.dealbreakers;

    // 字母圈属性
    if (data.isKinkOriented !== undefined) updateData.isKinkOriented = data.isKinkOriented;
    if (data.kinkIdentity !== undefined) updateData.kinkIdentity = data.kinkIdentity;
    if (data.kinkBoundaries !== undefined) updateData.kinkBoundaries = data.kinkBoundaries;
    if (data.kinkInterests !== undefined) updateData.kinkInterests = data.kinkInterests;
    if (data.kinkExperience !== undefined) updateData.kinkExperience = data.kinkExperience;
    if (data.kinkNotes !== undefined) updateData.kinkNotes = data.kinkNotes;

    // 内在画像
    if (data.personality !== undefined) updateData.personality = data.personality;
    if (data.values !== undefined) updateData.values_ = data.values;
    if (data.communicationStyle !== undefined) updateData.communicationStyle = data.communicationStyle;
    if (data.emotionalTriggers !== undefined) updateData.emotionalTriggers = data.emotionalTriggers;
    if (data.talkingTopics !== undefined) updateData.talkingTopics = data.talkingTopics;
    if (data.thingsToAvoid !== undefined) updateData.thingsToAvoid = data.thingsToAvoid;

    // 关系状态
    if (data.stage !== undefined) updateData.stage = data.stage;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.intimacyLevel !== undefined) updateData.intimacyLevel = data.intimacyLevel;
    if (data.tensionScore !== undefined) updateData.tensionScore = data.tensionScore;
    if (data.lastContact !== undefined) updateData.lastContact = data.lastContact || null;
    if (data.responsePattern !== undefined) updateData.responsePattern = data.responsePattern;

    // 上下文记忆
    if (data.signals !== undefined) updateData.signals = data.signals ? JSON.stringify(data.signals) : null;
    if (data.pendingActions !== undefined) updateData.pendingActions = data.pendingActions ? JSON.stringify(data.pendingActions) : null;
    if (data.observations !== undefined) updateData.observations = data.observations ? JSON.stringify(data.observations) : null;
    if (data.conversationSummary !== undefined) updateData.conversationSummary = data.conversationSummary;

    // AI战略分析
    if (data.bestApproach !== undefined) updateData.bestApproach = data.bestApproach;
    if (data.recommendedTopics !== undefined) updateData.recommendedTopics = data.recommendedTopics;
    if (data.upgradeConditions !== undefined) updateData.upgradeConditions = data.upgradeConditions;
    if (data.estimatedTimeline !== undefined) updateData.estimatedTimeline = data.estimatedTimeline;
    if (data.riskFactors !== undefined) updateData.riskFactors = data.riskFactors;
    if (data.strategicNotes !== undefined) updateData.strategicNotes = data.strategicNotes;

    // 谙世画像
    if (data.chatPartnerId !== undefined) updateData.chatPartnerId = data.chatPartnerId;
    if (data.empathy !== undefined) updateData.empathy = data.empathy;
    if (data.selfAwareness !== undefined) updateData.selfAwareness = data.selfAwareness;
    if (data.communication !== undefined) updateData.communication = data.communication;
    if (data.relationship !== undefined) updateData.relationship = data.relationship;
    if (data.conflictRes !== undefined) updateData.conflictRes = data.conflictRes;

    // 元数据
    if (data.matchScore !== undefined) updateData.matchScore = data.matchScore;
    if (data.matchScoreBasis !== undefined) updateData.matchScoreBasis = data.matchScoreBasis;
    if (data.matePreferences !== undefined) updateData.matePreferences = data.matePreferences;
    if (data.sourcePlatform !== undefined) updateData.sourcePlatform = data.sourcePlatform;
    if (data.sourceUrl !== undefined) updateData.sourceUrl = data.sourceUrl;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const girl = await prisma.girl.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, girl });
  } catch (error) {
    console.error('[Girls] 更新女生失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '更新女生失败，请稍后重试' } });
  }
});

// 删除女生
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const existing = await prisma.girl.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    }
    // 安全：操盘手只能操作自己负责的客户的女生（admin 跳过）
    if (req.user.role !== 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: existing.clientId }
      });
      if (!session) {
        return res.status(403).json({ error: { code: 'A0108', message: '无权删除此女生' } });
      }
    }

    await prisma.girl.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Girls] 删除女生失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '删除女生失败，请稍后重试' } });
  }
});

// 更新亲密度
router.post('/:id/intimacy', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const existing = await prisma.girl.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    }
    // 安全：操盘手只能操作自己负责的客户的女生（admin 跳过）
    if (req.user.role !== 'admin') {
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId: existing.clientId }
      });
      if (!session) {
        return res.status(403).json({ error: { code: 'A0108', message: '无权操作此女生' } });
      }
    }

    const { level } = req.body;

    const girl = await prisma.girl.update({
      where: { id: req.params.id },
      data: { intimacyLevel: level }
    });

    res.json({ success: true, girl });
  } catch (error) {
    console.error('[Girls] 更新亲密度失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '更新女生失败，请稍后重试' } });
  }
});

// 客户自己添加女生（带额度校验）
router.post('/client-add', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { name, age, occupation } = req.body;
    if (!name) {
      return res.status(400).json({ error: { code: 'S0803', message: '昵称是必需的' } });
    }

    const client = await prisma.user.findUnique({ where: { id: req.user.id } });
    const currentCount = await prisma.girl.count({ where: { clientId: req.user.id } });
    const quota = client.girlQuota || 1;

    if (currentCount >= quota) {
      return res.status(403).json({
        error: { code: 'C0202', message: `额度已用完（${currentCount}/${quota}人）`, currentCount, quota },
      });
    }

    const girl = await prisma.girl.create({
      data: {
        clientId: req.user.id,
        name,
        age: age ? parseInt(age) : null,
        occupation: occupation || null,
        stage: '陌生',
        status: 'available',
        intimacyLevel: 1,
        tensionScore: 5.0
      }
    });

    // 记录活跃度
    activityService.recordActivity(req.user.id, 'girl_add', {
      girlId: girl.id,
    }).catch(err => console.error(`[Activity] 记录girl_add失败: ${err.message}`));

    res.json({ success: true, girl, quotaLeft: quota - currentCount - 1 });
  } catch (error) {
    console.error('[Girls] 客户添加女生失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '添加进展失败，请稍后重试' } });
  }
});

// ---------------------------------------------------------------------------
// 客户端更新女生头像
// ---------------------------------------------------------------------------
router.patch('/:id/avatar', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const girl = await prisma.girl.findUnique({
      where: { id: req.params.id }
    });

    if (!girl) {
      return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    }

    if (girl.clientId !== req.user.id) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { avatar } = req.body;

    const updated = await prisma.girl.update({
      where: { id: girl.id },
      data: { avatar: avatar || null }
    });

    res.json({ success: true, girl: updated });
  } catch (error) {
    console.error('[Girls] 更新头像失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '更新女生失败，请稍后重试' } });
  }
});

// ---------------------------------------------------------------------------
// 关系阶段路由（M007 S01 T02）
// ---------------------------------------------------------------------------

// 所有权校验辅助函数
async function checkGirlOwnership(girlId, user) {
  const girl = await prisma.girl.findUnique({ where: { id: girlId } });
  if (!girl) return { error: { code: 'G0301', message: '女生不存在' }, girl: null };
  if (user.role === 'client' && girl.clientId !== user.id) return { error: { code: 'A0108', message: '无权限访问此女生数据' }, girl };
  if (user.role === 'admin') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: user.id, clientId: girl.clientId }
    });
    if (!session) return { error: { code: 'A0108', message: '无权限访问此女生数据' }, girl };
  }
  return { error: null, girl };
}

// 获取关系阶段变更历史
router.get('/:id/stage-history', authMiddleware, async (req, res) => {
  try {
    const { error } = await checkGirlOwnership(req.params.id, req.user);
    if (error) return res.status(403).json({ error });

    const history = await getStageHistory(req.params.id);
    res.json({ success: true, history });
  } catch (error) {
    console.error('[Girls] 获取阶段历史失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '获取进展失败，请稍后重试' } });
  }
});

// AI 评估关系阶段（返回推荐，不自动写入）
router.post('/:id/evaluate-stage', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    const { error } = await checkGirlOwnership(req.params.id, req.user);
    if (error) return res.status(403).json({ error });

    const result = await evaluateRelationshipStage(req.params.id, req.user.id);
    res.json({
      success: true,
      evaluation: result,
      validStages: VALID_STAGES.map(s => ({ value: s, label: STAGE_LABELS[s] }))
    });
  } catch (error) {
    console.error('[Girls] AI 阶段评估失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: error.message || '评估失败' } });
  }
});

// 手动设置关系阶段
router.put('/:id/relationship-stage', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    const { error } = await checkGirlOwnership(req.params.id, req.user);
    if (error) return res.status(403).json({ error });

    const { stage, reason, source } = req.body;
    if (!stage) {
      return res.status(400).json({ error: { code: 'S0803', message: 'stage 是必需的' } });
    }
    if (!VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: { code: 'G0303', message: `无效阶段值。有效值: ${VALID_STAGES.join(', ')}` } });
    }

    const result = await setRelationshipStage(
      req.params.id,
      stage,
      reason || null,
      req.user.id,
      source || 'manual'
    );

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Girls] 设置关系阶段失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: error.message || '设置失败' } });
  }
});

// ---------------------------------------------------------------------------
// 客户端编辑女生档案
// ---------------------------------------------------------------------------
router.put('/:id/client-update', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const girl = await prisma.girl.findUnique({ where: { id: req.params.id } });
    if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    if (girl.clientId !== req.user.id) return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });

    const data = req.body;
    const updateData = {};

    const stringFields = ['name', 'occupation', 'education', 'major', 'hometown', 'residence', 'workplace',
      'appearance', 'bodyType', 'styleTags', 'avatar', 'homepageUrl',
      'familyBackground', 'familyAtmosphere', 'familyBurden', 'familyComments',
      'workSchedule', 'socialActivity', 'financialHabits',
      'interests', 'dietPreferences', 'dietRestrictions', 'hobbiesDetail',
      'relationshipAttitude', 'pastRelationshipSummary', 'emotionalWounds', 'attachmentStyle', 'dealbreakers',
      'kinkIdentity', 'kinkBoundaries', 'kinkInterests', 'kinkExperience', 'kinkNotes',
      'sourcePlatform', 'sourceUrl', 'notes'];
    const intFields = ['age', 'height'];
    const floatFields = ['weight'];
    const jsonFields = ['photos', 'videos', 'momentPhotos', 'infoNotes'];
    const boolFields = ['isKinkOriented'];

    for (const key of stringFields) {
      if (data[key] !== undefined && GIRL_CLIENT_EDITABLE_FIELDS.has(key)) {
        updateData[key] = data[key] === '' ? null : data[key];
      }
    }
    for (const key of intFields) {
      if (data[key] !== undefined && GIRL_CLIENT_EDITABLE_FIELDS.has(key)) {
        updateData[key] = data[key] ? parseInt(data[key]) : null;
      }
    }
    for (const key of floatFields) {
      if (data[key] !== undefined && GIRL_CLIENT_EDITABLE_FIELDS.has(key)) {
        updateData[key] = data[key] ? parseFloat(data[key]) : null;
      }
    }
    for (const key of jsonFields) {
      if (data[key] !== undefined && GIRL_CLIENT_EDITABLE_FIELDS.has(key)) {
        updateData[key] = data[key] ? JSON.stringify(data[key]) : null;
      }
    }
    for (const key of boolFields) {
      if (data[key] !== undefined && GIRL_CLIENT_EDITABLE_FIELDS.has(key)) {
        updateData[key] = !!data[key];
      }
    }

    // 自动推断体型（仅当 bodyType 为空且 height 和 weight 都有值时）
    if (!updateData.bodyType && !girl.bodyType) {
      const h = updateData.height || girl.height;
      const w = updateData.weight || girl.weight;
      if (h && w && h > 0 && w > 0) {
        const heightM = h / 100;
        const bmi = w / (heightM * heightM);
        if (bmi < 18.5) updateData.bodyType = '偏瘦';
        else if (bmi < 24) updateData.bodyType = '标准';
        else if (bmi < 28) updateData.bodyType = '微胖';
        else updateData.bodyType = '偏胖';
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: { code: 'S0803', message: '没有可更新的字段' } });
    }

    const updated = await prisma.girl.update({
      where: { id: girl.id },
      data: updateData
    });

    res.json({ success: true, girl: updated });
  } catch (error) {
    console.error('[Girls] 客户端更新失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '更新女生失败，请稍后重试' } });
  }
});

// ---------------------------------------------------------------------------
// AI 文字提取女生档案 (SSE 流式)
// ---------------------------------------------------------------------------
router.post('/:id/extract-text', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const girl = await prisma.girl.findUnique({ where: { id: req.params.id } });
    if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    if (girl.clientId !== req.user.id) return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });

    const { text } = req.body;
    if (!text || text.trim().length < 10) {
      return res.status(400).json({ error: { code: 'S0803', message: '请至少输入10个字的描述' } });
    }

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const girlProfile = {
      name: girl.name,
      age: girl.age,
      occupation: girl.occupation,
      education: girl.education,
      major: girl.major,
      hometown: girl.hometown,
      residence: girl.residence,
      workplace: girl.workplace,
      stage: girl.stage,
      tensionScore: girl.tensionScore,
      recentSignals: girl.signals ? JSON.parse(girl.signals) : []
    };

    try {
      const result = await analyzeGirlText(girlProfile, text.trim());
      if (result) {
        // 从 profileUpdates 嵌套字段中提取（AI 返回的结构含 profileUpdates 子对象）
        const updates = result.profileUpdates || result;
        const pendingFields = {};
        const skipKeys = ['signals', 'pendingActions', 'observations', 'tensionScore', 'stage'];
        const { GIRL_FIELD_LABELS } = require('../services/profileEngine');

        for (const [key, value] of Object.entries(updates)) {
          if (skipKeys.includes(key)) continue;
          if (value === null || value === undefined || value === '') continue;
          if (typeof value === 'object') continue;
          const strValue = String(value).trim();
          if (!strValue || strValue === '未知' || strValue === '空' || strValue === '无' || strValue === '暂无') continue;
          const label = GIRL_FIELD_LABELS[key];
          if (!label) continue;
          if (!GIRL_CLIENT_EDITABLE_FIELDS.has(key)) continue;
          const currentValue = girl[key];
          if (currentValue !== null && currentValue !== undefined && currentValue !== '') continue;
          pendingFields[key] = { label, value: strValue };
        }

        res.write(`event: done\ndata: ${JSON.stringify({ success: true, pendingFields })}\n\n`);
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ error: { code: 'A0603', message: 'AI未能识别出有效信息，请尝试更详细的描述' } })}\n\n`);
      }
    } catch (aiError) {
      console.error('[Girls] AI提取失败:', aiError);
      res.write(`event: error\ndata: ${JSON.stringify({ error: { code: 'A0602', message: aiError.message || 'AI分析失败' } })}\n\n`);
    }

    res.end();
  } catch (error) {
    console.error('[Girls] 文字提取失败:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'S0802', message: '提取女生信息失败，请稍后重试' } });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: { code: 'S0802', message: error.message } })}\n\n`);
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// 截图上传 + AI 提取女生档案
// ---------------------------------------------------------------------------
router.post('/:id/extract-screenshot', authMiddleware, (req, res) => {
  girlScreenshotUpload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: { code: 'U0703', message: err.message || '上传失败' } });
    }

    try {
      if (req.user.role !== 'client') {
        return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
      }

      const girl = await prisma.girl.findUnique({ where: { id: req.params.id } });
      if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
      if (girl.clientId !== req.user.id) return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });

      if (!req.file) {
        return res.status(400).json({ error: { code: 'U0701', message: '请上传图片' } });
      }

      const imageUrl = `/uploads/girl-screenshots/${req.file.filename}`;

      const girlProfile = {
        name: girl.name,
        age: girl.age,
        occupation: girl.occupation,
        education: girl.education,
        major: girl.major,
        hometown: girl.hometown,
        residence: girl.residence,
        workplace: girl.workplace,
        stage: girl.stage,
        tensionScore: girl.tensionScore,
        recentSignals: girl.signals ? JSON.parse(girl.signals) : []
      };

      const result = await analyzeGirlImage(girlProfile, imageUrl);

      if (result) {
        const updates = result.profileUpdates || result;
        const pendingFields = {};
        const skipKeys = ['signals', 'pendingActions', 'observations', 'tensionScore', 'stage'];
        const { GIRL_FIELD_LABELS } = require('../services/profileEngine');

        for (const [key, value] of Object.entries(updates)) {
          if (skipKeys.includes(key)) continue;
          if (value === null || value === undefined || value === '') continue;
          if (typeof value === 'object') continue;
          const strValue = String(value).trim();
          if (!strValue || strValue === '未知' || strValue === '空' || strValue === '无' || strValue === '暂无') continue;
          const label = GIRL_FIELD_LABELS[key];
          if (!label) continue;
          if (!GIRL_CLIENT_EDITABLE_FIELDS.has(key)) continue;
          const currentValue = girl[key];
          if (currentValue !== null && currentValue !== undefined && currentValue !== '') continue;
          pendingFields[key] = { label, value: strValue };
        }

        res.json({ success: true, pendingFields, imageUrl });
      } else {
        res.json({ success: true, pendingFields: {}, imageUrl, message: 'AI未能识别出有效信息' });
      }
    } catch (error) {
      console.error('[Girls] 截图提取失败:', error);
      res.status(500).json({ error: { code: 'S0802', message: error.message || '分析失败' } });
    }
  });
});

// ---------------------------------------------------------------------------
// 统一快速记录：文字 + 图片（最多5张），AI 提取档案字段
// ---------------------------------------------------------------------------
router.post('/:id/extract-note', authMiddleware, (req, res) => {
  girlNoteImageUpload.array('images', 5)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: { code: 'U0703', message: err.message || '上传失败' } });
    }

    try {
      if (req.user.role !== 'client') {
        return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
      }

      const girl = await prisma.girl.findUnique({ where: { id: req.params.id } });
      if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
      if (girl.clientId !== req.user.id) return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });

      const text = req.body.text?.trim() || '';
      const files = req.files || [];
      const hasText = text.length >= 10;
      const hasImages = files.length > 0;

      if (!hasText && !hasImages) {
        return res.status(400).json({ error: { code: 'S0803', message: '请至少输入10个字的描述或上传图片' } });
      }

      const girlProfile = {
        name: girl.name,
        age: girl.age,
        occupation: girl.occupation,
        education: girl.education,
        major: girl.major,
        hometown: girl.hometown,
        residence: girl.residence,
        workplace: girl.workplace,
        stage: girl.stage,
        tensionScore: girl.tensionScore,
        recentSignals: girl.signals ? JSON.parse(girl.signals) : []
      };

      // 并行分析：文字 + 每张图片
      const analysisTasks = [];
      if (hasText) {
        analysisTasks.push(
          analyzeGirlText(girlProfile, text).then(r => ({ source: 'text', result: r }))
        );
      }
      const imageUrls = [];
      for (const file of files) {
        const imageUrl = `/uploads/girl-note-images/${file.filename}`;
        imageUrls.push(imageUrl);
        analysisTasks.push(
          analyzeGirlImage(girlProfile, imageUrl).then(r => ({ source: 'image', imageUrl, result: r }))
        );
      }

      const analysisResults = await Promise.allSettled(analysisTasks);

      // 合并所有成功的分析结果
      const mergedUpdates = {};
      for (const r of analysisResults) {
        if (r.status === 'rejected') continue;
        const updates = r.value.result?.profileUpdates || r.value.result || {};
        Object.assign(mergedUpdates, updates);
      }

      // 过滤 pendingFields：仅空字段 + 白名单内
      const pendingFields = {};
      const skipKeys = ['signals', 'pendingActions', 'observations', 'tensionScore', 'stage'];
      const { GIRL_FIELD_LABELS } = require('../services/profileEngine');

      for (const [key, value] of Object.entries(mergedUpdates)) {
        if (skipKeys.includes(key)) continue;
        if (value === null || value === undefined || value === '') continue;
        if (typeof value === 'object') continue;
        const strValue = String(value).trim();
        if (!strValue || strValue === '未知' || strValue === '空' || strValue === '无' || strValue === '暂无') continue;
        const label = GIRL_FIELD_LABELS[key];
        if (!label) continue;
        if (!GIRL_CLIENT_EDITABLE_FIELDS.has(key)) continue;
        const currentValue = girl[key];
        if (currentValue !== null && currentValue !== undefined && currentValue !== '') continue;
        pendingFields[key] = { label, value: strValue };
      }

      const failedCount = analysisResults.filter(r => r.status === 'rejected').length;
      res.json({
        success: true,
        pendingFields,
        imageUrls,
        text: hasText ? text : '',
        analysisSummary: {
          total: analysisTasks.length,
          succeeded: analysisResults.filter(r => r.status === 'fulfilled').length,
          failed: failedCount
        }
      });
    } catch (error) {
      console.error('[Girls] 快速记录分析失败:', error);
      res.status(500).json({ error: { code: 'S0802', message: error.message || '分析失败' } });
    }
  });
});

// ---------------------------------------------------------------------------
// 用户主页截图上传 + AI 提取基础档案（昵称、地区、年龄）
// ---------------------------------------------------------------------------
const GIRL_PROFILE_DIR = path.join(__dirname, '../../uploads/girl-profiles');
if (!fs.existsSync(GIRL_PROFILE_DIR)) {
  fs.mkdirSync(GIRL_PROFILE_DIR, { recursive: true });
}
const girlProfileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, GIRL_PROFILE_DIR),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('仅支持图片格式：jpeg, jpg, png, gif, webp'));
  }
});

router.post('/extract-profile-screenshot', authMiddleware, (req, res) => {
  girlProfileUpload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: { code: 'U0703', message: err.message || '上传失败' } });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: { code: 'U0701', message: '请上传图片' } });
      }

      const { analyzeProfileImage } = require('../services/profileEngine');
      const imageUrl = `/uploads/girl-profiles/${req.file.filename}`;
      const result = await analyzeProfileImage(imageUrl);

      const extracted = {};
      if (result?.name && result.name !== '空' && result.name !== '') extracted.name = result.name;
      if (result?.age && typeof result.age === 'number') extracted.age = result.age;
      if (result?.residence && result.residence !== '空' && result.residence !== '') extracted.residence = result.residence;
      if (result?.appearance && result.appearance !== '空' && result.appearance !== '') extracted.appearance = result.appearance;

      res.json({
        success: true,
        extracted,
        imageUrl
      });
    } catch (error) {
      console.error('[Girls] 主页截图提取失败:', error);
      // 技术错误返回 500，但修复失败返回空结果
      res.json({ success: true, extracted: {}, imageUrl: `/uploads/girl-profiles/${req.file?.filename || 'unknown'}` });
    }
  });
});

// ---------------------------------------------------------------------------
// 获取女生关联数据（约会 + 阶段历史 + 信号/待办/观察）
// ---------------------------------------------------------------------------
router.get('/:id/related', authMiddleware, async (req, res) => {
  try {
    const girl = await prisma.girl.findUnique({ where: { id: req.params.id } });
    if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });
    if (req.user.role === 'client' && girl.clientId !== req.user.id) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const [dates, stageHistory] = await Promise.all([
      prisma.date.findMany({
        where: { girlId: req.params.id },
        orderBy: { dateTime: 'desc' },
        take: 10
      }),
      prisma.relationshipStageHistory.findMany({
        where: { girlId: req.params.id },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    ]);

    const signals = girl.signals ? JSON.parse(girl.signals) : [];
    const pendingActions = girl.pendingActions ? JSON.parse(girl.pendingActions) : [];
    const observations = girl.observations ? JSON.parse(girl.observations) : [];

    res.json({
      success: true,
      dates,
      stageHistory,
      signals,
      pendingActions,
      observations,
      conversationSummary: girl.conversationSummary
    });
  } catch (error) {
    console.error('[Girls] 获取关联数据失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '获取进展失败，请稍后重试' } });
  }
});

module.exports = router;

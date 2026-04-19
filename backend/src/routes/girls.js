/**
 * 女生资源池路由
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const { JWT_SECRET } = require('../config');

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

// 获取客户的所有女生
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { clientId, status, stage } = req.query;

    let where = {};
    if (req.user.role === 'client') {
      where.clientId = req.user.id;
    } else if (clientId) {
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
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取女生详情
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const girl = await prisma.girl.findUnique({
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

    if (!girl) {
      return res.status(404).json({ error: '女生不存在' });
    }

    if (req.user.role === 'client' && girl.clientId !== req.user.id) {
      return res.status(403).json({ error: '无权限' });
    }

    res.json({ success: true, girl });
  } catch (error) {
    console.error('[Girls] 获取女生详情失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建女生
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const data = req.body;
    const required = ['clientId', 'name'];
    for (const field of required) {
      if (!data[field]) {
        return res.status(400).json({ error: `${field}是必需的` });
      }
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
    res.status(500).json({ error: '创建失败' });
  }
});

// 更新女生
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const existing = await prisma.girl.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: '女生不存在' });
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
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除女生
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    await prisma.girl.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Girls] 删除女生失败:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 更新亲密度
router.post('/:id/intimacy', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { level } = req.body;

    const girl = await prisma.girl.update({
      where: { id: req.params.id },
      data: { intimacyLevel: level }
    });

    res.json({ success: true, girl });
  } catch (error) {
    console.error('[Girls] 更新亲密度失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

module.exports = router;

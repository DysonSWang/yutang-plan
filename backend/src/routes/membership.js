/**
 * 会员、积分、邀请、截图档案路由
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');
const membershipService = require('../services/membershipService');
const activityService = require('../services/activityService');
const AppError = require('../errors/AppError');
const personalizationEngine = require('../services/personalizationEngine');

// 百度地图 Geocoding（地址转坐标，支持全国）
async function geocode(address) {
  const { execFileSync } = require('child_process');
  const ak = process.env.BAIDU_MAP_AK;
  if (!ak) {
    console.warn('[Membership] 百度地图AK未配置');
    return null;
  }
  try {
    const env = { ...process.env, https_proxy: 'http://127.0.0.1:7897', http_proxy: 'http://127.0.0.1:7897' };
    const output = execFileSync('curl', [
      '-s',
      `https://api.map.baidu.com/geocoding/v3/?address=${encodeURIComponent(address)}&ak=${ak}&output=json`
    ], { timeout: 10000, env });
    const data = JSON.parse(output.toString());
    if (data.status === 0 && data.result) {
      return {
        lng: parseFloat(data.result.location.lng),
        lat: parseFloat(data.result.location.lat)
      };
    }
    console.warn('[Membership] Geocoding失败:', data.message || data.msg);
  } catch (e) {
    console.error('[Membership] Geocoding异常:', e.message);
  }
  return null;
}

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch { res.status(401).json({ error: 'token无效' }); }
};

// Operator-only middleware
const operatorOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权限' });
  }
  next();
};

// ==========================================
// 会员
// ==========================================

// 获取我的会员状态
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const status = await membershipService.getMembershipStatus(req.user.id);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 档案完善度（与个性化学习引擎使用统一计算逻辑）
router.get('/profile-completeness', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: personalizationEngine.USER_PROFILE_SELECT,
    });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const completeness = personalizationEngine.calculateCompleteness(user);
    res.json({ success: true, completeness });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 购买/续费会员
router.post('/purchase', authMiddleware, async (req, res) => {
  try {
    const { type, pointsToUse, purchasedType } = req.body;
    const membership = await membershipService.purchaseMembership(
      req.user.id,
      type || 'monthly',
      parseInt(pointsToUse) || 0
    );
    res.json({ success: true, membership });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.status).json({ success: false, error: err.toJSON() });
    }
    res.status(400).json({ success: false, error: { code: 'S0801', message: err.message } });
  }
});

// 开通试用会员
router.post('/trial/activate', authMiddleware, async (req, res) => {
  try {
    const membership = await membershipService.activateTrial(req.user.id);
    res.json({ success: true, membership });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 获取试用配置
router.get('/trial/config', authMiddleware, async (req, res) => {
  try {
    const config = await membershipService.getTrialConfig();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新试用配置（管理员）
router.put('/trial/config', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { validDays, maxChapters, maxGirls, maxTrialUses } = req.body;
    const config = await membershipService.updateTrialConfig({
      validDays: parseInt(validDays) || 3,
      maxChapters: parseInt(maxChapters) || 2,
      maxGirls: parseInt(maxGirls) || 1,
      maxTrialUses: parseInt(maxTrialUses) || 2
    });
    res.json({ success: true, config });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 管理员：获取所有用户会员列表
router.get('/admin/list', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const clients = await prisma.user.findMany({
      where: { role: 'client' },
      select: {
        id: true,
        nickname: true,
        username: true,
        phone: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const clientsWithStatus = await Promise.all(clients.map(async (c) => {
      const status = await membershipService.getMembershipStatus(c.id);
      return { ...c, ...status };
    }));

    res.json({ success: true, clients: clientsWithStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员：设置/取消用户会员
router.post('/admin/set', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { userId, action, type, price, startDate, endDate } = req.body;
    if (action === 'cancel') {
      await prisma.membership.updateMany({
        where: { userId, status: 'active' },
        data: { status: 'cancelled' }
      });
      return res.json({ success: true });
    }
    if (action === 'set') {
      await prisma.membership.create({
        data: {
          userId,
          type: type || 'MONTHLY',
          status: 'active',
          price: parseFloat(price) || 0,
          pointsDiscount: 0,
          startDate: new Date(startDate || Date.now()),
          endDate: new Date(endDate || Date.now() + 30 * 86400000)
        }
      });
      return res.json({ success: true });
    }
    res.status(400).json({ error: '无效操作' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员：设置试用会员
router.post('/admin/trial', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { userId } = req.body;
    const membership = await membershipService.activateTrial(userId);
    res.json({ success: true, membership });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 积分
// ==========================================

// 获取积分余额和历史
router.get('/points', authMiddleware, async (req, res) => {
  try {
    const balance = await membershipService.getPointsBalance(req.user.id);
    const history = await membershipService.getPointsHistory(req.user.id, 50, 0);
    res.json({ success: true, balance, history: history.records, total: history.total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员：充值积分
router.post('/points/recharge', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    const record = await membershipService.rechargePoints(req.user.id, userId, parseInt(amount), note);
    res.json({ success: true, record });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 管理员：扣减积分
router.post('/points/deduct', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    const record = await membershipService.deductPoints(req.user.id, userId, parseInt(amount), note);
    res.json({ success: true, record });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 获取用户抵扣券列表
router.get('/coupons', authMiddleware, async (req, res) => {
  try {
    const coupons = await membershipService.getAvailableCoupons(req.user.id);
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员：发放抵扣券
router.post('/coupons/grant', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { userId, value, note } = req.body;
    const record = await membershipService.grantCoupon(req.user.id, userId, parseInt(value), note);
    res.json({ success: true, record });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 邀请
// ==========================================

// 生成/获取我的邀请码
router.post('/invitation/create', authMiddleware, async (req, res) => {
  try {
    const invitation = await membershipService.createInviteCode(req.user.id);
    res.json({ success: true, invitation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取我的邀请统计
router.get('/invitation/my-stats', authMiddleware, async (req, res) => {
  try {
    const stats = await membershipService.getMyInvitationStats(req.user.id);
    res.json({ success: true, ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 学习版块
// ==========================================

// 获取所有已上架章节（客户和操盘手都可用）
router.get('/learning/chapters', authMiddleware, async (req, res) => {
  try {
    const chapters = await prisma.learningChapter.findMany({
      where: { status: 'published' },
      orderBy: { orderIndex: 'asc' }
    });
    res.json({ success: true, chapters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取我的学习进度
router.get('/learning/progress', authMiddleware, async (req, res) => {
  try {
    const progress = await prisma.learningProgress.findMany({
      where: { userId: req.user.id }
    });
    res.json({ success: true, progress });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新学习进度
router.put('/learning/progress/:chapterId', authMiddleware, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { status } = req.body;

    const existing = await prisma.learningProgress.findUnique({
      where: { userId_chapterId: { userId: req.user.id, chapterId } }
    });

    let record;
    if (existing) {
      record = await prisma.learningProgress.update({
        where: { id: existing.id },
        data: {
          status,
          completedAt: status === 'completed' ? new Date() : existing.completedAt,
          lastVisitedAt: new Date()
        }
      });
    } else {
      record = await prisma.learningProgress.create({
        data: {
          userId: req.user.id,
          chapterId,
          status,
          completedAt: status === 'completed' ? new Date() : null,
          lastVisitedAt: new Date()
        }
      });
    }

    // 记录学习活跃
    activityService.recordActivity(req.user.id, 'learning').catch(console.error);

    res.json({ success: true, progress: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 学习版块 - 个性化
// ==========================================

// 获取所有章节的个性化状态
router.get('/learning/personalized-status', authMiddleware, async (req, res) => {
  try {
    const chapters = await prisma.learningChapter.findMany({
      where: { status: 'published' },
      orderBy: { orderIndex: 'asc' },
      select: { chapterId: true },
    });

    const personalized = await prisma.personalizedChapter.findMany({
      where: { userId: req.user.id },
      select: { chapterId: true, status: true, updatedAt: true },
    });

    const batch = await prisma.generationBatch.findFirst({
      where: { userId: req.user.id, status: 'processing' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, totalChapters: true, completedCount: true, failedCount: true },
    });

    const pMap = {};
    for (const p of personalized) {
      pMap[p.chapterId] = { status: p.status, generatedAt: p.updatedAt };
    }

    const chapterStatuses = chapters.map(ch => ({
      chapterId: ch.chapterId,
      status: pMap[ch.chapterId]?.status || 'pending',
      generatedAt: pMap[ch.chapterId]?.generatedAt || null,
    }));

    // 完善度
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { ...personalizationEngine.USER_PROFILE_SELECT, personalizationEnabled: true },
    });
    const completeness = personalizationEngine.calculateCompleteness(user);

    res.json({
      success: true,
      batchStatus: batch,
      completeness,
      chapters: chapterStatuses,
      personalizationEnabled: user.personalizationEnabled,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 触发全量批量生成
router.post('/learning/generate-all', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { ...personalizationEngine.USER_PROFILE_SELECT, personalizationEnabled: true },
    });

    if (!user.personalizationEnabled) {
      return res.status(403).json({ error: '个性化学习功能已禁用' });
    }

    const chapters = await prisma.learningChapter.findMany({
      where: { status: 'published' },
      orderBy: { orderIndex: 'asc' },
    });

    if (chapters.length === 0) {
      return res.status(400).json({ error: '暂无已上架章节' });
    }

    const batch = await personalizationEngine.generateAllChapters(
      req.user.id, user, chapters, prisma, req.app.get('io')
    );

    res.json({ success: true, batchId: batch.id });
  } catch (err) {
    if (err.message.includes('完善度不足')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// 查询生成进度
router.get('/learning/generate-status/:batchId', authMiddleware, async (req, res) => {
  try {
    const batch = await prisma.generationBatch.findUnique({
      where: { id: req.params.batchId },
    });

    if (!batch) return res.status(404).json({ error: '任务不存在' });
    if (batch.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权访问' });
    }

    res.json({ success: true, batch });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 画像更新后触发全量重新生成
router.post('/learning/regenerate', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { ...personalizationEngine.USER_PROFILE_SELECT, personalizationEnabled: true },
    });

    if (!user.personalizationEnabled) {
      return res.status(403).json({ error: '个性化学习功能已禁用' });
    }

    const chapters = await prisma.learningChapter.findMany({
      where: { status: 'published' },
      orderBy: { orderIndex: 'asc' },
    });

    if (chapters.length === 0) {
      return res.status(400).json({ error: '暂无已上架章节' });
    }

    const batch = await personalizationEngine.generateAllChapters(
      req.user.id, user, chapters, prisma, req.app.get('io')
    );

    res.json({ success: true, batchId: batch.id });
  } catch (err) {
    if (err.message.includes('完善度不足')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// 单章重试
router.post('/learning/regenerate/:chapterId', authMiddleware, async (req, res) => {
  try {
    const { chapterId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { ...personalizationEngine.USER_PROFILE_SELECT, personalizationEnabled: true },
    });

    if (!user.personalizationEnabled) {
      return res.status(403).json({ error: '个性化学习功能已禁用' });
    }

    const chapter = await prisma.learningChapter.findUnique({
      where: { chapterId, status: 'published' },
    });
    if (!chapter) return res.status(404).json({ error: '章节不存在' });

    const result = await personalizationEngine.regenerateChapter(
      req.user.id, chapterId, user, chapter, prisma, req.app.get('io')
    );

    if (result.degraded) {
      return res.json({ success: false, degraded: true, error: result.error });
    }

    res.json({ success: true, chapterId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取单个章节（支持 standard/personalized 版本）
// 必须放在所有具名 /learning/* 路由之后，避免 :chapterId 匹配到它们
router.get('/learning/:chapterId', authMiddleware, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const version = req.query.version || 'standard';

    // 标准版
    if (version !== 'personalized') {
      const chapter = await prisma.learningChapter.findUnique({
        where: { chapterId, status: 'published' }
      });
      if (!chapter) return res.status(404).json({ error: '章节不存在' });

      // 记录事件
      await prisma.personalizationEvent.create({
        data: {
          userId: req.user.id,
          chapterId,
          event: 'impression',
          metadata: JSON.stringify({ version: 'standard' }),
        },
      }).catch(() => {});

      return res.json({ success: true, chapter });
    }

    // 个性化版本
    const chapter = await prisma.learningChapter.findUnique({
      where: { chapterId, status: 'published' }
    });
    if (!chapter) return res.status(404).json({ error: '章节不存在' });

    const personalized = await prisma.personalizedChapter.findUnique({
      where: { userId_chapterId: { userId: req.user.id, chapterId } }
    });

    if (!personalized || personalized.status !== 'completed') {
      return res.json({
        success: true,
        chapter,
        personalized: null,
      });
    }

    // 查询完整用户画像用于过期判断（JWT req.user 只有 id+role）
    const fullUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: personalizationEngine.USER_PROFILE_SELECT,
    });

    // 检查是否过期
    const currentSnapshot = personalizationEngine.normalizeProfile(fullUser);
    const currentHash = personalizationEngine.sourceContentHash(chapter.content);
    const isStale = (currentSnapshot !== personalized.profileSnapshot) ||
                    (currentHash !== personalized.sourceContentHash);

    // 记录切换事件
    await prisma.personalizationEvent.create({
      data: {
        userId: req.user.id,
        chapterId,
        event: 'switch_to_personalized',
        metadata: JSON.stringify({ isStale }),
      },
    }).catch(() => {});

    return res.json({
      success: true,
      chapter,
      personalized: {
        content: personalized.content,
        status: personalized.status,
        generatedAt: personalized.updatedAt,
        isStale,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 管理员 - 学习版块
// ==========================================

// 管理员获取全部章节（不含 content，避免传输 800KB）
router.get('/admin/learning/chapters', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const chapters = await prisma.learningChapter.findMany({
      orderBy: { orderIndex: 'asc' },
      select: {
        chapterId: true,
        title: true,
        subtitle: true,
        orderIndex: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });
    res.json({ success: true, chapters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员创建章节（chapterId 在事务中自动生成）
router.post('/admin/learning/chapters', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { title, subtitle, content, status } = req.body;

    // 验证
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: '标题不能为空' });
    }
    const chapterStatus = (status === 'published') ? 'published' : 'draft';

    const chapter = await prisma.$transaction(async (tx) => {
      // 查询最大 chapterId
      const last = await tx.learningChapter.findFirst({
        orderBy: { orderIndex: 'desc' },
        select: { chapterId: true }
      });
      let nextNum = 1;
      if (last && last.chapterId) {
        const parsed = parseInt(last.chapterId, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      const chapterId = String(nextNum).padStart(2, '0');

      // 自动排在最后
      const maxOrder = await tx.learningChapter.findFirst({
        orderBy: { orderIndex: 'desc' },
        select: { orderIndex: true }
      });
      const orderIndex = (maxOrder?.orderIndex ?? 0) + 1;

      return tx.learningChapter.create({
        data: {
          chapterId,
          title: title.trim(),
          subtitle: subtitle || null,
          content: content || null,
          orderIndex,
          status: chapterStatus
        }
      });
    });

    res.status(201).json({ success: true, chapter });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员预览单个章节（返回完整内容，不受 status 限制）
router.get('/admin/learning/chapters/:chapterId', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const chapter = await prisma.learningChapter.findUnique({
      where: { chapterId: req.params.chapterId }
    });
    if (!chapter) return res.status(404).json({ error: '章节不存在' });
    res.json({ success: true, chapter });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员上架/下架章节
router.put('/admin/learning/chapters/:chapterId/publish', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { status } = req.body;

    if (status !== 'published' && status !== 'draft') {
      return res.status(400).json({ error: 'status 必须为 published 或 draft' });
    }

    const existing = await prisma.learningChapter.findUnique({ where: { chapterId } });
    if (!existing) return res.status(404).json({ error: '章节不存在' });

    const chapter = await prisma.learningChapter.update({
      where: { chapterId },
      data: { status }
    });

    res.json({ success: true, chapter });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员拖拽排序
router.put('/admin/learning/chapters/reorder', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'orderedIds 必须是非空数组' });
    }

    await prisma.$transaction(
      orderedIds.map((chapterId, index) =>
        prisma.learningChapter.update({
          where: { chapterId },
          data: { orderIndex: index + 1 }
        })
      )
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员更新章节（忽略 body 中的 chapterId，防止孤立 progress）
router.put('/admin/learning/chapters/:chapterId', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { title, subtitle, content, orderIndex, status } = req.body;

    // 验证
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: '标题不能为空' });
    }

    const existing = await prisma.learningChapter.findUnique({ where: { chapterId } });
    if (!existing) return res.status(404).json({ error: '章节不存在' });

    const updateData = {
      title: title.trim(),
      subtitle: subtitle || null,
      content: content || null
    };
    if (orderIndex !== undefined && Number.isInteger(orderIndex)) {
      updateData.orderIndex = orderIndex;
    }
    if (status === 'published' || status === 'draft') {
      updateData.status = status;
    }

    const chapter = await prisma.learningChapter.update({
      where: { chapterId },
      data: updateData
    });

    res.json({ success: true, chapter });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员删除章节（事务中先清 progress 再删 chapter）
router.delete('/admin/learning/chapters/:chapterId', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { chapterId } = req.params;

    const existing = await prisma.learningChapter.findUnique({ where: { chapterId } });
    if (!existing) return res.status(404).json({ error: '章节不存在' });

    await prisma.$transaction([
      prisma.learningProgress.deleteMany({ where: { chapterId } }),
      prisma.learningChapter.delete({ where: { chapterId } })
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 管理员 - 个性化学习管理
// ==========================================

// 查询有个性化活动的用户列表
router.get('/admin/personalization/users', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const chapterUsers = await prisma.personalizedChapter.findMany({
      distinct: ['userId'],
      select: { userId: true },
    });
    const userIds = chapterUsers.map(c => c.userId);

    if (userIds.length === 0) {
      return res.json({ success: true, users: [] });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, username: true, phone: true, personalizationEnabled: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const chapters = await prisma.personalizedChapter.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, chapterId: true, status: true, updatedAt: true },
    });

    const result = users.map(u => {
      const userChapters = chapters.filter(c => c.userId === u.id);
      const completed = userChapters.filter(c => c.status === 'completed').length;
      const generating = userChapters.filter(c => c.status === 'generating').length;
      const failed = userChapters.filter(c => c.status === 'failed').length;

      return {
        id: u.id,
        nickname: u.nickname,
        username: u.username,
        phone: u.phone,
        personalizationEnabled: u.personalizationEnabled,
        createdAt: u.createdAt,
        totalCompleted: completed,
        totalGenerating: generating,
        totalFailed: failed,
      };
    });

    res.json({ success: true, users: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 开关用户个性化学习
router.post('/admin/personalization/toggle', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { userId, enabled } = req.body;
    if (!userId || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '参数错误' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { personalizationEnabled: enabled },
    });

    await prisma.personalizationEvent.create({
      data: {
        userId,
        event: 'admin_toggle',
        metadata: JSON.stringify({ enabled, operatorId: req.user.id }),
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取指定用户的个性化章节详情（含对比原文）
router.get('/admin/personalization/users/:userId/chapters', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { userId } = req.params;

    const [personalizedChapters, originalChapters] = await Promise.all([
      prisma.personalizedChapter.findMany({
        where: { userId },
        select: { chapterId: true, content: true, status: true, updatedAt: true },
        orderBy: { chapterId: 'asc' },
      }),
      prisma.learningChapter.findMany({
        where: { status: 'published' },
        select: { chapterId: true, title: true, content: true },
        orderBy: { orderIndex: 'asc' },
      }),
    ]);

    const originalMap = {};
    for (const ch of originalChapters) {
      originalMap[ch.chapterId] = ch;
    }

    const result = personalizedChapters.map(pc => ({
      chapterId: pc.chapterId,
      status: pc.status,
      updatedAt: pc.updatedAt,
      personalized: pc.content,
      original: originalMap[pc.chapterId]?.content || null,
      title: originalMap[pc.chapterId]?.title || pc.chapterId,
    }));

    res.json({ success: true, chapters: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// AI 约会方案

// 和风天气查询（支持按时段）
async function getWeather(lng, lat, dateTime) {
  const { execFileSync } = require('child_process');
  const host = process.env.QWEATHER_HOST;
  const key = process.env.QWEATHER_KEY;
  if (!host || !key) return null;
  try {
    // 先获取24小时预报
    const env = { ...process.env, https_proxy: 'http://127.0.0.1:7897', http_proxy: 'http://127.0.0.1:7897' };
    const output = execFileSync('curl', [
      '-s', '--compressed',
      `https://${host}/v7/weather/24h?location=${lng},${lat}&key=${key}`
    ], { timeout: 10000, env });
    const data = JSON.parse(output.toString());
    if (data.code !== '200' || !data.hourly) return null;

    // 解析用户输入的时间
    const now = new Date();
    const targetDate = new Date(now);
    let targetHour = null;

    const dtLower = (dateTime || '').toLowerCase();

    // 解析日期
    if (/明天/.test(dtLower)) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (/后天/.test(dtLower)) {
      targetDate.setDate(targetDate.getDate() + 2);
    }

    // 解析时段
    if (/凌晨|早上|清晨/.test(dtLower)) targetHour = 8;
    else if (/上午|AM/.test(dtLower)) targetHour = 10;
    else if (/中午|午饭|午餐/.test(dtLower)) targetHour = 12;
    else if (/下午|PM/.test(dtLower)) targetHour = 14;
    else if (/傍晚|黄昏/.test(dtLower)) targetHour = 17;
    else if (/晚上|夜间|夜晚/.test(dtLower)) targetHour = 19;
    else if (/深夜|凌晨/.test(dtLower)) targetHour = 22;
    else {
      // 尝试解析具体时间 "18:00"
      const hourMatch = dateTime.match(/(\d{1,2}):?\d{0,2}/);
      if (hourMatch) targetHour = parseInt(hourMatch[1]);
    }

    // 找到最接近的时段数据
    const targetDateStr = targetDate.toISOString().split('T')[0];
    let bestMatch = null;
    let minDiff = 999;

    // 默认目标小时：如果没有指定，假设下午2点（14:00）
    const defaultTargetHour = targetHour !== null ? targetHour : 14;

    for (const h of data.hourly) {
      const fxTime = new Date(h.fxTime);
      // 必须同一天
      if (!h.fxTime.startsWith(targetDateStr)) continue;

      const hour = fxTime.getHours();
      const hourDiff = Math.abs(hour - defaultTargetHour);

      if (hourDiff < minDiff) {
        minDiff = hourDiff;
        bestMatch = h;
      }
    }

    // 如果没找到，尝试匹配相邻日期
    if (!bestMatch && !targetHour) {
      const altDate = new Date(targetDate);
      altDate.setDate(altDate.getDate() + 1);
      const altDateStr = altDate.toISOString().split('T')[0];

      for (const h of data.hourly) {
        if (!h.fxTime.startsWith(altDateStr)) continue;
        const fxTime = new Date(h.fxTime);
        const hour = fxTime.getHours();
        const hourDiff = Math.abs(hour - defaultTargetHour);

        if (hourDiff < minDiff) {
          minDiff = hourDiff;
          bestMatch = h;
        }
      }
    }

    if (bestMatch) {
      const fxTime = new Date(bestMatch.fxTime);
      const timeStr = `${fxTime.getMonth()+1}月${fxTime.getDate()}日${fxTime.getHours()}时`;
      // 24h预报没有feelsLike字段，用temp代替
      const feelsLikeStr = bestMatch.feelsLike ? bestMatch.feelsLike + '°C' : bestMatch.temp + '°C';
      return {
        time: timeStr,
        temp: bestMatch.temp + '°C',
        feelsLike: feelsLikeStr,
        text: bestMatch.text,
        windDir: bestMatch.windDir,
        windScale: bestMatch.windScale + '级',
        humidity: bestMatch.humidity + '%'
      };
    }
  } catch (e) {
    console.error('[Membership] 天气查询异常:', e.message, e.stderr ? e.stderr.toString() : '');
  }
  return null;
}

// 智能分析合适场所类型（考虑时段、场景、关系阶段、预算）
function analyzeSuitableVenueTypes(sceneText, budgetText, dateTimeStr, relationshipStage) {
  const sceneLower = (sceneText || '').toLowerCase();
  const budgetNum = parseInt((budgetText || '500').replace(/[^0-9]/g, '')) || 500;

  let hour = 19;
  if (dateTimeStr) {
    try { const d = new Date(dateTimeStr); if (!isNaN(d.getTime())) hour = d.getHours(); } catch {}
  }

  const isLateNight = hour >= 22 || hour < 2;
  const isNight = hour >= 19 && hour < 22;
  const isAfternoon = hour >= 13 && hour < 17;
  const isLunch = hour >= 11 && hour < 13;
  const isMorning = hour >= 6 && hour < 11;

  const types = [];

  if (isLateNight) {
    types.push('精酿啤酒吧', '鸡尾酒吧', 'Livehouse');
    if (budgetNum >= 300) types.push('夜景高空酒吧', '清吧');
    types.push('深夜食堂', '烧烤夜宵', '居酒屋');
  } else if (isNight) {
    if (budgetNum >= 400) types.push('高级餐厅', '景观餐厅');
    else types.push('特色餐厅', '居酒屋', '小酒馆');
    types.push('鸡尾酒吧', '精酿啤酒吧');
    if (/初次|暧昧/.test(relationshipStage || '')) types.push('Livehouse', '爵士酒吧');
    else types.push('安静的清吧', '夜景咖啡');
  } else if (isAfternoon) {
    types.push('咖啡厅', '茶馆', '甜品店');
    if (/初次/.test(relationshipStage || '')) types.push('书店咖啡馆', '文创园');
    if (/散步|户外/.test(sceneLower)) types.push('公园', '滨江步道');
  } else if (isLunch) {
    types.push('餐厅', '特色饭馆');
    if (budgetNum >= 300) types.push('日料', '粤菜馆');
    else types.push('简餐', '面馆');
  } else if (isMorning) {
    types.push('早午餐', 'brunch餐厅', '咖啡馆');
  }

  if (/ktv|唱歌/.test(sceneLower) && !isLateNight) types.push('KTV');
  if (/电影/.test(sceneLower)) types.push('电影院');
  if (/火锅/.test(sceneLower)) types.push('火锅店');
  if (/烧烤/.test(sceneLower)) types.push('烧烤店');
  if (/粤菜/.test(sceneLower)) types.push('粤菜馆');
  if (/日料|日式/.test(sceneLower)) types.push('日料店');
  if (/西餐|牛排/.test(sceneLower)) types.push('西餐厅');
  if (/川菜|辣/.test(sceneLower)) types.push('川菜馆');

  const seen = new Set();
  const unique = [];
  for (const t of types) {
    const lower = t.toLowerCase();
    if (!seen.has(lower)) { seen.add(lower); unique.push(t); }
  }
  if (unique.length === 0) unique.push('约会场所');

  return unique;
}

// 百度AI搜索（从scene提取区域）
async function baiduVenueSearch(location, venueTypes, budget) {
  const { execFileSync } = require('child_process');
  const BAIDU_API_KEY = process.env.BAIDU_API_KEY;
  if (!BAIDU_API_KEY) {
    console.warn('[Membership] 百度API密钥未配置');
    return { choices: [], references: [] };
  }
  try {
    const budgetNum = parseInt((budget || '200').replace(/[^0-9]/g, '')) || 200;
    const venueTypeStr = venueTypes.join('、');
    const isSpecific = /[餐厅火锅烧烤酒楼饭店馆吧厅店堂轩坊阁院村屯]$/.test(location);
    const searchScope = isSpecific ? `搜索关于"${location}"的详细信息` : `在${location}附近搜索真实存在的${venueTypeStr}`;
    const query = `${searchScope}，适合2人约会，人均约${budgetNum}元。从百度搜索结果中提取信息。要求：
1. 只选搜索结果中真实存在的场所，地址真实即可，不强制门牌号
2. 没有确切地址的场所不要推荐，宁可少推也不要编造
3. 价格从搜索结果原文摘取，搜不到就写"未知"
4. 人均超过${budgetNum * 2}元的不推荐
5. 严格按JSON数组输出：
[{"name":"店名","address":"真实地址","price":"人均或未知"}]`;
    const postData = JSON.stringify({
      messages: [{ content: query, role: 'user' }],
      model: 'deepseek-v3',
      search_source: 'baidu_search_v2',
      resource_type_filter: [{ type: 'web', top_k: 10 }],
      stream: false,
      enable_deep_search: true
    });
    const env = {
      ...process.env,
      https_proxy: 'http://127.0.0.1:7897',
      http_proxy: 'http://127.0.0.1:7897'
    };
    const output = execFileSync('curl', [
      '-s', '-X', 'POST',
      'https://qianfan.baidubce.com/v2/ai_search/chat/completions',
      '-H', 'Authorization: Bearer ' + BAIDU_API_KEY,
      '-H', 'Content-Type: application/json',
      '-d', postData
    ], { timeout: 20000, env });
    return JSON.parse(output.toString());
  } catch (e) {
    console.warn('[Membership] 百度场地搜索失败:', e.message);
    return { choices: [], references: [] };
  }
}

// ==========================================

// 创建/生成约会方案
router.post('/dating-plan/generate', authMiddleware, async (req, res) => {
  try {
    // 试用限制检查
    try {
      await membershipService.checkTrialLimit(req.user.id, 'date_plan');
      await membershipService.useTrialCount(req.user.id);
    } catch (e) {
      return res.status(403).json({ error: e.message });
    }

    const { title, scene, budget, duration, location, dateTime, girlId, optimize, previousContent, girl, transportMode, relationshipStage, specialRequirements } = req.body;
    const { getAIConfig } = require('../config');

    // 查询用户档案
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { nickname: true, age: true, occupation: true, education: true, residence: true, personality: true, communicationStyle: true, socialStyle: true, relationshipGoal: true, emotionalGoal: true, strengths: true, weaknesses: true, dressingStyle: true, income: true }
    });

    const venueTypes = analyzeSuitableVenueTypes(scene, budget, dateTime, relationshipStage);
    console.log('[Dating] 分析场所类型:', venueTypes);

    // 创建草稿并立即返回
    const plan = await prisma.datingPlan.create({
      data: {
        userId: req.user.id,
        girlId: girlId || null,
        title: title || '约会方案',
        scene,
        budget,
        duration,
        location: location || null,
        dateTime: dateTime || null,
        planStatus: 'generating'
      }
    });

    // 立即返回草稿，不等待生成完成
    res.json({ success: true, plan });

    // ===== 以下全部在后台异步执行 =====
    (async () => {
      try {
        // 优化模式：从已存方案获取缺失的 location/dateTime
        let effectiveLocation = location;
        let effectiveDateTime = dateTime;
        if (optimize && previousContent) {
          try {
            const existingPlan = await prisma.datingPlan.findUnique({ where: { id: plan.id } });
            if (existingPlan) {
              if (!effectiveLocation && existingPlan.location) effectiveLocation = existingPlan.location;
              if (!effectiveDateTime && existingPlan.dateTime) effectiveDateTime = existingPlan.dateTime;
            }
          } catch {}
        }

        // 地址关键词：优先使用用户指定的地点，其次从 scene 提取
        let addressKeyword = (effectiveLocation || '').trim();
        if (!addressKeyword) {
          const addressMatch = (scene || '').match(/[一-龥]{2,10}(?:区|县|路|街|道|镇|城|广场|商圈|中心)/);
          addressKeyword = addressMatch ? addressMatch[0] : (scene || '').trim().split(/\s+/)[0];
        }
        console.log('[Dating] 地址关键词:', addressKeyword);

        // 百度AI搜索真实场地（使用提取的地址）
        let venueContext = '';

        // 并行执行：Geocoding、搜索、天气查询
        const geoPromise = addressKeyword ? geocode(addressKeyword) : Promise.resolve(null);

        const [coords, searchResult, weather] = await Promise.all([
          geoPromise,
          baiduVenueSearch(addressKeyword, venueTypes, budget),
          geoPromise.then(c => c ? getWeather(c.lng, c.lat, scene + (duration || '')) : Promise.resolve(null))
        ]);

        console.log('[Dating] 坐标:', coords, '天气:', weather ? '有' : '无');

        // 处理搜索结果 — 优先 JSON 解析，回退 Markdown 正则
        if (addressKeyword && searchResult) {
          const choices = searchResult.choices || [];
          const references = searchResult.references || [];
          const validRestaurants = [];
          const content = choices[0]?.message?.content || '';

          // 策略1：JSON 格式解析
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            try {
              const arr = JSON.parse(jsonMatch[0]);
              for (const item of arr) {
                if (!item.name || !item.address) continue;
                const addr = String(item.address).trim();
                if (/附近$|周边$|具体地址|未提供|不详/.test(addr)) continue;
                if (!/[路街道弄号广场大厦中心城]/.test(addr)) continue;
                const price = item.price && item.price !== '未知' ? String(item.price) : '';
                const exists = validRestaurants.some(r => r.includes(item.name));
                if (!exists) {
                  const priceStr = price ? '，人均：' + price : '';
                  validRestaurants.push(`${item.name}，地址：${addr}${priceStr}`);
                }
              }
            } catch { /* JSON 解析失败，回退正则 */ }
          }

          // 策略2（回退）：Markdown 标题 + 地址/人均 正则解析
          if (validRestaurants.length === 0) {
            const headingRegex = /(?:^|\n)(#{2,4})\s*\d*\.?\s*\*{0,2}([^\n*]{2,50}?)\*{0,2}(?=\s*\n)/g;
            let hm;
            while ((hm = headingRegex.exec(content)) !== null) {
              const name = hm[2].trim().replace(/[【】\[\]]/g, '');
              if ((/推荐|场所|清单|列表|汇总|精选/.test(name) && name.length <= 6) || name.length < 2) continue;
              if (!/店|馆|餐厅|咖啡|酒楼|食府|酒吧|茶|厅|厨房|食堂/.test(name)) continue;
              const after = content.slice(headingRegex.lastIndex, headingRegex.lastIndex + 300);
              const am = after.match(/[*-]\s*\*{0,2}地址\*{0,2}[：:]\s*([^\n]+)/);
              if (!am) continue;
              const addr = am[1].trim();
              if (!/市|区|县|路|街|道|镇|号|广场|大厦|中心|城|楼|层|栋/.test(addr)) continue;
              const pm = after.match(/[*-]\s*\*{0,2}人均\*{0,2}[：:]\s*[￥¥]?\s*([^\n]+)/);
              const price = pm ? pm[1].trim().replace(/[￥¥]/g, '') : '';
              if (!validRestaurants.some(r => r.includes(name))) {
                const ps = price ? '，人均：' + (price.includes('元') ? price : price + '元') : '';
                validRestaurants.push(name + '，地址：' + addr + ps);
              }
            }
          }

          // 策略3（回退）：表格格式
          if (validRestaurants.length === 0) {
            const tableRows = content.match(/\|[^|]+\|[^|]+\|[^|]+\|/g) || [];
            for (const row of tableRows) {
              const cols = row.split('|').map(c => c.trim()).filter(Boolean);
              if (cols.length >= 2) {
                const name = cols[0].replace(/[*_#]/g, '');
                if (/市|区|县|路|街|道|镇|号|广场|大厦|中心|城|楼|层/.test(cols[1]) && /店|馆|餐厅|咖啡|酒吧|茶/.test(name)) {
                  validRestaurants.push(name + '，' + cols[1]);
                }
              }
            }
          }

          // 策略4（最后回退）：从 references 提取
          if (validRestaurants.length === 0) {
            for (const ref of references) {
              const rc = ref.content || '';
              const rt = ref.title || '';
              const am = rc.match(/(?:餐厅)?地址[：:]\s*([^，,。\n]+)/);
              if (am && /店|馆|餐厅|咖啡|酒楼|食府|酒吧/.test(rt)) {
                const cn = rt.replace(/^[^\w一-鿿]+/, '').replace(/[#*【】\[\]]/g, '');
                validRestaurants.push(cn + '，地址：' + am[1]);
              }
            }
          }

          if (validRestaurants.length > 0) {
            venueContext = `\n【百度搜索真实场地】（以下餐厅地址经核实，请优先选择，严禁虚构）\n`;
            for (const r of validRestaurants.slice(0, 5)) {
              venueContext += `★ ${r}\n`;
            }
            venueContext += '\n';
          } else {
            venueContext = `\n【重要提示】百度搜索未找到符合条件的真实餐厅数据，请打开大众点评定位"${addressKeyword}"搜索。\n`;
          }
        }

        // 处理天气结果
        let weatherInfo = '';
        if (weather) {
          weatherInfo = `\n【约会时段天气（${weather.time}）】${weather.text}，气温${weather.temp}（体感${weather.feelsLike}），${weather.windDir}${weather.windScale}，湿度${weather.humidity}。\n`;
        }

        // Prompt 注入防护
        const escapePrompt = (str) => {
          if (!str) return '';
          return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/`/g, '\\`')
            .replace(/\$\{/g, '\\${');
        };

        const safeScene = escapePrompt(scene);
        const safeBudget = escapePrompt(budget);
        const safeDuration = escapePrompt(duration);

        const optimizeHint = (optimize && previousContent) ? `
【优化任务】
以下是之前生成的方案，请参考并改进，输出一份更完善的版本：

${previousContent.trim().slice(0, 3000)}

优化要点：保留原有优点，改进不足之处，提供更具体的地点推荐和时间安排。
` : '';

        // 构建用户档案上下文
        let userContext = '';
        if (user) {
          const profileParts = [];
          if (user.nickname) profileParts.push(`称呼：${user.nickname}`);
          if (user.age) profileParts.push(`年龄：${user.age}岁`);
          if (user.occupation) profileParts.push(`职业：${user.occupation}`);
          if (user.education) profileParts.push(`学历：${user.education}`);
          if (user.residence) profileParts.push(`所在地：${user.residence}`);
          if (user.income) profileParts.push(`收入：${user.income}`);
          if (user.personality) profileParts.push(`性格：${user.personality}`);
          if (user.communicationStyle) profileParts.push(`沟通风格：${user.communicationStyle}`);
          if (user.socialStyle) profileParts.push(`社交风格：${user.socialStyle}`);
          if (user.relationshipGoal) profileParts.push(`关系目标：${user.relationshipGoal}`);
          if (user.emotionalGoal) profileParts.push(`感情诉求：${user.emotionalGoal}`);
          if (user.strengths) profileParts.push(`优势：${user.strengths}`);
          if (user.weaknesses) profileParts.push(`短板：${user.weaknesses}`);
          if (user.dressingStyle) profileParts.push(`穿着风格：${user.dressingStyle}`);
          if (profileParts.length > 0) {
            userContext = `\n【男士档案】\n${profileParts.join('；')}\n`;
          }
        }

        // 构建女生信息上下文
        let girlContext = '';
        if (girl && typeof girl === 'object') {
          const girlParts = [];
          if (girl.name) girlParts.push(`姓名：${girl.name}`);
          if (girl.age) girlParts.push(`年龄：${girl.age}岁`);
          if (girl.occupation) girlParts.push(`职业：${girl.occupation}`);
          if (girl.education) girlParts.push(`学历：${girl.education}`);
          if (girl.residence) girlParts.push(`所在地：${girl.residence}`);
          if (girl.hometown) girlParts.push(`家乡：${girl.hometown}`);
          if (girl.personalityTags) girlParts.push(`性格标签：${girl.personalityTags}`);
          if (girl.interests) girlParts.push(`兴趣爱好：${girl.interests}`);
          if (girl.appearance) girlParts.push(`外貌：${girl.appearance}`);
          if (girl.styleTags) girlParts.push(`风格标签：${girl.styleTags}`);
          if (girlParts.length > 0) {
            girlContext = `\n【女生档案】\n${girlParts.join('；')}\n`;
          }
        }

        // 构建约会上下文
        let datingContext = '';
        const ctxParts = [];
        if (relationshipStage) ctxParts.push(`关系阶段：${relationshipStage}`);
        if (transportMode) ctxParts.push(`出行方式：${transportMode}`);
        if (specialRequirements) ctxParts.push(`特殊要求：${specialRequirements}`);
        // 解析约会具体时间
        if (effectiveDateTime) {
          try {
            const d = new Date(effectiveDateTime);
            const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const weekDay = weekNames[d.getDay()];
            const hour = d.getHours();
            const minute = d.getMinutes();
            const timeStr = `${d.getMonth() + 1}月${d.getDate()}日 ${weekDay} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            let period = '白天';
            if (hour >= 5 && hour < 9) period = '清晨';
            else if (hour >= 9 && hour < 11) period = '上午';
            else if (hour >= 11 && hour < 13) period = '午餐时段';
            else if (hour >= 13 && hour < 17) period = '下午';
            else if (hour >= 17 && hour < 19) period = '傍晚';
            else if (hour >= 19 && hour < 22) period = '晚上黄金时段';
            else if (hour >= 22 || hour < 2) period = '深夜';
            else period = '凌晨';
            ctxParts.push(`约会时间：${timeStr}（${period}）`);
            ctxParts.push(`⚠ 时段提醒：该时段为${period}，推荐场所必须在此时间正常营业且氛围合适，严禁推荐已打烊或不适配时段的地点`);
          } catch {}
        }
        if (ctxParts.length > 0) {
          datingContext = `\n【约会上下文】\n${ctxParts.join('；')}\n`;
        }

        const prompt = `你是资深约会策划专家，根据以下信息为用户设计一次完美的约会方案。
${optimizeHint}${userContext}${girlContext}${datingContext}
【约会参数】
地点：${addressKeyword || '未指定（请根据其他信息推荐合适区域）'}
场景：${safeScene || '普通约会'}
预算：${safeBudget || '1000元左右'}
时长：${safeDuration || '半天'}${venueContext}${weatherInfo}

${venueContext.includes('★') ? '🚫 场地铁律：请从上述百度搜索结果中挑选真实存在的场所推荐，严禁虚构任何店名。' : `🚫 场地铁律：百度搜索未找到该区域的真实商家数据。严禁编造任何具体店名（如"XXX酒吧（假设位于...）"），只能建议场所类型（如"精酿啤酒吧"、"深夜食堂"等），地址一律写搜索区域名称。`}

请以专业约会策划师的角度，结合男士档案和女生档案的信息，输出Markdown方案，内容包含：
1. 约会概览（分析男女匹配度、整体风格定位）
2. 推荐地点（只推荐百度搜索结果中的真实场所；若搜索结果为空则只建议场所类型如"精酿啤酒吧"，地址写搜索区域，严禁用"假设""假定"虚构店名）
3. 时间安排（从见面到结束的完整时间线，标注交通方式，活动必须匹配实际时段）
4. 聊天话题（结合女生性格和兴趣，每个阶段推荐具体话题）
5. 注意事项（针对该女生的雷区和加分项，结合男士短板给出提醒）
6. 穿着建议（根据天气和女生风格调整，参考男士日常穿着风格）
7. 预算分配提示
8. 天气出行建议（如遇雨天提供室内备选）
${optimize ? '\n要求：内容专业、实用，在原有方案基础上进一步优化，给出更具体可执行的建议。' : '要求：内容专业、实用，结合男女双方特点给出具体可执行的建议。让用户感受到这是一份为他俩量身定制的约会方案。'}

只输出Markdown方案内容，不要任何额外说明。`;

        const aiConfig = getAIConfig();

        const response = await fetch(aiConfig.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${aiConfig.key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: aiConfig.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 8192
          })
        });

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || '生成失败，请重试。';
        content = content.trim();
        if (content.startsWith('```markdown')) {
          content = content.slice('```markdown'.length);
        } else if (content.startsWith('```')) {
          content = content.slice(3);
        }
        if (content.endsWith('```')) {
          content = content.slice(0, -3);
        }
        content = content.trim();

        await prisma.datingPlan.update({
          where: { id: plan.id },
          data: {
            content,
            planStatus: 'generated'
          }
        });

        console.log('[Dating] 方案生成完成:', plan.id);

        // 记录活跃度（仅客户端用户）
        if (req.user.role === 'client') {
          activityService.recordActivity(req.user.id, 'date_plan', {
            planId: plan.id,
          }).catch(err => console.error(`[Activity] 记录date_plan失败: ${err.message}`));
        }
      } catch (err) {
        console.error('[Dating] 后台生成失败:', err.message);
        await prisma.datingPlan.update({
          where: { id: plan.id },
          data: { planStatus: 'draft' }
        }).catch(e => console.error('[Dating] 更新失败状态出错:', e.message));
      }
    })();
    // ===== 后台异步生成结束 =====
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取我的约会方案列表
router.get('/dating-plan', authMiddleware, async (req, res) => {
  try {
    const plans = await prisma.datingPlan.findMany({
      where: { userId: req.user.id },
      include: {
        girl: { select: { id: true, name: true, age: true, residence: true, photos: true, personality: true, interests: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取单个约会方案
router.get('/dating-plan/:id', authMiddleware, async (req, res) => {
  try {
    const plan = await prisma.datingPlan.findUnique({
      where: { id: req.params.id },
      include: {
        girl: { select: { id: true, name: true, age: true, residence: true, photos: true, personality: true, interests: true } }
      }
    });
    if (!plan || plan.userId !== req.user.id) {
      return res.status(404).json({ error: '方案不存在' });
    }
    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 截图识别档案
// ==========================================

// 配置 multer 上传
const uploadDir = path.join(__dirname, '../../uploads/screenshots');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('仅支持图片格式'));
  }
});

// 上传截图
router.post('/screenshot/upload', authMiddleware, operatorOnly, upload.single('image'), async (req, res) => {
  try {
    const { clientId } = req.body;
    const imagePath = `/uploads/screenshots/${req.file.filename}`;
    const profile = await membershipService.uploadAndExtractScreenshots(
      req.user.id,
      clientId,
      path.join(__dirname, '../../', imagePath)
    );
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取待确认档案列表
router.get('/screenshot/profiles', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const where = { uploadedBy: req.user.id };
    if (status) where.status = status;

    const profiles = await prisma.screenshotProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, profiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 确认/拒绝截图档案
router.post('/screenshot/profile/:id/confirm', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { action, linkedUserId } = req.body;
    const result = await membershipService.confirmScreenshotProfile(
      req.user.id,
      req.params.id,
      action,
      linkedUserId
    );
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
module.exports.baiduVenueSearch = baiduVenueSearch;
module.exports.analyzeSuitableVenueTypes = analyzeSuitableVenueTypes;
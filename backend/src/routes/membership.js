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
          type: type || 'monthly',
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

// 获取所有章节（客户和操盘手都可用）
router.get('/learning/chapters', authMiddleware, async (req, res) => {
  try {
    const chapters = await prisma.learningChapter.findMany({
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

    res.json({ success: true, progress: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// AI 约会方案
// 百度AI搜索（从scene提取区域）
async function baiduVenueSearch(location, budget) {
  const { execFileSync } = require('child_process');
  const BAIDU_API_KEY = 'bce-v3/ALTAK-OLhmNcBERSUNnAlIXsXa9/80280c210c8682e7c02a2a0883ef257fe36e4692';
  try {
    const budgetNum = parseInt((budget || '200').replace(/[^0-9]/g, '')) || 200;
    const query = `上海${location}适合2人约会的餐厅、咖啡厅推荐，包含具体店名、地址、人均消费，预算人均${budgetNum}元`;
    const postData = JSON.stringify({
      messages: [{ content: query, role: 'user' }],
      model: 'deepseek-v3',
      search_source: 'baidu_search_v2',
      resource_type_filter: [{ type: 'web', top_k: 5 }],
      stream: false,
      enable_deep_search: false
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
    ], { timeout: 15000, env });
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
    const { title, scene, budget, duration } = req.body;
    const { getAIConfig } = require('../config');

    // 从scene提取区域关键词（九亭、松江、浦东等）
    const areaMatch = (scene || '').match(/(九亭|松江|浦东|黄浦|静安|徐汇|长宁|虹口|杨浦|闵行|宝山|嘉定|青浦|奉贤|金山|崇明)/);
    const area = areaMatch ? areaMatch[1] : '';

    // 创建草稿
    const plan = await prisma.datingPlan.create({
      data: {
        userId: req.user.id,
        title: title || '约会方案',
        scene,
        budget,
        duration,
        planStatus: 'generating'
      }
    });

    // 百度AI搜索真实场地（优先按区域搜索）
    let venueContext = '';
    if (area) {
      const searchResult = await baiduVenueSearch(area, budget);
      const choices = searchResult.choices || [];
      if (choices.length > 0) {
        const content = choices[0].message?.content || '';
        if (content) {
          venueContext = `\n【百度搜索真实场地】（以下为百度搜索返回的真实餐厅/咖啡厅，请优先选择这些地点，严禁虚构店名）\n${content.slice(0, 1500)}\n`;
        }
      }
    }

    // 异步生成方案内容
    const aiConfig = getAIConfig();
    const prompt = `你是约会策划专家，根据以下信息为用户设计一次完美的约会方案。

场景：${scene || '普通约会'}
预算：${budget || '1000元左右'}
时长：${duration || '半天'}${venueContext}

请以Markdown格式输出，内容包含：
1. 约会概览（适合人群、整体风格）
2. 推荐地点（2-3个，**必须从【百度搜索真实场地】中选择真实餐厅/咖啡厅**，标注名称、地址、人均消费）
3. 时间安排（从见面到结束的完整时间线）
4. 聊天话题（每个阶段推荐聊什么）
5. 注意事项（雷区和加分项）
6. 穿着建议
7. 预算提示

**严格约束**：你只能使用【百度搜索真实场地】中列出的餐厅，禁止额外添加其他餐厅、咖啡厅或娱乐场所。如果搜索结果中的餐厅不足以填满推荐地点，请如实说明"搜索结果有限，建议自行通过大众点评确认"。

只输出Markdown方案内容，不要其他内容。`;

    try {
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
          max_tokens: 2000
        })
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '生成失败，请重试。';

      const updatedPlan = await prisma.datingPlan.update({
        where: { id: plan.id },
        data: {
          content,
          planStatus: 'generated'
        }
      });

      res.json({ success: true, plan: updatedPlan });
    } catch (err) {
      await prisma.datingPlan.update({
        where: { id: plan.id },
        data: { planStatus: 'draft' }
      });
      res.status(500).json({ error: 'AI生成失败: ' + err.message, plan });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取我的约会方案列表
router.get('/dating-plan', authMiddleware, async (req, res) => {
  try {
    const plans = await prisma.datingPlan.findMany({
      where: { userId: req.user.id },
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
    const plan = await prisma.datingPlan.findUnique({ where: { id: req.params.id } });
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
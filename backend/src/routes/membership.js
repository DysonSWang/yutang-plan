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

const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const asyncHandler = require('../middleware/asyncHandler');
const { success } = require('../utils/response');

// Auth middleware
const authMiddleware = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded;
});

// Operator-only middleware
const operatorOnly = asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
});

// ==========================================
// 会员
// ==========================================

// 获取我的会员状态
router.get('/status', authMiddleware, asyncHandler(async (req, res) => {
  const status = await membershipService.getMembershipStatus(req.user.id);
  return success(res, status);
}));

// 购买/续费会员
router.post('/purchase', authMiddleware, asyncHandler(async (req, res) => {
  const { type, pointsToUse, purchasedType } = req.body;
  const membership = await membershipService.purchaseMembership(
    req.user.id,
    type || 'monthly',
    parseInt(pointsToUse) || 0
  );
  return success(res, { membership });
}));

// 管理员：获取所有用户会员列表
router.get('/admin/list', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
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

  return success(res, { clients: clientsWithStatus });
}));

// 管理员：设置/取消用户会员
router.post('/admin/set', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { userId, action, type, price, startDate, endDate } = req.body;
  if (action === 'cancel') {
    await prisma.membership.updateMany({
      where: { userId, status: 'active' },
      data: { status: 'cancelled' }
    });
    return success(res, { success: true });
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
    return success(res, { success: true });
  }
  throw new AppError(ErrorCodes.VALIDATION_ERROR);
}));

// ==========================================
// 积分
// ==========================================

// 获取积分余额和历史
router.get('/points', authMiddleware, asyncHandler(async (req, res) => {
  const balance = await membershipService.getPointsBalance(req.user.id);
  const history = await membershipService.getPointsHistory(req.user.id, 50, 0);
  return success(res, { balance, history: history.records, total: history.total });
}));

// 管理员：充值积分
router.post('/points/recharge', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { userId, amount, note } = req.body;
  const record = await membershipService.rechargePoints(req.user.id, userId, parseInt(amount), note);
  return success(res, { record });
}));

// 管理员：扣减积分
router.post('/points/deduct', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { userId, amount, note } = req.body;
  const record = await membershipService.deductPoints(req.user.id, userId, parseInt(amount), note);
  return success(res, { record });
}));

// 获取用户抵扣券列表
router.get('/coupons', authMiddleware, asyncHandler(async (req, res) => {
  const coupons = await membershipService.getAvailableCoupons(req.user.id);
  return success(res, { coupons });
}));

// 管理员：发放抵扣券
router.post('/coupons/grant', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { userId, value, note } = req.body;
  const record = await membershipService.grantCoupon(req.user.id, userId, parseInt(value), note);
  return success(res, { record });
}));

// ==========================================
// 邀请
// ==========================================

// 生成/获取我的邀请码
router.post('/invitation/create', authMiddleware, asyncHandler(async (req, res) => {
  const invitation = await membershipService.createInviteCode(req.user.id);
  return success(res, { invitation });
}));

// 获取我的邀请统计
router.get('/invitation/my-stats', authMiddleware, asyncHandler(async (req, res) => {
  const stats = await membershipService.getMyInvitationStats(req.user.id);
  return success(res, stats);
}));

// ==========================================
// 学习版块
// ==========================================

// 获取所有章节（客户和操盘手都可用）
router.get('/learning/chapters', authMiddleware, asyncHandler(async (req, res) => {
  const chapters = await prisma.learningChapter.findMany({
    orderBy: { orderIndex: 'asc' }
  });
  return success(res, { chapters });
}));

// 获取我的学习进度
router.get('/learning/progress', authMiddleware, asyncHandler(async (req, res) => {
  const progress = await prisma.learningProgress.findMany({
    where: { userId: req.user.id }
  });
  return success(res, { progress });
}));

// 更新学习进度
router.put('/learning/progress/:chapterId', authMiddleware, asyncHandler(async (req, res) => {
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

  return success(res, { progress: record });
}));

// ==========================================
// AI 约会方案
// ==========================================

// 创建/生成约会方案
router.post('/dating-plan/generate', authMiddleware, asyncHandler(async (req, res) => {
  const { title, scene, budget, duration, girl, transportMode, relationshipStage, specialRequirements, dateTime, district } = req.body;
  const { getAIConfig } = require('../config');

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

  // 异步生成方案内容
  const aiConfig = getAIConfig();

  // 构建女生画像描述
  const girlProfile = girl ? `
【女生画像】
- 姓名：${girl.name || '未知'}
- 年龄：${girl.age || '未知'}
- 职业：${girl.occupation || '未知'}
- 学历：${girl.education || '未知'}
- 性格标签：${girl.personalityTags || '未知'}
- 喜好：${girl.interests || '未知'}
- 风格标签：${girl.styleTags || '未知'}
- 外貌特征：${girl.appearance || '未知'}
- 饮食偏好：${girl.dietPreferences || '暂无记录'}
- 饮食禁忌：${girl.dietRestrictions || '暂无记录'}
- 籍贯：${girl.hometown || '未知'}
- 现居地：${girl.residence || '未知'}
` : '';

  // 计算动态信息
  const now = new Date();
  const month = now.getMonth() + 1;
  const season = month >= 3 && month <= 5 ? '春季' : month >= 6 && month <= 8 ? '夏季' : month >= 9 && month <= 11 ? '秋季' : '冬季';
  const weatherOptions = ['晴朗', '多云', '阴天', '小雨', '中雨', '大雨', '雷阵雨', '雪天', '雾霾'];
  const weather = weatherOptions[now.getDay() % weatherOptions.length];
  const temp = 15 + Math.floor(Math.random() * 15);
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const prompt = `# 角色
你是「追爱AI」大师团首席约会策划顾问。你是三位一体的专家：
- **心理学专家**：擅长读懂女性心理，识别微表情和潜台词
- **场景设计师**：善于创造浪漫氛围，制造心动时刻
- **社交教练**：精通约会话术，能在关键时刻神助攻

# 追爱AI品牌调性
- 专业但不冰冷，有温度有洞察
- 语言风格：自信、有见地、带点幽默感
- 方案特点：注重细节、可落地、注重情绪价值

# 当前情境（精确信息）
- 当前日期：${dateStr}
- 约会地点：${girl?.residence || '上海'}
- 当前季节：${season}
- 今日天气：${weather}，气温约${temp}°C
- 今日星期：${dayNames[now.getDay()]}
- 约会时间段：${dateTime || '待定'}
- 约会区域：${district || (girl?.residence || '上海')}

# 输入信息
${girlProfile}
【约会需求】
- 场景需求：${scene || '普通约会'}
- 预算：${budget || '1000元左右'}
- 时长：${duration || '半天'}
- 约会时间段：${dateTime || '傍晚/晚上'}
- 约会区域：${district || '市中心'}
- 出行方式：${transportMode || '地铁/打车'}
- 当前关系阶段：${relationshipStage || '初次见面'}
- 特殊要求：${specialRequirements || '无'}

# 输出要求
请输出一份**极致精细化**的约会策划方案，包含以下所有内容，缺一不可：

## 一、约会概览（顶层设计）
1. **整体风格定位**（一句话）
2. **当前关系阶段**（${relationshipStage || '初次见面'}）及针对性策略
   - 初次见面：节奏放慢，以舒适感为主，切忌冒进
   - 已聊过几次：可以稍微大胆，但保持尊重边界
   - 暧昧中：可以增加肢体接触试探，创造心动时刻
   - 确定关系：可以更亲密，注重仪式感
3. **核心策略思路**（为什么这样安排，心理学依据）
4. **特殊要求应对**（${specialRequirements || '无'}）
5. **今日天气应对策略**（如果下雨/降温/升温，如何调整）

## 二、地点方案（精细化）
对每个推荐地点必须包含：
- **完整店名+连锁品牌（如有）**
- **精确定位**：地铁站+步行时间/停车指南
- **人均消费+预订网址/电话**
- **私密包间/景观位获取方法**
- **分".vs."对比表**：为什么选这家而非竞品
- **当日穿着适配**：这家店的氛围需要穿什么

## 三、天气+出行专项应对
根据当前天气（${weather}，${temp}°C）、约会时间段（${dateTime || '傍晚'}）和出行方式（${transportMode}），提供：

### 约会时间段适配
- **中午（11:30-14:00）**：午餐约会，适合轻食、商务简餐，注意节奏要快（她可能下午要上班）
- **下午（14:00-17:00）**：下午茶+逛展/逛街，节奏慢，适合深度聊天
- **傍晚（17:00-19:00）**：避开晚高峰，晚餐前的perfect timing
- **晚上（19:00-21:00）**：正式晚餐约会，节奏最完整，可以安排到深夜

### 出行方式适配
- **地铁/打车**：提前预估路程时间，约在她方便到达的中间地点；雨天提前叫车，估算好时间；告知她"已叫好车"让她安心
- **开车**：停车场选择、是否露天停车场、雨天停车后如何接她进餐厅；提前查好目的地附近停车场
- **步行**：准备雨具、规划好避雨路线、选择室内化路线；距离控制在15分钟步行范围内
- **骑车**：不建议，雨天安全第一，且到目的地后形象狼狈

### 区域适配（${district || '市中心'}）
- **推荐餐厅范围**：以${district || '市中心'}为中心，半径3公里内精选
- **交通枢纽**：最近的地铁站/打车下车点，需步行多久
- **应急备选**：区域内另一家备选餐厅，以防首选满座

### 天气应对
- **如果下雨**：哪些室内活动替代方案？鞋子/包/外套注意什么？哪些餐厅有私密包间适合避雨等餐？
- **如果晴天**：哪些户外活动可以加入？如何防晒/补水？
- **如果降温/升温**：多层穿搭方案/空调房外衣解决方案

## 四、完整时间线（每5分钟精确到）
根据约会时间段（${dateTime || '傍晚'}）推算具体开始时间。
格式示例：
HH:MM | 动作 | 情绪 | 话术/细节 | 备选预案

示例（傍晚约会）：
18:00 | 你提前到达餐厅，在附近便利店买一瓶依云 | 放松 | 在她到达前5分钟发微信：我在XX便利店给你买了水，你到了告诉我 | 如果她迟到→在餐厅坐下等，发我帮你点了茶，你先别赶

## 五、分阶段话术手册
必须包含：
1. **破冰话术3句**（带具体措辞+语调建议）
2. **话题转换话术3句**（当出现尴尬沉默时）
3. **夸人话术2句**（具体夸什么细节+怎么说）
4. **肢体接触时机判断**（什么情况下可以/不可以）
5. **收尾话术2句**（如何自然告别+埋下下次伏笔）

## 六、穿搭精细指南
分上装/下装/鞋子/配件/香水，各给出：
- **推荐单品类型**（如：羊绒高领衫、修身休闲西裤等）
- **具体颜色建议**（为什么选这个颜色，视觉原理）
- **今日天气适配**（防水/透气/保暖层数）
- **禁忌清单**（绝对不能穿的款式+为什么）

## 七、预算执行表
用表格形式：
| 类别 | 建议花费 | 省钱技巧 | 备用选项 |
| 餐厅 | 700 | 选set menu | 备选A/B |

## 八、随身物品清单
- 男生必带：纸巾/湿巾、充电宝、薄荷糖/口香糖、钱包
- 选带加分项：一个小礼物（什么类型？200元内）

## 九、大师团自检清单
- [ ] 方案是否针对该女生职业定制？
- [ ] 时间安排是否精确到5分钟？
- [ ] 话术是否有具体措辞而非泛泛而谈？
- [ ] 天气因素是否纳入？
- [ ] 预算是否控制在要求范围内？
- [ ] 是否有备选预案（餐厅满座/她迟到/冷场）？

---

**重要原则**：
1. 所有建议必须基于【女生画像】定制
2. 方案要可落地执行，不是理论派
3. 注重情绪价值，每个环节都有"为什么这样设计"的解释
4. 语气自信专业，但不失人情味
5. 结合女生的职业、性格、喜好来设计细节
6. **时间线必须精确到每5分钟，包含具体话术原文**
7. **天气应对是必选项，不是可选项**`;

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
        max_tokens: 4000
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

    return success(res, { plan: updatedPlan });
  } catch (err) {
    await prisma.datingPlan.update({
      where: { id: plan.id },
      data: { planStatus: 'draft' }
    });
    throw new AppError(ErrorCodes.AI_SERVICE_UNAVAILABLE);
  }
}));

// 获取我的约会方案列表
router.get('/dating-plan', authMiddleware, asyncHandler(async (req, res) => {
  const plans = await prisma.datingPlan.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' }
  });
  return success(res, { plans });
}));

// 获取单个约会方案
router.get('/dating-plan/:id', authMiddleware, asyncHandler(async (req, res) => {
  const plan = await prisma.datingPlan.findUnique({ where: { id: req.params.id } });
  if (!plan || plan.userId !== req.user.id) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
  }
  return success(res, { plan });
}));

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
router.post('/screenshot/upload', authMiddleware, operatorOnly, upload.single('image'), asyncHandler(async (req, res) => {
  const { clientId } = req.body;
  const imagePath = `/uploads/screenshots/${req.file.filename}`;
  const profile = await membershipService.uploadAndExtractScreenshots(
    req.user.id,
    clientId,
    path.join(__dirname, '../../', imagePath)
  );
  return success(res, { profile });
}));

// 获取待确认档案列表
router.get('/screenshot/profiles', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = { uploadedBy: req.user.id };
  if (status) where.status = status;

  const profiles = await prisma.screenshotProfile.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });
  return success(res, { profiles });
}));

// 确认/拒绝截图档案
router.post('/screenshot/profile/:id/confirm', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { action, linkedUserId } = req.body;
  const result = await membershipService.confirmScreenshotProfile(
    req.user.id,
    req.params.id,
    action,
    linkedUserId
  );
  return success(res, { result });
}));

module.exports = router;

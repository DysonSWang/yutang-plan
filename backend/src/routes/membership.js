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
    const { title, subtitle, content, orderIndex } = req.body;

    // 验证
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: '标题不能为空' });
    }
    if (orderIndex === undefined || !Number.isInteger(orderIndex)) {
      return res.status(400).json({ error: '排序序号必须为整数' });
    }

    const chapter = await prisma.$transaction(async (tx) => {
      // 在事务中查询最大 chapterId，避免竞态
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

      return tx.learningChapter.create({
        data: {
          chapterId,
          title: title.trim(),
          subtitle: subtitle || null,
          content: content || null,
          orderIndex
        }
      });
    });

    res.status(201).json({ success: true, chapter });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员更新章节（忽略 body 中的 chapterId，防止孤立 progress）
router.put('/admin/learning/chapters/:chapterId', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { title, subtitle, content, orderIndex } = req.body;

    // 验证
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: '标题不能为空' });
    }
    if (orderIndex === undefined || !Number.isInteger(orderIndex)) {
      return res.status(400).json({ error: '排序序号必须为整数' });
    }

    const existing = await prisma.learningChapter.findUnique({ where: { chapterId } });
    if (!existing) return res.status(404).json({ error: '章节不存在' });

    const chapter = await prisma.learningChapter.update({
      where: { chapterId },
      data: {
        title: title.trim(),
        subtitle: subtitle || null,
        content: content || null,
        orderIndex
      }
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

    const { title, scene, budget, duration, location, girlId } = req.body;
    const { getAIConfig } = require('../config');

    // 从scene提取场所类型关键词
    const sceneLower = (scene || '').toLowerCase();
    const venueTypes = [];
    if (/咖啡|cafe|茶|下午茶/.test(sceneLower)) venueTypes.push('咖啡厅', '茶馆');
    if (/餐厅|饭|餐|粤菜|川菜|日料|西餐|火锅|烧烤/.test(sceneLower)) venueTypes.push('餐厅', '饭馆');
    if (/ktv|唱歌|卡拉|包厢/.test(sceneLower)) venueTypes.push('KTV', '量贩式KTV');
    if (/电影|影院/.test(sceneLower)) venueTypes.push('电影院');
    if (/酒吧|小酒馆|清吧/.test(sceneLower)) venueTypes.push('酒吧', '小酒馆');
    if (/公园|散步|户外/.test(sceneLower)) venueTypes.push('公园', '滨江步道');
    if (venueTypes.length === 0) venueTypes.push('约会场所');

    // 创建草稿
    const plan = await prisma.datingPlan.create({
      data: {
        userId: req.user.id,
        girlId: girlId || null,
        title: title || '约会方案',
        scene,
        budget,
        duration,
        planStatus: 'generating'
      }
    });

    // 地址关键词：优先使用用户指定的地点，其次从 scene 提取
    let addressKeyword = (location || '').trim();
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

      // 策略1：JSON 格式解析（百度 AI Search 按要求返回 [{"name":"","address":"","price":""}）
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const arr = JSON.parse(jsonMatch[0]);
          for (const item of arr) {
            if (!item.name || !item.address) continue;
            const addr = String(item.address).trim();
            // 过滤明显虚假/模糊地址
            if (/附近$|周边$|具体地址|未提供|不详/.test(addr)) continue;
            // 至少包含路/街/道/弄/号/广场/大厦/中心/城 之一
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

    // 异步生成方案内容
    const aiConfig = getAIConfig();

    // Prompt 注入防护：转义用户输入中的特殊字符
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

    const prompt = `你是资深约会策划专家，根据以下信息为用户设计一次完美的约会方案。

【用户信息】
场景：${safeScene || '普通约会'}
预算：${safeBudget || '1000元左右'}
时长：${safeDuration || '半天'}${venueContext}${weatherInfo}

请以专业约会策划师的角度输出Markdown方案，内容包含：
1. 约会概览（适合人群、整体风格）
2. 推荐地点（2-3个精选场所，标注名称、地址、人均消费）
3. 时间安排（从见面到结束的完整时间线）
4. 聊天话题（每个阶段推荐聊什么）
5. 注意事项（雷区和加分项）
6. 穿着建议（根据天气调整）
7. 预算分配提示
8. 天气出行建议（如遇雨天提供室内备选）

要求：内容专业、实用，给出具体可执行的建议。让用户感受到这是一份精心策划的约会方案。

只输出Markdown方案内容，不要任何额外说明。`;

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
    let content = data.choices?.[0]?.message?.content || '生成失败，请重试。';
    // 去除 AI 可能包裹的 ```markdown ... ``` 代码块
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

      const updatedPlan = await prisma.datingPlan.update({
        where: { id: plan.id },
        data: {
          content,
          planStatus: 'generated'
        }
      });

      // 记录活跃度（仅客户端用户）
      if (req.user.role === 'client') {
        activityService.recordActivity(req.user.id, 'date_plan', {
          planId: plan.id,
        }).catch(err => console.error(`[Activity] 记录date_plan失败: ${err.message}`));
      }

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
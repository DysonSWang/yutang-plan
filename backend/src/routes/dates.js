/**
 * 约会管理路由
 * 支持：创建约会 → AI策划 → 执行 → 约会后记录评价
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET, getAIConfig } = require('../config');
const prisma = require('../prisma');
const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const { analyzeSuitableVenueTypes, baiduVenueSearch } = require('./membership');
// 辅助：验证目标用户是否为 client（管理员可操作所有客户）
async function verifyIsClient(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user && user.role === 'client';
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

// ========== AI 策划引擎 ==========
async function callAI(messages, options = {}) {
  const aiConfig = getAIConfig();
  if (!aiConfig) {
    throw new AppError(ErrorCodes.AI_SERVICE_UNAVAILABLE);
  }

  const body = {
    model: aiConfig.model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2000
  };

  const response = await fetch(aiConfig.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${aiConfig.key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new AppError(ErrorCodes.AI_SERVICE_UNAVAILABLE, { devMessage: `AI调用失败: ${response.status} - ${err}` });
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// 流式 AI 调用，支持思考过程回调
async function callAIStream(messages, options, callbacks) {
  const aiConfig = getAIConfig();
  if (!aiConfig) {
    callbacks.onError?.('AI 服务不可用');
    return;
  }

  const body = {
    model: aiConfig.model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 3000,
    stream: true
  };

  if (aiConfig.model === 'deepseek-v4-pro') {
    body.thinking = { type: 'enabled' };
  }

  try {
    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      callbacks.onError?.(`AI调用失败: ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            callbacks.onDone?.();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta || {};

            const reasoning = delta.reasoning_content || '';
            if (reasoning) {
              callbacks.onReasoning?.(reasoning);
              continue;
            }

            const content = delta.content || '';
            if (content) {
              callbacks.onChunk?.(content);
            }
          } catch { /* skip parse errors */ }
        }
      }
    }
    callbacks.onDone?.();
  } catch (err) {
    callbacks.onError?.(err.message);
  }
}

function parsePriceRange(text) {
  const match = text.match(/人均[：:]?[¥￥]?(\d+)/);
  return match ? parseInt(match[1]) : null;
}

async function searchVenues({ location, interests, budget, dateStyle, girl, dateTime }) {
  const results = { restaurants: [], venues: [], activities: [], summary: '' };

  // 提取预算数字
  const budgetNum = parseInt((budget || '500').replace(/[^0-9]/g, '')) || 500;
  const locationText = location || '';

  // 智能分析合适场所类型
  const sceneText = [dateStyle, interests].filter(Boolean).join(' ');
  const venueTypes = analyzeSuitableVenueTypes(sceneText, budget, dateTime, girl?.stage || '');

  // 1. 用百度AI搜索约会场地（使用增强版深搜）
  try {
    const data = await baiduVenueSearch(locationText, venueTypes, budgetNum);

    // 提取AI总结
    const choices = data.choices || [];
    if (choices.length > 0) {
      const content = choices[0].message?.content || '';
      if (content) {
        results.summary = content.slice(0, 500); // 保存AI总结用于参考
      }
    }

    // 提取参考来源
    const references = data.references || [];
    for (const ref of references.slice(0, 5)) {
      const title = ref.title || '';
      const url = ref.url || '';
      const source = ref.web_anchor || ref.source || '';

      if (title && !title.includes('...') && title.length > 2 && title.length < 50) {
        // 判断类型
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes('咖啡') || lowerTitle.includes('cafe') || lowerTitle.includes('茶')) {
          results.venues.push({
            name: title,
            type: '咖啡厅/茶馆',
            description: ref.content?.slice(0, 80) || '',
            source: source || '百度搜索'
          });
        } else if (lowerTitle.includes('ktv') || lowerTitle.includes('唱') || lowerTitle.includes('电影')) {
          results.activities.push({
            name: title,
            type: 'KTV/娱乐',
            description: ref.content?.slice(0, 80) || '',
            source: source || '百度搜索'
          });
        } else if (lowerTitle.includes('餐') || lowerTitle.includes('食') || lowerTitle.includes('饭店') || lowerTitle.includes('酒楼')) {
          results.restaurants.push({
            name: title,
            description: ref.content?.slice(0, 100) || '',
            price: parsePriceRange(ref.content || '') || budgetNum,
            source: source || '百度搜索'
          });
        }
      }
    }
  } catch (e) {
    console.warn('[Dates] 百度AI搜索失败:', e.message);
  }

  // 去重
  const seen = new Set();
  results.restaurants = results.restaurants.filter(r => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  }).slice(0, 5);

  seen.clear();
  results.venues = results.venues.filter(v => {
    if (seen.has(v.name)) return false;
    seen.add(v.name);
    return true;
  }).slice(0, 3);

  seen.clear();
  results.activities = results.activities.filter(a => {
    if (seen.has(a.name)) return false;
    seen.add(a.name);
    return true;
  }).slice(0, 2);

  console.log('[Dates] 百度AI搜索完成:', {
    restaurants: results.restaurants.length,
    venues: results.venues.length,
    activities: results.activities.length,
    hasSummary: !!results.summary
  });

  return results;
}

function buildDatePlanPrompt({ client, girl, conditions, venueSearchResults, date }) {
  return `你是一位顶尖约会策划师，代号"月老"。请根据以下信息，为客户生成一份详细的约会策划方案。

【客户信息】
姓名：${client.nickname || client.username}
年龄：${client.age || '未知'}
职业：${client.occupation || '未知'}
所在地：${client.residence || '未知'}
性格/风格：${client.personality || '未知'} / ${client.communicationStyle || '未知'}
沟通风格：${client.interactionStyle || client.communicationStyle || '正常'}
爱好：${client.interests || girl.interests || '未知'}
约会预算：${conditions.budget || '未指定'}
核心卖点：${client.strengths || '真诚、有趣'}

【女生信息】
姓名/昵称：${girl.name}
年龄：${girl.age || '未知'}
职业：${girl.occupation || '未知'}
现居地：${girl.residence || '未知'}
婚恋态度：${girl.relationshipAttitude || '未知'}
家庭背景：${girl.familyBackground || '未知'} / ${girl.familyAtmosphere || '未知'}
性格画像：${girl.personality || '未知'} / ${girl.communicationStyle || '未知'}
情绪触发点：${girl.emotionalTriggers || '未知'}
兴趣爱好：${girl.interests || '未知'}
饮食偏好：${girl.dietPreferences || '未知'}
饮食禁忌/过敏：${girl.dietRestrictions || '无'}
禁忌话题：${girl.thingsToAvoid || '未知'}
最佳策略：${girl.bestApproach || '真诚'}
当前阶段：${girl.stage || '陌生'}（热度${girl.tensionScore || 5}/10）
关系张力：${girl.intimacyLevel || 1}/5
过往情伤：${girl.emotionalWounds || '未知'}

【约会条件】
约会风格：${conditions.dateStyle || '正常约会'}
预算范围：${conditions.budget || '适中即可'}
兴趣爱好偏好：${conditions.interests || girl.interests || '未知'}
${(() => {
      let timeInfo = conditions.timePreference || '';
      let timeWarning = '';
      if (!timeInfo && date?.dateTime) {
        try {
          const d = new Date(date.dateTime);
          const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
          const weekDay = weekNames[d.getDay()];
          const hour = d.getHours();
          const minute = d.getMinutes();
          const timeStr = d.getMonth() + 1 + '月' + d.getDate() + '日 ' + weekDay + ' ' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
          let period = '';
          if (hour >= 5 && hour < 9) period = '清晨';
          else if (hour >= 9 && hour < 11) period = '上午';
          else if (hour >= 11 && hour < 13) period = '午餐时段';
          else if (hour >= 13 && hour < 17) period = '下午';
          else if (hour >= 17 && hour < 19) period = '傍晚';
          else if (hour >= 19 && hour < 22) period = '晚上黄金时段';
          else if (hour >= 22 || hour < 2) period = '深夜';
          else period = '凌晨';
          timeInfo = timeStr + '（' + period + '）';
          if (hour >= 22 || hour < 2) {
            timeWarning = '\\n🚫 深夜时段铁律：严禁推荐咖啡厅、茶馆、下午茶等白天场所！只能推荐酒吧、夜宵、Livehouse、深夜书店、夜间散步点等营业至深夜的地点。';
          } else if (hour >= 19 && hour < 22) {
            timeWarning = '\\n🌙 晚间时段：优先推荐酒吧、居酒屋、夜景餐厅等晚间氛围场所。';
          }
        } catch {}
      }
      return '⏰ 约会时间：' + (timeInfo || '周末下午') + timeWarning;
    })()}
📍 约会地点：${conditions.locationPreference || date?.location || girl?.residence || '未指定'}
特殊要求：${conditions.specialRequirements || '无'}
约会时长：${conditions.duration || '2-3小时'}
约会目的：${conditions.purpose || '加深了解，建立好感'}

【真实场地数据】（以下信息来自实时搜索，请优先从中选择，禁止虚构）
${venueSearchResults?.restaurants?.length ? `【餐厅推荐】
${venueSearchResults.restaurants.map(r => `★ ${r.name} | 人均¥${r.price} | ${r.source} | ${r.description || ''}`).join('\n')}` : '（未找到餐厅数据）'}
${venueSearchResults?.venues?.length ? `【咖啡厅/茶馆】
${venueSearchResults.venues.map(v => `☕ ${v.name} | ${v.type} | ${v.source} | ${v.description || ''}`).join('\n')}` : ''}
${venueSearchResults?.activities?.length ? `【娱乐活动】
${venueSearchResults.activities.map(a => `🎵 ${a.name} | ${a.type} | ${a.source} | ${a.description || ''}`).join('\n')}` : ''}
${(() => {
  const hasResults = (venueSearchResults?.restaurants?.length || 0) + (venueSearchResults?.venues?.length || 0) + (venueSearchResults?.activities?.length || 0) > 0;
  return hasResults ? '🚫 场地铁律：请从上述搜索结果中挑选真实存在的场所推荐，严禁虚构任何店名。' : '🚫 场地铁律：搜索未找到真实商家数据。严禁编造任何具体店名（如"XXX酒吧（假设位于...）"），只能建议场所类型（如"精酿啤酒吧"、"深夜食堂"等），地址一律写搜索区域名称。';
})()}

请生成一份JSON格式的约会方案，结构如下（只需要JSON，不要其他文字）：
{
  "overview": "约会总览，1-2句话概括整体思路",
  "venue": {
    "name": "推荐地点名称",
    "type": "类型（餐厅/咖啡厅/户外等）",
    "address": "大致地址或区域",
    "reason": "为什么选这个地方",
    "budget": "预计花费区间"
  },
  "schedule": [
    { "time": "时间点", "activity": "活动内容", "duration": "持续时长", "note": "注意事项" }
  ],
  "talkingPoints": [
    { "topic": "话题名称", "content": "具体说什么/怎么切入", "goal": "这个话题想要达到的目的" }
  ],
  "precautions": [
    { "point": "注意事项", "reason": "为什么要注意", "suggestion": "建议做法" }
  ],
  "outfit": {
    "style": "穿搭风格建议",
    "colors": "推荐颜色",
    "avoid": "避免的穿搭"
  },
  "budgetTips": "预算控制建议",
  "successSignals": ["约会中女生可能的好感信号1", "信号2"],
  "backupPlans": ["备选方案1", "备选方案2（如果被拒绝某项活动）"]
}`;
}

function buildPostDateReviewPrompt({ client, girl, date, evaluation }) {
  return `你是一位经验丰富的约会教练，代号"脱不花"。请根据以下信息，对这次约会进行深度复盘，给出下一步行动建议。

【客户信息】
姓名：${client.nickname || client.username}
年龄：${client.age || '未知'}
沟通风格：${client.interactionStyle || '正常'}
情伤记录：${client.emotionalWounds || '无'}

【女生信息】
姓名：${girl.name}
性格：${girl.personality || '未知'}
沟通风格：${girl.communicationStyle || '未知'}
情绪触发点：${girl.emotionalTriggers || '未知'}
婚恋态度：${girl.relationshipAttitude || '未知'}
情伤记录：${girl.emotionalWounds || '未知'}
当前阶段：${girl.stage || '陌生'} → ${evaluation.girlStageAfter || '未知'}
约会后热度变化：${evaluation.tensionChange || '未知'}
过往情伤：${girl.emotionalWounds || '无'}

【约会信息】
约会时长：${date.duration || '未知'}
约会地点：${date.location || '未知'}
总花费：${date.totalExpense ? `¥${date.totalExpense}` : '未知'}
约会评价：${evaluation.rating ? `${evaluation.rating}星` : '未评分'}

【约会后反馈】
正面信号：${evaluation.positiveSignals ? evaluation.positiveSignals.map(s => s.signal).join('、') : '未记录'}
负面信号：${evaluation.negativeSignals ? evaluation.negativeSignals.map(s => s.signal).join('、') : '无'}
客户总结：${evaluation.postNotes || '未记录'}
下次约会目的：${evaluation.nextPurpose || '继续推进关系'}

【深度观察数据（评审团新增）】
女生投入度曲线：开始 ${date.postDateInterview ? JSON.parse(date.postDateInterview).girlEngagementStart : '?'} → 中期 ${date.postDateInterview ? JSON.parse(date.postDateInterview).girlEngagementMid : '?'} → 结束 ${date.postDateInterview ? JSON.parse(date.postDateInterview).girlEngagementEnd : '?'}
女生舒适行为：${date.postDateInterview ? JSON.parse(date.postDateInterview).comfortBehaviors || '未记录' : '未记录'}
话题深入程度：${date.postDateInterview ? JSON.parse(date.postDateInterview).topicDepth || '未记录' : '未记录'}
操盘手关键观察：${date.postDateInterview ? JSON.parse(date.postDateInterview).clientAnchor || '未记录' : '未记录'}

请以JSON格式返回评价结果：
{
  "summary": "整体约会复盘，1-3句话",
  "tensionAnalysis": "热度变化分析（上升/下降/持平，原因是什么）",
  "positiveSignalsDetailed": [
    { "signal": "正面信号描述", "analysis": "这个信号说明什么", "significance": "重要性（高/中/低）" }
  ],
  "negativeSignalsDetailed": [
    { "signal": "负面信号描述", "analysis": "这个信号的风险程度", "mitigation": "如何化解或降低影响" }
  ],
  "nextActions": [
    { "action": "具体行动", "priority": "优先级（高/中/低）", "timing": "什么时候执行", "reason": "为什么现在要做这个" }
  ],
  "recommendedTopics": ["下次约会推荐话题1", "话题2"],
  "relationshipProgress": "关系进度评估（搭讪→聊天→暧昧→约会→锁定）",
  "warningSigns": ["需要警惕的信号1", "信号2（如无则填'无'）"]
}`;
}

// ========== 路由实现 ==========

// 获取约会列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { clientId, girlId, status } = req.query;

    let where = {};
    if (req.user.role === 'client') {
      where.userId = req.user.id;
    } else if (clientId) {
      // 安全：操盘手可查看所有客户的数据
      const ok = await verifyIsClient(clientId);
      if (!ok) return res.status(403).json({ error: '无权限访问此客户的数据' });
      where.userId = clientId;
    }
    if (girlId) where.girlId = girlId;
    if (status) where.status = status;

    const dates = await prisma.date.findMany({
      where,
      include: {
        user: {
          select: { id: true, nickname: true, username: true, interactionStyle: true, communicationStyle: true, strengths: true }
        },
        girl: {
          select: {
            id: true, name: true, age: true, occupation: true, residence: true, stage: true,
            personality: true, communicationStyle: true, emotionalTriggers: true, thingsToAvoid: true,
            interests: true, dietPreferences: true, dietRestrictions: true, relationshipAttitude: true, emotionalWounds: true,
            tensionScore: true, intimacyLevel: true, bestApproach: true, familyBackground: true,
            familyAtmosphere: true, avatar: true, photos: true
          }
        }
      },
      orderBy: { dateTime: 'desc' }
    });

    res.json({ success: true, dates });
  } catch (error) {
    console.error('[Dates] 获取约会列表失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建约会
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { clientId, girlId, dateTime, location, title, conditions, notes } = req.body;

    let effectiveClientId;
    if (req.user.role === 'client') {
      effectiveClientId = req.user.id;
    } else if (req.user.role === 'admin') {
      if (!clientId) return res.status(400).json({ error: '参数不完整（需 clientId）' });
      const ok = await verifyIsClient(clientId);
      if (!ok) return res.status(403).json({ error: '无权限为该客户创建约会' });
      effectiveClientId = clientId;
    } else {
      return res.status(403).json({ error: '无权限' });
    }

    if (!girlId) {
      return res.status(400).json({ error: '参数不完整（需 girlId）' });
    }

    // 验证女生属于该客户
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl || girl.clientId !== effectiveClientId) {
      return res.status(400).json({ error: '该女生不属于您' });
    }

    const date = await prisma.date.create({
      data: {
        userId: effectiveClientId,
        girlId,
        dateTime: dateTime ? new Date(dateTime) : new Date(),
        location,
        title,
        conditions: conditions ? JSON.stringify(conditions) : null,
        notes,
        status: req.user.role === 'client' ? 'confirmed' : 'pending_plan',
        planStatus: req.user.role === 'client' ? 'confirmed' : 'pending'
      }
    });

    // 更新女生阶段为约会
    await prisma.girl.update({
      where: { id: girlId },
      data: { stage: '约会', status: 'dating' }
    });

    // 自动创建日历事件
    const eventTime = dateTime ? new Date(dateTime) : new Date();
    await prisma.event.create({
      data: {
        clientId: effectiveClientId,
        girlId,
        title: title || '约会',
        content: location ? `地点：${location}` : null,
        eventTime,
        type: 'date',
        status: 'pending',
        dateId: date.id
      }
    });

    res.json({ success: true, date });
  } catch (error) {
    console.error('[Dates] 创建约会失败:', error);
    res.status(500).json({ error: '创建失败' });
  }
});

// 约会前检查清单模板
router.get('/checklist-template', authMiddleware, async (req, res) => {
  const template = [
    { category: '邀约确认', items: [
      { id: 'invite_confirmed', label: '女生已明确答应邀约' },
      { id: 'time_confirmed', label: '时间地点已确认' },
      { id: 'reminder_sent', label: '提前1-2小时提醒女生' },
      { id: 'girl_mood_ok', label: '女生当天情绪状态正面' },
      { id: 'backup_location', label: '备选地点已准备好' },
      { id: 'no_abnormal_signals', label: '女生最近无异常冷淡信号' },
    ]},
    { category: '客户形象', items: [
      { id: 'outfit_ready', label: '穿搭已确认（符合约会风格）' },
      { id: 'hairgroom', label: '发型/面容整洁' },
      { id: 'breath_fresh', label: '口气清新（薄荷糖/清新片备好）' },
      { id: 'nails_trimmed', label: '指甲修剪干净' },
      { id: 'sufficient_cash', label: '预算内现金备好' },
    ]},
    { category: '行程安排', items: [
      { id: 'route_planned', label: '约会路线已规划' },
      { id: 'venue_reserved', label: '餐厅/场地已预约（如需）' },
      { id: 'transfer_planned', label: '第一站→第二站衔接已规划' },
      { id: 'exit_strategy', label: '撤退策略已知（如何自然结束约会）' },
      { id: 'transport_ready', label: '交通方式/停车已确认' },
    ]},
    { category: '物资准备', items: [
      { id: 'essentials_packed', label: '钱包/手机/充电宝' },
      { id: 'weather_checked', label: '天气状况已确认（备伞/外套）' },
      { id: 'area_familiar', label: '对约会区域/洗手间位置已了解' },
      { id: 'topics_ready', label: '3-5个备用话题已准备' },
      { id: 'gift_optional', label: '小礼物已准备（如有）' },
    ]},
    { category: '心理预设', items: [
      { id: 'goal_set', label: '今晚目标：让她舒服，不是追到她' },
      { id: 'result_accept', label: '接受约会结果可能不符合预期' },
      { id: 'delay_plan', label: '她迟到超过15分钟的处理方案已知' },
      { id: 'no_neediness', label: '避免表现需求感的核心策略已熟悉' },
      { id: 'pace_respect', label: '推进节奏尊重女生的反馈信号' },
    ]},
  ];
  res.json({ success: true, template });
});


// ========== 客户获取待确认的约会方案 ==========
router.get('/client-pending', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({ error: '仅客户可访问' });
    }

    const dates = await prisma.date.findMany({
      where: {
        userId: req.user.id,
        status: { in: ['pending_plan', 'planned', 'pending_client_confirm', 'confirmed'] }
      },
      include: {
        girl: { select: { id: true, name: true, age: true, stage: true, personality: true, avatar: true, photos: true } }
      },
      orderBy: { dateTime: 'asc' }
    });

    res.json({ success: true, dates });
  } catch (error) {
    console.error('[Dates] 获取待确认方案失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});


// ========== 客户获取待填写的访谈 ==========
router.get('/client-interviews', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'client') return res.status(403).json({ error: '仅客户可访问' });

    // 查找已推送但未回答的访谈
    const completedDates = await prisma.date.findMany({
      where: {
        userId: req.user.id,
        status: 'completed',
        postDateInterview: { not: null }
      },
      include: {
        girl: { select: { id: true, name: true, stage: true, avatar: true, photos: true } }
      },
      orderBy: { dateTime: 'desc' }
    });

    const pending = completedDates.filter(d => {
      const interview = JSON.parse(d.postDateInterview || '{}');
      return interview.questionStatus === 'pending' && interview.generatedQuestions?.length > 0;
    }).map(d => {
      const interview = JSON.parse(d.postDateInterview);
      return {
        dateId: d.id,
        title: d.title || '约会反馈访谈',
        girlName: d.girl?.name,
        dateTime: d.dateTime,
        interviewOverview: interview.interviewOverview,
        questions: interview.generatedQuestions,
        pushedAt: interview.pushedAt
      };
    });

    res.json({ success: true, interviews: pending });
  } catch (error) {
    console.error('[Dates] 获取客户访谈失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});


// 获取单个约会详情
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const date = await prisma.date.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: { id: true, nickname: true, username: true, interactionStyle: true, communicationStyle: true, strengths: true, emotionalWounds: true, age: true, occupation: true, residence: true }
        },
        girl: {
          select: { id: true, name: true, age: true, occupation: true, residence: true, stage: true, personality: true, communicationStyle: true, emotionalTriggers: true, thingsToAvoid: true, interests: true, dietPreferences: true, dietRestrictions: true, relationshipAttitude: true, emotionalWounds: true, tensionScore: true, intimacyLevel: true, bestApproach: true, familyBackground: true, familyAtmosphere: true, avatar: true, photos: true }
        }
      }
    });

    if (!date) return res.status(404).json({ error: '约会不存在' });

    // 安全：客户只能查看自己的约会
    if (req.user.role === 'client' && date.userId !== req.user.id) {
      return res.status(403).json({ error: '无权访问' });
    }
    // 安全：操盘手可查看所有客户的约会
    if (req.user.role === 'admin') {
      const dateOwner = await prisma.user.findUnique({ where: { id: date.userId }, select: { role: true } });
      if (!dateOwner || dateOwner.role !== 'client') {
        return res.status(403).json({ error: '无权访问此约会' });
      }
    }

    res.json({ success: true, date });
  } catch (error) {
    console.error('[Dates] 获取约会详情失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 更新约会
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const existing = await prisma.date.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '约会不存在' });
    // 安全：操盘手可操作所有客户的约会
    const ok = await verifyIsClient(existing.userId);
    if (!ok) return res.status(403).json({ error: '无权操作此约会' });

    const {
      dateTime, location, status, notes, nextAction,
      conditions, aiPlan, planStatus,
      expenseRecord, totalExpense, duration,
      rating, positiveSignals, negativeSignals, followUpActions, postNotes,
      girlStageAfter, title, preDateChecklist
    } = req.body;

    const updateData = {};
    if (dateTime !== undefined) updateData.dateTime = new Date(dateTime);
    if (location !== undefined) updateData.location = location;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (nextAction !== undefined) updateData.nextAction = nextAction;
    if (title !== undefined) updateData.title = title;
    if (conditions !== undefined) updateData.conditions = typeof conditions === 'string' ? conditions : JSON.stringify(conditions);
    if (aiPlan !== undefined) updateData.aiPlan = typeof aiPlan === 'string' ? aiPlan : JSON.stringify(aiPlan);
    if (planStatus !== undefined) updateData.planStatus = planStatus;
    if (expenseRecord !== undefined) updateData.expenseRecord = typeof expenseRecord === 'string' ? expenseRecord : JSON.stringify(expenseRecord);
    if (totalExpense !== undefined) updateData.totalExpense = parseFloat(totalExpense);
    if (duration !== undefined) updateData.duration = duration;
    if (rating !== undefined) updateData.rating = parseInt(rating);
    if (positiveSignals !== undefined) updateData.positiveSignals = typeof positiveSignals === 'string' ? positiveSignals : JSON.stringify(positiveSignals);
    if (negativeSignals !== undefined) updateData.negativeSignals = typeof negativeSignals === 'string' ? negativeSignals : JSON.stringify(negativeSignals);
    if (followUpActions !== undefined) updateData.followUpActions = typeof followUpActions === 'string' ? followUpActions : JSON.stringify(followUpActions);
    if (postNotes !== undefined) updateData.postNotes = postNotes;
    if (girlStageAfter !== undefined) {
      updateData.girlStageAfter = girlStageAfter;
      // 同步更新女生的阶段
      await prisma.girl.update({
        where: { id: (await prisma.date.findUnique({ where: { id: req.params.id } }))?.girlId },
        data: { stage: girlStageAfter }
      });
    }
    if (preDateChecklist !== undefined) updateData.preDateChecklist = typeof preDateChecklist === 'string' ? preDateChecklist : JSON.stringify(preDateChecklist);

    const date = await prisma.date.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, date });
  } catch (error) {
    console.error('[Dates] 更新约会失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 更新检查清单状态
router.put('/:id/checklist', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }
    const existing = await prisma.date.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '约会不存在' });
    // 安全：操盘手可操作所有客户的约会
    const ok = await verifyIsClient(existing.userId);
    if (!ok) return res.status(403).json({ error: '无权操作此约会' });
    const { checklist } = req.body;
    const updateData = {};
    if (checklist !== undefined) {
      updateData.preDateChecklist = typeof checklist === 'string' ? checklist : JSON.stringify(checklist);
    }
    const date = await prisma.date.update({
      where: { id: req.params.id },
      data: updateData
    });
    res.json({ success: true, date });
  } catch (error) {
    console.error('[Dates] 更新检查清单失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// AI 生成约会方案（SSE 流式）
router.post('/:id/generate-plan', authMiddleware, async (req, res) => {
  let date;
  try {
    date = await prisma.date.findUnique({
      where: { id: req.params.id },
      include: { user: true, girl: true }
    });

    if (!date) return res.status(404).json({ error: '约会不存在' });

    // 安全校验
    if (req.user.role === 'admin') {
      const ok = await verifyIsClient(date.userId);
      if (!ok) return res.status(403).json({ error: '无权操作此约会' });
    } else if (req.user.role === 'client') {
      if (date.userId !== req.user.id) {
        return res.status(403).json({ error: '无权操作此约会' });
      }
    } else {
      return res.status(403).json({ error: '无权限' });
    }
  } catch (error) {
    console.error('[Dates] 校验失败:', error);
    return res.status(500).json({ error: '校验失败' });
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'identity');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 更新状态为生成中
    await prisma.date.update({
      where: { id: req.params.id },
      data: { planStatus: 'generating' }
    });

    const conditions = date.conditions ? JSON.parse(date.conditions) : {};

    // 搜索真实场地
    send({ status: '正在搜索周边场地...' });
    let venueSearchResults = null;
    try {
      venueSearchResults = await searchVenues({
        location: conditions.locationPreference || date.location || date.girl?.residence || '',
        interests: conditions.interests || date.girl?.interests,
        budget: conditions.budget,
        dateStyle: conditions.dateStyle,
        girl: date.girl,
        dateTime: date.dateTime
      });
      console.log('[Dates] 场地搜索完成:', {
        restaurants: venueSearchResults.restaurants?.length || 0,
        venues: venueSearchResults.venues?.length || 0,
        activities: venueSearchResults.activities?.length || 0
      });
    } catch (e) {
      console.warn('[Dates] 场地搜索失败，使用空数据:', e.message);
    }

    const prompt = buildDatePlanPrompt({
      client: date.user,
      girl: date.girl,
      conditions,
      venueSearchResults,
      date
    });

    send({ status: 'AI 正在分析策划方案...' });

    let planText = '';

    await callAIStream(
      [{ role: 'user', content: prompt }],
      { temperature: 0.8, maxTokens: 3000 },
      {
        onReasoning: (reasoning) => {
          send({ reasoning });
        },
        onChunk: (content) => {
          planText += content;
          send({ content });
        },
        onDone: async () => {
          // 提取JSON
          let plan = null;
          const jsonMatch = planText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try { plan = JSON.parse(jsonMatch[0]); } catch { plan = { overview: planText }; }
          } else {
            plan = { overview: planText };
          }

          try {
            const updated = await prisma.date.update({
              where: { id: req.params.id },
              data: {
                aiPlan: JSON.stringify(plan),
                planStatus: 'generated',
                status: 'planned'
              }
            });
            send({ done: true, plan, date: updated });
          } catch (dbErr) {
            console.error('[Dates] 保存方案失败:', dbErr);
            send({ error: '保存方案失败' });
          }
          res.end();
        },
        onError: async (msg) => {
          console.error('[Dates] AI策划失败:', msg);
          await prisma.date.update({
            where: { id: req.params.id },
            data: { planStatus: 'pending' }
          }).catch(() => {});
          send({ error: msg });
          res.end();
        }
      }
    );
  } catch (error) {
    console.error('[Dates] AI策划失败:', error);
    try { send({ error: '策划失败' }); } catch {}
    res.end();
  }
});

// AI 约会后复盘评价
router.post('/:id/evaluate', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const date = await prisma.date.findUnique({
      where: { id: req.params.id },
      include: {
        user: true,
        girl: true
      }
    });

    if (!date) return res.status(404).json({ error: '约会不存在' });
    if (req.user.role === 'admin') {
      const ok = await verifyIsClient(date.userId);
      if (!ok) return res.status(403).json({ error: '无权操作此约会' });
    }

    const {
      rating, positiveSignals, negativeSignals, postNotes,
      nextPurpose, tensionChange, girlStageAfter,
      expenseRecord, totalExpense, duration,
      // 访谈新字段
      girlAppearance, girlOnTime, girlGreetedFirst,
      silenceDuration, awkwardMoments,
      physicalProgress,
      goodbyeInitiator, nextDateMentioned,
      moodStart, moodMid, moodEnd,
      highlight, lowlight, clientSelfScore, expectationGap,
      // 评审团新增
      girlEngagementStart, girlEngagementMid, girlEngagementEnd,
      comfortBehaviors, topicDepth, clientAnchor
    } = req.body;

    // 构造结构化访谈数据
    const postDateInterview = {
      girlAppearance, girlOnTime, girlGreetedFirst,
      silenceDuration, awkwardMoments,
      physicalProgress,
      goodbyeInitiator, nextDateMentioned,
      moodStart, moodMid, moodEnd,
      highlight, lowlight, clientSelfScore, expectationGap,
      girlEngagementStart, girlEngagementMid, girlEngagementEnd,
      comfortBehaviors, topicDepth, clientAnchor
    };

    // 更新数据库
    const updateData = {
      status: 'completed',
      rating: rating ? parseInt(rating) : undefined,
      positiveSignals: positiveSignals ? JSON.stringify(positiveSignals) : undefined,
      negativeSignals: negativeSignals ? JSON.stringify(negativeSignals) : undefined,
      postNotes,
      followUpActions: null,
      duration,
      expenseRecord: expenseRecord ? JSON.stringify(expenseRecord) : undefined,
      totalExpense: totalExpense ? parseFloat(totalExpense) : undefined,
      girlStageAfter,
      postDateInterview: JSON.stringify(postDateInterview)
    };

    // 如果指定了新阶段，同步更新女生
    if (girlStageAfter) {
      await prisma.girl.update({
        where: { id: date.girlId },
        data: {
          stage: girlStageAfter,
          status: girlStageAfter === '锁定' ? 'locked' : girlStageAfter === '长期' ? 'long_term' : 'dating'
        }
      });
    }

    const updated = await prisma.date.update({
      where: { id: req.params.id },
      data: Object.fromEntries(Object.entries(updateData).filter(([_, v]) => v !== undefined))
    });

    // AI 深度复盘
    const evaluation = { rating, positiveSignals, negativeSignals, postNotes, nextPurpose, tensionChange, girlStageAfter };
    const prompt = buildPostDateReviewPrompt({ client: date.user, girl: date.girl, date, evaluation });

    let reviewText;
    try {
      reviewText = await callAI([
        { role: 'user', content: prompt }
      ], { temperature: 0.7, maxTokens: 2000 });

      const jsonMatch = reviewText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const review = JSON.parse(jsonMatch[0]);
          await prisma.date.update({
            where: { id: req.params.id },
            data: {
              followUpActions: JSON.stringify(review.nextActions || []),
              nextAction: review.nextActions?.[0]?.action || null
            }
          });
          res.json({ success: true, date: updated, review });
          return;
        } catch (e) { console.warn('[Dates] AI复盘 JSON 解析失败:', e.message); }
      }
    } catch (err) {
      console.error('[Dates] AI复盘失败:', err);
    }

    res.json({ success: true, date: updated });
  } catch (error) {
    console.error('[Dates] 约会后评价失败:', error);
    res.status(500).json({ error: '评价失败' });
  }
});

// ========== 操盘手与AI讨论优化方案 ==========
router.post('/:id/discuss', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: '消息不能为空' });
    }

    const date = await prisma.date.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true,
            serviceStage: true,
            interactionStyle: true,
            communicationStyle: true,
            strengths: true,
            personality: true
          }
        },
        girl: {
          select: {
            id: true,
            name: true,
            age: true,
            stage: true,
            personality: true,
            communicationStyle: true,
            emotionalTriggers: true,
            thingsToAvoid: true,
            interests: true,
            dietPreferences: true,
            dietRestrictions: true,
            relationshipAttitude: true,
            emotionalWounds: true,
            tensionScore: true,
            intimacyLevel: true,
            bestApproach: true,
            familyBackground: true,
            familyAtmosphere: true
          }
        }
      }
    });
    if (!date) return res.status(404).json({ error: '约会不存在' });
    if (req.user.role === 'admin') {
      const ok = await verifyIsClient(date.userId);
      if (!ok) return res.status(403).json({ error: '无权操作此约会' });
    }
    if (!date.aiPlan) return res.status(400).json({ error: '请先生成约会方案' });

    const currentPlan = JSON.parse(date.aiPlan);
    const conditions = date.conditions ? JSON.parse(date.conditions) : {};

    // 构造历史讨论上下文
    const historyMessages = [];
    if (date.planDiscussion) {
      try {
        const history = JSON.parse(date.planDiscussion);
        history.forEach(h => {
          historyMessages.push({ role: h.role === 'ai' ? 'assistant' : 'user', content: h.content });
        });
      } catch (e) { console.warn('[Dates] planDiscussion JSON 解析失败:', e.message); }
    }

    const discussPrompt = `你是一位顶尖约会策划师，代号"月老"。客户正在就以下约会方案征求你的意见。

【当前约会方案】
${JSON.stringify(currentPlan, null, 2)}

【约会条件】
${JSON.stringify(conditions, null, 2)}

【女生信息】
姓名：${date.girl.name}
阶段：${date.girl.stage || '未知'}
性格：${date.girl.personality || '未知'}
饮食禁忌：${date.girl.dietRestrictions || '无'}

请根据操盘手的调整意见，给出具体可执行的优化建议。如果涉及方案改动，请给出新的完整方案结构（JSON格式）。`;

    const allMessages = [
      ...historyMessages,
      { role: 'user', content: discussPrompt + `\n\n操盘手说："${message}"` }
    ];

    let reply;
    try {
      reply = await callAI(allMessages, { temperature: 0.7, maxTokens: 2000 });
    } catch (err) {
      return res.status(500).json({ error: `AI调用失败: ${err.message}` });
    }

    // 保存讨论记录
    const discussion = date.planDiscussion ? JSON.parse(date.planDiscussion) : [];
    discussion.push(
      { role: 'admin', content: message, timestamp: new Date().toISOString() },
      { role: 'ai', content: reply, timestamp: new Date().toISOString() }
    );

    // 检查AI是否给出了优化后的方案
    const jsonMatch = reply.match(/\{[\s\S]*"overview"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const newPlan = JSON.parse(jsonMatch[0]);
        await prisma.date.update({
          where: { id: req.params.id },
          data: {
            planDiscussion: JSON.stringify(discussion),
            aiPlan: JSON.stringify(newPlan)
          }
        });
        return res.json({ success: true, reply, planUpdated: true, newPlan });
      } catch (e) { console.warn('[Dates] 约会讨论 JSON 解析失败:', e.message); }
    }

    await prisma.date.update({
      where: { id: req.params.id },
      data: { planDiscussion: JSON.stringify(discussion) }
    });

    res.json({ success: true, reply, planUpdated: false });
  } catch (error) {
    console.error('[Dates] 方案讨论失败:', error);
    res.status(500).json({ error: '讨论失败' });
  }
});

// ========== 推送方案给客户 ==========
router.post('/:id/push-to-client', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const date = await prisma.date.findUnique({ where: { id: req.params.id } });
    if (!date) return res.status(404).json({ error: '约会不存在' });
    if (req.user.role === 'admin') {
      const ok = await verifyIsClient(date.userId);
      if (!ok) return res.status(403).json({ error: '无权操作此约会' });
    }
    if (!date.aiPlan) return res.status(400).json({ error: '请先生成约会方案' });

    await prisma.date.update({
      where: { id: req.params.id },
      data: {
        planStatus: 'pushed',
        status: 'pending_client_confirm',
        pushToClientAt: new Date()
      }
    });

    res.json({ success: true, message: '方案已推送给客户' });
  } catch (error) {
    console.error('[Dates] 推送方案失败:', error);
    res.status(500).json({ error: '推送失败' });
  }
});

// ========== 客户提交调整建议 ==========
router.post('/:id/client-feedback', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({ error: '仅客户可提交反馈' });
    }

    const { adjustment, reason } = req.body;
    if (!adjustment?.trim()) {
      return res.status(400).json({ error: '请填写调整建议' });
    }

    const date = await prisma.date.findUnique({ where: { id: req.params.id } });
    if (!date) return res.status(404).json({ error: '约会不存在' });
    if (date.userId !== req.user.id) return res.status(403).json({ error: '无权操作此约会' });
    if (date.status !== 'pending_client_confirm') {
      return res.status(400).json({ error: '当前不在确认阶段' });
    }

    const feedbackList = date.clientFeedback ? JSON.parse(date.clientFeedback) : [];
    feedbackList.push({ adjustment, reason: reason || '', submittedAt: new Date().toISOString() });

    await prisma.date.update({
      where: { id: req.params.id },
      data: {
        clientFeedback: JSON.stringify(feedbackList),
        status: 'planned', // 退回给操盘手处理
        planStatus: 'generated'
      }
    });

    res.json({ success: true, message: '调整建议已提交，操盘手会优化方案' });
  } catch (error) {
    console.error('[Dates] 提交反馈失败:', error);
    res.status(500).json({ error: '提交失败' });
  }
});

// ========== 客户确认方案 ==========
router.post('/:id/client-confirm', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({ error: '仅客户可确认' });
    }

    const date = await prisma.date.findUnique({ where: { id: req.params.id } });
    if (!date) return res.status(404).json({ error: '约会不存在' });
    if (date.userId !== req.user.id) return res.status(403).json({ error: '无权操作此约会' });
    if (date.status !== 'pending_client_confirm') {
      return res.status(400).json({ error: '当前不在确认阶段' });
    }

    await prisma.date.update({
      where: { id: req.params.id },
      data: {
        status: 'confirmed',
        clientConfirmed: true,
        confirmedAt: new Date(),
        planStatus: 'confirmed'
      }
    });

    res.json({ success: true, message: '方案已确认，祝约会顺利！' });
  } catch (error) {
    console.error('[Dates] 确认方案失败:', error);
    res.status(500).json({ error: '确认失败' });
  }
});

// 删除约会
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await prisma.date.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '约会不存在' });

    if (req.user.role === 'admin') {
      const ok = await verifyIsClient(existing.userId);
      if (!ok) return res.status(403).json({ error: '无权删除此约会' });
    } else if (req.user.role === 'client') {
      if (existing.userId !== req.user.id) {
        return res.status(403).json({ error: '无权删除此约会' });
      }
    } else {
      return res.status(403).json({ error: '无权限' });
    }

    // 同时删除关联的日历事件
    await prisma.event.deleteMany({ where: { dateId: req.params.id } });
    await prisma.date.delete({ where: { id: req.params.id } });

    res.json({ success: true });
  } catch (error) {
    console.error('[Dates] 删除约会失败:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 删除约会方案（清除AI生成的方案）
router.delete('/:id/plan', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const existing = await prisma.date.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '约会不存在' });
    const ok = await verifyIsClient(existing.userId);
    if (!ok) return res.status(403).json({ error: '无权操作此约会' });

    await prisma.date.update({
      where: { id: req.params.id },
      data: {
        aiPlan: null,
        planStatus: null,
        planDiscussion: null,
        clientConfirmed: false,
        pushToClientAt: null,
        confirmedAt: null
      }
    });

    res.json({ success: true, message: '方案已删除' });
  } catch (error) {
    console.error('[Dates] 删除方案失败:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// ========== 个性化访谈问题生成 ==========
router.post('/:id/generate-interview', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const date = await prisma.date.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true,
            serviceStage: true,
            interactionStyle: true,
            communicationStyle: true,
            strengths: true,
            personality: true
          }
        },
        girl: {
          select: {
            id: true,
            name: true,
            age: true,
            stage: true,
            personality: true,
            communicationStyle: true,
            emotionalTriggers: true,
            thingsToAvoid: true,
            interests: true,
            dietPreferences: true,
            dietRestrictions: true,
            relationshipAttitude: true,
            emotionalWounds: true,
            tensionScore: true,
            intimacyLevel: true,
            bestApproach: true,
            familyBackground: true,
            familyAtmosphere: true
          }
        }
      }
    });
    if (!date) return res.status(404).json({ error: '约会不存在' });
    if (req.user.role === 'admin') {
      const ok = await verifyIsClient(date.userId);
      if (!ok) return res.status(403).json({ error: '无权操作此约会' });
    }
    if (date.status !== 'completed') return res.status(400).json({ error: '请先完成约会后评价' });

    // 检查是否已有访谈问题
    if (date.postDateInterview) {
      const existing = JSON.parse(date.postDateInterview);
      if (existing.generatedQuestions && existing.generatedQuestions.length > 0) {
        return res.json({ success: true, questions: existing.generatedQuestions, alreadyGenerated: true });
      }
    }

    const interviewData = date.postDateInterview ? JSON.parse(date.postDateInterview) : {};
    const prompt = `你是一位约会复盘访谈专家，代号"脱不花"。请根据以下信息，生成针对性的访谈问题，帮助操盘手深度了解约会情况。

【客户信息】
姓名：${date.user.nickname || date.user.username}
性格：${date.user.personality || '未知'}
沟通风格：${date.user.communicationStyle || '正常'}
情绪触发点：${date.user.emotionalTriggers || '未知'}
情伤记录：${date.user.emotionalWounds || '无'}
自我评价认知：${date.user.selfValuePerception || '未知'}

【女生信息】
姓名：${date.girl.name}
性格：${date.girl.personality || '未知'}
沟通风格：${date.girl.communicationStyle || '未知'}
情绪触发点：${date.girl.emotionalTriggers || '未知'}
婚恋态度：${date.girl.relationshipAttitude || '未知'}
关系阶段：${date.girl.stage || '未知'}

【约会基本信息】
时长：${date.duration || '未知'}
地点：${date.location || '未知'}
总花费：¥${date.totalExpense || 0}
客户自评：${interviewData.clientSelfScore || '未评'}

【已收集的访谈数据】
${JSON.stringify(interviewData, null, 2)}

请生成6-10个个性化的访谈问题，这些问题应该：
1. 针对具体约会场景（不要泛泛而问）
2. 帮助客户反思约会中的关键时刻
3. 挖掘正面和负面信号的深层原因
4. 为下一步行动提供依据
5. 包含「自我反思」维度——引导客户评估自己在约会中的表现，而非只是回忆感受

访谈问题应该涵盖以下维度（选择最相关的4-6个）：
A. 约会体验感受（如：整体感觉、是否符合预期）
B. 自我表现反思（如：最满意哪个表现、如果重来会怎么选择）
C. 女生反馈解读（如：哪些信号说明她投入、落差最大的是哪里）
D. 情绪与心态（如：约会中的焦虑点、是否有失态）
E. 肢体与亲密（如：推进是否顺利、哪一步最自然或最尴尬）
F. 下次约会预期（如：是否愿意再见、下次怎么改进）

返回JSON格式：
{
  "questions": [
    {
      "id": "q1",
      "category": "约会体验",
      "question": "问题文本",
      "purpose": "为什么问这个问题（帮助分析什么）",
      "options": ["选项1", "选项2"] // 多选题时提供选项，单选题时提供选项链
    }
  ],
  "interviewOverview": "本次访谈的核心目标是什么"
}`;

    let reply;
    try {
      reply = await callAI([
        { role: 'user', content: prompt }
      ], { temperature: 0.7, maxTokens: 2500 });
    } catch (err) {
      return res.status(500).json({ error: `AI调用失败: ${err.message}` });
    }

    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI返回格式异常' });

    const { questions, interviewOverview } = JSON.parse(jsonMatch[0]);
    if (!questions || !Array.isArray(questions)) {
      return res.status(500).json({ error: 'AI返回问题格式异常' });
    }

    // 保存到 postDateInterview
    const interviewObj = {
      ...interviewData,
      generatedQuestions: questions,
      interviewOverview: interviewOverview || '',
      questionsGeneratedAt: new Date().toISOString(),
      questionStatus: 'pending' // pending | answered | reviewed
    };

    await prisma.date.update({
      where: { id: req.params.id },
      data: { postDateInterview: JSON.stringify(interviewObj) }
    });

    res.json({ success: true, questions, interviewOverview, alreadyGenerated: false });
  } catch (error) {
    console.error('[Dates] 生成访谈问题失败:', error);
    res.status(500).json({ error: '生成失败' });
  }
});

// ========== 推送访谈给客户 ==========
router.post('/:id/push-interview', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const date = await prisma.date.findUnique({ where: { id: req.params.id } });
    if (!date) return res.status(404).json({ error: '约会不存在' });
    if (req.user.role === 'admin') {
      const ok = await verifyIsClient(date.userId);
      if (!ok) return res.status(403).json({ error: '无权操作此约会' });
    }

    const interview = date.postDateInterview ? JSON.parse(date.postDateInterview) : {};
    if (!interview.generatedQuestions || interview.generatedQuestions.length === 0) {
      return res.status(400).json({ error: '请先生成访谈问题' });
    }
    if (interview.questionStatus === 'answered') {
      return res.status(400).json({ error: '访谈已完成，请勿重复推送' });
    }

    interview.questionStatus = 'pending';
    interview.pushedAt = new Date().toISOString();

    await prisma.date.update({
      where: { id: req.params.id },
      data: { postDateInterview: JSON.stringify(interview) }
    });

    // 创建通知给客户
    await prisma.notification.create({
      data: {
        userId: date.userId,
        type: 'interview',
        title: '约会访谈 — 请填写约会反馈',
        content: `您有一份关于约会（${date.girl ? date.girl.name : date.title || '约会'}）的访谈问卷等待填写，请点击查看。`,
        metadata: JSON.stringify({ dateId: date.id, girlId: date.girlId })
      }
    });

    res.json({ success: true, message: '访谈已推送给客户' });
  } catch (error) {
    console.error('[Dates] 推送访谈失败:', error);
    res.status(500).json({ error: '推送失败' });
  }
});

// ========== 客户提交访谈回答 ==========
router.post('/:id/submit-interview', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'client') return res.status(403).json({ error: '仅客户可提交' });

    const { answers } = req.body;
    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: '答案格式错误' });
    }

    const date = await prisma.date.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true,
            serviceStage: true,
            interactionStyle: true,
            communicationStyle: true,
            strengths: true,
            personality: true
          }
        },
        girl: {
          select: {
            id: true,
            name: true,
            age: true,
            stage: true,
            personality: true,
            communicationStyle: true,
            emotionalTriggers: true,
            thingsToAvoid: true,
            interests: true,
            dietPreferences: true,
            dietRestrictions: true,
            relationshipAttitude: true,
            emotionalWounds: true,
            tensionScore: true,
            intimacyLevel: true,
            bestApproach: true,
            familyBackground: true,
            familyAtmosphere: true
          }
        }
      }
    });
    if (!date) return res.status(404).json({ error: '约会不存在' });
    if (date.userId !== req.user.id) return res.status(403).json({ error: '无权操作' });

    const interview = date.postDateInterview ? JSON.parse(date.postDateInterview) : {};
    if (interview.questionStatus === 'answered') {
      return res.status(400).json({ error: '访谈已回答，请勿重复提交' });
    }

    // 保存客户回答
    interview.clientAnswers = answers;
    interview.answeredAt = new Date().toISOString();
    interview.questionStatus = 'answered';

    await prisma.date.update({
      where: { id: req.params.id },
      data: { postDateInterview: JSON.stringify(interview) }
    });

    // 创建通知给操盘手
    await prisma.notification.create({
      data: {
        userId: req.user.id, // 实际上应该发给操盘手，找operator
        type: 'interview_answered',
        title: '客户已完成访谈',
        content: `客户 ${date.user.nickname || date.user.username} 已完成约会访谈，请查看复盘分析。`,
        metadata: JSON.stringify({ dateId: date.id, clientId: date.userId })
      }
    });

    res.json({ success: true, message: '访谈已提交，复盘分析生成中...' });
  } catch (error) {
    console.error('[Dates] 提交访谈失败:', error);
    res.status(500).json({ error: '提交失败' });
  }
});

// ========== AI 提炼访谈回答，生成复盘报告并更新档案 ==========
router.post('/:id/generate-review-report', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const date = await prisma.date.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true,
            serviceStage: true,
            interactionStyle: true,
            communicationStyle: true,
            strengths: true,
            personality: true
          }
        },
        girl: {
          select: {
            id: true,
            name: true,
            age: true,
            stage: true,
            personality: true,
            communicationStyle: true,
            emotionalTriggers: true,
            thingsToAvoid: true,
            interests: true,
            dietPreferences: true,
            dietRestrictions: true,
            relationshipAttitude: true,
            emotionalWounds: true,
            tensionScore: true,
            intimacyLevel: true,
            bestApproach: true,
            familyBackground: true,
            familyAtmosphere: true
          }
        }
      }
    });
    if (!date) return res.status(404).json({ error: '约会不存在' });
    if (req.user.role === 'admin') {
      const ok = await verifyIsClient(date.userId);
      if (!ok) return res.status(403).json({ error: '无权操作此约会' });
    }

    const interview = date.postDateInterview ? JSON.parse(date.postDateInterview) : {};
    if (!interview.clientAnswers || interview.questionStatus !== 'answered') {
      return res.status(400).json({ error: '客户尚未回答访谈' });
    }

    const postDateData = {
      ...interview,
      clientAnswers: interview.clientAnswers
    };

    // 生成深度复盘报告 prompt
    const reportPrompt = `你是一位约会复盘分析专家，代号"月老"。请根据客户提交的访谈回答，生成一份完整的复盘报告，并提出下一步行动建议。

【客户信息】
姓名：${date.user.nickname || date.user.username}
年龄：${date.user.age || '未知'}
性格：${date.user.personality || '未知'}
沟通风格：${date.user.communicationStyle || '正常'}
约会风格：${date.user.interactionStyle || '正常'}
核心优势：${date.user.strengths || '真诚'}
短板：${date.user.weaknesses || '未知'}
情伤记录：${date.user.emotionalWounds || '无'}
自我价值认知：${date.user.selfValuePerception || '未知'}
抗压能力：${date.user.antiFrustrationLevel ? `${date.user.antiFrustrationLevel}/10` : '未知'}

【女生信息】
姓名：${date.girl.name}
性格：${date.girl.personality || '未知'}
沟通风格：${date.girl.communicationStyle || '未知'}
情绪触发点：${date.girl.emotionalTriggers || '未知'}
婚恋态度：${date.girl.relationshipAttitude || '未知'}
过往情伤：${date.girl.emotionalWounds || '无'}
约会策略：${date.girl.bestApproach || '真诚'}
当前阶段：${date.girl.stage || '陌生'}
关系热度：${date.girl.tensionScore || 5}/10
亲密度：${date.girl.intimacyLevel || 1}/5

【约会信息】
约会时长：${date.duration || '未知'}
约会地点：${date.location || '未知'}
总花费：¥${date.totalExpense || 0}
评价：${date.rating ? `${date.rating}星` : '未评分'}

【约会后访谈数据（操盘手记录）】
见面时刻：穿着 ${postDateData.girlAppearance || '未记录'} / ${postDateData.girlOnTime || '未记录'} / ${postDateData.girlGreetedFirst || '未记录'}
对话质量：沉默 ${postDateData.silenceDuration || '未记录'} / 尴尬 ${postDateData.awkwardMoments || '未记录'}
肢体进展：${postDateData.physicalProgress || '无'}
离别时刻：${postDateData.goodbyeInitiator || '未记录'} / 下次暗示 ${postDateData.nextDateMentioned || '未记录'}
情绪曲线：开始 ${postDateData.moodStart || '?'} → 中期 ${postDateData.moodMid || '?'} → 结束 ${postDateData.moodEnd || '?'}
亮点：${postDateData.highlight || '未记录'}
槽点：${postDateData.lowlight || '未记录'}
客户自评：${postDateData.clientSelfScore || '?'}/5
预期偏差：${postDateData.expectationGap || '未记录'}
正面信号：${interview.positiveSignals?.map(s => s.signal).join('、') || '未记录'}
负面信号：${interview.negativeSignals?.map(s => s.signal).join('、') || '无'}

【客户访谈回答】
${postDateData.clientAnswers.map(a => `Q${a.id}: ${a.question}\n回答: ${a.answer}`).join('\n\n')}

请生成完整的复盘报告，JSON格式：
{
  "summary": "整体复盘，1-3句话概括约会核心",
  "tensionAnalysis": "热度变化分析（上升/下降/持平，原因是什么）",
  "compatibilityScore": 85, // 整体匹配度评分 0-100
  "positiveSignalsDetailed": [
    { "signal": "信号描述", "analysis": "说明什么", "significance": "重要性（高/中/低）" }
  ],
  "negativeSignalsDetailed": [
    { "signal": "信号描述", "analysis": "风险程度", "mitigation": "如何化解" }
  ],
  "clientInsights": "从客户访谈中发现的关键洞察（性格表现/成长空间/盲点）",
  "girlInsights": "从女生反应中推断的关键信息（兴趣度/舒适度/隐患）",
  "nextActions": [
    { "action": "具体行动", "priority": "高/中/低", "timing": "什么时候执行", "reason": "为什么", "channel": "聊天/约会/暂停" }
  ],
  "recommendedTopics": ["下次约会推荐话题1", "话题2"],
  "relationshipProgress": "关系进度评估（陌生→搭讪→聊天→暧昧→约会→锁定）",
  "warningSigns": ["需要警惕的信号1", "信号2（如无则填'无'）"],
  "girlUpdates": {
    "personality": "根据访谈推断女生性格（如有变化）",
    "emotionalTriggers": "情绪触发点（如有新发现）",
    "tensionScore": 7.5, // 更新后热度
    "intimacyLevel": 3,   // 更新后亲密度
    "observations": "其他观察到的女生特点"
  },
  "clientUpdates": {
    "strengths": "本次约会展现出的优势（如有新发现）",
    "weaknesses": "本次约会暴露的短板（如有新发现）",
    "learningPoints": "客户可以从这次约会中学到的1-2个关键点"
  },
  "nextDatePlan": {
    "suggestedTiming": "下次约会建议时间（1-3天/一周内/一个月后）",
    "suggestedActivity": "建议活动类型",
    "suggestedLocation": "建议地点类型",
    "keyFocus": "这次约会的核心目标",
    "budgetEstimate": "预算估算"
  }
}`;

    let reply;
    try {
      reply = await callAI([
        { role: 'user', content: reportPrompt }
      ], { temperature: 0.7, maxTokens: 3000 });
    } catch (err) {
      return res.status(500).json({ error: `AI调用失败: ${err.message}` });
    }

    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI返回格式异常' });

    const report = JSON.parse(jsonMatch[0]);

    // 更新 postDateInterview 中的报告
    interview.reviewReport = report;
    interview.reviewGeneratedAt = new Date().toISOString();

    await prisma.date.update({
      where: { id: req.params.id },
      data: {
        postDateInterview: JSON.stringify(interview),
        followUpActions: JSON.stringify(report.nextActions || []),
        nextAction: report.nextActions?.[0]?.action || null
      }
    });

    // 更新女生档案
    if (report.girlUpdates) {
      const girlUpdate = {};
      if (report.girlUpdates.personality) girlUpdate.personality = report.girlUpdates.personality;
      if (report.girlUpdates.emotionalTriggers) girlUpdate.emotionalTriggers = report.girlUpdates.emotionalTriggers;
      if (report.girlUpdates.tensionScore) girlUpdate.tensionScore = report.girlUpdates.tensionScore;
      if (report.girlUpdates.intimacyLevel) girlUpdate.intimacyLevel = report.girlUpdates.intimacyLevel;
      if (report.girlUpdates.observations) {
        const existingObs = date.girl.observations ? JSON.parse(date.girl.observations) : [];
        existingObs.push({ date: new Date().toISOString(), type: 'interview_review', content: report.girlUpdates.observations });
        girlUpdate.observations = JSON.stringify(existingObs);
      }
      if (Object.keys(girlUpdate).length > 0) {
        await prisma.girl.update({ where: { id: date.girlId }, data: girlUpdate });
      }
    }

    // 更新客户档案
    if (report.clientUpdates) {
      const clientUpdate = {};
      if (report.clientUpdates.learningPoints) {
        const existingLearnings = date.user.signals ? JSON.parse(date.user.signals) : [];
        existingLearnings.push({ date: new Date().toISOString(), type: 'date_review', event: report.clientUpdates.learningPoints });
        clientUpdate.signals = JSON.stringify(existingLearnings);
      }
      if (report.clientUpdates.strengths && !date.user.strengths?.includes(report.clientUpdates.strengths)) {
        clientUpdate.strengths = (date.user.strengths ? date.user.strengths + ' / ' : '') + report.clientUpdates.strengths;
      }
      if (report.clientUpdates.weaknesses) {
        clientUpdate.weaknesses = (date.user.weaknesses ? date.user.weaknesses + ' / ' : '') + report.clientUpdates.weaknesses;
      }
      if (Object.keys(clientUpdate).length > 0) {
        await prisma.user.update({ where: { id: date.userId }, data: clientUpdate });
      }
    }

    res.json({ success: true, report });
  } catch (error) {
    console.error('[Dates] 生成复盘报告失败:', error);
    res.status(500).json({ error: '生成失败' });
  }
});

module.exports = router;

/**
 * Membership & Points & Invitation Service
 * 会员、积分、邀请联合服务
 *
 * 定价体系：
 * - 普惠月付：999元/月
 * - 普惠年付：8888元/年
 * - 高端：50000元/年
 *
 * 邀请积分（邀请人获得，仅限续费，无有效期）：
 * - 被邀请人月付 → 邀请人得 500 积分
 * - 被邀请人年付 → 邀请人得 4444 积分
 * - 被邀请人高端 → 邀请人得 25000 积分
 *
 * 被邀请人首单享受 8 折优惠
 */
const prisma = require('../prisma');
const crypto = require('crypto');
const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');

// ===== 价格常量 =====
const PRICE_MONTHLY = 999;
const PRICE_YEARLY = 8888;
const PRICE_PREMIUM = 50000;

const POINTS_PER_PURCHASE = {
  monthly: 500,
  yearly: 4444,
  premium: 25000
};

const REFERRAL_DISCOUNT = 0.8; // 被邀请人首单 8 折

// ==========================================
// 会员
// ==========================================

/**
 * 获取用户当前会员状态
 */
async function getMembershipStatus(userId) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      status: 'active'
    },
    orderBy: { endDate: 'desc' }
  });

  const points = await getPointsBalance(userId);

  return {
    membership: membership ? {
      id: membership.id,
      type: membership.type,
      status: membership.status,
      startDate: membership.startDate,
      endDate: membership.endDate,
      price: membership.price,
      pointsDiscount: membership.pointsDiscount,
      trialUsed: membership.trialUsed,
      girlQuota: membership.girlQuota
    } : null,
    points,
    prices: {
      monthly: PRICE_MONTHLY,
      yearly: PRICE_YEARLY,
      premium: PRICE_PREMIUM
    }
  };
}

/**
 * 开通试用会员
 */
async function activateTrial(userId) {
  // 检查是否已有有效会员
  const existingActive = await prisma.membership.findFirst({
    where: { userId, status: 'active' }
  });
  if (existingActive) {
    throw new Error('已有试用或有效会员');
  }

  // 获取试用配置
  let config = await prisma.trialConfig.findUnique({
    where: { id: 'trial_config' }
  });
  if (!config) {
    // 如果没有配置，创建默认配置
    config = await prisma.trialConfig.create({
      data: {
        id: 'trial_config',
        validDays: 3,
        maxChapters: 2,
        maxGirls: 1,
        maxTrialUses: 2
      }
    });
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + config.validDays);

  return prisma.membership.create({
    data: {
      userId,
      type: 'TRIAL',
      status: 'active',
      price: 0,
      pointsDiscount: 0,
      startDate,
      endDate,
      trialUsed: 0,
      girlQuota: config.maxGirls
    }
  });
}

/**
 * 校验会员资格（含试用次数和到期检查）
 * @param {string} userId
 * @param {string} feature - 功能标识：date_plan, ai_coach, reply_suggest, chat_optimize, girl_chat
 */
async function checkTrialLimit(userId, feature) {
  // 查询所有有效或刚过期的会员（不过滤status，因为可能要重新激活）
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      status: { in: ['active', 'expired'] }
    },
    orderBy: { createdAt: 'desc' }  // 取最新的
  });

  // 无会员跳过（有其他地方检查试用次数）
  if (!membership) {
    return true;
  }

  // 已过期的会员直接拒绝
  if (new Date() > membership.endDate) {
    // 如果状态还是 active，更新为 expired
    if (membership.status === 'active') {
      await prisma.membership.update({
        where: { id: membership.id },
        data: { status: 'expired' }
      });
    }
    throw new Error('会员已到期，请续费');
  }

  // 仅试用会员检查试用次数
  if (membership.type === 'TRIAL') {
    const config = await prisma.trialConfig.findUnique({
      where: { id: 'trial_config' }
    });
    const maxUses = config?.maxTrialUses || 2;

    if (membership.trialUsed >= maxUses) {
      throw new Error('试用次数已用完');
    }
  }

  return true;
}

/**
 * 消耗试用次数
 */
async function useTrialCount(userId) {
  const membership = await prisma.membership.findFirst({
    where: { userId, status: 'active', type: 'TRIAL' }
  });
  if (!membership) return;

  await prisma.membership.update({
    where: { id: membership.id },
    data: { trialUsed: { increment: 1 } }
  });
}

/**
 * 获取试用配置
 */
async function getTrialConfig() {
  let config = await prisma.trialConfig.findUnique({
    where: { id: 'trial_config' }
  });
  if (!config) {
    config = await prisma.trialConfig.create({
      data: {
        id: 'trial_config',
        validDays: 3,
        maxChapters: 2,
        maxGirls: 1,
        maxTrialUses: 2
      }
    });
  }
  return config;
}

/**
 * 更新试用配置
 */
async function updateTrialConfig(data) {
  return prisma.trialConfig.upsert({
    where: { id: 'trial_config' },
    update: data,
    create: {
      id: 'trial_config',
      ...data
    }
  });
}

/**
 * 计算实际价格（含首单折扣）
 * @param {string} type - monthly/yearly/premium
 * @param {boolean} isFirstPurchase - 是否为首单（可享受被邀请折扣）
 */
function calcPrice(type, isFirstPurchase = false) {
  const base = type === 'monthly' ? PRICE_MONTHLY
    : type === 'yearly' ? PRICE_YEARLY
    : PRICE_PREMIUM;
  return isFirstPurchase ? Math.round(base * REFERRAL_DISCOUNT) : base;
}

/**
 * 购买/续费会员
 * @param {string} userId
 * @param {string} type - monthly/yearly/premium
 * @param {number} pointsToUse - 用多少积分抵扣（积分只能续费不能用）
 */
async function purchaseMembership(userId, type, pointsToUse = 0) {
  // 校验 type
  if (!['monthly', 'yearly', 'premium'].includes(type)) {
    throw new Error('无效的会员类型');
  }

  // 首次购买才享折扣（无有效会员记录）
  const existingActive = await prisma.membership.findFirst({
    where: { userId, status: 'active' }
  });
  const isFirstPurchase = !existingActive;

  const basePrice = type === 'monthly' ? PRICE_MONTHLY
    : type === 'yearly' ? PRICE_YEARLY
    : PRICE_PREMIUM;

  const price = isFirstPurchase
    ? Math.round(basePrice * REFERRAL_DISCOUNT)
    : basePrice;

  // 校验积分：系统仅支持积分支付，积分必须覆盖全款
  const balance = await getPointsBalance(userId);
  if (pointsToUse < price) {
    throw new AppError(ErrorCodes.MEMBERSHIP_POINTS_INSUFFICIENT, { userMessage: `积分余额不足，需要${price}积分，当前${balance}积分` });
  }
  if (pointsToUse > balance) throw new AppError(ErrorCodes.MEMBERSHIP_POINTS_INSUFFICIENT, { userMessage: '积分余额不足' });
  // 超出部分不扣
  if (pointsToUse > price) pointsToUse = price;

  const startDate = new Date();
  const endDate = calcEndDate(startDate, type);

  return prisma.$transaction(async (tx) => {
    // 消费积分
    await tx.pointsLedger.create({
      data: {
        userId,
        amount: -pointsToUse,
        balanceAfter: balance - pointsToUse,
        type: 'membership_discount',
        refId: null,
        note: `${existingActive ? '续费' : '开通'}抵扣：使用${pointsToUse}积分`
      }
    });

    // 已有有效会员 → 续期
    if (existingActive) {
      const newEnd = calcEndDate(existingActive.endDate, type);
      return tx.membership.update({
        where: { id: existingActive.id },
        data: {
          type,
          endDate: newEnd,
          price: (existingActive.price || 0) + price,
          pointsDiscount: (existingActive.pointsDiscount || 0) + pointsToUse,
          status: 'active'
        }
      });
    }

    // 新购
    return tx.membership.create({
      data: {
        userId,
        type,
        status: 'active',
        price,
        pointsDiscount: pointsToUse,
        startDate,
        endDate
      }
    });
  });
}

/**
 * 根据起止日期和套餐类型计算到期日
 */
function calcEndDate(startDate, type) {
  const end = new Date(startDate);
  if (type === 'monthly') {
    end.setMonth(end.getMonth() + 1);
  } else if (type === 'yearly' || type === 'premium') {
    end.setFullYear(end.getFullYear() + 1);
  }
  return end;
}

/**
 * 操盘手为用户充值积分
 */
async function rechargePoints(operatorId, userId, amount, note = '') {
  if (amount <= 0) throw new Error('充值金额必须为正数');

  return prisma.$transaction(async (tx) => {
    const current = await getPointsBalance(userId);
    const balanceAfter = current + amount;

    return tx.pointsLedger.create({
      data: {
        userId,
        amount,
        balanceAfter,
        type: 'recharge',
        operatorId,
        note: note || '管理员充值'
      }
    });
  });
}

/**
 * 操盘手扣减用户积分
 */
async function deductPoints(operatorId, userId, amount, note = '') {
  if (amount <= 0) throw new Error('扣减金额必须为正数');

  return prisma.$transaction(async (tx) => {
    const current = await getPointsBalance(userId);
    if (current < amount) throw new Error('积分余额不足');

    const balanceAfter = current - amount;

    return tx.pointsLedger.create({
      data: {
        userId,
        amount: -amount,
        balanceAfter,
        type: 'admin_adjust',
        operatorId,
        note: note || '管理员扣减'
      }
    });
  });
}

/**
 * 获取积分余额
 */
async function getPointsBalance(userId) {
  const last = await prisma.pointsLedger.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
  return last ? last.balanceAfter : 0;
}

/**
 * 获取积分明细
 */
async function getPointsHistory(userId, limit = 50, offset = 0) {
  const records = await prisma.pointsLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset
  });

  const total = await prisma.pointsLedger.count({ where: { userId } });

  return { records, total };
}

// ==========================================
// 邀请
// ==========================================

/**
 * 生成邀请码
 */
async function createInviteCode(userId) {
  let code;
  let exists = true;
  while (exists) {
    code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const existing = await prisma.invitation.findUnique({ where: { inviteCode: code } });
    exists = !!existing;
  }

  return prisma.invitation.create({
    data: {
      inviterId: userId,
      inviteCode: code
    }
  });
}

/**
 * 获取我的邀请统计
 */
async function getMyInvitationStats(userId) {
  const invitations = await prisma.invitation.findMany({
    where: { inviterId: userId },
    orderBy: { createdAt: 'desc' }
  });

  const totalInvites = invitations.length;
  const activatedCount = invitations.filter(i => i.activated).length;
  const rewardPaidCount = invitations.filter(i => i.rewardPaid).length;

  return {
    totalInvites,
    activatedCount,
    rewardPaidCount,
    inviteCode: invitations[0]?.inviteCode || null,
    invitations: invitations.map(i => ({
      id: i.id,
      inviteCode: i.inviteCode,
      activated: i.activated,
      rewardPaid: i.rewardPaid,
      createdAt: i.createdAt
    }))
  };
}

/**
 * 注册时绑定邀请码
 * 被邀请人注册成功后，激活邀请关系并给邀请人发放积分
 * 积分根据被邀请人购买的套餐类型计算
 */
async function bindInvitation(inviteeId, inviteCode, purchasedType) {
  const invitation = await prisma.invitation.findUnique({
    where: { inviteCode }
  });

  if (!invitation) return null;
  if (invitation.inviteeId) return null; // 已被使用

  // 计算邀请人获得的积分（根据被邀请人购买的套餐）
  // 如果 purchasedType 未传，使用默认月付积分
  const pointsEarned = POINTS_PER_PURCHASE[purchasedType] || POINTS_PER_PURCHASE.monthly;

  return prisma.$transaction(async (tx) => {
    // 绑定被邀请人
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { inviteeId, activated: true }
    });

    // 给邀请人发放积分（只在激活时发放）
    if (!invitation.rewardPaid) {
      await tx.pointsLedger.create({
        data: {
          userId: invitation.inviterId,
          amount: pointsEarned,
          balanceAfter: await getPointsBalance(invitation.inviterId) + pointsEarned,
          type: 'invite_reward',
          refId: invitation.id,
          note: `邀请奖励：被邀请人购买${purchasedType || '月付'}套餐`
        }
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { rewardPaid: true }
      });
    }

    return invitation;
  });
}

// ==========================================
// 截图识别
// ==========================================

/**
 * 上传聊天截图，AI 提取用户信息
 */
async function uploadAndExtractScreenshots(operatorId, clientId, imagePath) {
  const { getAIConfig } = require('../config');

  const aiConfig = getAIConfig();
  let extractedData = {};

  try {
    const response = await fetch(aiConfig.url.replace('/chat/completions', '/v1/chat/completions').replace('/v1/chat/completions', '/api/paulanlp/v2/activity/chat'),
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'glm-4v-plus',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `file://${imagePath}` } },
                { type: 'text', text: '请从这张聊天截图中提取用户信息：姓名、性别、年龄、电话、身高、职业、收入水平、所在城市、感情状态等。请以JSON格式返回，字段名为：name, phone, age, gender, occupation, income, city, emotion_status, other。无法识别的字段留空字符串。' }
              ]
            }
          ],
          max_tokens: 500
        })
      }
    );
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    try {
      extractedData = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch { /* ignore parse error */ }
  } catch (err) {
    console.error('[ScreenshotProfile] AI extraction failed:', err.message);
  }

  return prisma.screenshotProfile.create({
    data: {
      uploadedBy: operatorId,
      clientId: clientId || null,
      imagePath,
      extractedName: extractedData.name || '',
      extractedPhone: extractedData.phone || '',
      extractedAge: extractedData.age || '',
      extractedGender: extractedData.gender || '',
      extractedInfo: JSON.stringify(extractedData) || '{}',
      status: 'pending'
    }
  });
}

/**
 * 操盘手确认截图档案，创建或更新用户
 */
async function confirmScreenshotProfile(operatorId, profileId, action, linkedUserId = null) {
  const profile = await prisma.screenshotProfile.findUnique({ where: { id: profileId } });
  if (!profile) throw new Error('档案不存在');

  const extracted = JSON.parse(profile.extractedInfo || '{}');

  return prisma.$transaction(async (tx) => {
    if (action === 'create_user') {
      const newUser = await tx.user.create({
        data: {
          username: `extracted_${Date.now()}`,
          password: crypto.randomBytes(16).toString('hex'),
          role: 'client',
          nickname: profile.extractedName || '新用户',
          phone: profile.extractedPhone || null,
          age: profile.extractedAge ? parseInt(profile.extractedAge) : null
        }
      });

      await tx.screenshotProfile.update({
        where: { id: profileId },
        data: { status: 'confirmed', confirmedAt: new Date(), linkedUserId: newUser.id, clientId: newUser.id }
      });

      return { type: 'created', userId: newUser.id, user: newUser };
    } else if (action === 'link_existing' && linkedUserId) {
      await tx.screenshotProfile.update({
        where: { id: profileId },
        data: { status: 'confirmed', confirmedAt: new Date(), linkedUserId, clientId: linkedUserId }
      });
      return { type: 'linked', userId: linkedUserId };
    } else if (action === 'reject') {
      await tx.screenshotProfile.update({
        where: { id: profileId },
        data: { status: 'rejected', confirmedAt: new Date() }
      });
      return { type: 'rejected' };
    }

    throw new Error('未知的操作');
  });
}

/**
 * 获取待确认的截图档案列表
 */
async function getPendingProfiles(operatorId) {
  return prisma.screenshotProfile.findMany({
    where: {
      uploadedBy: operatorId,
      status: 'pending'
    },
    orderBy: { createdAt: 'desc' }
  });
}

module.exports = {
  // prices
  PRICE_MONTHLY,
  PRICE_YEARLY,
  PRICE_PREMIUM,
  POINTS_PER_PURCHASE,
  // membership
  getMembershipStatus,
  purchaseMembership,
  activateTrial,
  checkTrialLimit,
  useTrialCount,
  getTrialConfig,
  updateTrialConfig,
  calcPrice,
  // points
  rechargePoints,
  deductPoints,
  getPointsBalance,
  getPointsHistory,
  // invitation
  createInviteCode,
  getMyInvitationStats,
  bindInvitation,
  // screenshot
  uploadAndExtractScreenshots,
  confirmScreenshotProfile,
  getPendingProfiles
};

/**
 * 生成 90 天演示活跃数据 — 有真实趋势变化
 * 用法: node scripts/seed-activity-data.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ACTIVITY_TYPES = ['login', 'ai_coach', 'date_plan', 'chat_message', 'girl_add', 'learning', 'mo_chat'];

// 用户活跃度配置
const USER_PROFILES = {
  power:   { dailyChance: 0.80, loginChance: 0.95, featureMultiplier: 3 },
  active:  { dailyChance: 0.50, loginChance: 0.70, featureMultiplier: 2 },
  casual:  { dailyChance: 0.20, loginChance: 0.35, featureMultiplier: 1 },
  dormant: { dailyChance: 0.03, loginChance: 0.05, featureMultiplier: 0 },
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seed() {
  console.log('=== 生成新演示数据 ===');

  // 清除旧数据
  await prisma.userActivity.deleteMany({});
  console.log('已清除旧活动数据');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // 获取现有 client 用户
  const existingClients = await prisma.user.findMany({
    where: { role: 'client' },
    select: { id: true },
  });
  const existingCount = existingClients.length;
  console.log(`现有 client 用户: ${existingCount}`);

  // 创建新用户以达到 60 人
  const targetUsers = 60;
  const needNew = Math.max(0, targetUsers - existingCount);
  console.log(`需要创建 ${needNew} 个新用户`);

  // 为用户分配分散的注册日期（过去 90 天内），模拟持续增长
  const allUserIds = existingClients.map(u => u.id);
  const userCreatedDates = {};

  // 现有用户的注册日期：分散在 90 天前到 15 天前
  let idx = 0;
  for (const uid of allUserIds) {
    // 以递增密度分布：早期稀疏，近期密集（模拟用户增长加速）
    const bucket = idx / existingCount;
    const daysAgo = Math.floor(85 - bucket * 70) + randomInt(-3, 3);
    const d = new Date(today);
    d.setDate(d.getDate() - Math.max(1, daysAgo));
    d.setHours(randomInt(8, 22), randomInt(0, 59));
    userCreatedDates[uid] = d;
    idx++;
  }

  // 创建新用户
  const nicknamePrefixes = ['小明', '小红', '阿杰', '小美', '大鹏', '思思', '小宇', '悦悦', '浩然', '雨桐',
    '子轩', '欣怡', '梓涵', '一诺', '沐辰', '若曦', '奕辰', '艺涵', '皓轩', '诗涵',
    '俊杰', '思雨', '宇航', '梦瑶', '志远', '雪婷', '文博', '乐瑶', '天佑', '语嫣',
    '子豪', '晓萌', '睿渊', '清雅', '晨宇', '若兰', '泽宇', '婉清', '冠霖', '静怡'];
  for (let i = 0; i < needNew; i++) {
    const prefix = nicknamePrefixes[i % nicknamePrefixes.length];
    const username = `demo_user_${Date.now()}_${i}`;
    const nickname = `${prefix}${i + 1}`;

    // 注册日期：模拟持续增长，近期增速加快
    const bucket = (existingCount + i) / targetUsers;
    const daysAgo = Math.floor(88 - bucket * 75) + randomInt(-4, 4);

    const d = new Date(today);
    d.setDate(d.getDate() - Math.max(1, daysAgo));
    d.setHours(randomInt(8, 22), randomInt(0, 59));

    try {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('123456', 10);
      const user = await prisma.user.create({
        data: {
          username,
          nickname,
          password: hashedPassword,
          role: 'client',
          createdAt: d,
        },
      });
      allUserIds.push(user.id);
      userCreatedDates[user.id] = d;
    } catch (e) {
      console.error(`创建用户失败: ${username}`, e.message);
    }
  }

  // 分配活跃度 profile
  const userProfiles = {};
  for (const uid of allUserIds) {
    const rand = Math.random();
    if (rand < 0.12) userProfiles[uid] = 'power';
    else if (rand < 0.45) userProfiles[uid] = 'active';
    else if (rand < 0.80) userProfiles[uid] = 'casual';
    else userProfiles[uid] = 'dormant';
  }

  const profileCounts = { power: 0, active: 0, casual: 0, dormant: 0 };
  for (const uid of allUserIds) profileCounts[userProfiles[uid]]++;
  console.log(`用户活跃度分布: power=${profileCounts.power}, active=${profileCounts.active}, casual=${profileCounts.casual}, dormant=${profileCounts.dormant}`);
  console.log(`总用户数: ${allUserIds.length}`);

  // 生成 90 天活动数据
  const activities = [];
  const globalGrowthCurve = {}; // date -> { baseActivity: number }

  // 先计算全局活跃度曲线（随用户增长自然上升）
  for (let d = 89; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const key = date.toISOString().split('T')[0];

    // 统计这天之前已注册的用户数
    let registeredUsers = 0;
    for (const uid of allUserIds) {
      if (userCreatedDates[uid] <= date) registeredUsers++;
    }
    // baseActivity = 该日活跃度系数（随用户数增长）
    globalGrowthCurve[key] = {
      registeredUsers,
      baseActivity: Math.max(0.15, registeredUsers / targetUsers),
    };
  }

  for (const uid of allUserIds) {
    const profile = USER_PROFILES[userProfiles[uid]];
    const userCreatedAt = userCreatedDates[uid];

    for (let d = 89; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const dateKey = date.toISOString().split('T')[0];

      // 注册前无活动
      if (date < userCreatedAt) continue;

      // 沉睡用户：注册后只活跃 7 天
      if (profile === USER_PROFILES.dormant) {
        const daysSinceReg = Math.floor((date - userCreatedAt) / (1000 * 60 * 60 * 24));
        if (daysSinceReg > 7) continue;
        if (Math.random() > 0.4) continue;
      }

      // 全局活跃系数影响：早期用户少时活跃率低一点（模拟产品增长）
      const globalFactor = globalGrowthCurve[dateKey]?.baseActivity || 0.5;
      const effectiveChance = profile.dailyChance * (0.6 + 0.4 * globalFactor);

      // 当日是否有活动
      if (Math.random() > effectiveChance) continue;

      // 周末活跃度略低（社交产品周末可能会高，但这里模拟工作日使用更频繁）
      const dayOfWeek = date.getDay();
      const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.65 : 1.0;
      if (Math.random() > weekendFactor) continue;

      // 登录活动
      if (Math.random() < profile.loginChance * weekendFactor) {
        activities.push({ userId: uid, type: 'login', date: new Date(date) });
      }

      // 功能使用
      const featureCount = Math.floor(profile.featureMultiplier * (0.5 + 0.5 * globalFactor));
      for (let f = 0; f < featureCount; f++) {
        if (Math.random() < 0.55) {
          const type = pickRandom(ACTIVITY_TYPES.filter(t => t !== 'login'));
          activities.push({ userId: uid, type, date: new Date(date) });
        }
      }

      // 高活跃用户每天多些聊天消息
      if (profile === USER_PROFILES.power || profile === USER_PROFILES.active) {
        const extraChats = randomInt(0, Math.floor(profile.featureMultiplier * 2.5));
        for (let c = 0; c < extraChats; c++) {
          activities.push({ userId: uid, type: 'chat_message', date: new Date(date) });
        }
      }
    }
  }

  console.log(`生成了 ${activities.length} 条活动记录，正在批量写入...`);

  // 分批写入
  const BATCH = 500;
  for (let i = 0; i < activities.length; i += BATCH) {
    const batch = activities.slice(i, i + BATCH);
    await prisma.userActivity.createMany({ data: batch });
    if ((i / BATCH) % 10 === 0) {
      console.log(`  已写入 ${Math.min(i + BATCH, activities.length)} / ${activities.length}`);
    }
  }
  console.log(`写入完成: ${activities.length} 条`);

  // 更新用户的 lastActive
  for (const uid of allUserIds) {
    const lastActivity = activities
      .filter(a => a.userId === uid)
      .sort((a, b) => b.date - a.date)[0];
    if (lastActivity) {
      await prisma.user.update({
        where: { id: uid },
        data: { lastActive: lastActivity.date },
      });
    }
  }
  console.log('lastActive 更新完成');

  // 打印统计
  const dauMap = {};
  for (const a of activities) {
    const k = a.date.toISOString().split('T')[0];
    if (!dauMap[k]) dauMap[k] = new Set();
    dauMap[k].add(a.userId);
  }
  const sortedKeys = Object.keys(dauMap).sort();
  console.log(`\n数据摘要 (90天):`);
  console.log(`  活跃天数: ${sortedKeys.length}`);
  console.log(`  日均 DAU: ${Math.round(sortedKeys.reduce((s,k) => s + dauMap[k].size, 0) / sortedKeys.length)}`);
  console.log(`  峰值 DAU: ${Math.max(...sortedKeys.map(k => dauMap[k].size))}`);
  console.log(`  生长趋势: DAU 前10天均值 ${Math.round(sortedKeys.slice(0,10).reduce((s,k) => s + (dauMap[k]?.size||0), 0) / 10)} → 后10天均值 ${Math.round(sortedKeys.slice(-10).reduce((s,k) => s + (dauMap[k]?.size||0), 0) / 10)}`);

  await prisma.$disconnect();
  console.log('\n=== 完成 ===');
}

seed().catch(e => { console.error(e); process.exit(1); });

/**
 * 一次性数据修复：将有效会员的 girlQuota 同步到 User 表
 * 用法: node fix-girl-quota.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const quotaByType = { MONTHLY: 30, YEARLY: 365, PREMIUM: 999, TRIAL: 1 };

async function main() {
  const activeMemberships = await prisma.membership.findMany({
    where: { status: 'active' },
    orderBy: { endDate: 'desc' }
  });

  let fixed = 0;
  for (const m of activeMemberships) {
    const quota = m.girlQuota || quotaByType[m.type] || 30;
    const user = await prisma.user.findUnique({ where: { id: m.userId } });
    if (!user) continue;

    if (user.girlQuota !== quota) {
      await prisma.user.update({
        where: { id: m.userId },
        data: { girlQuota: quota }
      });
      console.log(`[FIXED] ${user.nickname || user.username} (${m.userId}): ${user.girlQuota} → ${quota} (${m.type})`);
      fixed++;
    } else {
      console.log(`[OK] ${user.nickname || user.username} (${m.userId}): already ${quota}`);
    }
  }

  console.log(`\n总计: 修复 ${fixed} 个用户`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

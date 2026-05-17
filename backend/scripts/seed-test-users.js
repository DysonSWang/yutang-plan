const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const hashed = await bcrypt.hash('test1234', 10);
  const user = await prisma.user.create({
    data: {
      username: 'testuser',
      password: hashed,
      nickname: '测试用户',
      role: 'client',
      girlQuota: 999
    }
  });
  console.log('Created user:', user.id, user.username);

  const hashedAdmin = await bcrypt.hash('admin1234', 10);
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      password: hashedAdmin,
      nickname: '管理员',
      role: 'admin',
      girlQuota: 999
    }
  });
  console.log('Created admin:', admin.id, admin.username);

  await prisma.trialConfig.upsert({
    where: { id: 'trial_config' },
    update: {},
    create: { id: 'trial_config', validDays: 3, maxChapters: 2, maxGirls: 1, maxTrialUses: 2 }
  });
  console.log('Trial config ready');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

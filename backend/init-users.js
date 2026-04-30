const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // 创建管理员
  const adminExists = await prisma.user.findFirst({ where: { username: 'admin' } });
  if (!adminExists) {
    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        password: await bcrypt.hash('admin123', 10),
        role: 'admin',
        nickname: '管理员',
      }
    });
    console.log('管理员创建成功:', admin.username);
  } else {
    console.log('管理员已存在');
  }

  // 创建测试用户
  const testExists = await prisma.user.findFirst({ where: { username: 'test' } });
  if (!testExists) {
    const test = await prisma.user.create({
      data: {
        username: 'test',
        password: await bcrypt.hash('test123', 10),
        role: 'client',
        nickname: '测试用户',
      }
    });
    console.log('测试用户创建成功:', test.username);
  } else {
    console.log('测试用户已存在');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

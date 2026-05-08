/**
 * 共享 Prisma 客户端实例
 * 所有模块从这里导入 prisma，确保一致的数据库连接
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      // 测试环境优先使用 TEST_DATABASE_URL（优先级高于 DATABASE_URL）
      url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    }
  }
});

// SQLite 外键约束（Prisma 默认关闭，需手动开启）
async function enableForeignKeys() {
  if (process.env.DATABASE_URL?.includes('sqlite') || !process.env.DATABASE_URL) {
    try {
      await prisma.$executeRaw`PRAGMA foreign_keys = ON;`;
      console.log('[Prisma] SQLite foreign keys enabled');
    } catch (e) {
      console.warn('[Prisma] Failed to enable foreign keys:', e.message);
    }
  }
}

// 启动时启用外键
enableForeignKeys().catch(console.warn);

module.exports = prisma;

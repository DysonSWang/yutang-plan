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

module.exports = prisma;

/**
 * Jest 测试环境初始化
 *
 * 数据库说明：
 * - 使用 ./test-db.db（相对于 backend/ 目录，即 backend/test-db.db）
 * - 首次运行前需执行：DATABASE_URL="file:///绝对路径" npx prisma db push --force-reset
 *   示例：DATABASE_URL="file:///home/admin/zhuiai/backend/test-db.db" npx prisma db push --schema ./prisma/schema.prisma --skip-generate --force-reset
 *   Prisma CLI 的相对路径解析基于 schema.prisma 位置（prisma/schema.prisma），而非 cwd
 *
 * 重要：此文件在 dotenv.config() 之前执行，确保测试环境变量不会被 .env 覆盖
 */

// 测试环境变量设置（32字符长度以满足 config.js 检查）
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-32chars';
process.env.TESTING = 'true';

// 优先使用 TEST_DATABASE_URL；prisma.js 会优先读取它
process.env.TEST_DATABASE_URL = 'file:./test-db.db';
// 数据库使用独立的测试数据库
process.env.DATABASE_URL = 'file:./test-db.db';

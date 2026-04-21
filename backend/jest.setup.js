/**
 * Jest 测试环境初始化
 *
 * 数据库说明：
 * - 使用 ./test-db.db（相对于 backend/ 目录，即 backend/test-db.db）
 * - 首次运行前需执行：DATABASE_URL="file:///绝对路径" npx prisma db push --force-reset
 *   示例：DATABASE_URL="file:///home/admin/yutang-plan/backend/test-db.db" npx prisma db push --schema ./prisma/schema.prisma --skip-generate --force-reset
 *   Prisma CLI 的相对路径解析基于 schema.prisma 位置（prisma/schema.prisma），而非 cwd
 */
process.env.JWT_SECRET = 'test-jwt-secret';
// 优先使用 TEST_DATABASE_URL；prisma.js 会优先读取它
process.env.TEST_DATABASE_URL = 'file:./test-db.db';
// dotenv.config() 在 config.js 里运行会覆盖已存在的变量，
// 所以我们直接在这里覆盖 DATABASE_URL
process.env.DATABASE_URL = 'file:./test-db.db';

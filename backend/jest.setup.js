/**
 * Jest 测试环境初始化
 */
process.env.JWT_SECRET = 'test-jwt-secret';
// 优先使用 TEST_DATABASE_URL；prisma.js 会优先读取它
process.env.TEST_DATABASE_URL = 'file:./test-db.db';
// dotenv.config() 在 config.js 里运行会覆盖已存在的变量，
// 所以我们直接在这里覆盖 DATABASE_URL
process.env.DATABASE_URL = 'file:./test-db.db';

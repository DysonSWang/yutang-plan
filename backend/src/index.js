/**
 * 追爱计划 - 后端入口
 */

require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const { PORT } = require('./config');
const prisma = require('./prisma');
const logger = require('./utils/logger');
const requestIdMiddleware = require('./middleware/requestId');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const errorCollector = require('./middleware/errorCollector');
const logRoutes = require('./routes/logs');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const chatLogRoutes = require('./routes/chatLog');
const girlsRoutes = require('./routes/girls');
const clientsRoutes = require('./routes/clients');
const datesRoutes = require('./routes/dates');
const paymentsRoutes = require('./routes/payments');
const progressRoutes = require('./routes/progress');
const aiCoachRoutes = require('./routes/aiCoach');
const agentChatRoutes = require('./routes/agentChat');
const notificationsRoutes = require('./routes/notifications');
const chatPartnerRoutes = require('./routes/chatPartner');
const chatScreenshotRoutes = require('./routes/chatScreenshot');
const dashboardRoutes = require('./routes/dashboard');
const eventsRoutes = require('./routes/events');
const alertsRoutes = require('./routes/alerts');
const weeklyReviewRoutes = require('./routes/weeklyReview');
const reversalRoutes = require('./routes/reversal');
const uploadRoutes = require('./routes/upload');
const videoCompressRoutes = require('./routes/video-compress');
const membershipRoutes = require('./routes/membership');
const restaurantRoutes = require('./routes/restaurant');
const versionRoutes = require('./routes/version');
const activityRoutes = require('./routes/activity');

const app = express();
const server = http.createServer(app);

// Socket.io
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const whitelist = (process.env.CORS_WHITELIST || 'http://localhost:3000,http://localhost:5173,http://localhost:5181')
        .split(',')
        .map(item => item.trim());
      if (whitelist.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[Socket.IO CORS] 拒绝非白名单域名: ${origin}`);
        callback(new Error('不允许的域名'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Socket.io 限流（防止 WebSocket 洪水攻击）
const socketConnections = new Map(); // ip -> { count, resetTime }
const SOCKET_RATE_LIMIT = 100; // 最多100个连接/IP
const SOCKET_RATE_WINDOW = 60 * 1000; // 1分钟窗口

io.use((socket, next) => {
  const ip = socket.handshake.ip || socket.conn.remoteAddress;
  const now = Date.now();
  const connectionInfo = socketConnections.get(ip);

  if (!connectionInfo) {
    socketConnections.set(ip, { count: 1, resetTime: now + SOCKET_RATE_WINDOW });
    return next();
  }

  // 重置计数器
  if (now > connectionInfo.resetTime) {
    connectionInfo.count = 1;
    connectionInfo.resetTime = now + SOCKET_RATE_WINDOW;
    return next();
  }

  if (connectionInfo.count >= SOCKET_RATE_LIMIT) {
    console.warn(`[Socket.IO RateLimit] 拒绝过多连接: ${ip}`);
    return next(new Error('连接过于频繁'));
  }

  connectionInfo.count++;
  next();
});

// 让路由可通过 req.app.get('io') 访问
app.set('io', io);

// Middleware
// CORS 配置 - 支持白名单
const corsOptions = {
  origin: function (origin, callback) {
    // 允许没有 origin 的请求（如移动端、Postman）
    if (!origin) return callback(null, true);

    // 从环境变量读取白名单，默认允许 localhost 开发
    const whitelist = (process.env.CORS_WHITELIST || 'https://zhuiai.club,https://localhost,capacitor://localhost,capacitor://localhost:0,http://localhost:3000,http://localhost:5173,http://localhost:5181')
      .split(',')
      .map(item => item.trim());

    // Capacitor App 的请求，无论 origin 都允许
    if (origin?.startsWith('capacitor://') || origin?.startsWith('ionic://')) {
      return callback(null, true);
    }

    if (whitelist.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] 拒绝非白名单域名: ${origin}`);
      callback(new Error('不允许的域名'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// 安全响应头
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.deepseek.com", "https://dashscope.aliyuncs.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// 全局速率限制 - 防止暴力攻击
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟窗口
  max: 1000, // 限制每个IP 15分钟内最多1000请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' }
});
app.use(globalLimiter);

// 认证相关接口更严格限制
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 30, // 登录/注册等操作每IP最多30次
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '认证请求过于频繁，请15分钟后再试' }
});

app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(express.json({ limit: process.env.MAX_BODY_SIZE || '2mb' }));
app.use(errorCollector);

// 路由
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/chat', chatRoutes(io));
app.use('/api/chat-logs', chatLogRoutes);
app.use('/api/girls', girlsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/dates', datesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/progress', progressRoutes(io));
app.use('/api/ai-coach', aiCoachRoutes);
app.use('/api/agent', agentChatRoutes);
app.use('/api/notifications', notificationsRoutes(io));
app.use('/api/chat-partner', chatPartnerRoutes);
app.use('/api/chat-screenshots', chatScreenshotRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/alerts', alertsRoutes(io));
app.use('/api/clients', weeklyReviewRoutes);
app.use('/api/girls', reversalRoutes(io));
app.use('/api/reports', require('./routes/reports'));

// 静态文件服务 - 截图图片
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 兼容旧 public 路径 → 重定向到 OSS
app.get('/public/*', async (req, res) => {
  const ossPath = req.path.replace(/^\//, '');
  try {
    const { client } = require('./services/ossClient');
    const url = await client.signatureUrl(ossPath, { expires: 3600 });
    return res.redirect(url);
  } catch (err) {
    logger.error('[Public] OSS redirect error', { err: err.message });
    return res.status(404).json({ error: '文件不存在' });
  }
});

// 上传路由
app.use('/api/upload', uploadRoutes);
app.use('/api/upload', videoCompressRoutes);

// 会员/积分/邀请/学习版块
app.use('/api/membership', membershipRoutes);

// 精选餐厅库
app.use('/api/restaurants', restaurantRoutes);

// 版本检测
app.use('/api/version', versionRoutes);

// 活跃度追踪 API
app.use('/api/admin/activity', activityRoutes);

// 日志 API
app.use('/api/logs', logRoutes);

// Socket.io 连接处理
io.on('connection', (socket) => {
  logger.info(`[Socket] 客户端连接: ${socket.id}`);

  // 加入操盘手房间
  socket.on('operator:join', (operatorId) => {
    socket.join(`operator:${operatorId}`);
    logger.info(`[Socket] 操盘手 ${operatorId} 加入房间`);
  });

  // 加入客户房间
  socket.on('client:join', (clientId) => {
    socket.join(`client:${clientId}`);
    logger.info(`[Socket] 客户 ${clientId} 加入房间`);
  });

  // 发送消息给操盘手
  socket.on('message:to-operator', (data) => {
    const { operatorId, sessionId, message } = data;
    io.to(`operator:${operatorId}`).emit('message:new', {
      sessionId,
      message
    });
  });

  // 发送消息给客户
  socket.on('message:to-client', (data) => {
    const { clientId, message } = data;
    io.to(`client:${clientId}`).emit('message:new', message);
  });

  // 发送通知给操盘手
  socket.on('notification:to-operator', (data) => {
    const { operatorId, notification } = data;
    io.to(`operator:${operatorId}`).emit('notification:new', notification);
  });

  socket.on('disconnect', () => {
    logger.info(`[Socket] 客户端断开: ${socket.id}`);
  });
});

// 404 处理
app.use(notFoundHandler);

// 错误处理
app.use(errorHandler);

// 恢复未完成的个性化生成任务
const { resumeAbandonedBatches } = require('./services/personalizationEngine');
resumeAbandonedBatches(prisma, io);

// 恢复 stuck 的截图分析任务
const { recoverStuckJobs } = require('./services/asyncAnalysis');
recoverStuckJobs(prisma);

server.listen(PORT, () => {
  logger.info(`🐟 追爱计划后端启动: http://localhost:${PORT}`);
});

module.exports = { app, server, io, prisma };

// ============================================================
// P0 预警定时触发（每 6 小时自动检测所有客户女生的预警）
// ============================================================
async function runAlertCheck() {
  try {
    const { evaluateAllGirls, saveAlerts, getActiveAlerts } = require('./services/alertEngine');
    const operators = await prisma.user.findMany({ where: { role: 'operator' } });
    let newAlertCount = 0;

    for (const op of operators) {
      const newAlerts = await evaluateAllGirls(op.id);
      if (newAlerts.length > 0) {
        await saveAlerts(newAlerts);
        newAlertCount += newAlerts.length;

        // 通过 Socket.io 推送实时通知
        const activeAlerts = await getActiveAlerts(op.id);
        io.to(`operator:${op.id}`).emit('alerts:update', {
          count: activeAlerts.filter(a => a.status === 'active').length,
          alerts: activeAlerts.slice(0, 5),
          newCount: newAlerts.length
        });
      }
    }

    if (newAlertCount > 0) {
      logger.info('[AlertScheduler] 生成新预警', { count: newAlertCount });
    }
  } catch (err) {
    logger.error('[AlertScheduler] 预警检测失败', { err: err.message });
  }
}

// 服务启动时立即跑一次（收集初始预警）
runAlertCheck();

// 每 6 小时跑一次
const SIX_HOURS = 6 * 60 * 60 * 1000;
setInterval(runAlertCheck, SIX_HOURS);
logger.info('[AlertScheduler] 预警定时器已启动（每 6 小时）');

// ============================================================
// 实时日志推送 - 每秒读取新行推送给管理员
// ============================================================
let lastLogPosition = 0;

function tailLogFile() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filePath = path.join(__dirname, `../logs/app-${today}.json`);

  if (!fs.existsSync(filePath)) return;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    if (lines.length > lastLogPosition) {
      const newLines = lines.slice(lastLogPosition).filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);

      if (newLines.length > 0) {
        io.emit('log:new', { logs: newLines });
      }
      lastLogPosition = lines.length;
    }
  } catch (e) {
    // 忽略文件读取错误
  }
}

setInterval(tailLogFile, 1000);
logger.info('[LogTailing] 实时日志推送已启动');

// ============================================================
// 阅后即焚 - 即时模式主动销毁定时器
// ============================================================
async function burnExpiredImmediateMessages() {
  try {
    const expiredMessages = await prisma.message.findMany({
      where: {
        isBurnAfterRead: true,
        burnTrigger: 'immediately',
        burnedAt: null,
        createdAt: {
          lte: new Date(Date.now()), // will filter in SQL below
        },
      },
      select: { id: true, sessionId: true, createdAt: true, burnAfterSeconds: true },
    });

    const now = new Date();
    const toBurn = expiredMessages.filter(
      (m) => new Date(m.createdAt).getTime() + (m.burnAfterSeconds || 5) * 1000 <= now.getTime()
    );

    if (toBurn.length === 0) return;

    await prisma.message.updateMany({
      where: { id: { in: toBurn.map((m) => m.id) } },
      data: { burnedAt: now },
    });

    // 推送销毁通知给在线双方
    const sessionIds = [...new Set(toBurn.map((m) => m.sessionId))];
    for (const sessionId of sessionIds) {
      const burnedInSession = toBurn.filter((m) => m.sessionId === sessionId);
      io.emit('message:burned', {
        sessionId,
        messageIds: burnedInSession.map((m) => m.id),
      });
    }

    if (toBurn.length > 0) {
      logger.info('[BurnScheduler] 主动销毁即时消息', { count: toBurn.length });
    }
  } catch (err) {
    logger.error('[BurnScheduler] 即时消息销毁失败', { err: err.message });
  }
}

setInterval(burnExpiredImmediateMessages, 1000);
logger.info('[BurnScheduler] 即时模式销毁定时器已启动（每秒）');

/**
 * 追爱计划 - 后端入口
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
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
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 让路由可通过 req.app.get('io') 访问
app.set('io', io);

// Middleware
app.use(cors());
app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(express.json({ limit: '10mb' }));
app.use(errorCollector);

// 路由
app.use('/api/auth', authRoutes);
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

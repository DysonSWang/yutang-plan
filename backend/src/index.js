/**
 * 鱼塘计划 - 后端入口
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const { PORT } = require('./config');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const chatLogRoutes = require('./routes/chatLog');
const girlsRoutes = require('./routes/girls');
const clientsRoutes = require('./routes/clients');
const datesRoutes = require('./routes/dates');
const paymentsRoutes = require('./routes/payments');
const progressRoutes = require('./routes/progress');
const aiCoachRoutes = require('./routes/aiCoach');
const notificationsRoutes = require('./routes/notifications');
const chatPartnerRoutes = require('./routes/chatPartner');
const chatScreenshotRoutes = require('./routes/chatScreenshot');
const dashboardRoutes = require('./routes/dashboard');
const uploadRoutes = require('./routes/upload');
const videoCompressRoutes = require('./routes/video-compress');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

// Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

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
app.use('/api/notifications', notificationsRoutes(io));
app.use('/api/chat-partner', chatPartnerRoutes);
app.use('/api/chat-screenshots', chatScreenshotRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 静态文件服务 - 截图图片
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 上传路由
app.use('/api/upload', uploadRoutes);
app.use('/api/upload', videoCompressRoutes);

// Socket.io 连接处理
io.on('connection', (socket) => {
  console.log('[Socket] 客户端连接:', socket.id);

  // 加入操盘手房间
  socket.on('operator:join', (operatorId) => {
    socket.join(`operator:${operatorId}`);
    console.log(`[Socket] 操盘手 ${operatorId} 加入房间`);
  });

  // 加入客户房间
  socket.on('client:join', (clientId) => {
    socket.join(`client:${clientId}`);
    console.log(`[Socket] 客户 ${clientId} 加入房间`);
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
    console.log('[Socket] 客户端断开:', socket.id);
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: '服务器错误' });
});

server.listen(PORT, () => {
  console.log(`🐟 鱼塘计划后端启动: http://localhost:${PORT}`);
});

module.exports = { app, server, io, prisma };

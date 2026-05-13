/**
 * 通知路由
 */

const express = require('express');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');

module.exports = function(io) {
const router = express.Router();

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: { code: 'A0101', message: '未登录' } });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: { code: 'A0102', message: '认证令牌无效' } });
  }
};

// 获取通知列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { unreadOnly } = req.query;

    const where = { userId: req.user.id };
    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, isRead: false }
    });

    res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    console.error('[Notifications] 获取通知失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '获取通知列表失败，请稍后重试' } });
  }
});

// 创建通知
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { userId, type, title, content, metadata } = req.body;

    if (!userId || !type || !title || !content) {
      return res.status(400).json({ error: { code: 'S0803', message: 'userId、type、title、content是必需的' } });
    }

    // 安全：操盘手只能给其负责的客户发送通知
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: userId }
    });
    if (!session) {
      return res.status(403).json({ error: { code: 'A0108', message: '无权限向此用户发送通知' } });
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        content,
        metadata: metadata ? JSON.stringify(metadata) : null
      }
    });

    // 通过 Socket.io 推送通知
    if (io) {
      io.to(`client:${userId}`).emit('notification:new', notification);
    }

    res.json({ success: true, notification });
  } catch (error) {
    console.error('[Notifications] 创建通知失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '创建通知失败，请稍后重试' } });
  }
});

// 标记已读
router.post('/:id/read', authMiddleware, async (req, res) => {
  try {
    // 安全：验证通知属于当前用户（防止操作他人通知）
    const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: { code: 'S0804', message: '通知不存在' } });
    if (existing.userId !== req.user.id) {
      return res.status(403).json({ error: { code: 'A0108', message: '无权操作此通知' } });
    }

    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true }
    });

    res.json({ success: true, notification });
  } catch (error) {
    console.error('[Notifications] 标记已读失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '标记已读失败，请稍后重试' } });
  }
});

// 标记全部已读
router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] 标记全部已读失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '标记全部已读失败，请稍后重试' } });
  }
});

  return router;
};

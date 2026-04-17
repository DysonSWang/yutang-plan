/**
 * 通知路由
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'yutang-secret-key-2024';

module.exports = function(io) {
const router = express.Router();

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'token无效' });
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
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建通知
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { userId, type, title, content, metadata } = req.body;

    if (!userId || !type || !title || !content) {
      return res.status(400).json({ error: '参数不完整' });
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
    res.status(500).json({ error: '创建失败' });
  }
});

// 标记已读
router.post('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true }
    });

    res.json({ success: true, notification });
  } catch (error) {
    console.error('[Notifications] 标记已读失败:', error);
    res.status(500).json({ error: '操作失败' });
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
    res.status(500).json({ error: '操作失败' });
  }
});

  return router;
};

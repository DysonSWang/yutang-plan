/**
 * 私密聊天路由 - 操盘手和客户之间的1v1聊天
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

  // Socket.io 推送消息
  const emitNewMessage = (session, message) => {
    if (!io) return;
    // 发送给会话的另一方
    const isOperator = session.operatorId === message.senderId;
    const room = isOperator ? `client:${session.clientId}` : `operator:${session.operatorId}`;
    console.log('[Chat] Emitting to room:', room, 'message:', message.id);
    io.to(room).emit('message:new', message);
  };

  // 获取操盘手的所有客户会话列表
  router.get('/sessions', authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== 'operator' && req.user.role !== 'admin') {
        return res.status(403).json({ error: '无权限' });
      }

      const sessions = await prisma.chatSession.findMany({
        where: { operatorId: req.user.id },
        orderBy: { lastMessageAt: 'desc' }
      });

      // 获取每个会话的客户信息
      const sessionsWithClients = await Promise.all(
        sessions.map(async (session) => {
          const client = await prisma.user.findUnique({
            where: { id: session.clientId },
            select: {
              id: true,
              nickname: true,
              avatar: true,
              serviceStage: true
            }
          });
          return { ...session, client };
        })
      );

      res.json({ success: true, sessions: sessionsWithClients });
    } catch (error) {
      console.error('[Chat] 获取会话列表失败:', error);
      res.status(500).json({ error: '获取失败' });
    }
  });

  // 获取或创建与客户的会话
  router.post('/sessions', authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== 'operator' && req.user.role !== 'admin') {
        return res.status(403).json({ error: '无权限' });
      }

      const { clientId } = req.body;
      if (!clientId) {
        return res.status(400).json({ error: '客户ID是必需的' });
      }

      // 查找或创建会话
      let session = await prisma.chatSession.findUnique({
        where: {
          operatorId_clientId: {
            operatorId: req.user.id,
            clientId
          }
        }
      });

      if (!session) {
        session = await prisma.chatSession.create({
          data: {
            operatorId: req.user.id,
            clientId
          }
        });
      }

      res.json({ success: true, session });
    } catch (error) {
      console.error('[Chat] 创建会话失败:', error);
      res.status(500).json({ error: '创建失败' });
    }
  });

  // 获取会话的消息历史
  router.get('/sessions/:sessionId/messages', authMiddleware, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { limit = 50, before } = req.query;

      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        return res.status(404).json({ error: '会话不存在' });
      }

      // 验证权限
      if (session.operatorId !== req.user.id && session.clientId !== req.user.id) {
        return res.status(403).json({ error: '无权限' });
      }

      const where = { sessionId };
      if (before) {
        where.createdAt = { lt: new Date(before) };
      }

      const messages = await prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit)
      });

      // 标记消息为已读
      await prisma.message.updateMany({
        where: {
          sessionId,
          senderRole: 'client',
          isRead: false
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      // 更新未读数
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { unreadCount: 0 }
      });

      res.json({ success: true, messages: messages.reverse() });
    } catch (error) {
      console.error('[Chat] 获取消息失败:', error);
      res.status(500).json({ error: '获取失败' });
    }
  });

  // 发送消息
  router.post('/messages', authMiddleware, async (req, res) => {
    try {
      const { sessionId, content, type = 'text', isBurnAfterRead = false } = req.body;

      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        return res.status(404).json({ error: '会话不存在' });
      }

      // 验证权限
      if (session.operatorId !== req.user.id && session.clientId !== req.user.id) {
        return res.status(403).json({ error: '无权限' });
      }

      // 确定发送者角色
      const senderRole = session.operatorId === req.user.id ? 'operator' : 'client';

      const message = await prisma.message.create({
        data: {
          sessionId,
          senderRole,
          senderId: req.user.id,
          content,
          type,
          isBurnAfterRead
        }
      });

      // 更新会话
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: {
          lastMessage: content?.substring(0, 50),
          lastMessageAt: new Date(),
          unreadCount: session.operatorId === req.user.id ? 0 : session.unreadCount + 1
        }
      });

      // 通过 Socket.io 推送消息给另一方
      emitNewMessage(session, message);

      res.json({ success: true, message });
    } catch (error) {
      console.error('[Chat] 发送消息失败:', error);
      res.status(500).json({ error: '发送失败' });
    }
  });

  // 阅后即焚 - 标记消息已销毁
  router.post('/messages/:id/burn', authMiddleware, async (req, res) => {
    try {
      const message = await prisma.message.findUnique({
        where: { id: req.params.id }
      });

      if (!message) {
        return res.status(404).json({ error: '消息不存在' });
      }

      if (message.senderId !== req.user.id && message.sessionId) {
        const session = await prisma.chatSession.findUnique({
          where: { id: message.sessionId }
        });
        if (session?.operatorId !== req.user.id && session?.clientId !== req.user.id) {
          return res.status(403).json({ error: '无权限' });
        }
      }

      await prisma.message.update({
        where: { id: req.params.id },
        data: {
          content: '[消息已销毁]',
          burnedAt: new Date()
        }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('[Chat] 销毁消息失败:', error);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // 标记消息已读
  router.post('/messages/:id/read', authMiddleware, async (req, res) => {
    try {
      const message = await prisma.message.update({
        where: { id: req.params.id },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      res.json({ success: true, message });
    } catch (error) {
      console.error('[Chat] 标记已读失败:', error);
      res.status(500).json({ error: '操作失败' });
    }
  });

  return router;
};

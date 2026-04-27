/**
 * 代聊记录路由 - 操盘手帮客户发消息给女生
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');

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

// 获取女生的代聊记录
router.get('/girl/:girlId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId } = req.params;
    const { limit = 50 } = req.query;

    // 安全：验证女生存在且属于操盘手负责的客户
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return res.status(404).json({ error: '女生不存在' });
    }
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: girl.clientId }
    });
    if (!session) {
      return res.status(403).json({ error: '无权限访问此女生数据' });
    }

    const logs = await prisma.chatLog.findMany({
      where: { girlId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json({ success: true, logs });
  } catch (error) {
    console.error('[ChatLog] 获取代聊记录失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 更新代聊记录的可见性（推送给客户）
router.patch('/:id/visibility', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { id } = req.params;
    const { isVisibleToClient } = req.body;

    // 安全：验证记录存在且属于操盘手负责的客户
    const existing = await prisma.chatLog.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '记录不存在' });
    }
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: existing.clientId }
    });
    if (!session) {
      return res.status(403).json({ error: '无权限操作此记录' });
    }

    const log = await prisma.chatLog.update({
      where: { id },
      data: { isVisibleToClient }
    });

    res.json({ success: true, log });
  } catch (error) {
    console.error('[ChatLog] 更新可见性失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 获取客户的代聊记录（客户只能看到已推送的）
router.get('/client/me', authMiddleware, async (req, res) => {
  try {
    const { girlId, limit = 50 } = req.query;

    const where = { clientId: req.user.id, isVisibleToClient: true };
    if (girlId) {
      where.girlId = girlId;
    }

    const logs = await prisma.chatLog.findMany({
      where,
      include: {
        girl: {
          select: {
            id: true,
            name: true,
            stage: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json({ success: true, logs });
  } catch (error) {
    console.error('[ChatLog] 获取代聊记录失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建代聊记录
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { girlId, receiverName, content, type = 'text', aiAnalysis, aiSuggestions, aiAdopted = false } = req.body;

    if (!girlId || !content) {
      return res.status(400).json({ error: '参数不完整' });
    }

    // 安全：验证女生存在并获取其 clientId，防止操作不属于自己的客户数据
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      return res.status(404).json({ error: '女生不存在' });
    }
    const clientId = girl.clientId;

    const log = await prisma.chatLog.create({
      data: {
        girlId,
        clientId,
        operatorId: req.user.id,
        receiverName,
        content,
        type,
        aiAnalysis,
        aiSuggestions,
        aiAdopted
      }
    });

    // TODO: 通过 Socket.io 通知客户
    // io.to(`client:${clientId}`).emit('chat-log:new', log);

    res.json({ success: true, log });
  } catch (error) {
    console.error('[ChatLog] 创建代聊记录失败:', error);
    res.status(500).json({ error: '创建失败' });
  }
});

module.exports = router;

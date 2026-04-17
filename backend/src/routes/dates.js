/**
 * 约会管理路由
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'yutang-secret-key-2024';

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

// 获取约会列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { clientId, girlId, status } = req.query;

    let where = {};
    if (req.user.role === 'client') {
      where.userId = req.user.id;
    } else if (clientId) {
      where.userId = clientId;
    }
    if (girlId) where.girlId = girlId;
    if (status) where.status = status;

    const dates = await prisma.date.findMany({
      where,
      include: {
        user: {
          select: { id: true, nickname: true }
        },
        girl: {
          select: { id: true, name: true, stage: true }
        }
      },
      orderBy: { dateTime: 'desc' }
    });

    res.json({ success: true, dates });
  } catch (error) {
    console.error('[Dates] 获取约会列表失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建约会
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { clientId, girlId, dateTime, location, notes, nextAction } = req.body;

    if (!clientId || !girlId || !dateTime) {
      return res.status(400).json({ error: '参数不完整' });
    }

    const date = await prisma.date.create({
      data: {
        userId: clientId,
        girlId,
        dateTime: new Date(dateTime),
        location,
        notes,
        nextAction,
        status: 'planned'
      }
    });

    // TODO: 通知客户

    res.json({ success: true, date });
  } catch (error) {
    console.error('[Dates] 创建约会失败:', error);
    res.status(500).json({ error: '创建失败' });
  }
});

// 更新约会
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { dateTime, location, status, notes, nextAction } = req.body;

    const updateData = {};
    if (dateTime !== undefined) updateData.dateTime = new Date(dateTime);
    if (location !== undefined) updateData.location = location;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (nextAction !== undefined) updateData.nextAction = nextAction;

    const date = await prisma.date.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, date });
  } catch (error) {
    console.error('[Dates] 更新约会失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除约会
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    await prisma.date.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Dates] 删除约会失败:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;

/**
 * 日历事件路由 - 统一管理约会、行动项、手动事件
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
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'token无效' });
  }
};

// 获取事件列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { clientId, girlId, type, status, startDate, endDate } = req.query;

    let where = {};
    if (req.user.role === 'client') {
      where.clientId = req.user.id;
    } else if (clientId) {
      where.clientId = clientId;
    }
    if (girlId) where.girlId = girlId;
    if (type) where.type = type;
    if (status) where.status = status;
    if (startDate) where.eventTime = { ...where.eventTime, gte: new Date(startDate) };
    if (endDate) where.eventTime = { ...where.eventTime, lte: new Date(endDate) };

    const events = await prisma.event.findMany({
      where,
      include: {
        girl: { select: { id: true, name: true, stage: true } }
      },
      orderBy: { eventTime: 'asc' }
    });

    res.json({ success: true, events });
  } catch (error) {
    console.error('[Events] 获取事件列表失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建事件
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin' && req.user.role !== 'client') {
      return res.status(403).json({ error: '无权限' });
    }

    const { clientId, girlId, title, content, eventTime, endTime, type, source, aiContext, dateId, chatLogId, color, notes, metadata } = req.body;

    if (!clientId || !title || !eventTime) {
      return res.status(400).json({ error: '缺少必填字段（clientId、title、eventTime）' });
    }

    const event = await prisma.event.create({
      data: {
        clientId,
        girlId: girlId || null,
        title,
        content: content || null,
        eventTime: new Date(eventTime),
        endTime: endTime ? new Date(endTime) : null,
        type: type || 'manual',
        source: source || (req.user.role === 'client' ? 'manual' : null),
        aiContext: aiContext || null,
        dateId: dateId || null,
        chatLogId: chatLogId || null,
        color: color || null,
        notes: notes || null,
        metadata: metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null
      },
      include: { girl: { select: { id: true, name: true, stage: true } } }
    });

    res.json({ success: true, event });
  } catch (error) {
    console.error('[Events] 创建事件失败:', error);
    res.status(500).json({ error: '创建失败' });
  }
});

// 获取单个事件
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        girl: { select: { id: true, name: true, stage: true, personality: true } }
      }
    });

    if (!event) return res.status(404).json({ error: '事件不存在' });

    if (req.user.role === 'client' && event.clientId !== req.user.id) {
      return res.status(403).json({ error: '无权访问' });
    }

    res.json({ success: true, event });
  } catch (error) {
    console.error('[Events] 获取事件失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 更新事件
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '事件不存在' });

    if (req.user.role === 'client' && existing.clientId !== req.user.id) {
      return res.status(403).json({ error: '无权修改' });
    }
    if (req.user.role === 'client' && existing.type === 'date') {
      return res.status(403).json({ error: '约会由操盘手管理' });
    }

    const { title, content, eventTime, endTime, status, girlId, color, notes, metadata } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (eventTime !== undefined) updateData.eventTime = new Date(eventTime);
    if (endTime !== undefined) updateData.endTime = endTime ? new Date(endTime) : null;
    if (status !== undefined) updateData.status = status;
    if (girlId !== undefined) updateData.girlId = girlId || null;
    if (color !== undefined) updateData.color = color;
    if (notes !== undefined) updateData.notes = notes;
    if (metadata !== undefined) updateData.metadata = typeof metadata === 'string' ? metadata : (metadata ? JSON.stringify(metadata) : null);

    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: updateData,
      include: { girl: { select: { id: true, name: true, stage: true } } }
    });

    res.json({ success: true, event });
  } catch (error) {
    console.error('[Events] 更新事件失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除事件
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '事件不存在' });

    if (req.user.role === 'client' && existing.clientId !== req.user.id) {
      return res.status(403).json({ error: '无权删除' });
    }
    if (req.user.role === 'client' && existing.type === 'date') {
      return res.status(403).json({ error: '约会由操盘手管理' });
    }

    await prisma.event.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[Events] 删除事件失败:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 标记完成/取消
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '事件不存在' });

    if (req.user.role === 'client' && existing.clientId !== req.user.id) {
      return res.status(403).json({ error: '无权修改' });
    }

    const { status } = req.body;
    if (!['pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: '无效状态' });
    }

    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: { status }
    });

    res.json({ success: true, event });
  } catch (error) {
    console.error('[Events] 更新状态失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 批量获取事件（用于日历加载）
router.post('/batch', authMiddleware, async (req, res) => {
  try {
    const { clientId, startDate, endDate } = req.body;

    if (!clientId) return res.status(400).json({ error: 'clientId 是必需的' });

    let where = { clientId };
    if (startDate) where.eventTime = { ...where.eventTime, gte: new Date(startDate) };
    if (endDate) where.eventTime = { ...where.eventTime, lte: new Date(endDate) };

    const [dates, events] = await Promise.all([
      // 约会（映射为 type=date 的事件）
      prisma.date.findMany({
        where: { userId: clientId },
        include: { girl: { select: { id: true, name: true, stage: true } } }
      }),
      // 日历事件
      prisma.event.findMany({
        where,
        include: { girl: { select: { id: true, name: true, stage: true } } }
      })
    ]);

    // 映射约会为日历事件
    const dateEvents = dates.map(d => ({
      id: `date:${d.id}`,
      eventId: d.id,
      title: d.title || d.girl?.name || '约会',
      content: d.notes,
      eventTime: d.dateTime,
      endTime: null,
      type: 'date',
      status: d.status,
      girl: d.girl,
      source: 'date',
      color: null,
      isDate: true,
      dateStatus: d.status,
      location: d.location,
      rating: d.rating
    }));

    // 映射普通事件
    const actionEvents = events.map(e => ({
      id: e.id,
      eventId: e.id,
      title: e.title,
      content: e.content,
      eventTime: e.eventTime,
      endTime: e.endTime,
      type: e.type,
      status: e.status,
      girl: e.girl,
      source: e.source,
      color: e.color,
      isDate: false,
      dateStatus: null,
      location: null,
      rating: null,
      aiContext: e.aiContext
    }));

    const all = [...dateEvents, ...actionEvents].sort((a, b) =>
      new Date(a.eventTime) - new Date(b.eventTime)
    );

    res.json({ success: true, events: all });
  } catch (error) {
    console.error('[Events] 批量获取失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

module.exports = router;

/**
 * 日历事件路由 - 统一管理约会、行动项、手动事件
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');

const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const asyncHandler = require('../middleware/asyncHandler');
const { success } = require('../utils/response');

// Auth middleware
const authMiddleware = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded;
});

// 获取事件列表
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
  const { clientId, girlId, type, status, startDate, endDate } = req.query;

  let where = {};
  if (req.user.role === 'client') {
    where.clientId = req.user.id;
  } else if (clientId) {
    // 安全：操盘手只能查询自己负责的客户
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
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

  return success(res, { events });
}));

// 创建事件
router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role !== 'operator' && req.user.role !== 'admin' && req.user.role !== 'client') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const { clientId, girlId, title, content, eventTime, endTime, type, source, aiContext, dateId, chatLogId, color, notes, metadata } = req.body;

  if (!clientId || !title || !eventTime) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }

  // 安全：操盘手只能为自己的客户创建事件（客户可为自身创建）
  if (req.user.role === 'operator' || req.user.role === 'admin') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
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

  return success(res, { event });
}));

// 获取单个事件
router.get('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: {
      girl: { select: { id: true, name: true, stage: true, personality: true } }
    }
  });

  if (!event) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);

  if (req.user.role === 'client' && event.clientId !== req.user.id) {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  // 安全：操盘手只能访问自己负责的客户的事件
  if (req.user.role === 'operator') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: event.clientId }
    });
    if (!session) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
  }

  return success(res, { event });
}));

// 更新事件
router.put('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);

  if (req.user.role === 'client' && existing.clientId !== req.user.id) {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  if (req.user.role === 'client' && existing.type === 'date') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  // 安全：操盘手只能操作自己负责的客户的事件
  if (req.user.role === 'operator') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: existing.clientId }
    });
    if (!session) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
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

  return success(res, { event });
}));

// 更新事件状态（标记完成/取消完成）
router.patch('/:id/status', authMiddleware, asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status || !['pending', 'completed', 'cancelled'].includes(status)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }

  const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);

  // 客户只能修改自己的事件
  if (req.user.role === 'client' && existing.clientId !== req.user.id) {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  // 客户不能修改约会类型
  if (req.user.role === 'client' && existing.type === 'date') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }

  const event = await prisma.event.update({
    where: { id: req.params.id },
    data: { status },
    include: { girl: { select: { id: true, name: true, stage: true } } }
  });

  return success(res, { event });
}));

// 删除事件
router.delete('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);

  if (req.user.role === 'client' && existing.clientId !== req.user.id) {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  if (req.user.role === 'client' && existing.type === 'date') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  // 安全：操盘手只能操作自己负责的客户的事件
  if (req.user.role === 'operator') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: existing.clientId }
    });
    if (!session) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
  }

  await prisma.event.delete({ where: { id: req.params.id } });
  return success(res, { success: true });
}));

// 标记完成/取消
router.patch('/:id/status', authMiddleware, asyncHandler(async (req, res) => {
  const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);

  if (req.user.role === 'client' && existing.clientId !== req.user.id) {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  // 安全：操盘手只能操作自己负责的客户的事件
  if (req.user.role === 'operator') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: existing.clientId }
    });
    if (!session) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
  }

  const { status } = req.body;
  if (!['pending', 'completed', 'cancelled'].includes(status)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }

  const event = await prisma.event.update({
    where: { id: req.params.id },
    data: { status }
  });

  return success(res, { event });
}));

// 批量获取事件（用于日历加载）
router.post('/batch', authMiddleware, asyncHandler(async (req, res) => {
  const { clientId, startDate, endDate } = req.body;

  if (!clientId) throw new AppError(ErrorCodes.VALIDATION_ERROR);

  // 安全：操盘手只能查询自己负责的客户
  if (req.user.role !== 'client' && req.user.role !== 'admin') {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) {
      throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
    }
  }

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

  return success(res, { events: all });
}));

module.exports = router;

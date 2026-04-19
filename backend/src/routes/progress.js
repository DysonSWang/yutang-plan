/**
 * 服务进度路由
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

// 获取服务进度
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.query;

    let where = {};
    if (req.user.role === 'client') {
      where.userId = req.user.id;
    } else if (clientId) {
      where.userId = clientId;
    }

    const progress = await prisma.serviceProgress.findMany({
      where,
      orderBy: { stage: 'asc' }
    });

    res.json({ success: true, progress });
  } catch (error) {
    console.error('[Progress] 获取服务进度失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建/更新服务进度
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { clientId, stage, stageName, status = 'in_progress', amountPaid } = req.body;

    if (!clientId || stage === undefined || !stageName) {
      return res.status(400).json({ error: '参数不完整' });
    }

    // 查找是否已存在该阶段
    const existing = await prisma.serviceProgress.findFirst({
      where: { userId: clientId, stage }
    });

    let progress;
    if (existing) {
      progress = await prisma.serviceProgress.update({
        where: { id: existing.id },
        data: {
          status,
          amountPaid,
          paidAt: amountPaid ? new Date() : undefined,
          completedAt: status === 'completed' ? new Date() : undefined
        }
      });
    } else {
      progress = await prisma.serviceProgress.create({
        data: {
          userId: clientId,
          stage,
          stageName,
          status,
          amountPaid,
          paidAt: amountPaid ? new Date() : undefined,
          completedAt: status === 'completed' ? new Date() : undefined
        }
      });
    }

    // 更新用户服务阶段
    await prisma.user.update({
      where: { id: clientId },
      data: { serviceStage: stageName }
    });

    // 发送通知给客户
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: clientId,
          type: 'progress',
          title: '服务进度更新',
          content: `您的服务已进入【${stageName}】阶段`,
          metadata: JSON.stringify({ stage, stageName })
        }
      });
      // 通过 Socket.io 推送通知
      if (io) {
        io.to(`client:${clientId}`).emit('notification:new', notification);
      }
    } catch (notifErr) {
      console.error('[Progress] 创建通知失败:', notifErr);
    }

    res.json({ success: true, progress });
  } catch (error) {
    console.error('[Progress] 创建/更新服务进度失败:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 获取客户完整进度报告
router.get('/report/:clientId', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.params;

    // 获取进度记录
    const progress = await prisma.serviceProgress.findMany({
      where: { userId: clientId },
      orderBy: { stage: 'asc' }
    });

    // 获取女生统计
    const girls = await prisma.girl.findMany({
      where: { clientId }
    });

    const girlCount = girls.length;
    const intimacyCount = girls.filter(g => g.stage === '暧昧').length;
    const longTermCount = girls.filter(g => g.stage === '长期').length;

    // 获取约会统计
    const dates = await prisma.date.findMany({
      where: { userId: clientId }
    });
    const dateCount = dates.filter(d => d.status === 'completed').length;

    res.json({
      success: true,
      progress,
      stats: {
        girlCount,
        intimacyCount,
        longTermCount,
        dateCount
      }
    });
  } catch (error) {
    console.error('[Progress] 获取进度报告失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

  return router;
};

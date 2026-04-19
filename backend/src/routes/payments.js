/**
 * 阶段付款路由
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

// 获取付款记录
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.query;

    let where = {};
    if (req.user.role === 'client') {
      where.userId = req.user.id;
    } else if (clientId) {
      where.userId = clientId;
    }

    const payments = await prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, payments });
  } catch (error) {
    console.error('[Payments] 获取付款记录失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建付款记录
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'operator' && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    const { clientId, stage, amount } = req.body;

    if (!clientId || stage === undefined || !amount) {
      return res.status(400).json({ error: '参数不完整' });
    }

    const payment = await prisma.payment.create({
      data: {
        userId: clientId,
        stage,
        amount,
        status: 'paid',
        paidAt: new Date()
      }
    });

    // 更新用户余额
    await prisma.user.update({
      where: { id: clientId },
      data: { balance: { increment: amount } }
    });

    res.json({ success: true, payment });
  } catch (error) {
    console.error('[Payments] 创建付款记录失败:', error);
    res.status(500).json({ error: '创建失败' });
  }
});

module.exports = router;

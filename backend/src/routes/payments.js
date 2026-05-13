/**
 * 阶段付款路由
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');
const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');

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

// 获取付款记录
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.query;

    let where = {};
    if (req.user.role === 'client') {
      where.userId = req.user.id;
    } else if (clientId) {
      // 安全：操盘手只能查询自己负责的客户
      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId }
      });
      if (!session) {
        return res.status(403).json({ error: { code: 'A0108', message: '无权限访问此客户的数据' } });
      }
      where.userId = clientId;
    }

    const payments = await prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, payments });
  } catch (error) {
    console.error('[Payments] 获取付款记录失败:', error);
    res.status(500).json({ error: { code: 'S0802', message: '获取付款记录失败，请稍后重试' } });
  }
});

// 创建付款记录
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }

    const { clientId, stage, amount } = req.body;

    if (!clientId || stage === undefined || !amount) {
      return res.status(400).json({ error: { code: 'S0803', message: '缺少必填字段：clientId、stage、amount' } });
    }

    // 安全：操盘手只能为自己的客户创建付款记录
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) {
      return res.status(403).json({ error: { code: 'A0108', message: '无权为该客户创建付款记录' } });
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
    res.status(500).json({ error: { code: 'S0802', message: '创建付款记录失败，请稍后重试' } });
  }
});

module.exports = router;

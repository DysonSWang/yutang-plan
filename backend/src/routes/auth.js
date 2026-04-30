/**
 * 认证路由
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');
const activityService = require('../services/activityService');

// 注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname, phone } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码是必需的' });
    }

    // 安全：强制最小密码长度
    if (password.length < 8) {
      return res.status(400).json({ error: '密码至少8位' });
    }

    // 安全：不接受 role 参数，所有注册用户都是 client
    const role = 'client';

    // 检查用户是否存在
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role,
        nickname: nickname || username,
        phone
      }
    });

    // 生成 token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        nickname: user.nickname
      }
    });
  } catch (error) {
    console.error('[Auth] 注册失败:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码是必需的' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 生成 token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // 记录登录活跃度（客户端用户才记录）
    if (user.role === 'client') {
      activityService.recordLogin(user.id).catch(err => {
        console.error('[Auth] 记录登录活跃度失败:', err);
      });
    }

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        nickname: user.nickname
      }
    });
  } catch (error) {
    console.error('[Auth] 登录失败:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// 验证 token
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        role: true,
        nickname: true,
        avatar: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.warn('[Auth] verify token 失败:', error.message);
    res.status(401).json({ error: 'token无效' });
  }
});

// 获取当前用户信息
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        role: true,
        nickname: true,
        avatar: true,
        phone: true,
        assetsLevel: true,
        serviceStage: true,
        balance: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.warn('[Auth] me token 失败:', error.message);
    res.status(401).json({ error: 'token无效' });
  }
});

// 修改密码
router.post('/change-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '旧密码和新密码都是必需的' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: '新密码至少8位' });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: '旧密码错误' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('[Auth] 修改密码失败:', error);
    res.status(500).json({ error: '修改密码失败' });
  }
});

module.exports = router;

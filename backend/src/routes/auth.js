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
const membershipService = require('../services/membershipService');
const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const asyncHandler = require('../middleware/asyncHandler');

// 注册
router.post('/register', asyncHandler(async (req, res) => {
  const { username, password, nickname, phone, inviteCode } = req.body;

  if (!username || !password) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, { userMessage: '用户名和密码是必需的' });
  }

  if (password.length < 8) {
    throw new AppError(ErrorCodes.AUTH_PASSWORD_TOO_SHORT);
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    throw new AppError(ErrorCodes.AUTH_USER_EXISTS);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
      role: 'client',
      nickname: nickname || username,
      phone
    }
  });

  // 注册成功后绑定邀请关系（积分在购买会员时发放）
  if (inviteCode) {
    membershipService.bindInvitation(user.id, inviteCode).catch(() => {});
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, role: user.role, nickname: user.nickname }
  });
}));

// 登录
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, { userMessage: '用户名和密码是必需的' });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    throw new AppError(ErrorCodes.AUTH_CREDENTIALS_INVALID);
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    throw new AppError(ErrorCodes.AUTH_CREDENTIALS_INVALID);
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  if (user.role === 'client') {
    activityService.recordLogin(user.id).catch(err => {
      console.error('[Auth] 记录登录活跃度失败:', err);
    });
  }

  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, role: user.role, nickname: user.nickname }
  });
}));

// 验证 token
router.get('/verify', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new AppError(ErrorCodes.AUTH_TOKEN_INVALID);
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: { id: true, username: true, role: true, nickname: true, avatar: true }
  });

  if (!user) {
    throw new AppError(ErrorCodes.AUTH_USER_NOT_FOUND);
  }

  res.json({ success: true, user });
}));

// 获取当前用户信息
router.get('/me', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new AppError(ErrorCodes.AUTH_TOKEN_INVALID);
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: {
      id: true, username: true, role: true, nickname: true, avatar: true,
      phone: true, assetsLevel: true, serviceStage: true, balance: true, createdAt: true
    }
  });

  if (!user) {
    throw new AppError(ErrorCodes.AUTH_USER_NOT_FOUND);
  }

  res.json({ success: true, user });
}));

// 修改密码
router.post('/change-password', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new AppError(ErrorCodes.AUTH_TOKEN_INVALID);
  }

  const { oldPassword, newPassword, confirmPassword } = req.body;

  if (!oldPassword || !newPassword || !confirmPassword) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, { userMessage: '旧密码和新密码都是必需的' });
  }

  if (newPassword !== confirmPassword) {
    throw new AppError(ErrorCodes.AUTH_PASSWORD_MISMATCH);
  }

  if (newPassword.length < 8) {
    throw new AppError(ErrorCodes.AUTH_PASSWORD_TOO_SHORT);
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) {
    throw new AppError(ErrorCodes.AUTH_USER_NOT_FOUND);
  }

  const validPassword = await bcrypt.compare(oldPassword, user.password);
  if (!validPassword) {
    throw new AppError(ErrorCodes.AUTH_OLD_PASSWORD_WRONG);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword }
  });

  res.json({ success: true, message: '密码修改成功' });
}));

module.exports = router;

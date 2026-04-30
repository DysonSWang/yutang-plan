/**
 * 认证路由
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');
const { success } = require('../utils/response');
const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const asyncHandler = require('../middleware/asyncHandler');

// 注册
router.post('/register', asyncHandler(async (req, res) => {
  const { username, password, nickname, phone } = req.body;

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

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  return success(res, {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      nickname: user.nickname
    }
  });
});

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

  return success(res, {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      nickname: user.nickname
    }
  });
});

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
    select: {
      id: true,
      username: true,
      role: true,
      nickname: true,
      avatar: true
    }
  });

  if (!user) {
    throw new AppError(ErrorCodes.AUTH_USER_NOT_FOUND);
  }

  return success(res, { user });
});

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
    throw new AppError(ErrorCodes.AUTH_USER_NOT_FOUND);
  }

  return success(res, { user });
});

module.exports = router;

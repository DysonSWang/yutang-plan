/**
 * 统一认证中间件
 * 所有需要认证的路由使用此中间件
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const { AppError, ErrorCodes } = require('../errors/errorCodes');

// Token 黑名单（生产环境建议用 Redis）
const revokedTokens = new Set();

/**
 * 检查 Token 是否已撤销
 * @param {string} token
 * @returns {boolean}
 */
function isTokenRevoked(token) {
  return revokedTokens.has(token);
}

/**
 * 撤销 Token
 * @param {string} token
 */
function revokeToken(token) {
  revokedTokens.add(token);
}

/**
 * 认证中间件
 * 验证 JWT token 并将用户信息附加到 req.user
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 'AUTH_TOKEN_MISSING',
      error: '未提供认证 token'
    });
  }

  const token = authHeader.split(' ')[1];

  // 检查是否已撤销
  if (isTokenRevoked(token)) {
    return res.status(401).json({
      code: 'AUTH_TOKEN_REVOKED',
      error: 'Token 已失效，请重新登录'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        code: 'AUTH_TOKEN_EXPIRED',
        error: 'Token 已过期，请重新登录'
      });
    }
    return res.status(401).json({
      code: 'AUTH_TOKEN_INVALID',
      error: 'Token 无效'
    });
  }
}

/**
 * 管理员权限中间件
 * 必须与 authMiddleware 配合使用
 */
function adminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      code: 'AUTH_REQUIRED',
      error: '需要登录'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      code: 'AUTH_FORBIDDEN',
      error: '需要管理员权限'
    });
  }

  next();
}

/**
 * 可选认证中间件
 * 如果提供了 token 则验证，不提供也允许通过
 * 用于需要认证但非强制的路由
 */
function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  if (isTokenRevoked(token)) {
    return next(); // token 被撤销但路由允许游客访问
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };
  } catch {
    // token 无效但路由允许游客访问，忽略错误
  }

  next();
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  optionalAuthMiddleware,
  revokeToken,
  isTokenRevoked,
  revokedTokens
};
/**
 * 请求追踪 ID 中间件
 * 为每个请求生成唯一 ID，用于日志关联和错误追踪
 */

const { randomBytes } = require('crypto');

function requestIdMiddleware(req, res, next) {
  const id = req.headers['x-request-id'] || randomBytes(8).toString('hex');

  req.id = id;
  res.setHeader('X-Request-Id', id);

  next();
}

module.exports = requestIdMiddleware;

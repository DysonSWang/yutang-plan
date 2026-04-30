/**
 * 请求日志中间件
 * 为每个 HTTP 请求自动记录开始/结束日志，包含请求耗时
 * 慢请求（>3000ms）自动标记
 */

const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const startTime = Date.now();
  const { method, path } = req;

  // 记录请求开始（debug 级别）
  logger.debug(`[Request] --> ${method} ${path}`, {
    requestId: req.id,
    method,
    path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip,
    type: 'request_start',
  });

  // 拦截响应
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const slowThreshold = logger.getSlowThreshold();

    const logData = {
      requestId: req.id,
      method,
      path,
      status: res.statusCode,
      duration,
      slow: duration > slowThreshold,
      type: 'request_end',
    };

    if (duration > slowThreshold) {
      logger.slow(`${method} ${path} 慢请求`, logData);
    } else {
      logger.info(`${method} ${path}`, logData);
    }

    originalEnd.apply(this, args);
  };

  next();
}

module.exports = requestLogger;

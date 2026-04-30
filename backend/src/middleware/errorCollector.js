/**
 * 错误收集中间件
 * 统一收集所有错误，记录结构化日志
 */

const logger = require('../utils/logger');

// 延迟加载 AppError，避免循环依赖
let AppError;
try {
  AppError = require('../errors/AppError');
} catch (e) {
  AppError = null;
}

function errorCollector(err, req, res, next) {
  const logData = {
    requestId: req.id,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    type: 'error',
  };

  if (AppError && err instanceof AppError) {
    logger.error(`[AppError] ${err.code} ${err.message}`, {
      ...logData,
      code: err.code,
      status: err.status,
      metadata: err.metadata,
    });
  } else {
    logger.error(`[UnhandledError] ${err.message}`, {
      ...logData,
      name: err.name,
      stack: err.stack,
    });
  }

  next(err);
}

module.exports = errorCollector;

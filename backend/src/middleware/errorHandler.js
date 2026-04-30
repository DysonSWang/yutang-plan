/**
 * 全局错误处理中间件
 * 统一所有错误的响应格式、结构化日志、请求追踪
 */

const AppError = require('../errors/AppError');
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  const logContext = {
    requestId: req.id,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
  };

  if (err instanceof AppError) {
    logger.warn(`[AppError] ${err.code} ${err.message}`, {
      ...logContext,
      code: err.code,
      status: err.status,
      metadata: err.metadata,
    });

    return res.status(err.status).json({
      success: false,
      requestId: req.id,
      error: err.toJSON(),
    });
  }

  // 未知编程错误
  logger.error(`[UnhandledError] ${err.message}`, {
    ...logContext,
    name: err.name,
    stack: err.stack,
  });

  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    success: false,
    requestId: req.id,
    error: {
      code: 'S0801',
      message: '服务器内部错误',
      ...(!isProd && { devMessage: err.message }),
    },
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    requestId: req.id,
    error: {
      code: 'S0804',
      message: '请求的资源不存在',
    },
  });
}

module.exports = { errorHandler, notFoundHandler };

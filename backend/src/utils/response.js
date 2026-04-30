/**
 * 统一响应格式辅助函数
 */

const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');

/**
 * 成功响应
 */
function success(res, data, meta = null) {
  const payload = {
    success: true,
    data,
    ...(meta && { meta }),
  };
  return res.json(payload);
}

/**
 * 错误响应
 */
function error(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

/**
 * 统一 try/catch 处理
 * 用法: const result = await handle(res, async () => { ... });
 * 路由中不需要再写 try/catch，直接 throw AppError 即可
 */
async function handle(res, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[Handler]', err);
    throw new AppError(ErrorCodes.INTERNAL_ERROR, { devMessage: err.message });
  }
}

module.exports = { success, error, handle };

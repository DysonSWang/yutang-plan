/**
 * 统一响应格式辅助函数
 */

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

module.exports = { success, error };

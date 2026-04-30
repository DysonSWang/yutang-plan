/**
 * 异步路由包装中间件
 * 确保 async 路由中的 throw 错误能被 errorHandler 捕获
 */

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

module.exports = asyncHandler;

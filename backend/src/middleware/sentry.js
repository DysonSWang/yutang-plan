/**
 * Sentry 错误追踪中间件
 * 统一收集所有未处理的错误到 Sentry
 */

let Sentry;
let sentryEnabled = false;

try {
  Sentry = require('@sentry/node');
} catch (e) {
  console.error('[Sentry] 加载失败:', e.message);
}

// 仅在配置了 DSN 时初始化
if (Sentry && process.env.SENTRY_DSN) {
  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      integrations: [
        // 自动捕获 HTTP 请求和异常
        new Sentry.Integrations.Http({ breadcrumbs: true, tracing: true }),
        // 捕获 Express 中间件错误
        new Sentry.Integrations.Express(),
        // 捕获未处理的 Promise 拒绝
        new Sentry.Integrations.UnhandledRejection(),
      ],
      // 采样率：生产环境 10%
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      // 错误采样率：生产环境 50%
      sampleRate: process.env.NODE_ENV === 'production' ? 0.5 : 1.0,
      // 过滤敏感信息
      beforeSend(event) {
        // 移除可能的敏感字段
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['x-api-key'];
        }
        return event;
      },
    });
    sentryEnabled = true;
    console.log('[Sentry] 已初始化');
  } catch (e) {
    console.error('[Sentry] 初始化失败:', e.message);
  }
}

// 空操作中间件（当 Sentry 未启用时）
const noOpMiddleware = (req, res, next) => next();

module.exports = {
  Sentry,
  isEnabled: () => sentryEnabled,
  // Express 错误处理中间件
  errorHandler: sentryEnabled ? Sentry.Handlers.errorHandler() : noOpMiddleware,
  // 请求处理中间件（自动记录请求）
  requestHandler: sentryEnabled ? Sentry.Handlers.requestHandler() : noOpMiddleware,
  // 追踪中间件
  tracingHandler: sentryEnabled ? Sentry.Handlers.tracingHandler() : noOpMiddleware,
};
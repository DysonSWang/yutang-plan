/**
 * 前端错误捕获与上报
 * 全局监听未捕获错误、Promise 拒绝，统一上报到后端日志系统 + Sentry
 */

import * as Sentry from '@sentry/react';
import { browserTracingIntegration } from '@sentry/react';

// Sentry 配置（使用与后端相同的 DSN）
const SENTRY_DSN = 'https://b1a99a858fc9e0197cf9d850107aef44@o4511406445625344.ingest.us.sentry.io/4511406460895232';

// 初始化 Sentry（仅在生产环境）
if (import.meta.env.PROD) {
  const dsn = import.meta.env.VITE_SENTRY_DSN || SENTRY_DSN;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [
      browserTracingIntegration(),
    ],
    tracesSampleRate: 0.1,
    // 最大 breadcrumbs 数量
    maxBreadcrumbs: 100,
    // 过滤敏感信息
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['cookie'];
        delete event.request.headers['authorization'];
      }
      return event;
    },
  });

  // 添加路由变化的 breadcrumb
  const originalPush = window.history.pushState;
  window.history.pushState = function(...args) {
    originalPush.apply(this, args);
    Sentry.addBreadcrumb({
      category: 'navigation',
      message: `路由: ${window.location.pathname}`,
      data: { path: window.location.pathname },
    });
  };

  // 添加 API 调用的 breadcrumb（通过重写 fetch）
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0] instanceof Request ? args[0].url : args[0];
    const method = args[1]?.method || 'GET';

    return originalFetch.apply(this, args).then(response => {
      Sentry.addBreadcrumb({
        category: 'api',
        message: `${method} ${url}`,
        data: {
          status: response.status,
          ok: response.ok,
        },
        level: response.ok ? 'info' : 'warning',
      });
      return response;
    }).catch(error => {
      Sentry.addBreadcrumb({
        category: 'api',
        message: `${method} ${url}`,
        data: { error: error.message },
        level: 'error',
      });
      throw error;
    });
  };

  console.log('[Sentry] 前端已初始化，breadcrumbs 已启用');
}

const API_BASE = import.meta.env.VITE_API_URL || ''; // Web 用相对路径，Capacitor 用绝对路径

const MAX_PER_MINUTE = 20; // 每分钟最多上报 20 条
const DEDUP_WINDOW = 5000; // 5 秒内相同错误去重

let reportQueue = [];
let lastFlush = 0;
const seenErrors = new Map(); // key: message+type -> timestamp

function buildKey(message, type) {
  return `${type}:${message?.slice(0, 120)}`;
}

function generateErrorId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `fe-${ts}-${rand}`;
}

function flush() {
  if (reportQueue.length === 0) return;

  const batch = reportQueue.splice(0, 5);
  batch.forEach((entry) => {
    fetch(`${API_BASE}/api/logs/frontend-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      keepalive: true,
    }).catch(() => {});
  });

  if (reportQueue.length > 0) {
    setTimeout(flush, 200);
  }
}

function scheduleFlush() {
  const now = Date.now();
  if (now - lastFlush > 1000) {
    lastFlush = now;
    setTimeout(flush, 1000);
  }
}

function isRateLimited() {
  const now = Date.now();
  for (const [key, ts] of seenErrors) {
    if (now - ts > 60000) seenErrors.delete(key);
  }
  return seenErrors.size >= MAX_PER_MINUTE;
}

function isDuplicate(key) {
  const now = Date.now();
  const lastSeen = seenErrors.get(key);
  if (lastSeen && now - lastSeen < DEDUP_WINDOW) {
    return true;
  }
  seenErrors.set(key, now);
  return false;
}

function reportError({ message, stack, type, url, metadata }) {
  const key = buildKey(message, type);

  if (isRateLimited()) return;
  if (isDuplicate(key)) return;

  reportQueue.push({
    errorId: generateErrorId(),
    message: message || '未知错误',
    stack: stack || '',
    type: type || 'unknown',
    url: url || window.location.href,
    userAgent: navigator.userAgent,
    metadata,
  });

  scheduleFlush();
}

// 手动上报（供 ErrorBoundary、try/catch 等调用）
export function captureError(error, metadata = {}) {
  // 同时上报到 Sentry
  Sentry.captureException(error, {
    extra: metadata,
  });

  reportError({
    message: error?.message || String(error),
    stack: error?.stack || '',
    type: metadata.type || 'caught',
    url: metadata.url,
    metadata,
  });
}

let initialized = false;

export function initErrorCapture() {
  if (initialized) return;
  initialized = true;

  // 未捕获的同步/异步错误
  window.addEventListener('error', (event) => {
    // 忽略资源加载错误（如图片 404），只处理脚本错误
    if (!(event instanceof ErrorEvent)) return;

    // 上报到 Sentry
    Sentry.captureException(event.error || new Error(event.message), {
      extra: { lineno: event.lineno, colno: event.colno }
    });

    reportError({
      message: event.message,
      stack: event.error?.stack || '',
      type: 'uncaught',
      url: event.filename || window.location.href,
      metadata: { lineno: event.lineno, colno: event.colno },
    });
  });

  // 未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    // 上报到 Sentry
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));

    reportError({
      message: reason?.message || String(reason),
      stack: reason?.stack || '',
      type: 'unhandledRejection',
      url: window.location.href,
    });
  });

  if (import.meta.env.DEV) {
    console.log('[ErrorCapture] 全局错误捕获已初始化');
  }
}

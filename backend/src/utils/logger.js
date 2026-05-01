/**
 * 结构化日志工具
 * 生产环境输出 JSON 格式，便于日志收集和分析
 * 支持文件写入、慢请求标记、告警机制
 */

const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const SLOW_THRESHOLD = parseInt(process.env.SLOW_THRESHOLD) || 3000; // 慢请求阈值 ms

// 日志文件目录
const LOG_FILE_DIR = path.join(__dirname, '../../logs');

// 确保日志目录存在
if (!fs.existsSync(LOG_FILE_DIR)) {
  fs.mkdirSync(LOG_FILE_DIR, { recursive: true });
}

// 获取北京时间日期字符串 YYYYMMDD
function beijingDateStr(d = new Date()) {
  const bj = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const y = bj.getFullYear();
  const m = String(bj.getMonth() + 1).padStart(2, '0');
  const day = String(bj.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// 获取今日日志文件路径
function getLogFile() {
  return path.join(LOG_FILE_DIR, `app-${beijingDateStr()}.json`);
}

// 写入日志到文件
function writeLog(entry) {
  const line = JSON.stringify(entry) + '\n';
  fs.appendFile(getLogFile(), line, (err) => {
    if (err) console.error('[Logger] Write file error:', err);
  });
}

// 格式化输出（开发环境彩色，生成环境 JSON）
function formatMessage(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    pid: process.pid,
    ...meta,
  };

  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(entry);
  }

  const color = {
    error: '\x1b[31m',
    warn: '\x1b[33m',
    info: '\x1b[36m',
    debug: '\x1b[90m',
  }[level];

  const reset = '\x1b[0m';
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `${color}[${entry.timestamp}] ${level.toUpperCase()}: ${message}${metaStr}${reset}`;
}

function shouldLog(level) {
  return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
}

// 告警状态
const alertState = {
  errorCount: 0,
  slowCount: 0,
  lastReset: Date.now(),
  slowPaths: {}, // 记录每个路径的慢请求数
};

// 触发告警
function triggerAlert(entry, type = 'error') {
  const now = Date.now();

  // 每分钟重置计数
  if (now - alertState.lastReset > 60000) {
    alertState.errorCount = 0;
    alertState.slowCount = 0;
    alertState.slowPaths = {};
    alertState.lastReset = now;
  }

  if (type === 'error') {
    alertState.errorCount++;

    // 5个错误/分钟 → 告警
    if (alertState.errorCount === 5) {
      notifyAdmins('error', `🔥 错误风暴：5分钟内发生 ${alertState.errorCount} 个错误`);
    }
  } else if (type === 'slow') {
    const slowPath = entry.path || 'unknown';
    alertState.slowCount++;
    alertState.slowPaths[slowPath] = (alertState.slowPaths[slowPath] || 0) + 1;

    // 3个同路径慢请求/分钟 → 告警
    if (alertState.slowPaths[slowPath] === 3) {
      notifyAdmins('slow', `🐌 慢请求频繁：${slowPath} 出现 3 次慢请求`);
    }

    // 单次超级慢 > 10秒 → 立即告警
    if (entry.duration > 10000) {
      notifyAdmins('critical', `⚠️ 超级慢请求：${entry.method} ${entry.path} 耗时 ${entry.duration}ms`);
    }
  }
}

// 通知管理员（通过 Socket.io）
function notifyAdmins(type, message) {
  try {
    // 延迟加载避免循环依赖
    const { io } = require('../index');
    if (io) {
      io.emit('admin:alert', { type, message, time: new Date().toISOString() });
    }
  } catch (e) {
    // 服务启动时 io 尚未初始化，忽略
  }
  console.warn(`[ALERT] ${message}`);
}

const logger = {
  error(message, meta = {}) {
    if (shouldLog('error')) {
      const entry = { time: new Date().toISOString(), level: 'error', message, ...meta };
      console.error(formatMessage('error', message, meta));
      writeLog(entry);
      triggerAlert(entry, 'error');
    }
  },

  warn(message, meta = {}) {
    if (shouldLog('warn')) {
      const entry = { time: new Date().toISOString(), level: 'warn', message, ...meta };
      console.warn(formatMessage('warn', message, meta));
      writeLog(entry);
    }
  },

  info(message, meta = {}) {
    if (shouldLog('info')) {
      const entry = { time: new Date().toISOString(), level: 'info', message, ...meta };
      console.log(formatMessage('info', message, meta));
      writeLog(entry);
    }
  },

  debug(message, meta = {}) {
    if (shouldLog('debug')) {
      const entry = { time: new Date().toISOString(), level: 'debug', message, ...meta };
      console.log(formatMessage('debug', message, meta));
      writeLog(entry);
    }
  },

  // 慢请求专用方法
  slow(message, meta = {}) {
    const entry = { time: new Date().toISOString(), level: 'slow', message, ...meta };
    console.warn(formatMessage('warn', `[SLOW] ${message}`, meta));
    writeLog(entry);
    triggerAlert(entry, 'slow');
  },

  // 获取慢请求阈值
  getSlowThreshold() {
    return SLOW_THRESHOLD;
  },

  // 北京时间日期字符串
  beijingDateStr,
};

module.exports = logger;

/**
 * 结构化日志工具
 * 生产环境输出 JSON 格式，便于日志收集和分析
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

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

const logger = {
  error(message, meta = {}) {
    if (shouldLog('error')) console.error(formatMessage('error', message, meta));
  },

  warn(message, meta = {}) {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, meta));
  },

  info(message, meta = {}) {
    if (shouldLog('info')) console.log(formatMessage('info', message, meta));
  },

  debug(message, meta = {}) {
    if (shouldLog('debug')) console.log(formatMessage('debug', message, meta));
  },
};

module.exports = logger;

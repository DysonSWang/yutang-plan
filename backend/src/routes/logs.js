/**
 * 日志 API 路由
 * 提供日志文件列表、读取、统计接口
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const { success } = require('../utils/response');
const logger = require('../utils/logger');

const LOG_DIR = path.join(__dirname, '../../logs');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 获取日志文件列表
router.get('/files', (req, res) => {
  fs.readdir(LOG_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: '无法读取日志目录' });
    }

    const fileList = files
      .filter(f => f.startsWith('app-') && f.endsWith('.json'))
      .map(f => {
        const stat = fs.statSync(path.join(LOG_DIR, f));
        return {
          name: f,
          date: f.replace('app-', '').replace('.json', ''),
          size: stat.size,
          sizeFormatted: formatBytes(stat.size),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    res.json({ files: fileList });
  });
});

// 读取指定日期的日志
router.get('/file/:date', (req, res) => {
  const { date } = req.params;
  const filePath = path.join(LOG_DIR, `app-${date}.json`);

  if (!fs.existsSync(filePath)) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { userMessage: '日志文件不存在' });
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);

  // 反转数组，最新的在前
  lines.reverse();

  // 支持分页
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const offset = (page - 1) * limit;

  const filtered = lines.filter(log => {
    // 按级别过滤
    if (req.query.level && log.level !== req.query.level) return false;
    // 按 trace-id 搜索
    if (req.query.traceId && !log.requestId?.toString().includes(req.query.traceId)) return false;
    // 按关键词搜索
    if (req.query.search && !log.message?.toLowerCase().includes(req.query.search.toLowerCase())) return false;
    // 只看慢请求
    if (req.query.slow === 'true' && log.level !== 'slow') return false;
    // 只看错误
    if (req.query.error === 'true' && log.level !== 'error') return false;
    // 只看特定路径
    if (req.query.path && !log.path?.includes(req.query.path)) return false;
    // 按来源过滤：前端有 source='frontend'，后端无 source 字段
    if (req.query.source === 'frontend') {
      if (log.source !== 'frontend') return false;
    } else if (req.query.source === 'backend') {
      if (log.source === 'frontend') return false;
    }
    return true;
  });

  res.json({
    total: filtered.length,
    page,
    limit,
    totalPages: Math.ceil(filtered.length / limit),
    logs: filtered.slice(offset, offset + limit),
  });
});

// 获取统计信息
router.get('/stats', (req, res) => {
  const dateStr = req.query.date || logger.beijingDateStr();
  const filePath = path.join(LOG_DIR, `app-${dateStr}.json`);

  const stats = { today: { errors: 0, slow: 0, total: 0, errorRate: 0, slowRate: 0, frontendErrors: 0 } };

  if (!fs.existsSync(filePath)) {
    return res.json(stats);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  stats.today.total = lines.length;

  lines.forEach(line => {
    try {
      const log = JSON.parse(line);
      if (log.level === 'error' || log.level === 'warn') stats.today.errors++;
      if (log.level === 'slow') stats.today.slow++;
      if (log.source === 'frontend') stats.today.frontendErrors++;
    } catch {}
  });

  if (stats.today.total > 0) {
    stats.today.errorRate = ((stats.today.errors / stats.today.total) * 100).toFixed(2);
    stats.today.slowRate = ((stats.today.slow / stats.today.total) * 100).toFixed(2);
  }

  res.json(stats);
});

// 格式化字节大小
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 读取日志文件内容
function readLogLines(date) {
  const filePath = path.join(LOG_DIR, `app-${date}.json`);
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

// 慢请求分析
router.get('/slow-analysis', (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const limit = parseInt(req.query.limit) || 10;

  // 收集近N天的慢请求
  const allSlowLogs = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = logger.beijingDateStr(date);
    const logs = readLogLines(dateStr);
    logs.forEach(log => {
      if (log.level === 'slow' || (log.level === 'error' && log.duration > 3000)) {
        allSlowLogs.push({ ...log, date: dateStr });
      }
    });
  }

  // 按路径聚合
  const pathStats = {};
  allSlowLogs.forEach(log => {
    const key = log.path || 'unknown';
    if (!pathStats[key]) {
      pathStats[key] = { path: key, count: 0, totalDuration: 0, maxDuration: 0, minDuration: Infinity, logs: [] };
    }
    pathStats[key].count++;
    pathStats[key].totalDuration += log.duration || 0;
    pathStats[key].maxDuration = Math.max(pathStats[key].maxDuration, log.duration || 0);
    pathStats[key].minDuration = Math.min(pathStats[key].minDuration, log.duration || 0);
    if (pathStats[key].logs.length < 3) {
      pathStats[key].logs.push({ timestamp: log.timestamp, duration: log.duration, requestId: log.requestId, message: log.message });
    }
  });

  // 计算平均耗时并排序
  const pathList = Object.values(pathStats).map(p => ({
    path: p.path,
    count: p.count,
    avgDuration: Math.round(p.totalDuration / p.count),
    maxDuration: p.maxDuration,
    minDuration: p.minDuration === Infinity ? 0 : p.minDuration,
    logs: p.logs,
  })).sort((a, b) => b.count - a.count).slice(0, limit);

  // 按小时分布
  const hourlyDist = {};
  allSlowLogs.forEach(log => {
    if (log.timestamp) {
      const hour = new Date(log.timestamp).getHours();
      hourlyDist[hour] = (hourlyDist[hour] || 0) + 1;
    }
  });
  const hourlyData = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourlyDist[h] || 0 }));

  // 按天分布
  const dailyDist = {};
  allSlowLogs.forEach(log => {
    dailyDist[log.date] = (dailyDist[log.date] || 0) + 1;
  });
  const dailyData = Object.entries(dailyDist)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  res.json({
    total: allSlowLogs.length,
    topPaths: pathList,
    hourlyDistribution: hourlyData,
    dailyDistribution: dailyData,
    timeRange: { from: allSlowLogs[allSlowLogs.length - 1]?.timestamp, to: allSlowLogs[0]?.timestamp },
  });
});

// 通过 traceId 查询完整调用链
router.get('/trace/:traceId', (req, res) => {
  const { traceId } = req.params;
  const days = parseInt(req.query.days) || 7;
  const now = new Date();
  const traceLogs = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = logger.beijingDateStr(date);
    const logs = readLogLines(dateStr);
    logs.forEach(log => {
      if (log.requestId && log.requestId.includes(traceId)) {
        traceLogs.push({ ...log, date: dateStr });
      }
    });
  }

  // 按时间排序
  traceLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  res.json({
    traceId,
    total: traceLogs.length,
    logs: traceLogs.map(log => ({
      timestamp: log.timestamp,
      level: log.level,
      message: log.message,
      path: log.path,
      method: log.method,
      duration: log.duration,
      status: log.status,
      requestId: log.requestId,
      ...(log.error && { error: log.error }),
    })),
  });
});

// 接收前端错误上报
router.post('/frontend-error', (req, res) => {
  const { message, stack, type, url, userAgent, metadata, errorId } = req.body;

  const entry = {
    time: new Date().toISOString(),
    level: 'error',
    source: 'frontend',
    errorId: errorId || '',
    message: message || '未知前端错误',
    stack: stack || '',
    type: type || 'unknown',
    url: url || '',
    userAgent: userAgent || '',
    ...(metadata && { metadata }),
  };

  // 写入今日日志文件
  const dateStr = logger.beijingDateStr();
  const filePath = path.join(LOG_DIR, `app-${dateStr}.json`);
  const line = JSON.stringify(entry) + '\n';

  fs.appendFile(filePath, line, (err) => {
    if (err) {
      return res.status(500).json({ error: '写入日志失败' });
    }
    res.json({ success: true });
  });
});

module.exports = router;

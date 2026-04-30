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
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filePath = path.join(LOG_DIR, `app-${today}.json`);

  const stats = { today: { errors: 0, slow: 0, total: 0, errorRate: 0, slowRate: 0 } };

  if (!fs.existsSync(filePath)) {
    return res.json(stats);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  stats.today.total = lines.length;

  lines.forEach(line => {
    try {
      const log = JSON.parse(line);
      if (log.level === 'error') stats.today.errors++;
      if (log.level === 'slow') stats.today.slow++;
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

module.exports = router;

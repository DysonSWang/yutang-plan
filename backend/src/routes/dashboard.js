/**
 * Dashboard 路由 - 操盘手工作台 API
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');

const { generateDailyBrief, getDashboardStats, getCachedBrief } = require('../services/dailyBriefGenerator');

// 异步任务存储（内存）
const analysisJobs = new Map();

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'token无效' });
  }
};

// 仅 operator 和 admin 可访问
const operatorOnly = (req, res, next) => {
  if (!['operator', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: '无权限' });
  }
  next();
};

/**
 * 获取统计数据
 * GET /api/dashboard/stats?clientId=xxx
 */
router.get('/stats', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { clientId } = req.query;
    const stats = await getDashboardStats(clientId);
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('[Dashboard] 获取统计失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

/**
 * 获取完整简报（一次调用返回所有数据，避免多次触发 AI）
 * GET /api/dashboard/brief?clientId=xxx
 */
router.get('/brief', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { clientId } = req.query;
    const cached = getCachedBrief(clientId || 'all');
    const brief = await generateDailyBrief(clientId);
    res.json({
      success: true,
      tasks: brief.todayTasks || [],
      alerts: brief.alerts || [],
      weekTasks: brief.weekTasks || [],
      updatedAt: cached ? new Date(cached.timestamp).toISOString() : new Date().toISOString()
    });
  } catch (error) {
    console.error('[Dashboard] 获取简报失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

/**
 * 获取今日待办（已缓存，5分钟有效）
 * GET /api/dashboard/today-tasks?clientId=xxx
 */
router.get('/today-tasks', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { clientId } = req.query;
    const brief = await generateDailyBrief(clientId);
    res.json({ success: true, tasks: brief.todayTasks || [] });
  } catch (error) {
    console.error('[Dashboard] 获取今日待办失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

/**
 * 获取本周待办（已缓存，5分钟有效）
 * GET /api/dashboard/week-tasks?clientId=xxx
 */
router.get('/week-tasks', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { clientId } = req.query;
    const brief = await generateDailyBrief(clientId);
    res.json({ success: true, tasks: brief.weekTasks || [] });
  } catch (error) {
    console.error('[Dashboard] 获取本周待办失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

/**
 * 获取重要提醒（已缓存，5分钟有效）
 * GET /api/dashboard/alerts?clientId=xxx
 */
router.get('/alerts', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { clientId } = req.query;
    const brief = await generateDailyBrief(clientId);
    res.json({ success: true, alerts: brief.alerts || [] });
  } catch (error) {
    console.error('[Dashboard] 获取提醒失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

/**
 * 一键分析所有女生（Mo哥+童锦程）- 异步执行
 * POST /api/dashboard/analyze-all?clientId=xxx
 * 返回 jobId，前端轮询 /api/dashboard/analyze-result/:jobId 获取结果
 */
router.post('/analyze-all', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { clientId } = req.query;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 立即返回 jobId
    res.json({ success: true, jobId, status: 'processing' });

    // 后台异步执行 AI 分析
    const asyncAnalyze = async () => {
      try {
        console.log(`[Dashboard] 开始异步分析 job=${jobId}, current jobs: ${analysisJobs.size}`);
        const brief = await generateDailyBrief(clientId);
        console.log(`[Dashboard] AI返回结果 job=${jobId}, todayTasks=${brief?.todayTasks?.length}`);
        const jobData = {
          status: 'completed',
          result: brief,
          completedAt: new Date()
        };
        analysisJobs.set(jobId, jobData);
        console.log(`[Dashboard] 分析完成 job=${jobId}, jobs.size=${analysisJobs.size}, hasJob=${analysisJobs.has(jobId)}`);
      } catch (error) {
        console.error(`[Dashboard] 分析失败 job=${jobId}:`, error);
        analysisJobs.set(jobId, {
          status: 'failed',
          error: error.message,
          completedAt: new Date()
        });
      }
    };
    asyncAnalyze();
  } catch (error) {
    console.error('[Dashboard] 启动分析失败:', error);
    res.status(500).json({ error: '启动分析失败' });
  }
});

/**
 * 获取异步分析结果
 * GET /api/dashboard/analyze-result/:jobId
 */
router.get('/analyze-result/:jobId', authMiddleware, operatorOnly, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = analysisJobs.get(jobId);

    console.log(`[Dashboard] 查询结果 job=${jobId}, exists=${!!job}, jobs.size=${analysisJobs.size}`);

    if (!job) {
      return res.status(404).json({ error: '任务不存在或已过期' });
    }

    res.json({
      success: true,
      status: job.status,
      result: job.result || null,
      error: job.error || null,
      completedAt: job.completedAt
    });
  } catch (error) {
    console.error('[Dashboard] 获取分析结果失败:', error);
    res.status(500).json({ error: '获取结果失败' });
  }
});

module.exports = router;

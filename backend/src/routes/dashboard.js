/**
 * Dashboard 路由 - 操盘手工作台 API
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');

const { generateDailyBrief, getDashboardStats, getCachedBrief } = require('../services/dailyBriefGenerator');

const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const asyncHandler = require('../middleware/asyncHandler');
const { success } = require('../utils/response');

// 异步任务存储（内存）
const analysisJobs = new Map();

// Auth middleware
const authMiddleware = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
  }

  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded;
});

// 仅 operator 和 admin 可访问
const operatorOnly = asyncHandler(async (req, res) => {
  if (!['operator', 'admin'].includes(req.user.role)) {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
});

/**
 * 获取统计数据
 * GET /api/dashboard/stats?clientId=xxx
 */
router.get('/stats', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { clientId } = req.query;
  if (clientId) {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  const stats = await getDashboardStats(clientId);
  return success(res, stats);
}));

/**
 * 获取完整简报（一次调用返回所有数据，避免多次触发 AI）
 * GET /api/dashboard/brief?clientId=xxx
 */
router.get('/brief', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { clientId } = req.query;
  if (clientId) {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  const brief = await generateDailyBrief(clientId);
  return success(res, {
    tasks: brief.todayTasks || [],
    alerts: brief.alerts || [],
    weekTasks: brief.weekTasks || [],
    updatedAt: brief.timestamp ? new Date(brief.timestamp).toISOString() : new Date().toISOString()
  });
}));

/**
 * 获取今日待办（已缓存，5分钟有效）
 * GET /api/dashboard/today-tasks?clientId=xxx
 */
router.get('/today-tasks', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { clientId } = req.query;
  if (clientId) {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  const brief = await generateDailyBrief(clientId);
  return success(res, { tasks: brief.todayTasks || [] });
}));

/**
 * 获取本周待办（已缓存，5分钟有效）
 * GET /api/dashboard/week-tasks?clientId=xxx
 */
router.get('/week-tasks', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { clientId } = req.query;
  if (clientId) {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  const brief = await generateDailyBrief(clientId);
  return success(res, { tasks: brief.weekTasks || [] });
}));

/**
 * 获取重要提醒（已缓存，5分钟有效）
 * GET /api/dashboard/alerts?clientId=xxx
 */
router.get('/alerts', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { clientId } = req.query;
  if (clientId) {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  const brief = await generateDailyBrief(clientId);
  return success(res, { alerts: brief.alerts || [] });
}));

/**
 * 一键分析所有女生（Mo哥+童锦程）- 异步执行
 * POST /api/dashboard/analyze-all?clientId=xxx
 * 返回 jobId，前端轮询 /api/dashboard/analyze-result/:jobId 获取结果
 */
router.post('/analyze-all', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { clientId } = req.query;
  if (clientId) {
    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId }
    });
    if (!session) throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 立即返回 jobId
  return success(res, { jobId, status: 'processing' });

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
  asyncAnalyze().catch(err => console.error(`[Dashboard] asyncAnalyze 未捕获错误 job=${jobId}:`, err));
}));

/**
 * 获取异步分析结果
 * GET /api/dashboard/analyze-result/:jobId
 */
router.get('/analyze-result/:jobId', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const job = analysisJobs.get(jobId);

  console.log(`[Dashboard] 查询结果 job=${jobId}, exists=${!!job}, jobs.size=${analysisJobs.size}`);

  if (!job) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
  }

  return success(res, {
    status: job.status,
    result: job.result || null,
    error: job.error || null,
    completedAt: job.completedAt
  });
}));

module.exports = router;

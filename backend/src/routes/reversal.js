/**
 * 反撇检测路由 - M007 S03
 */

const express = require('express');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');
const { analyzeGirlOverall, getReversalRisk } = require('../services/reversalDetector');

module.exports = function(io) {
  const router = express.Router();

  const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) return res.status(401).json({ error: { code: 'A0101', message: '未登录' } });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: { code: 'A0102', message: '认证令牌无效' } });
    }
  };

  const operatorOnly = (req, res, next) => {
    if (!['admin'].includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'A0108', message: '无此操作权限' } });
    }
    next();
  };

  /**
   * 校验操盘手对女生的所有权
   */
  const validateGirlAccess = async (req, res, next) => {
    const { id } = req.params;
    const girl = await prisma.girl.findUnique({ where: { id } });
    if (!girl) return res.status(404).json({ error: { code: 'G0301', message: '女生不存在' } });

    const session = await prisma.chatSession.findFirst({
      where: { operatorId: req.user.id, clientId: girl.clientId }
    });
    if (!session) return res.status(403).json({ error: { code: 'A0108', message: '无权访问此女生的数据' } });

    req.girl = girl;
    next();
  };

  /**
   * POST /api/girls/:id/analyze-reversal
   * AI 综合分析女生反撇风险
   */
  router.post('/:id/analyze-reversal', authMiddleware, operatorOnly, validateGirlAccess, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await analyzeGirlOverall(id);

      if (!result.success) {
        return res.status(500).json({ error: { code: 'A0602', message: result.error || 'AI分析失败，请稍后重试' } });
      }

      res.json({ success: true, ...result });
    } catch (error) {
      console.error('[Reversal] 分析失败:', error);
      res.status(500).json({ error: { code: 'S0802', message: '反撇分析失败，请稍后重试' } });
    }
  });

  /**
   * GET /api/girls/:id/reversal-risk
   * 快速规则判断反撇风险（不调用 AI）
   */
  router.get('/:id/reversal-risk', authMiddleware, operatorOnly, validateGirlAccess, async (req, res) => {
    try {
      const { id } = req.params;
      const risk = await getReversalRisk(id);
      res.json({ success: true, ...risk });
    } catch (error) {
      console.error('[Reversal] 风险评估失败:', error);
      res.status(500).json({ error: { code: 'S0802', message: '反撇风险评估失败，请稍后重试' } });
    }
  });

  return router;
};

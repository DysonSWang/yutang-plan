/**
 * Coaches Module - 情感教练系统核心模块
 *
 * 提供：
 * - Loader: 加载大师skill数据（从skills/目录）
 * - Router: 问题类型路由
 * - PromptBuilder: 构建AI prompt
 */

const loader = require('./loader');
const router = require('./router');
const promptBuilder = require('./promptBuilder');

// coaches/ 目录已废弃（configs/ 删除），保留空对象保证模块接口完整
const coaches = {};

module.exports = {
  // Loader
  loadSkill: loader.loadSkill,
  loadSkills: loader.loadSkills,
  loadAllSkills: loader.loadAllSkills,
  getRoutingConfig: loader.getRoutingConfig,
  safeLoadSkill: loader.safeLoadSkill,
  clearCache: loader.clearCache,

  // Router
  routeQuestion: router.routeQuestion,
  getSkillsForQuestion: router.getSkillsForQuestion,
  getMultiDimensionalSkills: router.getMultiDimensionalSkills,
  getMultiDimensionalSkillsWithMeta: router.getMultiDimensionalSkillsWithMeta,
  adjustPriority: router.adjustPriority,

  // Prompt Builder
  buildMasterPrompt: promptBuilder.buildMasterPrompt,
  buildChatAnalysisPrompt: promptBuilder.buildChatAnalysisPrompt,

  // 向后兼容（已废弃）
  coaches,
  getCoach: () => null,
  listCoaches: () => [],
  getSystemPrompt: () => null,
  getCoachConfig: () => null,
};

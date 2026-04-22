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

// 向后兼容：保留原有教练配置加载
const fs = require('fs');
const path = require('path');

const coachesDir = path.join(__dirname, 'configs');
let coaches = {};

try {
  const coachFiles = fs.readdirSync(coachesDir).filter(f => f.endsWith('.js'));
  for (const file of coachFiles) {
    const coach = require(path.join(coachesDir, file));
    coaches[coach.id] = coach;
  }
} catch (e) {
  console.warn('[Coaches] 加载教练配置失败:', e.message);
}

module.exports = {
  // 新模块：Skill数据加载
  loadSkill: loader.loadSkill,
  loadSkills: loader.loadSkills,
  loadAllSkills: loader.loadAllSkills,
  getRoutingConfig: loader.getRoutingConfig,
  safeLoadSkill: loader.safeLoadSkill,
  clearCache: loader.clearCache,

  // 新模块：问题路由
  routeQuestion: router.routeQuestion,
  getSkillsForQuestion: router.getSkillsForQuestion,
  getMultiDimensionalSkills: router.getMultiDimensionalSkills,
  getMultiDimensionalSkillsWithMeta: router.getMultiDimensionalSkillsWithMeta,
  adjustPriority: router.adjustPriority,

  // 新模块：Prompt构建
  buildMasterPrompt: promptBuilder.buildMasterPrompt,
  buildChatAnalysisPrompt: promptBuilder.buildChatAnalysisPrompt,

  // 向后兼容：原有教练配置
  coaches,
  getCoach: (coachId) => coaches[coachId] || coaches.general,
  listCoaches: () => Object.values(coaches).map(c => ({
    id: c.id,
    name: c.name,
    description: c.description
  })),
  getSystemPrompt: (coachId) => {
    const coach = coaches[coachId] || coaches.general;
    return coach?.systemPrompt;
  },
  getCoachConfig: (coachId) => coaches[coachId] || coaches.general
};

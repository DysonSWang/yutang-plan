/**
 * Memory Module - 三层记忆体系导出
 *
 * - SemanticMemory: 女生画像、客户偏好（Prisma 存储）
 * - WorkingMemory: 当前对话上下文（UnifiedContext）
 * - EpisodicMemory: 历史压缩摘要、关键决策节点
 */

const SemanticMemory = require('./SemanticMemory');
const CompactionManager = require('./CompactionManager');
const EpisodicMemory = require('./EpisodicMemory');

module.exports = {
  SemanticMemory,
  CompactionManager,
  EpisodicMemory,

  // 便捷入口
  getGirlMemory: SemanticMemory.getGirlSemanticMemory,
  getClientMemory: SemanticMemory.getClientSemanticMemory,
  getSessionMemory: EpisodicMemory.getEpisodicMemory,
  getCompactionStatus: CompactionManager.getBudgetStatus,
  shouldCompact: CompactionManager.shouldCompact,
  compactSession: CompactionManager.runCompaction,
};
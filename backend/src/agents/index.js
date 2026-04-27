/**
 * Agent 入口 - 统一导出所有 Agent
 */
const { triage, getRouteTypeName } = require('./triage');
const { executeHandoff, getHandoffCallbacks } = require('./handoffs');
const { UnifiedContext, createUnifiedContext, ROUTE_TYPES } = require('./UnifiedContext');

// 专业 Agent
const SituationAgent = require('./SituationAgent');
const ChatAnalysisAgent = require('./ChatAnalysisAgent');
const ReplyAgent = require('./ReplyAgent');
const MomentAgent = require('./MomentAgent');
const OverviewAgent = require('./OverviewAgent');

module.exports = {
  // Triage & Routing
  triage,
  getRouteTypeName,
  executeHandoff,
  getHandoffCallbacks,

  // Context
  UnifiedContext,
  createUnifiedContext,
  ROUTE_TYPES,

  // 专业 Agent
  SituationAgent,
  ChatAnalysisAgent,
  ReplyAgent,
  MomentAgent,
  OverviewAgent,

  // Agent 映射（routeType -> Agent module）
  AGENT_MAP: {
    [ROUTE_TYPES.SITUATION]: SituationAgent,
    [ROUTE_TYPES.CHAT_ANALYSIS]: ChatAnalysisAgent,
    [ROUTE_TYPES.REPLY]: ReplyAgent,
    [ROUTE_TYPES.MOMENT]: MomentAgent,
    [ROUTE_TYPES.OVERVIEW]: OverviewAgent,
    [ROUTE_TYPES.OPTIMIZE_REPLY]: ReplyAgent,
    [ROUTE_TYPES.GENERAL]: SituationAgent,
  },
};

/**
 * ChatAnalysisAgent - 聊天分析 Agent
 *
 * 职责：分析聊天记录，识别双方意图、情绪和关系信号
 *
 * 特点：
 * - 10维度结构化分析（意图/情绪/信号/风险等）
 * - JSON 格式输出，便于前端结构化渲染
 * - 可复用 promptBuilder 中的 buildChatAnalysisPrompt
 */

const { buildChatAnalysisPrompt } = require('../coaches/promptBuilder');
const { buildGirlContext, buildClientHint, buildGirlStrategyHint, buildDepthInfo } = require('./contextBuilder');

// ---- 扩展分析 prompt（叠加在 promptBuilder 逻辑之上）----
const ENHANCED_ANALYSIS_INSTRUCTION = `
补充上下文（帮助更准确判断）：
`;

/**
 * 构建 ChatAnalysisAgent 的 prompt
 * @param {string} chatHistory - 聊天记录文本
 * @param {UnifiedContext} ctx - 统一上下文
 * @param {Object} opts - { clientId }
 */
async function buildPrompt(chatHistory, ctx, opts = {}) {
  // 使用 promptBuilder 中已有的成熟逻辑
  let systemPrompt = buildChatAnalysisPrompt(chatHistory, ctx.toPromptContext());

  // 如果有女生上下文，追加到分析末尾（作为额外参考）
  if (ctx.girlProfile) {
    const girlContext = buildGirlContext(ctx);
    systemPrompt += `\n\n${girlContext}`;
  }

  // 如果有客户画像，追加语气偏好
  if (ctx.clientProfile) {
    const clientHint = buildClientHint(ctx);
    if (clientHint) {
      systemPrompt += `\n\n${clientHint}`;
    }
  }

  // 深度信息
  const depthInfo = buildDepthInfo(ctx);
  systemPrompt += `\n\n${depthInfo}`;

  const userPrompt = `请分析以下聊天记录：

${chatHistory}
`;

  return { systemPrompt, userPrompt };
}

/**
 * 获取 Agent 元信息
 */
function getAgentMeta() {
  return {
    name: 'ChatAnalysisAgent',
    displayName: '聊天分析',
    description: '分析聊天记录，识别意图、情绪和关系信号',
    routeTypes: ['chat_analysis'],
    needsHistory: false,
    needsGirlProfile: true,
    needsClientProfile: true,
    outputFormat: 'json',
  };
}

module.exports = {
  buildPrompt,
  getAgentMeta,
};

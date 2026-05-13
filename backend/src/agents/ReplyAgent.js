/**
 * ReplyAgent - 回复建议 Agent
 *
 * 职责：
 * - reply 模式：根据女生情况生成回复选项
 * - optimizeReply 模式：优化用户已有的回复
 *
 * 特点：
 * - 多风格回复选项（2-3个不同风格）
 * - 适配女生性格和聊天风格
 * - optimizeReply 模式提供修改理由
 */

const { buildGirlContext, buildClientHint, buildGirlStrategyHint, buildHistorySection, buildDepthInfo, RESPONSE_FORMAT } = require('./contextBuilder');

// ---- Reply 模式指令 ----
const REPLY_INSTRUCTION = `你是追爱AI情感教练，根据女生情况生成回复建议。

${RESPONSE_FORMAT}

要求：
1. 生成 2-3 个不同风格的回复选项（从以下风格中选择：调侃、正经、暧昧、幽默）
2. 每个选项不超过50字
3. 热度低时优先正经/幽默，热度高时可加入暧昧
4. 直接给结论，不要解释为什么选择这个风格
5. 禁止生成骚扰性、冒犯性或操控性内容

回复格式：
(风格1) 回复文本1
---
(风格2) 回复文本2
---
(风格3) 回复文本3`;

// ---- OptimizeReply 模式指令 ----
const OPTIMIZE_INSTRUCTION = `你是追爱AI情感教练，优化用户已有的回复。

${RESPONSE_FORMAT}

要求：
1. 保持原意，改进表达方式
2. 适配女生性格和聊天风格
3. 给出优化后的版本和1条修改理由
4. 简洁，不要过度解释

回复格式：
优化后：[优化后的回复文本]
理由：[1条修改理由]`;

/**
 * 构建 ReplyAgent 的 prompt（普通回复建议模式）
 * @param {string} userQuestion - 用户输入（含上下文）
 * @param {UnifiedContext} ctx - 统一上下文
 * @param {Object} opts - { clientId }
 */
async function buildPrompt(userQuestion, ctx, opts = {}) {
  const girlContext = buildGirlContext(ctx);
  const clientHint = buildClientHint(ctx);
  const strategyHint = buildGirlStrategyHint(ctx);
  const historySection = buildHistorySection(ctx);
  const depthInfo = buildDepthInfo(ctx);

  const systemPrompt = `${REPLY_INSTRUCTION}

${girlContext}

${strategyHint}

${clientHint}

${historySection}

${depthInfo}
`.trim();

  const userPrompt = `【请求回复的背景】
${userQuestion}
`;

  return { systemPrompt, userPrompt };
}

/**
 * 构建优化回复的 prompt
 * @param {string} originalReply - 用户已有的回复
 * @param {string} userContext - 用户的补充说明
 * @param {UnifiedContext} ctx - 统一上下文
 * @param {Object} opts - { clientId }
 */
async function buildOptimizePrompt(originalReply, userContext, ctx, opts = {}) {
  const girlContext = buildGirlContext(ctx);
  const clientHint = buildClientHint(ctx);
  const strategyHint = buildGirlStrategyHint(ctx);
  const historySection = buildHistorySection(ctx);

  const systemPrompt = `${OPTIMIZE_INSTRUCTION}

${girlContext}

${strategyHint}

${clientHint}

${historySection}
`.trim();

  const userPrompt = `【用户已有回复】
${originalReply}

【用户说明】
${userContext || '无'}
`;

  return { systemPrompt, userPrompt };
}

/**
 * 判断是否为优化模式
 */
function isOptimizeMode(input) {
  const optimizeKeywords = ['优化', '改一下', '调整一下', '改善', '太生硬', '太土'];
  return optimizeKeywords.some(k => input.includes(k));
}

/**
 * 获取 Agent 元信息
 */
function getAgentMeta() {
  return {
    name: 'ReplyAgent',
    displayName: '回复建议',
    description: '根据女生情况生成回复选项，或优化用户已有回复',
    routeTypes: ['reply', 'optimize_reply'],
    needsHistory: true,
    needsGirlProfile: true,
    needsClientProfile: true,
    hasOptimizeMode: true,
  };
}

module.exports = {
  buildPrompt,
  buildOptimizePrompt,
  isOptimizeMode,
  getAgentMeta,
};

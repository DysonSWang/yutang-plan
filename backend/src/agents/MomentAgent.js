/**
 * MomentAgent - 朋友圈分析 Agent
 *
 * 职责：分析女生朋友圈内容，给出私聊切入角度和话题建议
 *
 * 特点：
 * - 内容背后的情绪和意图分析
 * - 评论切入角度推荐
 * - 私聊话题引导
 */

const { buildGirlContext, buildClientHint, buildGirlStrategyHint, buildDepthInfo, RESPONSE_FORMAT } = require('./contextBuilder');

// ---- 基础指令 ----
const MOMENT_INSTRUCTION = `你是鱼塘AI情感教练，分析女生朋友圈并给出私聊切入建议。

${RESPONSE_FORMAT}

分析维度：
1. 内容类型：照片/文字/转发/视频/音乐/链接
2. 情绪状态：积极/消极/中性/迷茫/兴奋
3. 意图信号：分享生活/求关注/测试反应/心情记录
4. 切入角度：可以评论什么引发互动

回复格式（严格按此格式）：
【内容解读】1-2句话描述这条朋友圈透露的情绪
【切入角度】1-2个具体的评论切入点（可直接用来评论）
【私聊话题】如果转私聊，可以聊什么（结合朋友圈内容和女生性格）
【注意事项】聊这个话题时需要避免什么`;

/**
 * 构建 MomentAgent 的 prompt
 * @param {string} momentContent - 朋友圈内容（用户描述或截图文字）
 * @param {UnifiedContext} ctx - 统一上下文
 * @param {Object} opts - { clientId }
 */
async function buildPrompt(momentContent, ctx, opts = {}) {
  const girlContext = buildGirlContext(ctx);
  const clientHint = buildClientHint(ctx);
  const strategyHint = buildGirlStrategyHint(ctx);
  const depthInfo = buildDepthInfo(ctx);

  const systemPrompt = `${MOMENT_INSTRUCTION}

${girlContext}

${strategyHint}

${clientHint}

${depthInfo}
`.trim();

  const userPrompt = `【朋友圈内容】
${momentContent}
`;

  return { systemPrompt, userPrompt };
}

/**
 * 获取 Agent 元信息
 */
function getAgentMeta() {
  return {
    name: 'MomentAgent',
    displayName: '朋友圈分析',
    description: '分析女生朋友圈，给出私聊切入角度和话题建议',
    routeTypes: ['moment'],
    needsHistory: false,
    needsGirlProfile: true,
    needsClientProfile: false,
  };
}

module.exports = {
  buildPrompt,
  getAgentMeta,
};

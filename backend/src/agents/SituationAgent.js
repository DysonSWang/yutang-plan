/**
 * SituationAgent - 情况咨询 Agent
 *
 * 职责：分析用户描述的当前情况，判断关系窗口，给出具体可执行的行动建议
 *
 * 特点：
 * - 使用完整四段式输出格式（窗口判断 / 核心问题 / 行动建议 / 追问）
 * - 结合多 Coach 框架视角
 * - 注入客户画像语气提示
 */

const { getMultiDimensionalSkillsWithMeta } = require('../coaches/router');
const { buildStructuredFusion } = require('../coaches/fusion');
const { buildGirlContext, buildClientHint, buildGirlStrategyHint, buildHistorySection, buildDepthInfo, RESPONSE_FORMAT, SITUATION_FORMAT } = require('./contextBuilder');

// ---- 基础指令 ----
const BASE_INSTRUCTION = `你是鱼塘AI情感教练，根据用户描述的情况提供专业分析和建议。

${RESPONSE_FORMAT}

核心原则：
- 具体可执行，不给泛泛而谈的建议
- 女生性格特点优先于通用策略
- 如果信息不够，直接说"目前信息不足"，追问1个关键问题
- 多Coach视角综合判断，不要矛盾`;

/**
 * 构建 SituationAgent 的 system prompt
 * @param {string} question - 用户输入
 * @param {UnifiedContext} ctx - 统一上下文
 * @param {Object} opts - { clientId }
 */
async function buildPrompt(question, ctx, opts = {}) {
  const { clientId } = opts;

  // 获取多维度技能视角
  const { skills, meta } = getMultiDimensionalSkillsWithMeta(question, ctx.toPromptContext());

  // 构建 Coach 视角部分
  const masterSection = skills.map(skill => buildMasterSection(skill)).join('\n\n');

  // 构建结构化融合提示
  let fusionHint = '';
  if (skills.length > 1) {
    fusionHint = await buildStructuredFusion(skills, meta, {
      clientId,
      clientProfile: ctx.clientProfile,
      girlProfile: ctx.girlProfile,
    });
  }

  // 构建女生上下文
  const girlContext = buildGirlContext(ctx);

  // 构建客户画像语气提示
  const clientHint = buildClientHint(ctx);

  // 构建女生策略提示
  const strategyHint = buildGirlStrategyHint(ctx);

  // 构建对话历史
  const historySection = buildHistorySection(ctx);

  // 构建深度信息
  const depthInfo = buildDepthInfo(ctx);

  const systemPrompt = `${BASE_INSTRUCTION}

${masterSection}

${fusionHint}

${girlContext}

${clientHint}

${strategyHint}

${historySection}

${depthInfo}
`.trim();

  const userPrompt = `【用户情况】
${question}
`;

  return { systemPrompt, userPrompt };
}

/**
 * 构建单个教练视角（不暴露名字）
 */
function buildMasterSection(skill) {
  const principles = skill.principles || [];

  const principlesText = principles.map(p => {
    if (p.steps && Array.isArray(p.steps)) {
      const stepsText = p.steps.map((s, i) => {
        const stepName = typeof s === 'string' ? s : s.name;
        const question = s.question || '';
        return `  ${i + 1}. ${stepName}${question ? ` - ${question}` : ''}`;
      }).join('\n');
      return `[框架] ${p.name}：${p.description || ''}\n${stepsText}`;
    } else {
      return `[原则] ${p.name}：${p.description || ''} | ${p.rule || ''}`;
    }
  }).join('\n');

  return `
[框架组]
${principlesText}
`;
}

/**
 * 获取 Agent 元信息
 */
function getAgentMeta() {
  return {
    name: 'SituationAgent',
    displayName: '情况咨询',
    description: '分析用户描述的情况，判断关系窗口，给出具体行动建议',
    routeTypes: ['situation'],
    needsHistory: true,
    needsGirlProfile: false,
    needsClientProfile: true,
  };
}

module.exports = {
  buildPrompt,
  getAgentMeta,
};

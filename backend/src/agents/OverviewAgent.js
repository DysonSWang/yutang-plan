/**
 * OverviewAgent - 全局概览 Agent
 *
 * 职责：给出追爱整体情况、各女生状态、优先级和推进计划
 *
 * 特点：
 * - 多女生汇总视角
 * - 优先级排序
 * - 全局策略建议
 */

const prisma = require('../prisma');
const { buildClientHint, RESPONSE_FORMAT } = require('./contextBuilder');

// ---- 基础指令 ----
const OVERVIEW_INSTRUCTION = `你是追爱AI情感教练，给出追爱整体情况和推进建议。

${RESPONSE_FORMAT}

数据说明：
- 热度(tensionScore)：1-10分，5以下偏低，7以上偏高，表示女生对你的好感程度
- 亲密度(intimacyLevel)：1-5级，1-2为初期，3为暧昧，4-5为亲密
- 最后联系：距离上次互动的天数，超过3天需要关注
- 今天是星期几：${new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

覆盖维度：
1. 各女生当前状态概览（热度、阶段、近期互动）
2. 优先级最高的事项（本周最值得投入的女生）
3. 全局策略建议（时间精力如何分配）
4. 风险预警（是否有需要注意的关系状态）

回复格式（简洁有条理）：
【追爱概览】总共N个女生，X个热度>5的，Y个超过3天未联系的
【逐个状态】每个女生一句话概括当前状态（热度、阶段、关键信号）
【重点关注】优先级最高的1-2个女生及原因
【本周建议】本周重点推进方向（结合今天是周几）
【风险提示】超过5天未联系或热度骤降的女生`;

/**
 * 构建 OverviewAgent 的 prompt
 * @param {string} userQuestion - 用户输入
 * @param {UnifiedContext} ctx - 统一上下文
 * @param {Object} opts - { clientId }
 */
async function buildPrompt(userQuestion, ctx, opts = {}) {
  const { clientId } = opts;

  // 加载所有女生的汇总信息
  let girlsOverview = '';
  if (clientId) {
    try {
      const girls = await prisma.girl.findMany({
        where: { clientId: clientId },
        select: {
          name: true,
          relationshipStage: true,
          tensionScore: true,
          intimacyLevel: true,
          lastContact: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      if (girls.length > 0) {
        const girlLines = girls.map((g, i) => {
          const daysAgo = g.lastContact
            ? Math.floor((Date.now() - new Date(g.lastContact).getTime()) / (1000 * 60 * 60 * 24))
            : null;
          const lastContactStr = daysAgo !== null
            ? (daysAgo === 0 ? '今天' : `${daysAgo}天前`)
            : '未知';
          return `${i + 1}. ${g.name || '未知'} | ${g.relationshipStage || '未设置'} | 热度${g.tensionScore || 5}/10 | 亲密度${g.intimacyLevel || 1} | 最后联系${lastContactStr}`;
        }).join('\n');
        girlsOverview = `【追爱女生列表】（共${girls.length}个）\n${girlLines}`;
      }
    } catch (e) {
      console.warn('[OverviewAgent] 加载女生列表失败:', e.message);
    }
  }

  const clientHint = buildClientHint(ctx);

  const systemPrompt = `${OVERVIEW_INSTRUCTION}

${girlsOverview}

${clientHint}
`.trim();

  const userPrompt = `【用户问题】
${userQuestion}
`;

  return { systemPrompt, userPrompt };
}

/**
 * 获取 Agent 元信息
 */
function getAgentMeta() {
  return {
    name: 'OverviewAgent',
    displayName: '全局概览',
    description: '给出追爱整体情况、各女生状态和推进计划',
    routeTypes: ['overview'],
    needsHistory: false,
    needsGirlProfile: false,
    needsClientProfile: false,
    needsAllGirls: true,
  };
}

module.exports = {
  buildPrompt,
  getAgentMeta,
};

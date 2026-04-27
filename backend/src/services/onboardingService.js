/**
 * 入职初始化服务 - M007 S05
 *
 * 客户完成入职引导后，根据收集的信息生成初始战略档案。
 * 调用AI生成: clientBestApproach, clientRecommendedTopics,
 * clientRiskFactors, clientUpgradeConditions, clientStrategicNotes
 */
const { getAIConfig } = require('../config');

/**
 * 生成初始战略档案（AI驱动）
 */
async function generateStrategicProfile(onboardingData) {
  const aiConfig = getAIConfig();
  if (!aiConfig) {
    return {
      clientBestApproach: null,
      clientRecommendedTopics: null,
      clientRiskFactors: null,
      clientUpgradeConditions: null,
      clientStrategicNotes: null,
      generated: false,
    };
  }

  const {
    nickname, age, occupation, emotionalGoal, relationshipGoal,
    personality, emotionalMaturityLevel, learningAbility,
    clientType, pacePreference, antiFrustrationLevel,
    eqLevel, communicationStyle, profileBio
  } = onboardingData;

  const prompt = `你是两性关系运营顾问，负责根据新客户入职信息生成个性化战略档案。

【客户基本信息】
- 昵称: ${nickname || '未知'}
- 年龄: ${age || '未知'}
- 职业: ${occupation || '未知'}
- 感情诉求: ${emotionalGoal || '未知'}
- 关系目标: ${relationshipGoal || '未知'}
- 性格/MBTI: ${personality || '未知'}
- 情感成熟度: ${emotionalMaturityLevel || 5}/10
- 情商水平: ${eqLevel || 5}/10
- 学习能力: ${learningAbility || '中'}
- 客户类型: ${clientType || '未知'}
- 节奏偏好: ${pacePreference || '未知'}
- 抗挫折能力: ${antiFrustrationLevel || 5}/10
- 沟通风格: ${communicationStyle || '未知'}
- 自我介绍: ${profileBio || '无'}

请输出 JSON（只输出JSON，不要其他文字）：
{
  "clientBestApproach": "最适合这个客户的追女生策略一句话概括，如：真诚型直接进攻/慢热型先做朋友/包装型高价值展示",
  "clientRecommendedTopics": ["话题1", "话题2", "话题3"],
  "clientRiskFactors": ["风险点1", "风险点2"],
  "clientUpgradeConditions": ["升级条件1", "升级条件2"],
  "clientStrategicNotes": "100字以内的个性化战略备注，包括适合的开场白风格、聊天节奏建议、注意事项"
}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 800
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) {
      console.warn('[Onboarding] AI 调用失败:', response.status);
      return { clientBestApproach: null, clientRecommendedTopics: null, clientRiskFactors: null, clientUpgradeConditions: null, clientStrategicNotes: null, generated: false };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';

    try {
      const profile = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      return { ...profile, generated: true };
    } catch {
      console.warn('[Onboarding] AI 响应解析失败:', content.slice(0, 100));
      return { clientBestApproach: null, clientRecommendedTopics: null, clientRiskFactors: null, clientUpgradeConditions: null, clientStrategicNotes: null, generated: false };
    }
  } catch (e) {
    console.warn('[Onboarding] AI 生成失败:', e.message);
    return { clientBestApproach: null, clientRecommendedTopics: null, clientRiskFactors: null, clientUpgradeConditions: null, clientStrategicNotes: null, generated: false };
  }
}

module.exports = {
  generateStrategicProfile,
};

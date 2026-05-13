/**
 * 聊天历史分析服务
 * 分析聊天记录，生成摘要和双方风格分析
 */
const { getVLModelConfig } = require('../config');

/**
 * 分析聊天历史，生成摘要和双方风格分析
 * @param {Array} messages - [{role: "girl"|"user", content: "...", timestamp?: "..."}]
 * @param {Object} girlProfile - 女生档案摘要（可选）
 * @returns {Object} { chatSummary, importAnalysis }
 */
async function analyzeChatHistory(messages, girlProfile = null) {
  const config = getVLModelConfig();
  if (!config) {
    throw new Error('多模态AI未配置');
  }

  // 类型验证：确保 girlProfile 是对象或 null
  if (girlProfile && typeof girlProfile !== 'object') {
    girlProfile = null;
  }

  // 构建对话文本
  const chatText = messages.map(m => {
    const role = m.role === 'girl' ? '女生' : '用户';
    const time = m.timestamp ? `${m.timestamp}` : '';
    return `${role}${time ? ` (${time})` : ''}: ${m.content}`;
  }).join('\n');

  const profileContext = girlProfile
    ? `\n女生档案：${JSON.stringify(girlProfile, null, 2)}`
    : '';

  const prompt = `你是童锦程，两性关系专家。请分析以下聊天记录：

${chatText}
${profileContext}

只输出 JSON，不要其他内容：
{
  "chatSummary": "2-3句话概括对话氛围和关系状态",
  "girlStyle": "女生聊天风格描述（语气、用词、回复特点）",
  "userStyle": "用户聊天风格描述（语气、用词、回复特点）",
  "problems": ["问题点1", "问题点2", "问题点3"],
  "suggestions": ["改进建议1", "改进建议2", "改进建议3"]
}`;

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`聊天分析失败: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // 解析JSON响应
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.warn('[ChatAnalyzer] JSON parse failed, using fallback');
  }

  return {
    chatSummary: '聊天记录分析完成',
    importAnalysis: {
      girlStyle: '风格分析中',
      userStyle: '风格分析中',
      problems: [],
      suggestions: []
    }
  };
}

/**
 * 根据消息列表生成简要摘要（用于最近消息展示）
 */
function generateSimpleSummary(messages, maxMessages = 20) {
  if (!messages || messages.length === 0) return '';
  const recent = messages.slice(-maxMessages);
  return recent.map(m => {
    const role = m.role === 'girl' ? '她' : '我';
    return `${role}: ${m.content.substring(0, 50)}${m.content.length > 50 ? '...' : ''}`;
  }).join('\n');
}

module.exports = { analyzeChatHistory, generateSimpleSummary };

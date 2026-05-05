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

  // 构建对话文本
  const chatText = messages.map(m => {
    const role = m.role === 'girl' ? '女生' : '用户';
    const time = m.timestamp ? `${m.timestamp}` : '';
    return `${role}${time ? ` (${time})` : ''}: ${m.content}`;
  }).join('\n');

  const profileContext = girlProfile
    ? `\n女生档案：${JSON.stringify(girlProfile, null, 2)}`
    : '';

  const prompt = `你是一位资深恋爱教练。请分析以下聊天记录：

${chatText}
${profileContext}

请输出以下分析结果：

【聊天摘要】
简要描述这段对话的整体氛围、话题走向、关系状态（2-3句话）

【女生风格】
描述女生的聊天风格：语气、用词习惯、回复特点（如：简短直接/热情主动/冷淡慢热）

【用户风格】
描述用户的聊天风格：语气、用词习惯、回复特点

【问题点】
列出这段对话中的1-3个问题点（如：回复太长/太频繁/话题单一/过于追问）

【改进建议】
针对上述问题，给出1-3条具体可执行的改进建议

请用JSON格式输出：
{
  "chatSummary": "...",
  "importAnalysis": {
    "girlStyle": "...",
    "userStyle": "...",
    "problems": ["...", "..."],
    "suggestions": ["...", "..."]
  }
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

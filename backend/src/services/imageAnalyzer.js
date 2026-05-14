/**
 * 图片分析服务 - 调用千问多模态模型分析截图
 */
const { getVLModelConfig } = require('../config');

const IMAGE_ANALYSIS_TIMEOUT = 90000; // 图片分析 90 秒超时

/**
 * 分析图片内容，识别类型并给出建议
 * @param {string} imageBase64 - base64编码的图片（data:image/jpeg;base64,xxx）
 * @param {string} userMessage - 用户可选配的文字说明
 * @returns {Object} { type, content }
 */
async function analyzeImage(imageBase64, userMessage = '') {
  const config = getVLModelConfig();
  if (!config) {
    throw new Error('多模态AI未配置');
  }

  const userContent = userMessage
    ? `\n用户补充说明：${userMessage}`
    : '';

  const prompt = `你是童锦程，两性关系专家。用户上传了一张截图。${userContent}

只输出 JSON，不要其他内容：
{
  "type": "chat_screenshot/moment_screenshot/other",
  "summary": "截图内容概述（50字内）",
  "analysis": "2-3句话分析内容",
  "suggestions": ["建议1", "建议2", "建议3"]
}`;

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageBase64 } }
      ]
    }
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_ANALYSIS_TIMEOUT);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: 8000,
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`AI分析失败: ${response.status} - ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 简单解析类型
    let type = '其他';
    if (content.includes('聊天记录')) type = '聊天记录';
    else if (content.includes('朋友圈')) type = '朋友圈';

    return { type, content };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('图片分析超时（90秒），请尝试压缩图片后重试');
    }
    throw err;
  }
}

module.exports = { analyzeImage };
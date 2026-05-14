/**
 * 图片分析服务 - 调用千问多模态模型分析截图
 */
const { getTextModelConfig, getVLModelConfig } = require('../config');

const IMAGE_ANALYSIS_TIMEOUT = 90000; // 图片分析 90 秒超时
const DESCRIBE_TIMEOUT = 60000; // 图片描述 60 秒超时

/**
 * 快速提取图片内容描述（VL模型，~15s）
 * 用于两步流式：先识别图片，再作为文本上下文走流式输出
 * @param {string} imageBase64 - base64编码的图片
 * @returns {string} 图片内容描述文本
 */
async function describeImage(imageBase64) {
  const config = getVLModelConfig();
  if (!config) {
    throw new Error('多模态AI未配置');
  }

  const prompt = `请详细描述这张图片的内容。要求：
1. 如果包含聊天记录，逐条识别每条消息的发送方和内容
2. 如果包含朋友圈，识别发布内容和评论
3. 如果包含其他文字信息，全部识别
4. 描述图片中的场景、人物、表情等视觉信息

请用中文回答，尽可能详细和准确。`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DESCRIBE_TIMEOUT);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ]
        }],
        max_tokens: 4000,
        temperature: 0.3
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`图片识别失败: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('图片识别超时，请压缩图片后重试');
    }
    throw err;
  }
}

/**
 * 分析图片内容，识别类型并给出建议（兼容旧接口）
 * @param {string} imageBase64 - base64编码的图片（data:image/jpeg;base64,xxx）
 * @param {string} userMessage - 用户可选配的文字说明
 * @returns {Object} { type, content }
 */
async function analyzeImage(imageBase64, userMessage = '') {
  const config = getTextModelConfig();
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
        max_tokens: 20000,
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

module.exports = { analyzeImage, describeImage };
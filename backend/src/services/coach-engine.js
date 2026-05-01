/**
 * Coach Engine - AI Coach 运行时，支持 Tool Use
 * 处理多轮对话中的工具调用
 */

const { toolDefinitions, executeTool } = require('../coaches/skills');
const { getAIConfig } = require('../config');

// 最大工具调用次数（防止无限循环）
const MAX_TOOL_CALLS = 5;

/**
 * 调用 AI，支持工具调用
 * @param {Array} messages - 对话历史
 * @param {Object} options - 配置选项
 * @returns {Object} { content, toolCalls, finishReason }
 */
async function callAI(messages, options = {}) {
  const aiConfig = getAIConfig();
  const { tools = [], temperature = 0.7, maxTokens = 4000 } = options;

  const requestBody = {
    model: aiConfig.model,
    messages,
    temperature,
    max_tokens: maxTokens
  };

  // 如果有工具，添加到请求中
  if (tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }

  const response = await fetch(aiConfig.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${aiConfig.key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI调用失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;

  return {
    content: message?.content || '',
    toolCalls: message?.tool_calls || [],
    finishReason: data.choices?.[0]?.finish_reason
  };
}

/**
 * 处理带工具的 AI 对话
 * @param {Array} messages - 对话历史（会被修改）
 * @param {Object} options - { tools, coachConfig, context }
 * @returns {string} AI 的最终回复
 */
async function chatWithTools(messages, options = {}) {
  const { tools: availableTools = [], coachConfig = {} } = options;

  // 获取教练配置的 tools
  const coachTools = coachConfig.tools || [];
  const toolsToUse = coachTools
    .map(t => availableTools.find(at => at?.function?.name === t))
    .filter(Boolean);

  let toolCallCount = 0;
  let lastContent = '';

  while (toolCallCount < MAX_TOOL_CALLS) {
    const result = await callAI(messages, {
      tools: toolsToUse,
      temperature: coachConfig.settings?.temperature || 0.7,
      maxTokens: coachConfig.settings?.maxTokens || 4000
    });

    lastContent = result.content;

    // 如果没有工具调用，返回内容
    if (result.toolCalls.length === 0) {
      return lastContent;
    }

    console.log(`[CoachEngine] AI 调用了 ${result.toolCalls.length} 个工具`);

    // 添加 AI 的回复到历史
    messages.push({
      role: 'assistant',
      content: result.content,
      tool_calls: result.toolCalls
    });

    // 执行每个工具调用
    for (const toolCall of result.toolCalls) {
      toolCallCount++;
      if (toolCallCount >= MAX_TOOL_CALLS) {
        console.log('[CoachEngine] 达到最大工具调用次数');
        break;
      }

      const { name, arguments: argsStr } = toolCall.function;
      let args;
      try {
        args = JSON.parse(argsStr);
      } catch {
        args = {};
      }

      console.log(`[CoachEngine] 执行工具: ${name}`, JSON.stringify(args).substring(0, 100));

      const toolResult = await executeTool(name, args);

      // 添加工具结果到历史
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult)
      });
    }
  }

  return lastContent || '工具调用次数已达上限';
}

/**
 * 简单 AI 对话（无工具）
 */
async function simpleChat(messages, options = {}) {
  const result = await callAI(messages, options);
  return result.content;
}

module.exports = {
  callAI,
  chatWithTools,
  simpleChat,
  toolDefinitions
};

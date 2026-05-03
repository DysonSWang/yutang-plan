/**
 * 共享配置 - 所有服务从这里读取环境变量
 * 不要在代码中硬编码任何 secrets
 */

require('dotenv').config();

// JWT 密钥（生产环境必须设置）
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('[Config] JWT_SECRET 未设置，使用临时密钥（仅开发环境）');
}

// DeepSeek（文本 AI 唯一提供商）
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// 通义千问（文本 + 图片统一用 qwen3.6-plus 多模态）
const DASHSCOPE_API_KEY = process.env.DASH_SCOPE_API_KEY;
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

// 端口
const PORT = parseInt(process.env.PORT, 10) || 3005;

// 服务器基础URL（用于生成完整图片URL）
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

/**
 * 获取文本 AI 配置
 * @param {'pro'|'flash'} mode - pro=深度模式, flash=快速模式
 */
function getAIConfig(mode = 'pro') {
  if (!DEEPSEEK_API_KEY) {
    console.error('[Config] DEEPSEEK_API_KEY 未设置，AI 功能将不可用');
    return null;
  }
  return {
    url: DEEPSEEK_API_URL,
    key: DEEPSEEK_API_KEY,
    model: mode === 'flash' ? 'deepseek-chat' : 'deepseek-v4-pro'
  };
}

function getVLModelConfig() {
  // DashScope 多模态模型（图片分析）
  if (DASHSCOPE_API_KEY) {
    return {
      url: DASHSCOPE_API_URL,
      key: DASHSCOPE_API_KEY,
      model: 'qwen3.6-plus'
    };
  }
  return null;
}

function getTextModelConfig() {
  // DashScope 多模态模型（文字提取，复用同一模型）
  if (DASHSCOPE_API_KEY) {
    return {
      url: DASHSCOPE_API_URL,
      key: DASHSCOPE_API_KEY,
      model: 'qwen3.6-plus'
    };
  }
  // 降级到 DeepSeek
  return getAIConfig('flash');
}

module.exports = {
  JWT_SECRET,
  DEEPSEEK_API_KEY,
  DEEPSEEK_API_URL,
  DASHSCOPE_API_KEY,
  DASHSCOPE_API_URL,
  PORT,
  BASE_URL,
  getAIConfig,
  getTextModelConfig,
  getVLModelConfig
};

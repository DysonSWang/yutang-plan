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

// AI Provider
const AI_PROVIDER = process.env.AI_PROVIDER || 'dashscope';

// 智谱AI
const ZHIPU_API_KEY = process.env.ZHIPUAI_API_KEY;
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// 通义千问
const DASHSCOPE_API_KEY = process.env.DASH_SCOPE_API_KEY;
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

// 端口
const PORT = parseInt(process.env.PORT, 10) || 3005;

// 服务器基础URL（用于生成完整图片URL）
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

function getAIConfig() {
  if (AI_PROVIDER === 'dashscope' && DASHSCOPE_API_KEY) {
    // 使用 qwen3.6-flash 收费模型
    return {
      url: DASHSCOPE_API_URL,
      key: DASHSCOPE_API_KEY,
      model: 'qwen3.6-flash'
    };
  }
  if (ZHIPU_API_KEY) {
    return {
      url: ZHIPU_API_URL,
      key: ZHIPU_API_KEY,
      model: 'glm-4'
    };
  }
  return null;
}

function getVLModelConfig() {
  // DashScope VL 模型用于图片分析
  if (DASHSCOPE_API_KEY) {
    return {
      url: DASHSCOPE_API_URL,
      key: DASHSCOPE_API_KEY,
      model: 'qwen-vl-plus'
    };
  }
  return null;
}

module.exports = {
  JWT_SECRET,
  AI_PROVIDER,
  ZHIPU_API_KEY,
  ZHIPU_API_URL,
  DASHSCOPE_API_KEY,
  DASHSCOPE_API_URL,
  PORT,
  BASE_URL,
  getAIConfig,
  getVLModelConfig
};

/**
 * E2E 测试辅助函数
 * 转发自 screenshot-setup.js（那里统一维护）
 */
const ss = require('./screenshot-setup');

module.exports = {
  BASE_URL: ss.BASE_URL,
  API_BASE: ss.API_BASE,
  operatorLogin: ss.operatorLogin,
  clientLogin: ss.clientLogin,
  getOperatorToken: ss.getOperatorToken,
  getClientToken: ss.getClientToken,
};

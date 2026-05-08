/**
 * JSON 解析安全封装 - 防止 parse 失败导致服务崩溃
 */

/**
 * 安全解析 JSON
 * @param {string} str - 要解析的字符串
 * @param {*} defaultValue - 解析失败时返回的默认值
 * @returns {*} 解析成功返回对象，失败返回默认值
 */
function safeJsonParse(str, defaultValue = null) {
  if (!str || typeof str !== 'string') {
    return defaultValue;
  }
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn('[SafeJSON] Parse failed:', e.message);
    return defaultValue;
  }
}

/**
 * 安全序列化 JSON
 * @param {*} value - 要序列化的值
 * @param {string} defaultValue - 序列化失败时返回的默认值
 * @returns {string} 序列化成功返回JSON字符串，失败返回默认值
 */
function safeJsonStringify(value, defaultValue = '{}') {
  if (value === undefined || typeof value === 'symbol') {
    return defaultValue;
  }
  try {
    return JSON.stringify(value);
  } catch (e) {
    console.warn('[SafeJSON] Stringify failed:', e.message);
    return defaultValue;
  }
}

module.exports = {
  safeJsonParse,
  safeJsonStringify
};
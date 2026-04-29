/**
 * Skill Loader - 加载并解析skill核心数据
 * 安全加载：防止路径遍历攻击
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'skills', 'INDEX.json');
const SKILL_DIR = path.join(__dirname, 'skills');

// 缓存
let configCache = null;
const skillCache = new Map();

/**
 * 加载配置文件
 */
function loadConfig() {
  if (configCache) {
    return configCache;
  }

  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    try { configCache = JSON.parse(data); } catch (e) { console.error('[Loader] config JSON parse failed:', e.message); configCache = { skills: {}, routing: {} }; }
    return configCache;
  } catch (error) {
    console.error('[Loader] 加载配置文件失败:', error);
    return { skills: {}, routing: {} };
  }
}

/**
 * 加载单个skill（带缓存）
 */
function loadSkill(skillId) {
  if (skillCache.has(skillId)) {
    return skillCache.get(skillId);
  }

  const config = loadConfig();
  const skillInfo = config.skills?.[skillId];

  if (!skillInfo) {
    return null;
  }

  try {
    const filePath = path.join(SKILL_DIR, skillInfo.file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    skillCache.set(skillId, data);
    return data;
  } catch (error) {
    console.error(`[Loader] 加载skill失败: ${skillId}`, error);
    return null;
  }
}

/**
 * 批量加载多个skill
 */
function loadSkills(skillIds) {
  return skillIds.map(id => loadSkill(id)).filter(Boolean);
}

/**
 * 加载所有skill
 */
function loadAllSkills() {
  const config = loadConfig();
  const skillIds = Object.keys(config.skills || {});

  return skillIds.map(id => loadSkill(id)).filter(Boolean);
}

/**
 * 获取路由配置
 */
function getRoutingConfig() {
  const config = loadConfig();
  return config.routing || {};
}

/**
 * 安全加载（防止路径遍历）
 */
function safeLoadSkill(skillId) {
  const config = loadConfig();
  const validIds = Object.keys(config.skills || {});

  if (!validIds.includes(skillId)) {
    return null;
  }

  const skillInfo = config.skills[skillId];
  const filePath = path.join(SKILL_DIR, skillInfo.file);

  // 防止路径遍历
  if (!filePath.startsWith(SKILL_DIR)) {
    return null;
  }

  return loadSkill(skillId);
}

/**
 * 清除缓存（用于热更新）
 */
function clearCache() {
  configCache = null;
  skillCache.clear();
}

module.exports = {
  loadSkill,
  loadSkills,
  loadAllSkills,
  getRoutingConfig,
  safeLoadSkill,
  clearCache
};

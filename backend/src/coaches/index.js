/**
 * Coach Loader - 动态加载教练配置
 * 参考 Claude Code 的 Skill 加载机制
 */

const fs = require('fs');
const path = require('path');

// 加载所有教练配置
const coachesDir = path.join(__dirname, 'configs');
const coachFiles = fs.readdirSync(coachesDir).filter(f => f.endsWith('.js'));

const coaches = {};
for (const file of coachFiles) {
  const coach = require(path.join(coachesDir, file));
  coaches[coach.id] = coach;
}

// 获取教练配置
function getCoach(coachId) {
  return coaches[coachId] || coaches.general;
}

// 获取所有教练列表
function listCoaches() {
  return Object.values(coaches).map(c => ({
    id: c.id,
    name: c.name,
    description: c.description
  }));
}

// 获取教练的系统提示
function getSystemPrompt(coachId) {
  const coach = getCoach(coachId);
  return coach.systemPrompt;
}

// 获取教练配置
function getCoachConfig(coachId) {
  return getCoach(coachId);
}

module.exports = {
  coaches,
  getCoach,
  listCoaches,
  getSystemPrompt,
  getCoachConfig
};

/**
 * 版本检测接口
 * 用于 App 版本更新检测
 */
const express = require('express');
const router = express.Router();

const { success } = require('../utils/response');

// 版本配置（每次发版时更新）
// upgradeType: 'force' | 'suggest' | 'none'
const VERSION_CONFIG = {
  latestVersion: '1.0.2',
  minVersion: '1.0.0',      // 强制升级版本，低于此版本必须更新
  downloadUrl: 'https://www.pgyer.com/zhuiaiai',
  updateDescription: '新版本发布，体验优化',
  buildNumber: 3
};

// 解析版本号
function parseVersion(v) {
  const parts = v.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
}

router.get('/check', (req, res) => {
  const { version, build } = req.query;

  console.log(`[Version] 检测版本: ${version || '未知'} (build: ${build || '未知'})`);

  // 如果没有传入版本，默认返回最新版本信息
  if (!version) {
    return success(res, {
      hasUpdate: true,
      upgradeType: 'none',
      ...VERSION_CONFIG
    });
  }

  const current = parseVersion(version);
  const latest = parseVersion(VERSION_CONFIG.latestVersion);

  // 比较版本
  const isNewer = (
    current.major < latest.major ||
    (current.major === latest.major && current.minor < latest.minor) ||
    (current.major === latest.major && current.minor === latest.minor && current.patch < latest.patch)
  );

  const isForced = parseVersion(version).major < parseVersion(VERSION_CONFIG.minVersion).major ||
    (parseVersion(version).major === parseVersion(VERSION_CONFIG.minVersion).major &&
     parseVersion(version).minor < parseVersion(VERSION_CONFIG.minVersion).minor);

  let upgradeType = 'none';
  if (isNewer) {
    upgradeType = isForced ? 'force' : 'suggest';
  }

  return success(res, {
    hasUpdate: isNewer,
    upgradeType,
    latestVersion: VERSION_CONFIG.latestVersion,
    minVersion: VERSION_CONFIG.minVersion,
    downloadUrl: VERSION_CONFIG.downloadUrl,
    updateDescription: VERSION_CONFIG.updateDescription,
    buildNumber: VERSION_CONFIG.buildNumber
  });
});

module.exports = router;

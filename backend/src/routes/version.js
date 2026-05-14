/**
 * 版本检测接口
 * 用于 App 版本更新检测
 */
const express = require('express');
const router = express.Router();

// 版本配置（每次发版时更新）
// upgradeType: 'force' | 'suggest' | 'none'
const VERSION_CONFIG = {
  latestVersion: '1.5.6',
  minVersion: '1.5.3',
  downloadUrl: 'https://zhuiai.club/apk/app.apk',
  updateDescription: '体验优化',
  buildNumber: 48,
  apkSize: '约 2.8 MB'
};

router.get('/check', (req, res) => {
  const { version, build } = req.query;

  console.log(`[Version] 检测版本: ${version || '未知'} (build: ${build || '未知'})`);

  // 如果没有传入版本，默认返回最新版本信息
  if (!version) {
    return res.json({
      code: 0,
      data: {
        hasUpdate: true,
        upgradeType: 'none',
        ...VERSION_CONFIG
      }
    });
  }

  // 解析版本号
  const parseVersion = (v) => {
    const parts = v.split('.').map(Number);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0
    };
  };

  const current = parseVersion(version);
  const latest = parseVersion(VERSION_CONFIG.latestVersion);

  // 比较版本
  const isNewer = (
    current.major < latest.major ||
    (current.major === latest.major && current.minor < latest.minor) ||
    (current.major === latest.major && current.minor === latest.minor && current.patch < latest.patch)
  );

  const min = parseVersion(VERSION_CONFIG.minVersion);
  const isForced = current.major < min.major ||
    (current.major === min.major && current.minor < min.minor) ||
    (current.major === min.major && current.minor === min.minor && current.patch < min.patch);

  let upgradeType = 'none';
  if (isNewer) {
    upgradeType = isForced ? 'force' : 'suggest';
  }

  res.json({
    code: 0,
    data: {
      hasUpdate: isNewer,
      upgradeType,
      latestVersion: VERSION_CONFIG.latestVersion,
      minVersion: VERSION_CONFIG.minVersion,
      downloadUrl: VERSION_CONFIG.downloadUrl,
      updateDescription: VERSION_CONFIG.updateDescription,
      buildNumber: VERSION_CONFIG.buildNumber,
      apkSize: VERSION_CONFIG.apkSize
    }
  });
});

module.exports = router;

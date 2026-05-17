/**
 * 版本检测接口
 * 用于 App 版本更新检测
 */
const express = require('express');
const router = express.Router();

// 版本配置（每次发版时更新）
// upgradeType: 'force' | 'suggest' | 'silent' | 'none'
//   - force:  强制更新，用户必须升级才能使用
//   - suggest: 建议更新，弹窗提示但可跳过
//   - silent:  静默更新，不弹窗提示，仅在"关于"页面显示小红点
//   - none:   无更新
const VERSION_CONFIG = {
  latestVersion: '1.6.5',
  minVersion: '1.5.3',
  downloadUrl: 'https://zhuiai.club/apk/zhuiai.apk',
  updateDescription: '体验优化',
  buildNumber: 57,
  apkSize: '约 3.5 MB',
  upgradeType: 'silent'  // 发版时修改：'force' | 'suggest' | 'silent'
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
        upgradeType: VERSION_CONFIG.upgradeType || 'suggest',
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
    if (isForced) {
      upgradeType = 'force';
    } else {
      // 使用配置的升级类型，支持 silent 模式
      upgradeType = VERSION_CONFIG.upgradeType || 'suggest';
    }
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

// ============================================================
// 健康检查接口（用于监控）
// ============================================================
router.get('/health', async (req, res) => {
  const startTime = Date.now();
  let dbStatus = 'ok';
  let dbLatency = 0;

  // 检查数据库连接
  try {
    const prisma = require('../prisma');
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - dbStart;
  } catch (err) {
    dbStatus = 'error';
    console.error('[Health] 数据库检查失败:', err.message);
  }

  const latency = Date.now() - startTime;
  const memoryUsage = process.memoryUsage();

  res.json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    db: dbStatus,
    latency,
    dbLatency,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024)
    },
    version: VERSION_CONFIG.latestVersion
  });
});

module.exports = router;

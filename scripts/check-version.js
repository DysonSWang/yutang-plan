#!/usr/bin/env node
/**
 * 发布前版本一致性检查
 * 解析文本而非 import，避免 ESM 问题
 */
const fs = require('fs');
const path = require('path');

const versionJsPath = path.join(__dirname, '../frontend/src/utils/version.js');
const buildGradlePath = path.join(__dirname, '../frontend/android/app/build.gradle');
const backendVersionPath = path.join(__dirname, '../backend/src/routes/version.js');

const versionJs = fs.readFileSync(versionJsPath, 'utf8');
const versionMatch = versionJs.match(/VERSION\s*=\s*'([^']+)'/);
const buildMatch = versionJs.match(/BUILD\s*=\s*(\d+)/);

const TARGET_VERSION = versionMatch ? versionMatch[1] : null;
const TARGET_BUILD = buildMatch ? parseInt(buildMatch[1]) : null;

let errors = [];

console.log('=== 追AI 发布前版本检查 ===\n');

if (!TARGET_VERSION || !TARGET_BUILD) {
  console.log('❌ 无法解析 frontend/src/utils/version.js');
  process.exit(1);
}

console.log(`  frontend/src/utils/version.js  →  ${TARGET_VERSION} (build ${TARGET_BUILD})`);

// 1. 检查 build.gradle
const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
const bgVersionMatch = buildGradle.match(/versionName\s+"([^"]+)"/);
const bgCodeMatch = buildGradle.match(/versionCode\s+(\d+)/);

if (bgVersionMatch && bgVersionMatch[1] !== TARGET_VERSION) {
  errors.push(`❌ build.gradle versionName: ${bgVersionMatch[1]}  ≠  ${TARGET_VERSION}`);
}
if (bgCodeMatch && parseInt(bgCodeMatch[1]) !== TARGET_BUILD) {
  errors.push(`❌ build.gradle versionCode: ${bgCodeMatch[1]}  ≠  ${TARGET_BUILD}`);
} else {
  console.log('  build.gradle               →  ✅ 一致');
}

// 2. 检查 backend
const backendVersion = fs.readFileSync(backendVersionPath, 'utf8');
const beVersionMatch = backendVersion.match(/latestVersion:\s+'([^']+)'/);
const beBuildMatch = backendVersion.match(/buildNumber:\s+(\d+)/);
const beUrlMatch = backendVersion.match(/downloadUrl:\s+'([^']+)'/);

if (beVersionMatch && beVersionMatch[1] !== TARGET_VERSION) {
  errors.push(`❌ backend latestVersion: ${beVersionMatch[1]}  ≠  ${TARGET_VERSION}`);
}
if (beBuildMatch && parseInt(beBuildMatch[1]) !== TARGET_BUILD) {
  errors.push(`❌ backend buildNumber: ${beBuildMatch[1]}  ≠  ${TARGET_BUILD}`);
} else {
  console.log('  backend latestVersion/buildNumber →  ✅ 一致');
}

if (beUrlMatch && (beUrlMatch[1].includes('zhuiai.club/apk/') || beUrlMatch[1].includes('oss-cn-hangzhou.aliyuncs.com/apk/'))) {
  console.log('  backend downloadUrl          →  ✅ 自建托管（OSS）');
} else if (beUrlMatch) {
  errors.push(`❌ backend downloadUrl 未指向自建托管: ${beUrlMatch[1]}`);
} else {
  errors.push('❌ backend downloadUrl 缺失');
}

if (errors.length > 0) {
  console.log('\n发现版本不一致，请先修复:\n');
  errors.forEach(e => console.log('  ' + e));
  console.log('\n修复后重新运行此脚本。\n');
  process.exit(1);
} else {
  console.log('\n✅ 版本检查通过，可以发布！\n');
  process.exit(0);
}

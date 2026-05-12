/**
 * 构建完成后处理 APK
 * - 复制为 app.apk（稳定下载路径，每次发版覆盖）
 * - 保留一份带版本号的备份（如 zhuiai-1.5.1.apk）
 */
import { readFileSync, copyFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 读取 versionName
const buildGradlePath = path.join(rootDir, 'android/app/build.gradle');
const buildGradle = readFileSync(buildGradlePath, 'utf-8');
const versionMatch = buildGradle.match(/versionName\s+["']([^"']+)["']/);
const version = versionMatch ? versionMatch[1] : 'unknown';

console.log(`检测到版本: ${version}`);

// APK 输出目录
const apkDir = path.join(rootDir, 'android/app/build/outputs/apk/release');
const sourceApk = path.join(apkDir, 'app-release.apk');
const stableApk = path.join(apkDir, 'app.apk');
const versionedApk = path.join(apkDir, `zhuiai-${version}.apk`);

// 复制为稳定版本 app.apk（每次发版覆盖这个）
copyFileSync(sourceApk, stableApk);
console.log(`✅ APK 已复制为 app.apk（稳定下载路径）`);

// 同时保留一份带版本号的备份
copyFileSync(sourceApk, versionedApk);
console.log(`✅ APK 已备份为 zhuiai-${version}.apk`);

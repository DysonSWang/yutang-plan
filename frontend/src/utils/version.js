/**
 * 版本检测工具
 */
import { App } from '@capacitor/app';
import { captureError } from './frontendErrorCapture';

// 降级版本号（浏览器环境用，实际 App 走 Capacitor 获取原生版本）
const VERSION = '1.2.6';
const BUILD = 36;

export { VERSION, BUILD };

// 检查是否在 Capacitor App 环境中
export function isCapacitorApp() {
  return typeof window !== 'undefined' && window.Capacitor !== undefined;
}

export async function checkVersion() {
  // 仅在 Capacitor App 环境中检测版本
  if (!isCapacitorApp()) {
    return null;
  }

  // 从原生层获取实际 APK 版本（build.gradle versionName / versionCode）
  let appVersion = VERSION;
  let appBuild = BUILD;
  try {
    const info = await App.getInfo();
    appVersion = info.version;
    appBuild = info.build;
  } catch {
    // 降级使用硬编码值
  }

  const apiBase = '';
  let res;
  try {
    res = await fetch(`${apiBase}/api/version/check?version=${appVersion}&build=${appBuild}`);
  } catch (err) {
    captureError(err, { context: 'version_check_fetch', version: appVersion, build: appBuild });
    throw err;
  }

  if (!res.ok) {
    const err = new Error(`Version check HTTP ${res.status}`);
    captureError(err, { context: 'version_check_status', status: res.status, version: appVersion, build: appBuild });
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    captureError(err, { context: 'version_check_parse', version: appVersion, build: appBuild });
    throw err;
  }

  if (data.code !== 0) {
    const err = new Error(`Version check API code ${data.code}`);
    captureError(err, { context: 'version_check_api_code', apiCode: data.code, version: appVersion, build: appBuild });
    throw err;
  }

  return data.data;
}

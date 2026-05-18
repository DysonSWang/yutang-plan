/**
 * 版本检测工具
 */
import { App } from '@capacitor/app';
import { captureError } from './frontendErrorCapture';
import { api } from './api';

// 降级版本号（浏览器环境用，实际 App 走 Capacitor 获取原生版本）
const VERSION = '1.6.6';
const BUILD = 58;

export { VERSION, BUILD };

// 检查是否在 Capacitor App 环境中
export function isCapacitorApp() {
  return typeof window !== 'undefined' && window.Capacitor !== undefined;
}

export async function checkVersion() {
  let appVersion = VERSION;
  let appBuild = BUILD;

  // 优先从 Capacitor App 获取原生版本（APK 环境）
  if (isCapacitorApp()) {
    try {
      const info = await App.getInfo();
      appVersion = info.version;
      appBuild = info.build;
    } catch {
      // 降级使用硬编码值
    }
  }

  // Web 环境也走 API 检测（用硬编码版本）
  // 使用 api.js 的 baseUrl，确保 APK 和 Web 环境都用正确的 API 地址
  let res;
  try {
    res = await fetch(`${api.baseUrl}/api/version/check?version=${appVersion}&build=${appBuild}`);
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

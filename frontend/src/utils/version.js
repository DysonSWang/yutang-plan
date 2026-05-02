/**
 * 版本检测工具
 */
import { captureError } from './frontendErrorCapture';

const VERSION = '1.0.10';  // 当前 App 版本，需与后端 VERSION_CONFIG.latestVersion 保持一致
const BUILD = 14;

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

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3005';
  let res;
  try {
    res = await fetch(`${apiBase}/api/version/check?version=${VERSION}&build=${BUILD}`);
  } catch (err) {
    captureError(err, { context: 'version_check_fetch', version: VERSION, build: BUILD });
    throw err;
  }

  if (!res.ok) {
    const err = new Error(`Version check HTTP ${res.status}`);
    captureError(err, { context: 'version_check_status', status: res.status, version: VERSION, build: BUILD });
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    captureError(err, { context: 'version_check_parse', version: VERSION, build: BUILD });
    throw err;
  }

  if (data.code !== 0) {
    const err = new Error(`Version check API code ${data.code}`);
    captureError(err, { context: 'version_check_api_code', apiCode: data.code, version: VERSION, build: BUILD });
    throw err;
  }

  return data.data;
}

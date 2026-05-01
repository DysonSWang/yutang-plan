/**
 * 版本检测工具
 */
const VERSION = '1.0.5';  // 当前 App 版本，需与后端 VERSION_CONFIG.latestVersion 保持一致
const BUILD = 7;

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

  try {
    const res = await fetch(`/api/version/check?version=${VERSION}&build=${BUILD}`);
    const data = await res.json();
    return data.data;
  } catch (err) {
    console.error('[Version] 检测失败:', err);
    return null;
  }
}

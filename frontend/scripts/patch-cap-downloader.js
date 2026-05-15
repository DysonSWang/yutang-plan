// 补丁：CapDownloader 添加 downloadAndInstall 方法 + 改用 app 私有目录下载
// CapDownloader.download() 只入队不等待完成，导致应用内升级安装时"解析包时出问题了"
// downloadAndInstall() 用 BroadcastReceiver 监听下载完成后再打开 APK
// CapDownloader.download() 改用 setDestinationInExternalFilesDir 避免存储权限问题
import { copyFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const patchDir = resolve(__dirname, 'patches');
const destDir = resolve(__dirname,
  '../node_modules/@bricks-soft/cap-downloader/android/src/main/java/bricks/cap/plugins/download');

const patches = ['CapDownloader.java', 'CapDownloaderPlugin.java'];

for (const file of patches) {
  const src = resolve(patchDir, file);
  const dest = resolve(destDir, file);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`已应用补丁: ${file}`);
  } else {
    console.warn(`补丁文件不存在: ${file}，跳过`);
  }
}

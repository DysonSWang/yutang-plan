// 补丁：CapDownloader 添加 downloadAndInstall 方法
// CapDownloader.download() 只入队不等待完成，导致应用内升级安装时"解析包时出问题了"
// downloadAndInstall() 用 BroadcastReceiver 监听下载完成后再打开 APK
import { copyFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, 'patches/CapDownloaderPlugin.java');
const dest = resolve(__dirname,
  '../node_modules/@bricks-soft/cap-downloader/android/src/main/java/bricks/cap/plugins/download/CapDownloaderPlugin.java');

if (existsSync(src)) {
  copyFileSync(src, dest);
  console.log('已应用 CapDownloader downloadAndInstall 补丁');
} else {
  console.warn('CapDownloader 补丁文件不存在，跳过');
}

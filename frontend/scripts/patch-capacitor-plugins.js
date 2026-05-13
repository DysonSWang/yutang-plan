// 追加自定义插件到 capacitor.plugins.json
// npx cap sync 会覆盖此文件，所以每次 sync 后需要重新注入
import { readFileSync, writeFileSync } from 'fs';

const pluginsPath = 'android/app/src/main/assets/capacitor.plugins.json';
const plugins = JSON.parse(readFileSync(pluginsPath, 'utf8'));

const screenshotToggle = {
  pkg: 'screenshot-toggle',
  classpath: 'com.zhuiai.app.ScreenshotTogglePlugin'
};

if (!plugins.some(p => p.pkg === 'screenshot-toggle')) {
  plugins.push(screenshotToggle);
  writeFileSync(pluginsPath, JSON.stringify(plugins, null, '\t') + '\n');
  console.log('已追加 screenshot-toggle 插件');
} else {
  console.log('screenshot-toggle 插件已存在');
}

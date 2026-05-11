const { chromium } = require('/home/admin/zhuiai/frontend/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const baseUrl = 'http://localhost:5181';
  const screenshotDir = '/home/admin/zhuiai/e2e-screenshots/audit';

  // 截图函数
  async function screenshot(name) {
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: false });
      console.log(`Screenshot: ${name}`);
    } catch (e) {
      console.error(`Error capturing ${name}: ${e.message}`);
    }
  }

  // 1. 登录页
  console.log('Capturing login page...');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await screenshot('01-login');

  // 2. 首页 (可能需要登录，重定向到login)
  console.log('Capturing home page...');
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await screenshot('02-home-redirect');

  // 3. 客户端页面 - 如果能获取token的话
  // 由于需要真实登录，先截取admin dashboard外观
  console.log('Capturing admin dashboard mock...');
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await screenshot('03-admin-redirect');

  // 4. 截图 index.html 入口页
  console.log('Capturing index...');
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await screenshot('04-index');

  await browser.close();
  console.log('Done!');
})();

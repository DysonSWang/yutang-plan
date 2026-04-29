/**
 * 截图验证脚本：展示有数据的页面
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5181';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const outDir = '/home/admin/zhuiai/e2e/screenshots-populated';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 客户登录
  await page.goto(`${BASE_URL}/login`);
  await page.waitForTimeout(500);
  const loginBtn = page.locator('button:has-text("登录")').first();
  if (await loginBtn.isVisible()) await loginBtn.click();
  await page.waitForTimeout(500);
  await page.locator('input[type="text"], input:not([type])').first().fill('cl_e2e');
  await page.locator('input[type="password"]').first().fill('cl123456');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
  console.log('Logged in as cl_e2e');

  const pages = [
    { name: '01-dates-with-data', url: '/client/dates' },
    { name: '02-pond-girls-tab', url: '/client/pond' },
    { name: '03-pond-chat-tab', url: '/client/pond' },
  ];

  for (const p of pages) {
    await page.goto(`${BASE_URL}${p.url}`);
    await page.waitForTimeout(2000);

    if (p.name === '03-pond-chat-tab') {
      // 切换到交流记录 tab
      try {
        const tabs = page.locator('[role="tab"]');
        const count = await tabs.count();
        for (let i = 0; i < count; i++) {
          const tab = tabs.nth(i);
          const text = await tab.textContent();
          if (text.includes('交流') || text.includes('聊天')) {
            await tab.click();
            await page.waitForTimeout(1000);
            break;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    const safeName = p.name;
    const filepath = path.join(outDir, `${safeName}.png`);
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`Screenshot: ${safeName}.png`);
  }

  await browser.close();
  console.log('\n✅ Screenshots saved to', outDir);
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});

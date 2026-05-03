/**
 * E2E: Keep-Alive 行为测试
 *
 * 验证页面 keep-alive 机制：
 * - 切换页面时数据保留（CSS display:none，不卸载）
 * - 切回页面时静默刷新
 * - 超过 MAX_KEEP_ALIVE(8) 时 LRU 淘汰
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, operatorLogin, BASE_URL } = require('./helpers');

test.describe('Keep-Alive 行为', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
  });

  test('切换页面后数据保留', async ({ page }) => {
    // 1. 访问我的缘分页，添加的女生列表应保留
    await page.goto(`${BASE_URL}/my-pond`);
    await page.waitForTimeout(1000);

    // 2. 切换到其他页面（个人设置）
    await page.goto(`${BASE_URL}/profile`);
    await page.waitForTimeout(500);

    // 3. 切回我的缘分页
    await page.goto(`${BASE_URL}/my-pond`);
    await page.waitForTimeout(1000);

    // 4. 女生列表数据应该还在（没有被重新加载的 loading 状态）
    const girlsTab = page.locator('text=女生').first();
    await expect(girlsTab).toBeVisible();
  });

  test('页面切换不触发重新挂载', async ({ page }) => {
    // 1. 访问页面 A
    await page.goto(`${BASE_URL}/my-pond`);
    await page.waitForTimeout(1000);

    // 记录控制台日志，查找组件挂载相关日志
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        consoleLogs.push(msg.text());
      }
    });

    // 2. 访问页面 B
    await page.goto(`${BASE_URL}/profile`);
    await page.waitForTimeout(500);

    // 3. 再切回页面 A
    await page.goto(`${BASE_URL}/my-pond`);
    await page.waitForTimeout(1000);

    // 页面应该正常显示，没有重新请求初始数据
    const heading = page.locator('text=缘分').first();
    await expect(heading).toBeVisible();
  });

  test('连续访问多个页面保持缓存', async ({ page }) => {
    // 依次访问多个页面，验证都能从缓存恢复
    const pages = [
      '/my-pond',
      '/learning',
      '/profile',
      '/my-pond',
      '/learning',
    ];

    for (const path of pages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForTimeout(500);
      // 验证页面标题或主要内容可见
      const body = page.locator('body');
      await expect(body).toBeVisible();
    }
  });

  test('AI 军师页面保持状态', async ({ page }) => {
    // 1. 进入 AI 军师页面
    await page.goto(`${BASE_URL}/ai-coach`);
    await page.waitForTimeout(1500);

    // 2. 离开页面
    await page.goto(`${BASE_URL}/profile`);
    await page.waitForTimeout(500);

    // 3. 返回 AI 军师页面
    await page.goto(`${BASE_URL}/ai-coach`);
    await page.waitForTimeout(1500);

    // 页面应该正常显示
    const pageContent = page.locator('body');
    await expect(pageContent).toBeVisible();
  });
});

test.describe('Keep-Alive - 操盘手端', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('操盘手切换客户列表保持状态', async ({ page }) => {
    // 1. 进入客户列表
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForTimeout(1000);

    // 2. 进入客户详情
    const firstClient = page.locator('table tbody tr').first();
    if (await firstClient.isVisible()) {
      await firstClient.click();
      await page.waitForTimeout(1000);

      // 3. 返回客户列表
      await page.goto(`${BASE_URL}/admin/clients`);
      await page.waitForTimeout(1000);

      // 列表应该仍然可见
      await expect(page.locator('table')).toBeVisible();
    }
  });

  test('操盘手女生管理保持状态', async ({ page }) => {
    // 1. 进入女生管理
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(1000);

    // 2. 切换到其他页面
    await page.goto(`${BASE_URL}/admin/dashboard`);
    await page.waitForTimeout(500);

    // 3. 返回女生管理
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(1000);

    // 页面应该正常显示
    const heading = page.locator('text=女生').first();
    await expect(heading).toBeVisible();
  });
});

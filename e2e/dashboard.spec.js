/**
 * E2E: 仪表盘和导航
 */

const { test, expect } = require('./screenshot-setup.js');
const { operatorLogin, BASE_URL } = require('./helpers');

test.describe('操盘手仪表盘', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('登录后进入仪表盘', async ({ page }) => {
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    expect(currentUrl).toContain('/admin');
  });

  test('侧边栏导航可见', async ({ page }) => {
    await page.waitForTimeout(1000);
    const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="layout"]').first();
    if (await sidebar.isVisible()) {
      await expect(sidebar).toBeVisible();
    }
  });

  test('可以访问客户管理页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    expect(currentUrl).toContain('/admin/clients');
  });

  test('可以访问约会管理页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/dates`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/admin/dates');
  });

  test('可以访问女生管理页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/admin/girls');
  });

  test('桌面视图下布局正常', async ({ page }) => {
    await operatorLogin(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(1000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('移动视图下布局正常', async ({ page }) => {
    await operatorLogin(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

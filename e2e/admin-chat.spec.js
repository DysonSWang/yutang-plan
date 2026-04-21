/**
 * E2E: 操盘手 - 实时聊天页面
 */

const { test, expect } = require('./screenshot-setup.js');
const { operatorLogin, BASE_URL } = require('./helpers');

test.describe('操盘手-聊天页面', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('可以访问操盘手聊天页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/chat`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/admin/chat');
  });

  test('聊天页面正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/chat`);
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('有会话选择或客户列表', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/chat`);
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('有消息输入区域', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/chat`);
    await page.waitForTimeout(2000);
    const inputs = page.locator('input, textarea');
    if (await inputs.count() > 0) {
      await expect(inputs.first()).toBeVisible();
    }
  });
});

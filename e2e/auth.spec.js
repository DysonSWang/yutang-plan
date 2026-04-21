/**
 * E2E: 登录认证流程
 */

const { test, expect } = require('./screenshot-setup.js');
const { BASE_URL, API_BASE } = require('./helpers');

async function showLoginForm(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForTimeout(500);
  const loginBtn = page.locator('button:has-text("登录")').first();
  if (await loginBtn.isVisible()) {
    await loginBtn.click();
    await page.waitForTimeout(500);
  }
}

async function fillLoginForm(page, username, password) {
  await showLoginForm(page);
  const usernameInput = page.locator('input').filter({ hasNot: page.locator('[type="password"]') }).first();
  const passwordInput = page.locator('input[type="password"]').first();
  await usernameInput.fill(username);
  await passwordInput.fill(password);
  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();
  await page.waitForTimeout(2000);
}

test.describe('登录认证', () => {
  test('登录页面正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('body')).toBeVisible();
  });

  test('可以输入用户名和密码', async ({ page }) => {
    await showLoginForm(page);
    const usernameInput = page.locator('input').filter({ hasNot: page.locator('[type="password"]') }).first();
    const passwordInput = page.locator('input[type="password"]').first();
    if (await usernameInput.isVisible()) {
      await usernameInput.fill('op_e2e');
      await passwordInput.fill('op123456');
    }
  });

  test('未注册用户登录失败', async ({ page }) => {
    await fillLoginForm(page, 'nonexistent_user_12345', 'wrongpassword');
    const currentUrl = page.url();
    expect(currentUrl).toContain('/login');
  });

  test('操盘手登录成功', async ({ page }) => {
    await fillLoginForm(page, 'op_e2e', 'op123456');
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');
    expect(currentUrl).toContain('/admin');
  });
});

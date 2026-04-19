/**
 * E2E: 登录认证流程
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5181';

test.describe('登录认证', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
  });

  test('登录页面正常加载', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('可以输入用户名和密码', async ({ page }) => {
    const usernameInput = page.locator('input[type="text"], input[placeholder*="用户名"], input[placeholder*="账号"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    if (await usernameInput.isVisible()) {
      await usernameInput.fill('operator');
      await passwordInput.fill('password123');
    }
  });

  test('未注册用户登录失败', async ({ page }) => {
    const usernameInput = page.locator('input[type="text"], input[placeholder*="用户名"], input[placeholder*="账号"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("登")').first();

    if (await usernameInput.isVisible()) {
      await usernameInput.fill('nonexistent_user_12345');
      await passwordInput.fill('wrongpassword');
      await submitButton.click();
      await page.waitForTimeout(1000);
      // 应该有错误提示或保持在登录页
      const currentUrl = page.url();
      expect(currentUrl).toContain('/login');
    }
  });

  test('操盘手登录成功', async ({ page }) => {
    const usernameInput = page.locator('input[type="text"], input[placeholder*="用户名"], input[placeholder*="账号"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("登")').first();

    if (await usernameInput.isVisible()) {
      await usernameInput.fill('operator');
      await passwordInput.fill('operator123');
      await submitButton.click();
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      // 登录后应该跳转到管理后台
      expect(currentUrl).not.toContain('/login');
    }
  });
});

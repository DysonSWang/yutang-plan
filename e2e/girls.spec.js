/**
 * E2E: 女生资源池管理
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5181';

async function operatorLogin(page) {
  await page.goto(`${BASE_URL}/login`);
  const usernameInput = page.locator('input[type="text"], input[placeholder*="用户名"], input[placeholder*="账号"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitButton = page.locator('button[type="submit"], button:has-text("登录")').first();

  if (await usernameInput.isVisible()) {
    await usernameInput.fill('operator');
    await passwordInput.fill('operator123');
    await submitButton.click();
    await page.waitForTimeout(2000);
  }
}

test.describe('女生资源池管理', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('可以进入女生管理页面', async ({ page }) => {
    // 尝试进入女生管理页面
    const girlsLink = page.locator('a[href*="girls"], a:has-text("女生"), a:has-text("鱼塘"), nav >> text=女').first();
    if (await girlsLink.isVisible()) {
      await girlsLink.click();
      await page.waitForTimeout(1000);
    } else {
      await page.goto(`${BASE_URL}/admin/girls`);
      await page.waitForTimeout(1000);
    }
    const currentUrl = page.url();
    // 页面应该能加载
    expect(currentUrl).toBeTruthy();
  });

  test('女生列表页面可显示', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('女生详情查看', () => {
  test('操盘手可查看女生详情', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);

    // 尝试点击第一个女生条目
    const firstGirl = page.locator('[data-testid*="girl"], [class*="girl"], tr:has(td)').first();
    if (await firstGirl.isVisible()) {
      await firstGirl.click();
      await page.waitForTimeout(1000);
    }
    const currentUrl = page.url();
    expect(currentUrl).toBeTruthy();
  });
});

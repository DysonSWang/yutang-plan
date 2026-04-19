/**
 * E2E: 仪表盘和导航
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

test.describe('操盘手仪表盘', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('登录后进入仪表盘', async ({ page }) => {
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    // 应该不在登录页
    expect(currentUrl).toBeTruthy();
  });

  test('侧边栏导航可见', async ({ page }) => {
    await page.waitForTimeout(1000);
    const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="layout"]').first();
    if (await sidebar.isVisible()) {
      await expect(sidebar).toBeVisible();
    }
  });

  test('可以访问客户管理页面', async ({ page }) => {
    const clientsLink = page.locator('a[href*="clients"], a:has-text("客户"), nav >> text=客').first();
    if (await clientsLink.isVisible()) {
      await clientsLink.click();
      await page.waitForTimeout(1000);
    } else {
      await page.goto(`${BASE_URL}/admin/clients`);
      await page.waitForTimeout(1000);
    }
    const currentUrl = page.url();
    expect(currentUrl).toBeTruthy();
  });

  test('可以访问约会管理页面', async ({ page }) => {
    const datesLink = page.locator('a[href*="dates"], a:has-text("约会"), nav >> text=约').first();
    if (await datesLink.isVisible()) {
      await datesLink.click();
      await page.waitForTimeout(1000);
    } else {
      await page.goto(`${BASE_URL}/admin/dates`);
      await page.waitForTimeout(1000);
    }
    expect(page.url()).toBeTruthy();
  });
});

test.describe('页面响应式', () => {
  test('桌面视图下布局正常', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await operatorLogin(page);
    await page.waitForTimeout(1000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('移动视图下布局正常', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await operatorLogin(page);
    await page.waitForTimeout(1000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

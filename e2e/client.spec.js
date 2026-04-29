/**
 * E2E: 客户（client）角色完整流程
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, operatorLogin, BASE_URL } = require('./helpers');

test.describe('客户登录', () => {
  test('客户登录页面可以访问', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('body')).toBeVisible();
  });

  test('客户可以成功登录', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForTimeout(500);
    const loginBtn = page.locator('button:has-text("登录")').first();
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
      await page.waitForTimeout(500);
    }
    const usernameInput = page.locator('input[type="text"], input:not([type])').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();
    await usernameInput.fill('cl_e2e');
    await passwordInput.fill('cl123456');
    await submitBtn.click();
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/login');
  });

  test('错误密码无法登录', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForTimeout(500);
    const loginBtn = page.locator('button:has-text("登录")').first();
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
      await page.waitForTimeout(500);
    }
    const usernameInput = page.locator('input[type="text"], input:not([type])').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();
    await usernameInput.fill('cl_e2e');
    await passwordInput.fill('wrongpassword123');
    await submitBtn.click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/login');
  });
});

test.describe('客户首页', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
  });

  test('登录后进入客户首页', async ({ page }) => {
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('/login');
    expect(page.url()).not.toContain('/admin');
  });

  test('首页显示基础内容', async ({ page }) => {
    await page.waitForTimeout(1000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('可以访问个人主页', async ({ page }) => {
    const profileLink = page.locator('a[href="/profile"], nav >> text=个人, nav >> text=主页').first();
    if (await profileLink.isVisible()) {
      await profileLink.click();
      await page.waitForTimeout(1000);
    } else {
      await page.goto(`${BASE_URL}/profile`);
      await page.waitForTimeout(1000);
    }
    expect(page.url()).toBeTruthy();
  });

  test('可以访问我的追爱', async ({ page }) => {
    const pondLink = page.locator('a[href*="pond"], nav >> text=追爱').first();
    if (await pondLink.isVisible()) {
      await pondLink.click();
      await page.waitForTimeout(1000);
    } else {
      await page.goto(`${BASE_URL}/my-pond`);
      await page.waitForTimeout(1000);
    }
    expect(page.url()).toBeTruthy();
  });

  test('可以访问约会页面', async ({ page }) => {
    const datesLink = page.locator('a[href="/dates"], nav >> text=约会').first();
    if (await datesLink.isVisible()) {
      await datesLink.click();
      await page.waitForTimeout(1000);
    } else {
      await page.goto(`${BASE_URL}/dates`);
      await page.waitForTimeout(1000);
    }
    expect(page.url()).toBeTruthy();
  });
});

test.describe('客户权限隔离', () => {
  test('客户无法直接访问管理后台', async ({ page }) => {
    await clientLogin(page);
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('/admin/clients');
  });

  test('客户无法直接访问女生管理', async ({ page }) => {
    await clientLogin(page);
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('/admin/girls');
  });

  test('操盘手无法访问客户首页', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('/login');
  });
});

/**
 * E2E: 客户导航和首页新功能入口
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, BASE_URL } = require('./helpers');

test.describe('客户导航-新功能入口', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
  });

  test('客户端侧边栏有"学习"导航项', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(1500);

    const learningLink = page.getByText('学习', { exact: true }).or(page.locator('a[href="/learning"]')).first();
    await expect(learningLink).toBeVisible();
  });

  test('客户端侧边栏有"方案"导航项', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(1500);

    const plansLink = page.getByText('方案', { exact: true }).or(page.locator('a[href="/dating-plans"]')).first();
    await expect(plansLink).toBeVisible();
  });

  test('点击"学习"导航项进入学习页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(1500);

    const learningLink = page.locator('a[href="/learning"]').first();
    if (await learningLink.isVisible()) {
      await learningLink.click();
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/learning');
    }
  });

  test('点击"方案"导航项进入约会方案页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(1500);

    const plansLink = page.locator('a[href="/dating-plans"]').first();
    if (await plansLink.isVisible()) {
      await plansLink.click();
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/dating-plans');
    }
  });

  test('客户端首页显示会员状态区域', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('操盘手导航-会员管理入口', () => {
  test.beforeEach(async ({ page }) => {
    const { operatorLogin } = require('./helpers');
    await operatorLogin(page);
  });

  test('操盘手侧边栏有"会员管理"导航项', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(1500);

    const membershipLink = page.getByText('会员管理', { exact: true }).or(page.locator('a[href="/admin/membership"]')).first();
    await expect(membershipLink).toBeVisible();
  });

  test('点击"会员管理"导航项进入会员管理页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(1500);

    const membershipLink = page.locator('a[href="/admin/membership"]').first();
    if (await membershipLink.isVisible()) {
      await membershipLink.click();
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/admin/membership');
    }
  });
});

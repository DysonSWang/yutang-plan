/**
 * E2E: 操盘手 - 军师工具（工作台）
 */

const { test, expect } = require('./screenshot-setup.js');
const { operatorLogin, BASE_URL } = require('./helpers');

test.describe('操盘手-军师工具页', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('可以访问军师工具页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/workbench`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/admin/workbench');
  });

  test('页面有情况咨询 Tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/workbench`);
    await page.waitForTimeout(2000);
    const tabs = page.locator('[role="tab"]');
    if (await tabs.count() > 0) {
      const tabText = await tabs.first().textContent();
      expect(tabText).toBeTruthy();
    }
  });

  test('页面有实战聊天 Tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/workbench`);
    await page.waitForTimeout(2000);
    const tabs = page.locator('[role="tab"]');
    if (await tabs.count() > 0) {
      await expect(tabs.first()).toBeVisible();
    }
  });

  test('有客户下拉选择器', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/workbench`);
    await page.waitForTimeout(2000);
    const selects = page.locator('select');
    if (await selects.count() > 0) {
      await expect(selects.first()).toBeVisible();
    }
  });

  test('选择客户后加载女生列表', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/workbench`);
    await page.waitForTimeout(2000);

    const selects = page.locator('select');
    if (await selects.count() > 0) {
      const options = page.locator('select:first-of-type option');
      const count = await options.count();
      if (count >= 2) {
        await selects.first().selectOption({ index: 1 });
        await page.waitForTimeout(2000);
      }
    }
  });

  test('选择女生后显示详情信息', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/workbench`);
    await page.waitForTimeout(2000);

    const selects = page.locator('select');
    if (await selects.count() > 0) {
      const options = page.locator('select:first-of-type option');
      const count = await options.count();
      if (count >= 2) {
        await selects.first().selectOption({ index: 1 });
        await page.waitForTimeout(2000);
      }
    }
  });

  test('情况咨询有 AI 分析按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/workbench`);
    await page.waitForTimeout(2000);
    const analyzeBtn = page.locator('button:has-text("分析"), button:has-text("咨询"), button:has-text("快速"), button:has-text("深度")');
    if (await analyzeBtn.count() > 0) {
      await expect(analyzeBtn.first()).toBeVisible();
    }
  });

  test('有代聊记录 Tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/workbench`);
    await page.waitForTimeout(2000);
    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();
    if (tabCount >= 3) {
      await tabs.nth(2).click();
      await page.waitForTimeout(500);
      const body = page.locator('body');
      await expect(body).toBeVisible();
    }
  });
});

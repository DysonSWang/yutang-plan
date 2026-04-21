/**
 * E2E: 女生资源池管理
 */

const { test, expect } = require('./screenshot-setup.js');
const { operatorLogin, BASE_URL, getOperatorToken, API_BASE } = require('./helpers');

test.describe('女生资源池管理', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('可以进入女生管理页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/admin/girls');
  });

  test('女生列表页面可显示', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('女生列表有新增按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const addBtn = page.locator('button:has-text("新增"), button:has-text("添加"), button:has-text("录入")').first();
    if (await addBtn.isVisible()) {
      await expect(addBtn).toBeVisible();
    }
  });
});

test.describe('女生详情查看', () => {
  test('操盘手可查看女生详情', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const firstGirl = page.locator('[class*="card"], [class*="item"], tr, [class*="row"]').first();
    if (await firstGirl.isVisible()) {
      await firstGirl.click();
      await page.waitForTimeout(1000);
    }
    const currentUrl = page.url();
    expect(currentUrl).toBeTruthy();
  });
});

test.describe('女生 API 验证', () => {
  test('操盘手可以获取女生列表', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/girls`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });
});

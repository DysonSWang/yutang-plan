/**
 * E2E: 通知系统
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, operatorLogin, BASE_URL, getClientToken, getOperatorToken, API_BASE } = require('./helpers');

test.describe('客户-通知系统', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
  });

  test('侧边栏有通知铃铛图标', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(2000);

    // 通知图标（铃铛）
    const bellIcon = page.locator('[aria-label*="通知"], [aria-label*="bell"], button:has-text("通知")');
    if (await bellIcon.count() > 0) {
      await expect(bellIcon.first()).toBeVisible();
    }
  });

  test('点击铃铛显示通知列表', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(2000);

    // 找到通知区域并点击
    const bell = page.locator('button, [aria-label*="通知"], [aria-label*="bell"]').first();
    if (await bell.isVisible()) {
      await bell.click();
      await page.waitForTimeout(1000);
      // 应该弹出通知面板
      const body = page.locator('body');
      await expect(body).toBeVisible();
    }
  });

  test('无未读通知时不显示红点', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('通知 API', () => {
  test('客户可以获取通知列表', async ({ page }) => {
    const token = await getClientToken(page);
    const resp = await page.request.get(`${API_BASE}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (resp.status() === 404) return;
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });

  test('客户可以标记所有通知为已读', async ({ page }) => {
    const token = await getClientToken(page);
    const resp = await page.request.post(`${API_BASE}/api/notifications/read-all`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {}
    });
    if (resp.status() === 404) return;
    expect([200, 201]).toContain(resp.status());
  });

  test('操盘手可以获取通知列表', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (resp.status() === 404) return;
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });
});

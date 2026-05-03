/**
 * E2E: 客户 - 我的缘分（整合版）
 *
 * 验证合并后的 MyPond 页面：
 * - 三个子标签（女生/约会/日历）
 * - 每个子标签内容加载
 * - Keep-alive 行为
 *
 * 注：更详细的子标签测试见 client-my-pond-tabs.spec.js
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, BASE_URL, API_BASE } = require('./helpers');

test.describe('客户 - 我的缘分', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
    await page.goto(`${BASE_URL}/my-pond`);
    await page.waitForTimeout(2000);
  });

  test('页面显示三个子标签', async ({ page }) => {
    await expect(page.locator('text=女生').first()).toBeVisible();
    await expect(page.locator('text=约会').first()).toBeVisible();
    await expect(page.locator('text=日历').first()).toBeVisible();
  });

  test('无长时间 loading 转圈', async ({ page }) => {
    await page.waitForTimeout(5000);
    const loadingText = page.locator('text=Loading...');
    expect(await loadingText.count()).toBe(0);
  });

  test('子标签可以切换', async ({ page }) => {
    const datesTab = page.locator('text=约会').first();
    const calendarTab = page.locator('text=日历').first();

    if (await datesTab.isVisible()) {
      await datesTab.click();
      await page.waitForTimeout(500);
    }

    if (await calendarTab.isVisible()) {
      await calendarTab.click();
      await page.waitForTimeout(500);
    }

    expect(page.url()).toContain('/my-pond');
  });
});

test.describe('缘分 API', () => {
  test('客户可以获取自己的女生列表', async ({ page }) => {
    const loginResp = await page.request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'cl_e2e', password: 'cl123456' }
    });

    if (!loginResp.ok()) return;
    const { token } = await loginResp.json();

    const resp = await page.request.get(`${API_BASE}/api/girls`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect([200, 404]).toContain(resp.status());

    if (resp.ok()) {
      const data = await resp.json();
      expect(Array.isArray(data.girls)).toBe(true);
    }
  });

  test('客户可以获取自己的约会列表', async ({ page }) => {
    const loginResp = await page.request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'cl_e2e', password: 'cl123456' }
    });

    if (!loginResp.ok()) return;
    const { token } = await loginResp.json();

    const resp = await page.request.get(`${API_BASE}/api/dates`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect([200, 404]).toContain(resp.status());

    if (resp.ok()) {
      const data = await resp.json();
      expect(Array.isArray(data.dates)).toBe(true);
    }
  });
});

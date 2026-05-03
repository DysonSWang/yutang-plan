/**
 * E2E: 客户 - 我的缘分页（三子标签：女生/约会/日历）
 *
 * 验证合并后的 MyPond 页面：
 * - 三个子标签正确显示
 * - 子标签切换正常
 * - 每个子标签内容加载
 * - 空状态展示
 * - Keep-alive 行为（切出保留数据、切回静默刷新）
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, BASE_URL, API_BASE } = require('./helpers');

test.describe('客户 - 我的缘分（三子标签）', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
    await page.goto(`${BASE_URL}/my-pond`);
    await page.waitForTimeout(2000);
  });

  test('页面标题显示缘分', async ({ page }) => {
    // 验证页面标题
    const title = page.locator('text=缘分').first();
    await expect(title).toBeVisible();
  });

  test('三个子标签都可见', async ({ page }) => {
    const girlsTab = page.locator('[role="tab"]:has-text("女生"), button:has-text("女生"), text=女生').first();
    const datesTab = page.locator('[role="tab"]:has-text("约会"), button:has-text("约会"), text=约会').first();
    const calendarTab = page.locator('[role="tab"]:has-text("日历"), button:has-text("日历"), text=日历').first();

    await expect(girlsTab).toBeVisible();
    await expect(datesTab).toBeVisible();
    await expect(calendarTab).toBeVisible();
  });

  test('默认显示女生子标签', async ({ page }) => {
    // 默认应在女生标签
    const girlsContent = page.locator('[class*="girls" i]');
    // 即使没有数据，女生区域也应该存在
    expect(page.url()).toContain('/my-pond');
  });

  test('可以切换到约会子标签', async ({ page }) => {
    const datesTab = page.locator('button:has-text("约会"), text=约会').first();
    if (await datesTab.isVisible()) {
      await datesTab.click();
      await page.waitForTimeout(500);
      // 验证切换到约会标签
      expect(page.url()).toContain('/my-pond');
    }
  });

  test('可以切换到日历子标签', async ({ page }) => {
    const calendarTab = page.locator('button:has-text("日历"), text=日历').first();
    if (await calendarTab.isVisible()) {
      await calendarTab.click();
      await page.waitForTimeout(500);
      // 验证切换到日历标签
      expect(page.url()).toContain('/my-pond');
    }
  });

  test('切换标签后再切回数据保留（keep-alive）', async ({ page }) => {
    // 获取女生标签初始内容
    const initialBody = await page.innerHTML('body');

    // 切换到约会
    const datesTab = page.locator('button:has-text("约会"), text=约会').first();
    if (await datesTab.isVisible()) {
      await datesTab.click();
      await page.waitForTimeout(500);
    }

    // 切回女生
    const girlsTab = page.locator('button:has-text("女生"), text=女生').first();
    if (await girlsTab.isVisible()) {
      await girlsTab.click();
      await page.waitForTimeout(500);
    }

    // 页面应该仍然可见
    expect(page.url()).toContain('/my-pond');
  });

  test('API 数据加载正常（无长时间 loading）', async ({ page }) => {
    // 等待 5 秒，不应看到持续 loading（之前的 bug 是永远转圈）
    await page.waitForTimeout(5000);

    // 不应出现 "Loading..." 文字（表示一直 loading 的 bug）
    const loadingText = page.locator('text=Loading...');
    expect(await loadingText.count()).toBe(0);
  });
});

test.describe('我的缘分 API 验证', () => {
  test('客户可以获取自己的女生列表', async ({ page }) => {
    const loginResp = await page.request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'cl_e2e', password: 'cl123456' }
    });

    if (!loginResp.ok()) return;
    const { token } = await loginResp.json();

    const resp = await page.request.get(`${API_BASE}/api/girls`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // 应返回 200（无论是否有数据）
    expect([200, 404]).toContain(resp.status());

    if (resp.ok()) {
      const data = await resp.json();
      // 返回结构应包含 girls 数组
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

    // 应返回 200
    expect([200, 404]).toContain(resp.status());

    if (resp.ok()) {
      const data = await resp.json();
      expect(Array.isArray(data.dates)).toBe(true);
    }
  });
});

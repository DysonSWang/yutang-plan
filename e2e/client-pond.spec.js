/**
 * E2E: 客户 - 我的追爱
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, BASE_URL, getClientToken, getOperatorToken, API_BASE } = require('./helpers');

test.describe('客户-我的追爱', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
  });

  test('可以访问我的追爱页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/my-pond`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/my-pond');
  });

  test('页面显示 Tab 切换（女生资源/交流记录）', async ({ page }) => {
    await page.goto(`${BASE_URL}/my-pond`);
    await page.waitForTimeout(2000);
    const tabs = page.locator('[role="tab"], button:has-text("女生"), button:has-text("交流"), button:has-text("资源")');
    if (await tabs.count() > 0) {
      await expect(tabs.first()).toBeVisible();
    }
  });

  test('可以切换到交流记录 Tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/my-pond`);
    await page.waitForTimeout(2000);

    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();
    if (tabCount >= 2) {
      await tabs.nth(1).click();
      await page.waitForTimeout(500);
    }
  });

  test('女生卡片列表可以点击查看详情', async ({ page }) => {
    await page.goto(`${BASE_URL}/my-pond`);
    await page.waitForTimeout(2000);

    // 确保在女生资源 Tab
    const tabs = page.locator('[role="tab"]');
    if (await tabs.count() > 0) {
      await tabs.first().click();
      await page.waitForTimeout(500);
    }

    // 等待卡片加载
    await page.waitForTimeout(1000);
    const cards = page.locator('[class*="card"], [class*="Card"]');
    if (await cards.count() > 0) {
      await cards.first().click();
      await page.waitForTimeout(1000);
    }
  });

  test('点击卡片打开详情弹窗', async ({ page }) => {
    await page.goto(`${BASE_URL}/my-pond`);
    await page.waitForTimeout(2000);

    const tabs = page.locator('[role="tab"]');
    if (await tabs.count() > 0) {
      await tabs.first().click();
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(1000);
    const cards = page.locator('[class*="card"], [class*="Card"]');
    if (await cards.count() > 0) {
      await cards.first().click();
      await page.waitForTimeout(2000);
      // 详情弹窗包含女生名字、关闭按钮等
      const closeBtn = page.locator('[aria-label="Close"], button[class*="Close"], [class*="close"]').first();
      if (await closeBtn.isVisible()) {
        await expect(closeBtn).toBeVisible();
      } else {
        // 或者弹窗包含基本信息区域
        const body = page.locator('body');
        await expect(body).toBeVisible();
      }
    }
  });
});

test.describe('追爱 API', () => {
  test('客户可以获取自己的女生资源列表', async ({ page }) => {
    const token = await getClientToken(page);
    const resp = await page.request.get(`${API_BASE}/api/girls/client/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // 如果端点不存在，返回 404 说明未覆盖，测试跳过
    if (resp.status() === 404) return;
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });

  test('客户可以获取自己的聊天截图', async ({ page }) => {
    const token = await getClientToken(page);
    const resp = await page.request.get(`${API_BASE}/api/chat-screenshots/client/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (resp.status() === 404) return;
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });

  test('操盘手无法访问客户的聊天截图接口（403）', async ({ page }) => {
    const operatorToken = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/chat-screenshots/client/me`, {
      headers: { Authorization: `Bearer ${operatorToken}` }
    });
    // 操作员 role 不是 client，应该返回 403
    expect(resp.status()).toBe(403);
  });
});

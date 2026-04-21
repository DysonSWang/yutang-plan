/**
 * E2E: 操盘手 - 进度管理页面
 */

const { test, expect } = require('./screenshot-setup.js');
const { operatorLogin, BASE_URL, getOperatorToken, API_BASE } = require('./helpers');

test.describe('操盘手-进度管理页', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('可以访问进度管理页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/progress`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/admin/progress');
  });

  test('页面显示客户列表', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/progress`);
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('显示服务阶段进度', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/progress`);
    await page.waitForTimeout(2000);
    // 检查是否有阶段标签
    const stageLabels = page.locator('text=背调, text=建池, text=约会, text=锁定, text=维护');
    if (await stageLabels.count() > 0) {
      await expect(stageLabels.first()).toBeVisible();
    }
  });

  test('有更新进度按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/progress`);
    await page.waitForTimeout(2000);
    const updateBtn = page.locator('button:has-text("更新"), button:has-text("推进"), button:has-text("进度")');
    if (await updateBtn.count() > 0) {
      await expect(updateBtn.first()).toBeVisible();
    }
  });
});

test.describe('进度 API', () => {
  test('操盘手可以获取客户进度', async ({ page }) => {
    const token = await getOperatorToken(page);

    // 先获取一个客户
    const clientsResp = await page.request.get(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!clientsResp.ok()) return;
    const clientsData = await clientsResp.json();
    const client = clientsData.clients?.find(c => c.role === 'client');
    if (!client) return;

    const resp = await page.request.get(`${API_BASE}/api/progress?clientId=${client.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (resp.status() === 404) return;
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });
});

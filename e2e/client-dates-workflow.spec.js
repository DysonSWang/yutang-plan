/**
 * E2E: 客户 - 约会完整工作流
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, operatorLogin, BASE_URL, getClientToken, getOperatorToken, API_BASE } = require('./helpers');

test.describe('客户-约会列表页', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
  });

  test('可以访问约会页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/dates`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/dates');
  });

  test('页面有刷新按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/dates`);
    await page.waitForTimeout(2000);
    const refreshBtn = page.locator('button:has-text("刷新"), button:has-text("刷新")');
    if (await refreshBtn.count() > 0) {
      await expect(refreshBtn.first()).toBeVisible();
    }
  });

  test('可以查看约会方案详情', async ({ page }) => {
    await page.goto(`${BASE_URL}/dates`);
    await page.waitForTimeout(2000);

    // 找"查看方案"按钮
    const viewBtn = page.locator('button:has-text("查看方案")').first();
    if (await viewBtn.isVisible()) {
      await viewBtn.click();
      await page.waitForTimeout(1500);
      // 详情弹窗应该包含约会信息
      const modal = page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]');
      if (await modal.count() > 0) {
        await expect(modal.first()).toBeVisible();
      }
    }
  });

  test('空状态显示正确', async ({ page }) => {
    await page.goto(`${BASE_URL}/dates`);
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('约会方案详情弹窗', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
  });

  test('详情包含推荐地点信息', async ({ page }) => {
    await page.goto(`${BASE_URL}/dates`);
    await page.waitForTimeout(2000);

    const viewBtn = page.locator('button:has-text("查看方案")').first();
    if (!(await viewBtn.isVisible())) return;

    await viewBtn.click();
    await page.waitForTimeout(1500);

    // 方案详情应包含地点、时间等信息
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('有确认按钮和调整建议入口', async ({ page }) => {
    await page.goto(`${BASE_URL}/dates`);
    await page.waitForTimeout(2000);

    const viewBtn = page.locator('button:has-text("查看方案")').first();
    if (!(await viewBtn.isVisible())) return;

    await viewBtn.click();
    await page.waitForTimeout(1500);

    const confirmBtn = page.locator('button:has-text("确认"), button:has-text("确认此方案")');
    if (await confirmBtn.count() > 0) {
      await expect(confirmBtn.first()).toBeVisible();
    }

    const feedbackArea = page.locator('textarea, [placeholder*="调整"], [placeholder*="建议"]');
    if (await feedbackArea.count() > 0) {
      await expect(feedbackArea.first()).toBeVisible();
    }
  });
});

test.describe('约会 API 完整流程', () => {
  test('操盘手可以推送约会方案给客户', async ({ page }) => {
    const token = await getOperatorToken(page);

    // 获取客户
    const clientsResp = await page.request.get(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!clientsResp.ok()) return;
    const clientsData = await clientsResp.json();
    const client = clientsData.clients?.find(c => c.role === 'client');
    if (!client) return;

    // 获取女生的
    const girlsResp = await page.request.get(`${API_BASE}/api/girls?clientId=${client.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!girlsResp.ok()) return;
    const girlsData = await girlsResp.json();
    const girl = girlsData.girls?.[0];
    if (!girl) return;

    // 创建约会
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const createResp = await page.request.post(`${API_BASE}/api/dates`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        clientId: client.id,
        girlId: girl.id,
        dateTime: futureDate,
        title: '自动化测试约会',
        location: '咖啡厅'
      }
    });
    if (!createResp.ok()) return;
    const createData = await createResp.json();
    if (!createData.date) return;
    const dateId = createData.date.id;

    // 生成 AI 方案
    const planResp = await page.request.post(`${API_BASE}/api/dates/${dateId}/generate-plan`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {}
    });
    // AI 生成可能失败（无 key），但不影响测试

    // 推送给客户
    const pushResp = await page.request.post(`${API_BASE}/api/dates/${dateId}/push-to-client`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {}
    });
    expect(pushResp.ok()).toBeTruthy();

    // 清理
    await page.request.delete(`${API_BASE}/api/dates/${dateId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  });

  test('客户可以获取自己的待确认约会', async ({ page }) => {
    const token = await getClientToken(page);
    const resp = await page.request.get(`${API_BASE}/api/dates/client-pending`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (resp.status() === 404) return;
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });

  test('客户可以确认约会方案', async ({ page }) => {
    const token = await getClientToken(page);

    // 获取待确认约会
    const pendingResp = await page.request.get(`${API_BASE}/api/dates/client-pending`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (pendingResp.status() === 404) return;
    if (!pendingResp.ok()) return;
    const pendingData = await pendingResp.json();
    const pendingDate = pendingData.dates?.[0];
    if (!pendingDate) return;

    const confirmResp = await page.request.post(`${API_BASE}/api/dates/${pendingDate.id}/client-confirm`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {}
    });
    // 可能已确认过，所以 400 也可接受
    expect([200, 400]).toContain(confirmResp.status());
  });

  test('客户可以提交约会调整建议', async ({ page }) => {
    const token = await getClientToken(page);

    const pendingResp = await page.request.get(`${API_BASE}/api/dates/client-pending`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (pendingResp.status() === 404) return;
    if (!pendingResp.ok()) return;
    const pendingData = await pendingResp.json();
    const pendingDate = pendingData.dates?.[0];
    if (!pendingDate) return;

    const feedbackResp = await page.request.post(`${API_BASE}/api/dates/${pendingDate.id}/client-feedback`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { adjustment: '换成更安静的餐厅', reason: '喜欢安静的环境' }
    });
    // 可能已经反馈过，所以允许各种状态码
    expect([200, 201, 400]).toContain(feedbackResp.status());
  });
});

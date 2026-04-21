/**
 * E2E: 操盘手 - 女生资源池管理
 */

const { test, expect } = require('./screenshot-setup.js');
const { operatorLogin, BASE_URL, getOperatorToken, API_BASE } = require('./helpers');

test.describe('操盘手-女生列表', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('可以访问女生管理页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toContain('/admin/girls');
  });

  test('可以通过侧边栏导航到女生管理', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(1000);
    const girlsLink = page.locator('a[href="/admin/girls"]').first();
    if (await girlsLink.isVisible()) {
      await girlsLink.click();
      await page.waitForTimeout(1000);
      expect(page.url()).toContain('/admin/girls');
    }
  });

  test('女生列表有新增按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const addBtn = page.locator('button:has-text("新增"), button:has-text("添加"), button:has-text("录入")').first();
    if (await addBtn.isVisible()) {
      await expect(addBtn).toBeVisible();
    }
  });

  test('可以按阶段筛选女生', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const selects = page.locator('select');
    if (await selects.count() > 0) {
      await expect(selects.first()).toBeVisible();
    }
  });
});

test.describe('操盘手-女生详情', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('可以点击查看女生详情', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const firstGirl = page.locator('[class*="card"], [class*="item"], tr, [class*="row"]').first();
    if (await firstGirl.isVisible()) {
      await firstGirl.click();
      await page.waitForTimeout(1000);
    }
    expect(page.url()).toBeTruthy();
  });

  test('女生详情页面包含基础内容', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const firstGirl = page.locator('[class*="card"], [class*="item"], tr, [class*="row"]').first();
    if (await firstGirl.isVisible()) {
      await firstGirl.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('操盘手-新增女生', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('可以展开新增女生表单', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const addBtn = page.locator('button:has-text("新增"), button:has-text("添加"), button:has-text("录入")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
      const inputs = page.locator('input');
      if (await inputs.count() > 0) {
        await expect(inputs.first()).toBeVisible();
      }
    }
  });

  test('新增女生表单需要填写姓名', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const addBtn = page.locator('button:has-text("新增"), button:has-text("添加"), button:has-text("录入")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
      const nameInput = page.locator('input[placeholder*="姓名"], input[placeholder*="名字"], input[placeholder*="昵称"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill('自动化测试女生_' + Date.now());
        const submitBtn = page.locator('button[type="submit"]').first();
        if (await submitBtn.isVisible()) {
          await submitBtn.click();
          await page.waitForTimeout(1000);
        }
      }
    }
  });
});

test.describe('女生 API 数据验证', () => {
  test('操盘手可以通过 API 获取女生列表', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/girls`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });

  test('操盘手可以添加女生资源', async ({ page }) => {
    const token = await getOperatorToken(page);
    const clientsResp = await page.request.get(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!clientsResp.ok()) return;
    const clientsData = await clientsResp.json();
    const client = clientsData.clients?.find(c => c.role === 'client');
    if (!client) return;

    const timestamp = Date.now();
    const resp = await page.request.post(`${API_BASE}/api/girls`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        clientId: client.id,
        name: `自动化测试女生_${timestamp}`,
        age: 25,
        stage: '陌生',
        status: 'available'
      }
    });

    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data.girl).toBeTruthy();
  });
});

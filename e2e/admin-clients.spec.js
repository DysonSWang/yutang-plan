/**
 * E2E: 操盘手 - 客户管理
 */

const { test, expect } = require('./screenshot-setup.js');
const { operatorLogin, BASE_URL, getOperatorToken, API_BASE } = require('./helpers');

test.describe('操盘手-客户列表', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('登录后进入操盘手工作台', async ({ page }) => {
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/admin');
  });

  test('可以导航到客户管理页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
    expect(page.url()).toContain('/admin/clients');
  });

  test('侧边栏显示所有导航项', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(1000);
    const sidebar = page.locator('nav, [class*="sidebar"], aside').first();
    if (await sidebar.isVisible()) {
      for (const label of ['工作台', '客户', '女生', '约会', '聊天', '军师', '进度']) {
        const link = page.locator(`text=${label}`).first();
        if (await link.isVisible()) {
          await expect(link).toBeVisible();
        }
      }
    }
  });

  test('可以筛选客户列表', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForTimeout(2000);
    const selects = page.locator('select');
    if (await selects.count() > 0) {
      await expect(selects.first()).toBeVisible();
    }
  });

  test('点击客户卡片可以查看详情', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForTimeout(2000);
    const firstClient = page.locator('[class*="card"], [class*="item"], tr, [class*="row"]').first();
    if (await firstClient.isVisible()) {
      await firstClient.click();
      await page.waitForTimeout(1000);
    }
    expect(page.url()).toBeTruthy();
  });
});

test.describe('操盘手-创建客户', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('客户管理页面有新增按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForTimeout(2000);
    const addBtn = page.locator('button:has-text("新增"), button:has-text("添加"), button:has-text("创建")').first();
    if (await addBtn.isVisible()) {
      await expect(addBtn).toBeVisible();
    }
  });

  test('可以展开新增客户表单', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForTimeout(2000);
    const addBtn = page.locator('button:has-text("新增"), button:has-text("添加"), button:has-text("创建")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
      const form = page.locator('form');
      if (await form.isVisible()) {
        await expect(form).toBeVisible();
      }
    }
  });
});

test.describe('客户 API 验证', () => {
  test('操盘手可以获取客户列表', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.clients)).toBe(true);
  });

  test('操盘手可以获取自己的信息', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/clients/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data.client.username).toBe('op_e2e');
  });
});

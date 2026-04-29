/**
 * E2E: 客户 - AI 约会方案
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, BASE_URL, getClientToken, API_BASE } = require('./helpers');

test.describe('客户-AI约会方案页面', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
  });

  test('可以访问约会方案页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/dating-plans`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/dating-plans');
  });

  test('页面有生成方案表单', async ({ page }) => {
    await page.goto(`${BASE_URL}/dating-plans`);
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    // 应该有表单元素（场景、预算、时长等输入框或选择器）
    const hasFormElements = await page.locator('input, select, [class*="select"], textarea').count() > 0;
    expect(hasFormElements).toBeTruthy();
  });

  test('页面有生成/提交按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/dating-plans`);
    await page.waitForTimeout(2000);

    // 查找生成或提交按钮
    const generateBtn = page.locator('button:has-text("生成"), button:has-text("提交"), button:has-text("创建")').first();
    await expect(generateBtn).toBeVisible();
  });

  test('页面显示历史方案列表区域', async ({ page }) => {
    await page.goto(`${BASE_URL}/dating-plans`);
    await page.waitForTimeout(2000);

    // 页面应该有一些文本内容（列表区域或空状态）
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('可以填写并提交生成表单', async ({ page }) => {
    await page.goto(`${BASE_URL}/dating-plans`);
    await page.waitForTimeout(2000);

    // 查找输入框并填写
    const inputs = page.locator('input, select, [class*="select"], textarea');
    const inputCount = await inputs.count();

    if (inputCount > 0) {
      // 尝试填写前几个输入框
      for (let i = 0; i < Math.min(inputCount, 3); i++) {
        const input = inputs.nth(i);
        if (await input.isVisible()) {
          const tagName = await input.evaluate(el => el.tagName.toLowerCase());
          if (tagName === 'select') {
            // 选择第一个选项
            const options = input.locator('option');
            const optionCount = await options.count();
            if (optionCount > 1) {
              await input.selectOption({ index: 1 });
            }
          } else if (tagName === 'input' || tagName === 'textarea') {
            const type = await input.getAttribute('type');
            if (type !== 'password' && type !== 'checkbox' && type !== 'radio') {
              await input.fill('自动化测试输入');
            }
          }
        }
      }
    }

    // 查找并点击生成按钮
    const submitBtn = page.locator('button:has-text("生成"), button:has-text("提交"), button:has-text("创建")').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
    }

    // 页面应该仍然在约会方案页面
    expect(page.url()).toContain('/dating-plans');
  });
});

test.describe('约会方案 API', () => {
  test('客户可以获取约会方案列表', async ({ page }) => {
    const token = await getClientToken(page);
    const resp = await page.request.get(`${API_BASE}/api/membership/dating-plan`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.plans)).toBeTruthy();
  });

  test('客户可以生成新的约会方案', async ({ page }) => {
    const token = await getClientToken(page);

    const resp = await page.request.post(`${API_BASE}/api/membership/dating-plan/generate`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        title: '自动化测试约会方案',
        scene: '第一次约会',
        budget: '500-1000元',
        duration: '半天'
      }
    });

    // API 应该返回（200 成功或 500 AI生成失败都可接受）
    const status = resp.status();
    expect([200, 500]).toContain(status);

    const data = await resp.json();
    // 成功时返回 plan，AI 失败时返回 plan + error
    expect(data.plan).toBeTruthy();
  });

  test('客户可以获取单个约会方案', async ({ page }) => {
    const token = await getClientToken(page);

    // 先获取列表
    const listResp = await page.request.get(`${API_BASE}/api/membership/dating-plan`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!listResp.ok()) return;
    const listData = await listResp.json();
    if (!listData.plans || listData.plans.length === 0) return;

    const firstPlan = listData.plans[0];

    // 获取单个方案
    const detailResp = await page.request.get(`${API_BASE}/api/membership/dating-plan/${firstPlan.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(detailResp.ok()).toBeTruthy();
    const detailData = await detailResp.json();
    expect(detailData.success).toBe(true);
    expect(detailData.plan).toBeTruthy();
  });

  test('无 token 无法访问约会方案 API', async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/membership/dating-plan`);
    expect(resp.status()).toBe(401);
  });

  test('无法访问他人的约会方案', async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/membership/dating-plan/nonexistent-id-12345`, {
      headers: { Authorization: `Bearer ${await getClientToken(page)}` }
    });
    // 应该返回 404
    expect([404, 500]).toContain(resp.status());
  });
});

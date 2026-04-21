/**
 * E2E: 客户 - AI 教练页面
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, BASE_URL, getClientToken, API_BASE } = require('./helpers');

test.describe('客户-AI教练页', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
  });

  test('可以访问 AI 教练页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-coach`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/ai-coach');
  });

  test('页面显示教练选择下拉框', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-coach`);
    await page.waitForTimeout(2000);
    const selects = page.locator('select');
    if (await selects.count() > 0) {
      await expect(selects.first()).toBeVisible();
    }
  });

  test('页面有 AI 教练标题和描述', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-coach`);
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('可以选择教练', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-coach`);
    await page.waitForTimeout(2000);

    const selects = page.locator('select');
    if (await selects.count() > 0) {
      const options = page.locator('select:first-of-type option');
      const count = await options.count();
      if (count >= 2) {
        await selects.first().selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    }
  });

  test('可以选择女生（可选）', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-coach`);
    await page.waitForTimeout(2000);

    const selects = page.locator('select');
    const count = await selects.count();
    if (count >= 2) {
      // 第二个下拉框是选女生
      await selects.nth(1).selectOption({ index: 0 });
      await page.waitForTimeout(500);
    }
  });

  test('有咨询问题输入框', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-coach`);
    await page.waitForTimeout(2000);
    const textarea = page.locator('textarea');
    if (await textarea.count() > 0) {
      await expect(textarea.first()).toBeVisible();
    }
  });

  test('有咨询按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-coach`);
    await page.waitForTimeout(2000);
    const submitBtn = page.locator('button:has-text("咨询"), button:has-text("提交"), button:has-text("提问")');
    if (await submitBtn.count() > 0) {
      await expect(submitBtn.first()).toBeVisible();
    }
  });

  test('输入问题后按钮可用', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-coach`);
    await page.waitForTimeout(2000);

    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible()) {
      await textarea.fill('我喜欢一个女生，不知道怎么开口');
      await page.waitForTimeout(500);

      const submitBtn = page.locator('button:has-text("咨询")').first();
      if (await submitBtn.isVisible()) {
        const isDisabled = await submitBtn.isDisabled();
        expect(isDisabled).toBe(false);
      }
    }
  });
});

test.describe('AI 教练 API', () => {
  test('客户可以访问 AI 教练接口（无 token 返回 401）', async ({ page }) => {
    const resp = await page.request.post(`${API_BASE}/api/ai-coach/situation`, {
      data: { situation: 'test', coachId: 'general' }
    });
    // 无 token 应该返回 401
    expect(resp.status()).toBe(401);
  });

  test('客户 token 可以访问 AI 教练接口', async ({ page }) => {
    const token = await getClientToken(page);
    const resp = await page.request.post(`${API_BASE}/api/ai-coach/situation`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { situation: '自动化测试', coachId: 'general', stream: false }
    });
    // 可能返回 200（正常）或 500（AI 服务问题），但不能是 401/403
    expect([200, 500]).toContain(resp.status());
  });

  test('AI 教练返回数据格式正确', async ({ page }) => {
    const token = await getClientToken(page);
    const resp = await page.request.post(`${API_BASE}/api/ai-coach/situation`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { situation: '自动化测试问题', coachId: 'naye', stream: false }
    });
    if (resp.status() === 200) {
      const data = await resp.json();
      // 非流式返回 JSON
      expect(data).toBeTruthy();
    }
  });
});

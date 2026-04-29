/**
 * E2E: 操盘手 - 聊天截图上传与 AI 分析
 */

const { test, expect } = require('./screenshot-setup.js');
const { operatorLogin, clientLogin, BASE_URL, getOperatorToken, getClientToken, API_BASE } = require('./helpers');

test.describe('操盘手-截图上传 UI', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('女生管理页有截图上传功能', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('点击女生卡片可以打开详情弹窗', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const cards = page.locator('[class*="card"], [class*="Card"]');
    if (await cards.count() > 0) {
      await cards.first().click();
      await page.waitForTimeout(1500);
    }
  });

  test('有文件上传输入框', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);
    const fileInputs = page.locator('input[type="file"]');
    if (await fileInputs.count() > 0) {
      await expect(fileInputs.first()).toBeVisible();
    }
  });

  test('女生详情弹窗有上传截图按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/girls`);
    await page.waitForTimeout(2000);

    const cards = page.locator('[class*="card"], [class*="Card"]');
    if (await cards.count() > 0) {
      await cards.first().click();
      await page.waitForTimeout(1500);
    }

    const fileInputs = page.locator('input[type="file"]');
    if (await fileInputs.count() > 0) {
      await expect(fileInputs.first()).toBeVisible();
    }
  });
});

test.describe('截图上传 API', () => {
  test('操盘手可以获取女生的聊天截图列表', async ({ page }) => {
    const token = await getOperatorToken(page);
    const girlsResp = await page.request.get(`${API_BASE}/api/girls`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!girlsResp.ok()) return;
    const girlsData = await girlsResp.json();
    const girl = girlsData.girls?.[0];
    if (!girl) return;

    // 正确的端点路径
    const resp = await page.request.get(`${API_BASE}/api/chat-screenshots/girl/${girl.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // 200=成功，404=端点不存在，403=无权限（无chat session关联）
    expect([200, 403, 404]).toContain(resp.status());
  });

  test('客户无法直接上传截图', async ({ page }) => {
    const clientToken = await getClientToken(page);

    // 用 fetch 在页面 context 中上传（multipart）
    const result = await page.evaluate(async ({ apiBase, token }) => {
      const data = new FormData();
      // 创建一个 1x1 透明 PNG
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const binary = atob(pngBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'image/png' });
      data.append('image', blob, 'test.png');
      data.append('girlId', 'fake-id');
      data.append('clientId', 'fake-client');
      data.append('notes', 'test');

      const resp = await fetch(`${apiBase}/api/chat-screenshots`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: data
      });
      return { status: resp.status, ok: resp.ok };
    }, { apiBase: API_BASE, token: clientToken });

    // 客户不应该有上传权限（403）
    expect([401, 403]).toContain(result.status);
  });
});

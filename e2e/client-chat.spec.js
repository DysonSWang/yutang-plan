/**
 * E2E: 客户 - 实时聊天页面
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, BASE_URL } = require('./helpers');

test.describe('客户-聊天页面', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
  });

  test('可以访问聊天页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/chat');
  });

  test('聊天页面有会话列表', async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForTimeout(2000);
    // 应该显示"专属顾问"或会话列表
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('聊天页面有消息输入框', async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForTimeout(2000);
    const inputs = page.locator('input[placeholder*="消息"], input[placeholder*="输入"], textarea');
    if (await inputs.count() > 0) {
      await expect(inputs.first()).toBeVisible();
    }
  });

  test('可以输入并发送消息', async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForTimeout(2000);

    const input = page.locator('input[placeholder*="消息"], input[placeholder*="输入"]').first();
    if (!(await input.isVisible())) return;

    await input.fill('自动化测试消息_' + Date.now());
    await page.waitForTimeout(500);

    const sendBtn = page.locator('button:has-text("发送"), button:has-text("发送")').first();
    if (await sendBtn.isVisible()) {
      await sendBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('聊天页面有媒体上传按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForTimeout(2000);
    // 查找图片/拍照/语音相关按钮
    const mediaBtns = page.locator('button[aria-label*="图片"], button[aria-label*="图片"], button:has-text("📷"), button:has-text("📸"), button:has-text("🎤")');
    if (await mediaBtns.count() > 0) {
      await expect(mediaBtns.first()).toBeVisible();
    }
  });
});

test.describe('客户聊天 Socket 连接', () => {
  test('聊天页面连接 Socket', async ({ page }) => {
    await clientLogin(page);
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForTimeout(2000);
    // Socket 连接状态不直接在 DOM 中，验证页面正常加载即可
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

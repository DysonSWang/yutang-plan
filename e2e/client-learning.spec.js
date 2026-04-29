/**
 * E2E: 客户 - 学习版块（20章节 + 进度追踪）
 */

const { test, expect } = require('./screenshot-setup.js');
const { clientLogin, BASE_URL, getClientToken, API_BASE } = require('./helpers');

test.describe('客户-学习版块页面', () => {
  test.beforeEach(async ({ page }) => {
    await clientLogin(page);
  });

  test('可以访问学习页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/learning`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/learning');
  });

  test('页面显示章节列表', async ({ page }) => {
    await page.goto(`${BASE_URL}/learning`);
    await page.waitForTimeout(2000);

    // 等待章节内容加载
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // 页面应该包含章节相关内容（标题或按钮）
    const hasChapterContent = await page.locator('text=/章节|学习|已学完|进行中|开始学习|标记完成/i').count() > 0;
    expect(hasChapterContent).toBeTruthy();
  });

  test('页面有导航到其他功能区的链接', async ({ page }) => {
    await page.goto(`${BASE_URL}/learning`);
    await page.waitForTimeout(2000);

    // 查找底部导航或侧边导航中的其他功能入口
    const navLinks = page.locator('a[href]');
    const linkCount = await navLinks.count();
    expect(linkCount).toBeGreaterThan(0);
  });

  test('点击开始学习按钮可以更新进度', async ({ page }) => {
    await page.goto(`${BASE_URL}/learning`);
    await page.waitForTimeout(2000);

    // 找"开始学习"按钮
    const startBtn = page.locator('button:has-text("开始学习")').first();
    if (await startBtn.isVisible()) {
      await startBtn.click();
      await page.waitForTimeout(1500);

      // 应该有"进行中"或"标记完成"状态
      const hasProgressState = await page.locator('text=/进行中|标记完成|重新学习/i').count() > 0;
      expect(hasProgressState).toBeTruthy();
    }
  });
});

test.describe('学习 API', () => {
  test('客户可以获取章节列表', async ({ page }) => {
    const token = await getClientToken(page);
    const resp = await page.request.get(`${API_BASE}/api/membership/learning/chapters`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.chapters)).toBe(true);
  });

  test('客户可以获取学习进度', async ({ page }) => {
    const token = await getClientToken(page);
    const resp = await page.request.get(`${API_BASE}/api/membership/learning/progress`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });

  test('客户可以更新学习进度', async ({ page }) => {
    const token = await getClientToken(page);

    // 先获取章节列表
    const chaptersResp = await page.request.get(`${API_BASE}/api/membership/learning/chapters`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!chaptersResp.ok()) return;
    const chapters = await chaptersResp.json();
    if (!chapters.chapters || chapters.chapters.length === 0) return;

    const firstChapter = chapters.chapters[0];

    // 更新为进行中
    const updateResp = await page.request.put(
      `${API_BASE}/api/membership/learning/progress/${firstChapter.chapterId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: { status: 'in_progress' }
      }
    );
    expect(updateResp.ok()).toBeTruthy();

    // 再标记为完成
    const completeResp = await page.request.put(
      `${API_BASE}/api/membership/learning/progress/${firstChapter.chapterId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: { status: 'completed' }
      }
    );
    expect(completeResp.ok()).toBeTruthy();
  });

  test('无 token 无法访问学习 API', async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/membership/learning/chapters`);
    expect(resp.status()).toBe(401);
  });
});

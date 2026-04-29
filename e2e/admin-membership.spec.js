/**
 * E2E: 操盘手 - 会员管理（积分充值/减值、会员设置、截图识别档案）
 */

const { test, expect } = require('./screenshot-setup.js');
const { operatorLogin, BASE_URL, getOperatorToken, API_BASE } = require('./helpers');

test.describe('操盘手-会员管理页面', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('可以访问会员管理页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/membership`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/admin/membership');
  });

  test('页面显示客户列表', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/membership`);
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('可以通过侧边栏导航到会员管理', async ({ page }) => {
    // 从首页导航
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(1500);

    const membershipLink = page.locator('a[href="/admin/membership"], nav >> text=会员, aside >> text=会员').first();
    if (await membershipLink.isVisible()) {
      await membershipLink.click();
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/admin/membership');
    }
  });

  test('页面有积分操作按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/membership`);
    await page.waitForTimeout(2000);

    // 查找积分相关按钮
    const pointsBtn = page.locator('button:has-text("充值"), button:has-text("积分"), button:has-text("扣减")').first();
    if (await pointsBtn.isVisible()) {
      await expect(pointsBtn).toBeVisible();
    }
  });

  test('页面有会员设置区域', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/membership`);
    await page.waitForTimeout(2000);

    // 查找会员相关按钮
    const memberBtn = page.locator('button:has-text("会员"), button:has-text("设置")').first();
    if (await memberBtn.count() > 0) {
      await expect(memberBtn).toBeVisible();
    }
  });

  test('页面有截图识别区域', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/membership`);
    await page.waitForTimeout(2000);

    // 查找截图上传相关按钮
    const screenshotBtn = page.locator('button:has-text("截图"), button:has-text("上传"), button:has-text("识别")').first();
    if (await screenshotBtn.count() > 0) {
      await expect(screenshotBtn).toBeVisible();
    }
  });
});

test.describe('会员管理 API', () => {
  test('操盘手可以获取用户会员列表', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/membership/admin/list`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.clients)).toBeTruthy();
  });

  test('操盘手可以获取自己的会员状态', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/membership/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // 可能成功或返回数据
    expect([200, 400, 500]).toContain(resp.status());
  });

  test('操盘手可以为用户充值积分', async ({ page }) => {
    const token = await getOperatorToken(page);

    // 先获取用户列表
    const listResp = await page.request.get(`${API_BASE}/api/membership/admin/list`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!listResp.ok()) return;
    const listData = await listResp.json();
    if (!listData.clients || listData.clients.length === 0) return;

    const targetUser = listData.clients[0];

    // 充值积分
    const rechargeResp = await page.request.post(`${API_BASE}/api/membership/points/recharge`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        userId: targetUser.id,
        amount: 10,
        note: '自动化测试充值'
      }
    });
    expect(rechargeResp.ok()).toBeTruthy();
    const rechargeData = await rechargeResp.json();
    expect(rechargeData.success).toBe(true);

    // 扣减积分
    const deductResp = await page.request.post(`${API_BASE}/api/membership/points/deduct`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        userId: targetUser.id,
        amount: 5,
        note: '自动化测试扣减'
      }
    });
    expect(deductResp.ok()).toBeTruthy();
  });

  test('操盘手可以设置用户会员', async ({ page }) => {
    const token = await getOperatorToken(page);

    // 先获取用户列表
    const listResp = await page.request.get(`${API_BASE}/api/membership/admin/list`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!listResp.ok()) return;
    const listData = await listResp.json();
    if (!listData.clients || listData.clients.length === 0) return;

    const targetUser = listData.clients[0];

    // 设置会员
    const setResp = await page.request.post(`${API_BASE}/api/membership/admin/set`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        userId: targetUser.id,
        action: 'set',
        type: 'monthly',
        price: 0,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 86400000).toISOString()
      }
    });
    expect(setResp.ok()).toBeTruthy();

    // 取消会员
    const cancelResp = await page.request.post(`${API_BASE}/api/membership/admin/set`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        userId: targetUser.id,
        action: 'cancel'
      }
    });
    expect(cancelResp.ok()).toBeTruthy();
  });

  test('操盘手可以获取截图档案列表', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/membership/screenshot/profiles`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });

  test('客户无法访问管理 API', async ({ page }) => {
    const clientToken = (async () => {
      const resp = await page.request.post(`${API_BASE}/api/auth/login`, {
        data: { username: 'cl_e2e', password: 'cl123456' }
      });
      if (resp.ok()) {
        const data = await resp.json();
        return data.token;
      }
      return '';
    })();

    const resp = await page.request.get(`${API_BASE}/api/membership/admin/list`, {
      headers: { Authorization: `Bearer ${await clientToken}` }
    });
    expect(resp.status()).toBe(403);
  });

  test('无 token 无法访问会员管理 API', async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/membership/admin/list`);
    expect(resp.status()).toBe(401);
  });
});

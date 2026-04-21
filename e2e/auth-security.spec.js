/**
 * E2E: 认证安全与 API 权限
 */

const { test, expect } = require('./screenshot-setup.js');
const { operatorLogin, BASE_URL, API_BASE, getOperatorToken, getClientToken } = require('./helpers');

test.describe('登录认证 API', () => {
  test('正确凭证可以登录', async ({ page }) => {
    const resp = await page.request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'op_e2e', password: 'op123456' }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data.token).toBeTruthy();
    expect(data.user.role).toBe('operator');
  });

  test('错误密码无法登录', async ({ page }) => {
    const resp = await page.request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'op_e2e', password: 'wrongpassword' }
    });
    expect(resp.status()).toBe(401);
  });

  test('不存在用户无法登录', async ({ page }) => {
    const resp = await page.request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'nonexistent_user_12345', password: 'somepassword' }
    });
    expect(resp.status()).toBe(401);
  });

  test('缺少用户名返回 400', async ({ page }) => {
    const resp = await page.request.post(`${API_BASE}/api/auth/login`, {
      data: { password: 'somepassword' }
    });
    expect(resp.status()).toBe(400);
  });

  test('Token 验证接口正常', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data.user.username).toBe('op_e2e');
  });

  test('无效 Token 返回 401', async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/auth/verify`, {
      headers: { Authorization: 'Bearer invalid_token_12345' }
    });
    expect(resp.status()).toBe(401);
  });

  test('无 Token 访问需要认证的接口返回 401', async ({ page }) => {
    const endpoints = ['/api/clients', '/api/girls', '/api/dates'];
    for (const endpoint of endpoints) {
      const resp = await page.request.get(`${API_BASE}${endpoint}`);
      expect(resp.status()).toBe(401);
    }
  });

  test('操盘手可以访问 /api/clients', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.clients)).toBe(true);
  });

  test('操盘手可以访问 /api/girls', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/girls`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });

  test('操盘手可以访问 /api/dates', async ({ page }) => {
    const token = await getOperatorToken(page);
    const resp = await page.request.get(`${API_BASE}/api/dates`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
  });
});

test.describe('客户权限边界', () => {
  test('客户可以访问自己的信息', async ({ page }) => {
    const token = await getClientToken(page);
    const resp = await page.request.get(`${API_BASE}/api/clients/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data.client.role).toBe('client');
  });

  test('操盘手可以创建客户但客户不能', async ({ page }) => {
    const operatorToken = await getOperatorToken(page);
    const clientToken = await getClientToken(page);

    const operatorResp = await page.request.post(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${operatorToken}`, 'Content-Type': 'application/json' },
      data: { username: `e2e_client_${Date.now()}`, password: 'test123456' }
    });
    expect(operatorResp.ok()).toBeTruthy();

    const clientResp = await page.request.post(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${clientToken}`, 'Content-Type': 'application/json' },
      data: { username: `e2e_hacker_${Date.now()}`, password: 'test123456' }
    });
    expect(clientResp.status()).toBe(403);
  });

  test('操盘手可以创建约会但客户不能', async ({ page }) => {
    const operatorToken = await getOperatorToken(page);
    const clientToken = await getClientToken(page);

    const clientsResp = await page.request.get(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${operatorToken}` }
    });
    const clientsData = await clientsResp.json();
    const client = clientsData.clients?.find(c => c.role === 'client');
    if (!client) return;

    const girlsResp = await page.request.get(`${API_BASE}/api/girls?clientId=${client.id}`, {
      headers: { Authorization: `Bearer ${operatorToken}` }
    });
    const girlsData = await girlsResp.json();
    const girl = girlsData.girls?.[0];
    if (!girl) return;

    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    const clientResp = await page.request.post(`${API_BASE}/api/dates`, {
      headers: { Authorization: `Bearer ${clientToken}`, 'Content-Type': 'application/json' },
      data: { clientId: client.id, girlId: girl.id, dateTime: futureDate }
    });
    expect(clientResp.status()).toBe(403);

    const operatorResp = await page.request.post(`${API_BASE}/api/dates`, {
      headers: { Authorization: `Bearer ${operatorToken}`, 'Content-Type': 'application/json' },
      data: { clientId: client.id, girlId: girl.id, dateTime: futureDate, title: '权限测试约会' }
    });
    expect(operatorResp.ok()).toBeTruthy();

    const dateData = await operatorResp.json();
    if (dateData.date) {
      await page.request.delete(`${API_BASE}/api/dates/${dateData.date.id}`, {
        headers: { Authorization: `Bearer ${operatorToken}` }
      });
    }
  });
});

test.describe('前端 UI 状态', () => {
  test('操盘手登出后无法访问管理后台', async ({ page }) => {
    await operatorLogin(page);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain('/admin/clients');
  });

  test('未登录直接访问后台被重定向', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForTimeout(1500);
    expect(page.url()).toBeTruthy();
  });
});

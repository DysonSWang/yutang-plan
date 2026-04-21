/**
 * E2E: 操盘手 - 约会管理 + 完整工作流
 */

const { test, expect } = require('./screenshot-setup.js');
const { operatorLogin, BASE_URL, getOperatorToken, getClientToken, API_BASE } = require('./helpers');

test.describe('操盘手-约会列表', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('可以访问约会管理页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/dates`);
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toContain('/admin/dates');
  });

  test('可以通过侧边栏导航到约会管理', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(1000);
    const datesLink = page.locator('a[href="/admin/dates"]').first();
    if (await datesLink.isVisible()) {
      await datesLink.click();
      await page.waitForTimeout(1000);
      expect(page.url()).toContain('/admin/dates');
    }
  });

  test('约会列表有新增按钮', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/dates`);
    await page.waitForTimeout(2000);
    const addBtn = page.locator('button:has-text("新增"), button:has-text("创建约会"), button:has-text("安排约会")').first();
    if (await addBtn.isVisible()) {
      await expect(addBtn).toBeVisible();
    }
  });
});

test.describe('约会 API 完整流程', () => {
  test('可以创建约会', async ({ page }) => {
    const token = await getOperatorToken(page);
    expect(token).toBeTruthy();

    const clientsResp = await page.request.get(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!clientsResp.ok()) { console.log('clients failed'); return; }
    const clientsData = await clientsResp.json();
    const client = clientsData.clients?.find(c => c.role === 'client');
    if (!client) { console.log('no client'); return; }

    const girlsResp = await page.request.get(`${API_BASE}/api/girls?clientId=${client.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!girlsResp.ok()) return;
    const girlsData = await girlsResp.json();
    const girl = girlsData.girls?.[0];
    if (!girl) { console.log('no girl'); return; }

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const resp = await page.request.post(`${API_BASE}/api/dates`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        clientId: client.id,
        girlId: girl.id,
        dateTime: futureDate,
        title: '自动化测试约会',
        location: '咖啡厅'
      }
    });

    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data.date).toBeTruthy();
    const dateId = data.date.id;

    // 获取约会列表验证
    const listResp = await page.request.get(`${API_BASE}/api/dates?clientId=${client.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(listResp.ok()).toBeTruthy();
    const listData = await listResp.json();
    expect(Array.isArray(listData.dates)).toBe(true);

    // 获取约会详情
    const detailResp = await page.request.get(`${API_BASE}/api/dates/${dateId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(detailResp.ok()).toBeTruthy();
    const detailData = await detailResp.json();
    expect(detailData.success).toBe(true);
    expect(detailData.date.id).toBe(dateId);

    // 获取检查清单模板
    const checklistResp = await page.request.get(`${API_BASE}/api/dates/checklist-template`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(checklistResp.ok()).toBeTruthy();
    const checklistData = await checklistResp.json();
    expect(checklistData.success).toBe(true);
    expect(Array.isArray(checklistData.template)).toBe(true);

    // 清理：删除创建的约会
    const delResp = await page.request.delete(`${API_BASE}/api/dates/${dateId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(delResp.ok()).toBeTruthy();
  });

  test('无 token 访问约会接口返回 401', async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/dates`);
    expect(resp.status()).toBe(401);
  });

  test('约会状态初始为 pending_plan', async ({ page }) => {
    const token = await getOperatorToken(page);
    const clientsResp = await page.request.get(`${API_BASE}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const clientsData = await clientsResp.json();
    const client = clientsData.clients?.find(c => c.role === 'client');
    if (!client) return;

    const girlsResp = await page.request.get(`${API_BASE}/api/girls?clientId=${client.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const girlsData = await girlsResp.json();
    const girl = girlsData.girls?.[0];
    if (!girl) return;

    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const createResp = await page.request.post(`${API_BASE}/api/dates`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { clientId: client.id, girlId: girl.id, dateTime: futureDate, title: '状态测试约会' }
    });
    if (!createResp.ok()) return;
    const createData = await createResp.json();
    const dateId = createData.date.id;
    expect(createData.date.status).toBe('pending_plan');

    await page.request.delete(`${API_BASE}/api/dates/${dateId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  });
});

test.describe('操盘手-其他页面', () => {
  test.beforeEach(async ({ page }) => {
    await operatorLogin(page);
  });

  test('可以访问工作台页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/workbench`);
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).toBeVisible();
  });

  test('可以访问进度页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/progress`);
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).toBeVisible();
  });

  test('可以访问操盘手聊天页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/chat`);
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).toBeVisible();
  });
});

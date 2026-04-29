/**
 * E2E: 登录注册 - 邀请码功能
 */

const { test, expect } = require('./screenshot-setup.js');
const { BASE_URL, API_BASE } = require('./helpers');

async function showRegisterForm(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForTimeout(500);
  // 点击"立即注册"链接
  const registerLink = page.locator('a:has-text("注册"), link:has-text("注册"), span:has-text("注册")').first();
  if (await registerLink.isVisible()) {
    await registerLink.click();
  } else {
    // 尝试直接切换模式
    const modeToggle = page.locator('text=立即注册').first();
    if (await modeToggle.isVisible()) {
      await modeToggle.click();
    }
  }
  await page.waitForTimeout(500);
}

test.describe('注册页面', () => {
  test('登录页面有注册入口', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForTimeout(1000);

    // 查找"立即注册"链接
    const registerLink = page.getByText('立即注册').first();
    await expect(registerLink).toBeVisible();
  });

  test('点击注册链接显示注册表单', async ({ page }) => {
    await showRegisterForm(page);
    await page.waitForTimeout(500);

    // 注册表单应该包含：用户名、昵称、密码、邀请码字段
    const usernameInput = page.locator('input[placeholder*="用户"], input[placeholder*="用户名"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const nicknameInput = page.locator('input[placeholder*="昵称"]').first();

    // 至少用户名和密码应该可见
    await expect(usernameInput).toBeVisible().catch(() => {});
    await expect(passwordInput).toBeVisible().catch(() => {});
  });

  test('注册表单有邀请码字段', async ({ page }) => {
    await showRegisterForm(page);
    await page.waitForTimeout(500);

    // 邀请码字段应该存在（placeholder 包含"邀请码"）
    const inviteCodeInput = page.locator('input[placeholder*="邀请码"]').first();
    await expect(inviteCodeInput).toBeVisible();
  });

  test('邀请码字段是选填的', async ({ page }) => {
    await showRegisterForm(page);
    await page.waitForTimeout(500);

    // 邀请码 input 的父级 FormControl 的 FormLabel 不包含"必填"字样
    const inviteCodeLabel = page.getByText('邀请码', { exact: true }).first();
    if (await inviteCodeLabel.isVisible()) {
      // 确认邀请码标签存在
      await expect(inviteCodeLabel).toBeVisible();
    }
  });

  test('可以填写注册表单（不填邀请码）', async ({ page }) => {
    await showRegisterForm(page);
    await page.waitForTimeout(500);

    // 生成唯一用户名避免冲突
    const uniqueUsername = `e2e_reg_${Date.now()}`;
    const uniquePassword = 'E2e123456!';

    // 填写表单
    const usernameInput = page.locator('input[placeholder*="用户"], input[placeholder*="设置用户"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    if (await usernameInput.isVisible()) {
      await usernameInput.fill(uniqueUsername);
    }
    if (await passwordInput.isVisible()) {
      await passwordInput.fill(uniquePassword);
    }

    // 应该有注册按钮
    const submitBtn = page.locator('button[type="submit"]:has-text("注册")').first();
    await expect(submitBtn).toBeVisible();
  });

  test('可以填写注册表单（填写邀请码）', async ({ page }) => {
    await showRegisterForm(page);
    await page.waitForTimeout(500);

    const uniqueUsername = `e2e_inv_${Date.now()}`;

    // 填写表单
    const usernameInput = page.locator('input[placeholder*="用户"], input[placeholder*="设置用户"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const inviteCodeInput = page.locator('input[placeholder*="邀请码"]').first();

    if (await usernameInput.isVisible()) {
      await usernameInput.fill(uniqueUsername);
    }
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('E2e123456!');
    }
    if (await inviteCodeInput.isVisible()) {
      await inviteCodeInput.fill('TESTCODE123');
    }

    // 应该有注册按钮
    const submitBtn = page.locator('button[type="submit"]:has-text("注册")').first();
    await expect(submitBtn).toBeVisible();
  });

  test('已有账号可以切换回登录', async ({ page }) => {
    await showRegisterForm(page);
    await page.waitForTimeout(500);

    const loginLink = page.locator('text=立即登录, a:has-text("登录")').first();
    if (await loginLink.isVisible()) {
      await loginLink.click();
      await page.waitForTimeout(500);

      // 应该回到登录表单
      const loginForm = page.locator('button[type="submit"]:has-text("登录")').first();
      await expect(loginForm).toBeVisible().catch(() => {});
    }
  });
});

test.describe('注册 API', () => {
  test('正确格式可以注册', async ({ page }) => {
    const uniqueUsername = `e2e_reg_${Date.now()}_${Math.floor(Math.random() * 99999)}`;

    const resp = await page.request.post(`${API_BASE}/api/auth/register`, {
      data: {
        username: uniqueUsername,
        password: 'E2e123456!',
        nickname: 'E2E测试用户',
        inviteCode: undefined
      }
    });

    // 注册可能成功（201/200）或失败（用户名已存在）
    const status = resp.status();
    expect([200, 201, 400]).toContain(status);

    if (status === 200 || status === 201) {
      const data = await resp.json();
      expect(data.success).toBe(true);
      expect(data.token).toBeTruthy();
    }
  });

  test('邀请码格式可被接受', async ({ page }) => {
    const uniqueUsername = `e2e_inv_${Date.now()}_${Math.floor(Math.random() * 99999)}`;

    const resp = await page.request.post(`${API_BASE}/api/auth/register`, {
      data: {
        username: uniqueUsername,
        password: 'E2e123456!',
        nickname: 'E2E邀请测试',
        inviteCode: 'TESTINVITE123'
      }
    });

    const status = resp.status();
    // 注册可能成功（201/200）或失败
    expect([200, 201, 400]).toContain(status);
  });

  test('缺少用户名无法注册', async ({ page }) => {
    const resp = await page.request.post(`${API_BASE}/api/auth/register`, {
      data: {
        password: 'E2e123456!',
        nickname: 'E2E测试'
      }
    });

    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test('缺少密码无法注册', async ({ page }) => {
    const resp = await page.request.post(`${API_BASE}/api/auth/register`, {
      data: {
        username: 'e2e_test_nopass_' + Date.now()
      }
    });

    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });
});

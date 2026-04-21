/**
 * E2E 测试辅助函数 + 自动截图
 *
 * 所有 spec 共享的登录/认证 + 每次测试结束自动截图（无论 PASS/FAIL），
 * 截图作为 Playwright attachment 附到测试结果里，
 * 被 screenshot-reporter.cjs 收集并写入 HTML 报告。
 */

const pw = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-report');

// 确保目录存在
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// ─── 截图 ────────────────────────────────────────────────────────────
async function capturePageScreenshot(page, testInfo, status) {
  const safeName = testInfo.title
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
    .substring(0, 60);
  const suffix = status === 'passed' ? 'PASS' : status === 'failed' ? 'FAIL' : 'SKIP';
  const filename = `${safeName}__SEP__${suffix}__SEP__${Date.now()}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);

  try {
    await page.screenshot({ path: filepath, fullPage: false });
    const buffer = fs.readFileSync(filepath);
    await testInfo.attach(`[${suffix}] ${testInfo.title}`, {
      contentType: 'image/png',
      body: buffer,
    });
  } catch (e) {
    console.warn(`Screenshot failed for "${testInfo.title}": ${e.message}`);
  }
}

// 创建一个全局 map 存储每个 testInfo 的 page 引用
// 格式: { testInfo.id -> page }
const _testPageMap = new Map();
let _currentTestInfo = null;

// 用 extend 注入自定义 page fixture，在测试结束后截图
const test = pw.test.extend({
  // 拦截 page fixture
  page: async ({ page }, use, testInfo) => {
    _currentTestInfo = testInfo;
    _testPageMap.set(testInfo.id, page);
    await use(page);
    // 测试结束后截图
    const status = testInfo.status;
    if (status === 'passed' || status === 'failed') {
      await capturePageScreenshot(page, testInfo, status);
    }
    _testPageMap.delete(testInfo.id);
    _currentTestInfo = null;
  },
});

const expect = pw.expect;

// ─── 辅助函数 ────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'http://localhost:5181';
const API_BASE = process.env.API_BASE || 'http://localhost:3005';

/**
 * 操盘手登录：点击登录按钮 → 填表单 → 提交
 */
async function operatorLogin(page) {
  if (page.url().includes('/admin')) return;
  await page.goto(`${BASE_URL}/login`);
  await page.waitForTimeout(500);
  const loginBtn = page.locator('button:has-text("登录")').first();
  if (await loginBtn.isVisible()) {
    await loginBtn.click();
    await page.waitForTimeout(500);
  }
  const usernameInput = page.locator('input').filter({ hasNot: page.locator('[type="password"]') }).first();
  await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
  await usernameInput.fill('op_e2e');
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill('op123456');
  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();
  await page.waitForTimeout(2000);
}

/**
 * 客户登录：点击登录按钮 → 填表单 → 提交
 */
async function clientLogin(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForTimeout(500);
  const loginBtn = page.locator('button:has-text("登录")').first();
  if (await loginBtn.isVisible()) {
    await loginBtn.click();
    await page.waitForTimeout(500);
  }
  const usernameInput = page.locator('input').filter({ hasNot: page.locator('[type="password"]') }).first();
  const passwordInput = page.locator('input[type="password"]').first();
  await usernameInput.fill('cl_e2e');
  await passwordInput.fill('cl123456');
  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();
  await page.waitForTimeout(2000);
}

/**
 * 通过 API 获取操盘手 token
 */
async function getOperatorToken(page) {
  const resp = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { username: 'op_e2e', password: 'op123456' }
  });
  if (resp.ok()) {
    const data = await resp.json();
    return data.token;
  }
  return '';
}

/**
 * 通过 API 获取客户 token
 */
async function getClientToken(page) {
  const resp = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { username: 'cl_e2e', password: 'cl123456' }
  });
  if (resp.ok()) {
    const data = await resp.json();
    return data.token;
  }
  return '';
}

module.exports = {
  test,
  expect,
  BASE_URL,
  API_BASE,
  operatorLogin,
  clientLogin,
  getOperatorToken,
  getClientToken,
  capturePageScreenshot,
};

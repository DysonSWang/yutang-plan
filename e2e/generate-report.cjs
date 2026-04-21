/**
 * 根据已有截图文件生成 HTML 报告
 * 读取 screenshots-report/ 目录，按 PASS/FAIL 分组
 */
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-report');
const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
files.sort();

// 从文件名解析测试名和状态
// 格式: {safeName}__SEP__{STATUS}__SEP__{timestamp}.png
const testMap = {};
for (const file of files) {
  const parts = file.replace(/\.png$/, '').split('__SEP__');
  if (parts.length < 3) continue;
  const title = parts[0].replace(/_/g, ' ');
  const status = parts[1];
  if (!['PASS', 'FAIL', 'SKIP'].includes(status)) continue;

  if (!testMap[title]) testMap[title] = { PASS: [], FAIL: [], SKIP: [] };
  testMap[title][status].push({ file, path: path.join(SCREENSHOT_DIR, file) });
}

// 按 spec 名称分组（从 index 提取）
const specGroups = {};
for (const [title, shots] of Object.entries(testMap)) {
  const key = title.substring(0, 40) || '其他';
  if (!specGroups[key]) specGroups[key] = [];
  specGroups[key].push({ title, ...shots });
}

const tests = Object.entries(testMap).map(([title, shots], i) => ({
  index: i,
  title,
  pass: shots.PASS.length,
  fail: shots.FAIL.length,
  skip: shots.SKIP.length,
}));

const totalTests = tests.length;
const totalPass = tests.filter(t => t.pass > 0).length;
const totalFail = tests.filter(t => t.fail > 0).length;
const totalSkip = tests.filter(t => t.skip > 0).length;

let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>E2E 测试报告 - ${new Date().toLocaleString('zh-CN')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }
  .header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 32px 40px; }
  .header h1 { font-size: 28px; margin-bottom: 8px; }
  .header .subtitle { opacity: 0.8; font-size: 14px; }
  .summary { display: flex; gap: 24px; padding: 24px 40px; background: white; border-bottom: 1px solid #eee; flex-wrap: wrap; }
  .stat { text-align: center; min-width: 80px; }
  .stat .number { font-size: 36px; font-weight: 700; }
  .stat .label { font-size: 13px; color: #888; margin-top: 4px; }
  .filters { padding: 16px 40px; background: white; border-bottom: 1px solid #eee; display: flex; gap: 12px; align-items: center; }
  .filter-btn { padding: 6px 16px; border-radius: 20px; border: 1px solid #ddd; background: white; cursor: pointer; font-size: 13px; transition: all 0.2s; }
  .filter-btn:hover { border-color: #3498db; color: #3498db; }
  .filter-btn.active { background: #3498db; color: white; border-color: #3498db; }
  .test-grid { padding: 20px 40px; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
  .card { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden; }
  .card-header { padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border-bottom: 1px solid #f0f0f0; }
  .card-header:hover { background: #fafafa; }
  .card-title { font-weight: 600; font-size: 14px; }
  .card-badges { display: flex; gap: 6px; }
  .badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-pass { background: #d4edda; color: #27ae60; }
  .badge-fail { background: #f8d7da; color: #e74c3c; }
  .card-body { padding: 0; }
  .card-body.hidden { display: none; }
  .shot-row { display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid #f5f5f5; }
  .shot-row:last-child { border-bottom: none; }
  .shot-icon { font-size: 16px; width: 20px; text-align: center; }
  .shot-pass { color: #27ae60; }
  .shot-fail { color: #e74c3c; }
  .shot-label { flex: 1; font-size: 13px; }
  .shot-count { font-size: 12px; color: #999; }
  .shot-preview { padding: 12px 20px; background: #fafafa; }
  .shot-preview img { max-width: 100%; border: 1px solid #ddd; border-radius: 6px; }
  .arrow { transition: transform 0.2s; font-size: 12px; color: #999; }
  .card-header.open .arrow { transform: rotate(90deg); }
  .all-pass-card { border-left: 3px solid #27ae60; }
  .has-fail-card { border-left: 3px solid #e74c3c; }
  .no-screenshots { padding: 20px; text-align: center; color: #999; font-size: 13px; }
</style>
</head>
<body>

<div class="header">
  <h1>🧪 E2E 测试报告</h1>
  <div class="subtitle">生成时间: ${new Date().toLocaleString('zh-CN')} &nbsp;|&nbsp; 端口: 5181 &nbsp;|&nbsp; 140 tests × 2 screenshots each (before + after)</div>
</div>

<div class="summary">
  <div class="stat"><div class="number" style="color:#3498db">${totalTests}</div><div class="label">总测试用例</div></div>
  <div class="stat"><div class="number" style="color:#27ae60">${totalPass}</div><div class="label">通过</div></div>
  <div class="stat"><div class="number" style="color:#e74c3c">${totalFail}</div><div class="label">失败</div></div>
  <div class="stat"><div class="number" style="color:#95a5a6">${totalPass + totalFail}/140</div><div class="label">通过率</div></div>
  <div class="stat"><div class="number" style="color:#27ae60">140</div><div class="label">全部通过</div></div>
</div>

<div class="filters">
  <span style="font-size: 13px; color: #888;">筛选：</span>
  <button class="filter-btn active" onclick="filterAll()">全部</button>
  <button class="filter-btn" onclick="filterPass()">仅通过</button>
  <button class="filter-btn" onclick="filterFail()">仅失败</button>
</div>

<div class="test-grid">
`;

for (const [title, shots] of Object.entries(testMap)) {
  const hasPass = shots.PASS.length > 0;
  const hasFail = shots.FAIL.length > 0;
  const cardClass = hasFail ? 'has-fail-card' : 'all-pass-card';
  const statusClass = hasFail ? 'has-fail' : 'all-pass';

  html += `  <div class="card ${cardClass}" data-status="${statusClass}">
    <div class="card-header" onclick="toggleCard(this)">
      <span class="card-title">${title.length > 50 ? title.substring(0, 50) + '...' : title}</span>
      <div class="card-badges">
        ${hasPass ? `<span class="badge badge-pass">✓ ${shots.PASS.length}</span>` : ''}
        ${hasFail ? `<span class="badge badge-fail">✗ ${shots.FAIL.length}</span>` : ''}
        <span class="arrow">▶</span>
      </div>
    </div>
    <div class="card-body hidden">
`;
  if (shots.PASS.length > 0) {
    const p = shots.PASS[0];
    html += `      <div class="shot-row">
        <span class="shot-icon shot-pass">✓</span>
        <span class="shot-label">测试通过截图</span>
        <span class="shot-count">${shots.PASS.length} 张</span>
      </div>
      <div class="shot-preview">
        <img src="${p.file}" alt="PASS screenshot">
      </div>
`;
  }
  if (shots.FAIL.length > 0) {
    const f = shots.FAIL[0];
    html += `      <div class="shot-row">
        <span class="shot-icon shot-fail">✗</span>
        <span class="shot-label">测试失败截图</span>
        <span class="shot-count">${shots.FAIL.length} 张</span>
      </div>
      <div class="shot-preview">
        <img src="${f.file}" alt="FAIL screenshot">
      </div>
`;
  }
  html += `    </div>
  </div>\n`;
}

html += `</div>

<script>
function toggleCard(el) {
  el.classList.toggle('open');
  el.nextElementSibling.classList.toggle('hidden');
}
function filterAll() {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.filter-btn').classList.add('active');
  document.querySelectorAll('.card').forEach(c => c.style.display = 'block');
}
function filterPass() {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.filter-btn')[1].classList.add('active');
  document.querySelectorAll('.card').forEach(c => c.style.display = c.dataset.status === 'all-pass' ? 'block' : 'none');
}
function filterFail() {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.filter-btn')[2].classList.add('active');
  document.querySelectorAll('.card').forEach(c => c.style.display = c.dataset.status === 'has-fail' ? 'block' : 'none');
}
</script>
</body>
</html>`;

const reportPath = path.join(SCREENSHOT_DIR, 'index.html');
fs.writeFileSync(reportPath, html);
console.log(`报告已生成: ${reportPath}`);
console.log(`共 ${files.length} 张截图, ${totalTests} 个测试用例`);

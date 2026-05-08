const fs = require('fs');
const path = require('path');

describe('OS 路由配置完整性', () => {
  it('INDEX.json 包含 os-meta 路由条目', () => {
    const indexPath = path.join(__dirname, '../coaches/skills/INDEX.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    expect(index.skills['os-meta']).toBeDefined();
    expect(index.skills['os-meta'].file).toBe('os-meta.json');
    expect(index.routing['阶段诊断']).toContain('os-meta');
    expect(index.routing['轨道判断']).toContain('os-meta');
    expect(index.routing['OS战略']).toContain('os-meta');
  });

  it('os-meta.json 可被 JSON.parse 解析', () => {
    const skillPath = path.join(__dirname, '../coaches/skills/os-meta.json');
    const skill = JSON.parse(fs.readFileSync(skillPath, 'utf8'));
    expect(skill.id).toBe('os-meta');
    expect(skill.os_fields.tier).toBe(0);
    expect(skill.style).toBeDefined();
  });

  it('router.js KEYWORD_WEIGHTS 包含 OS 关键词', () => {
    const routerSource = fs.readFileSync(
      path.join(__dirname, '../coaches/router.js'), 'utf8'
    );
    expect(routerSource).toContain('阶段诊断');
    expect(routerSource).toContain('轨道判断');
    expect(routerSource).toContain('OS战略');
    expect(routerSource).toContain('我现在在哪个阶段');
  });
});
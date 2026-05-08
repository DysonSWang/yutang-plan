const osConfig = require('../coaches/os-config');

describe('os-config 结构完整性', () => {
  it('导出所有顶级键', () => {
    expect(osConfig).toHaveProperty('CORE_PRINCIPLES');
    expect(osConfig).toHaveProperty('PHASES');
    expect(osConfig).toHaveProperty('SIGNAL_IOI');
    expect(osConfig).toHaveProperty('TRACK_DECISION');
    expect(osConfig).toHaveProperty('PULL_PUSH_TEMPLATE');
    expect(osConfig).toHaveProperty('PHASE_CHEAT_SHEET');
    expect(osConfig).toHaveProperty('DB_STAGE_MAP');
  });

  it('PHASES 包含 0-6 共 7 个阶段', () => {
    for (let i = 0; i <= 6; i++) {
      expect(osConfig.PHASES[i]).toBeDefined();
      expect(osConfig.PHASES[i].name).toBeTruthy();
      expect(osConfig.PHASES[i].coreTask).toBeTruthy();
    }
  });

  it('DB_STAGE_MAP 覆盖 6 种已知 stage 字符串', () => {
    const known = ['陌生', '搭讪', '聊天', '暧昧', '约会', '长期'];
    for (const k of known) {
      expect(osConfig.DB_STAGE_MAP[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it('CORE_PRINCIPLES 包含 5 条原则', () => {
    expect(osConfig.CORE_PRINCIPLES).toHaveLength(5);
    osConfig.CORE_PRINCIPLES.forEach(p => {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.diagnostic).toBeTruthy();
    });
  });

  it('Phase 4/5/6 有 trackDecision=true', () => {
    expect(osConfig.PHASES[4].trackDecision).toBe(true);
    expect(osConfig.PHASES[5].trackDecision).toBe(true);
    expect(osConfig.PHASES[6].trackDecision).toBe(true);
  });
});
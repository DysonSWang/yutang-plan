const { enforceNoSkip, routeByPhase } = require('../coaches/stage-diagnosis');

describe('enforceNoSkip', () => {
  it('Phase 2 返回正确的前提条件', () => {
    const result = enforceNoSkip(2);
    expect(result.currentPhase).toBe(2);
    expect(result.phaseName).toBe('探测');
    expect(result.prerequisites).toContain('完成破冰');
    expect(result.coreAction).toBeTruthy();
  });

  it('Phase 5 (trackDecision) 返回正确的核心任务', () => {
    const result = enforceNoSkip(5);
    expect(result.phaseName).toBe('确立');
    expect(result.coreAction).toContain('速约');
    expect(result.warning).toBeTruthy();
  });

  it('越界 Phase 返回空默认值而不抛异常', () => {
    const result = enforceNoSkip(99);
    expect(result.currentPhase).toBe(99);
    expect(result.prerequisites).toEqual([]);
    expect(result.coreAction).toBe('');
  });
});

describe('routeByPhase', () => {
  it('Phase 2 返回 masters 数组', () => {
    const result = routeByPhase(2);
    expect(result.masters.length).toBeGreaterThan(0);
    expect(result.trackDecision).toBeUndefined();
  });

  it('Phase 4 返回 trackDecision + shortTrack/longTrack', () => {
    const result = routeByPhase(4);
    expect(result.trackDecision).toBe(true);
    expect(result.shortTrack.length).toBeGreaterThan(0);
    expect(result.longTrack.length).toBeGreaterThan(0);
  });

  it('Phase 5 (trackDecision) 正确提取 shortTrack/longTrack', () => {
    const result = routeByPhase(5);
    expect(result.trackDecision).toBe(true);
    expect(result.shortTrack).toContain('表哥');
    expect(result.longTrack).toContain('梵公子');
  });

  it('越界 Phase 返回默认值', () => {
    const result = routeByPhase(99);
    expect(result.masters).toEqual([]);
    expect(result.reason).toContain('通用');
  });
});
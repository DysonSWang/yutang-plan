const { buildOSMetaSection } = require('../coaches/promptBuilder');

describe('buildOSMetaSection 兼容性', () => {
  it('空 context 返回非空字符串且不抛异常', () => {
    const result = buildOSMetaSection({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(50);
  });

  it('返回包含【恋爱操作系统 · 内部规则】头部', () => {
    const result = buildOSMetaSection({});
    expect(result).toContain('【恋爱操作系统 · 内部规则】');
  });

  it('包含全部 7 个阶段', () => {
    const result = buildOSMetaSection({});
    expect(result).toContain('Phase 0');
    expect(result).toContain('Phase 6');
  });

  it('无 girlProfile 时输出轨道决策树', () => {
    const result = buildOSMetaSection({});
    expect(result).toContain('轨道决策树');
    expect(result).toContain('短轨条件');
    expect(result).toContain('长轨条件');
  });
});

describe('buildOSMetaSection 增强内容', () => {
  it('有 stage 时输出当前阶段和死胡同警告', () => {
    const result = buildOSMetaSection({
      girlProfile: { stage: '暧昧' }
    });
    expect(result).toContain('当前阶段');
    expect(result).toContain('Phase 3');
    expect(result).toContain('⚠️ 死胡同');
  });

  it('有 track 时输出轨道策略', () => {
    const result = buildOSMetaSection({
      girlProfile: { stage: '聊天', track: 'short' }
    });
    expect(result).toContain('短轨(速约)');
    expect(result).toContain('效率优先');
  });

  it('未知 stage 回退到 Phase 1', () => {
    const result = buildOSMetaSection({
      girlProfile: { stage: '不存在的阶段' }
    });
    expect(result).toContain('Phase 1');
  });

  it('输出格式不含 undefined/null', () => {
    const result = buildOSMetaSection({
      girlProfile: { stage: '聊天', track: 'short' }
    });
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });

  it('输出包含冲突裁决规则', () => {
    const result = buildOSMetaSection({});
    expect(result).toContain('短轨和长轨是两个独立系统');
    expect(result).toContain('阶段不可跳步');
  });

  it('输出包含 5 条核心原则', () => {
    const result = buildOSMetaSection({});
    expect(result).toContain('框架即Game');
    expect(result).toContain('标准即尊严');
    expect(result).toContain('情绪即KPI');
    expect(result).toContain('顺序即安全');
    expect(result).toContain('执行即答案');
  });
});
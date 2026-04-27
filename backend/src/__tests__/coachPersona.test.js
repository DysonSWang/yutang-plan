/**
 * Coach Persona 测试 - M007 S06
 */
const prisma = require('../prisma');
const bcrypt = require('bcryptjs');

const {
  PersonaAdapter,
  buildDynamicPersona,
  buildPersonaSection,
  buildFullPersona,
  ATTACHMENT_TONE_CONFIG,
  LOVE_STYLE_HINTS,
} = require('../services/coachPersona');

describe('PersonaAdapter 单元测试', () => {
  it('基础初始化', () => {
    const adapter = new PersonaAdapter({ nickname: '测试' });
    expect(adapter.clientProfile).toHaveProperty('nickname');
  });

  it('执行型客户生成 step_by_step 提示', async () => {
    const adapter = new PersonaAdapter({ clientType: '执行型', learningAbility: '强' });
    const persona = await adapter.build();
    expect(persona.personaHints.some(h => h.includes('编号步骤'))).toBe(true);
    expect(persona.behaviorConfig.directiveStyle).toBe('step_by_step');
  });

  it('质疑型客户生成 explain_first 提示', async () => {
    const adapter = new PersonaAdapter({ clientType: '质疑型', learningAbility: '中' });
    const persona = await adapter.build();
    expect(persona.personaHints.some(h => h.includes('先说"我建议这样，因为'))).toBe(true);
    expect(persona.behaviorConfig.directiveStyle).toBe('explain_first');
  });

  it('自主型客户生成 framework_only 提示', async () => {
    const adapter = new PersonaAdapter({ clientType: '自主型', learningAbility: '弱' });
    const persona = await adapter.build();
    expect(persona.personaHints.some(h => h.includes('让客户自己做决策'))).toBe(true);
    expect(persona.behaviorConfig.directiveStyle).toBe('framework_only');
  });

  it('焦虑型客户加载正确的语气配置', async () => {
    const adapter = new PersonaAdapter({ attachmentStyle: '焦虑型' });
    const persona = await adapter.build();
    expect(persona.attachmentConfig).not.toBeNull();
    expect(persona.attachmentConfig.pressure).toBe('low');
    expect(persona.personaHints.some(h => h.includes('施压'))).toBe(true);
  });

  it('回避型客户加载正确的语气配置', async () => {
    const adapter = new PersonaAdapter({ attachmentStyle: '回避型' });
    const persona = await adapter.build();
    expect(persona.attachmentConfig.pressure).toBe('very_low');
    expect(persona.personaHints.some(h => h.includes('连环追问'))).toBe(true);
  });

  it('抗挫折能力低时语气更鼓励', async () => {
    const adapter = new PersonaAdapter({ antiFrustrationLevel: 2 });
    const persona = await adapter.build();
    expect(persona.personaHints.some(h => h.includes('鼓励') || h.includes('正向反馈'))).toBe(true);
  });

  it('快节奏偏好生成简洁建议', async () => {
    const adapter = new PersonaAdapter({ pacePreference: '快节奏' });
    const persona = await adapter.build();
    expect(persona.personaHints.some(h => h.includes('简洁有力'))).toBe(true);
  });

  it('慢热型偏好生成稳妥建议', async () => {
    const adapter = new PersonaAdapter({ pacePreference: '慢热型' });
    const persona = await adapter.build();
    expect(persona.personaHints.some(h => h.includes('稳妥优先') || h.includes('舒适感'))).toBe(true);
  });

  it('clientBestApproach 被注入提示', async () => {
    const adapter = new PersonaAdapter({ clientBestApproach: '真诚型直接进攻' });
    const persona = await adapter.build();
    expect(persona.personaHints.some(h => h.includes('真诚型直接进攻'))).toBe(true);
  });

  it('loveStyle 生成恋爱风格提示', async () => {
    const adapter = new PersonaAdapter({ loveStyle: '浪漫型' });
    const persona = await adapter.build();
    expect(persona.personaHints.some(h => h.includes('仪式感') || h.includes('浪漫'))).toBe(true);
  });

  it('midSession adaptMidSession: frustrated', async () => {
    const adapter = new PersonaAdapter({ clientType: '执行型' });
    adapter.adaptMidSession('frustrated');
    expect(adapter._midSessionHints.some(h => h.includes('受挫') || h.includes('鼓励'))).toBe(true);
  });

  it('midSession adaptMidSession: confused', async () => {
    const adapter = new PersonaAdapter({ clientType: '质疑型' });
    adapter.adaptMidSession('confused');
    expect(adapter._midSessionHints.some(h => h.includes('困惑') || h.includes('直白'))).toBe(true);
  });

  it('midSession adaptMidSession: motivated', async () => {
    const adapter = new PersonaAdapter({ clientType: '执行型' });
    adapter.adaptMidSession('motivated');
    expect(adapter._midSessionHints.some(h => h.includes('积极') || h.includes('推进节奏'))).toBe(true);
  });

  it('midSession adaptMidSession: stuck', async () => {
    const adapter = new PersonaAdapter({ clientType: '自主型' });
    adapter.adaptMidSession('stuck');
    expect(adapter._midSessionHints.some(h => h.includes('困境') || h.includes('换角度'))).toBe(true);
  });

  it('buildFullPersona 组合主构建+中期调整', async () => {
    const persona = await buildFullPersona({
      clientProfile: { clientType: '执行型', attachmentStyle: '安全型' },
      clientId: null,
      emotionalSignal: 'frustrated'
    });
    expect(persona.personaHints.length).toBeGreaterThan(0);
    expect(persona.behaviorConfig.directiveStyle).toBe('step_by_step');
    expect(persona.personaHints.some(h => h.includes('受挫'))).toBe(true);
  });
});

describe('buildPersonaSection 测试', () => {
  it('空提示返回空字符串', () => {
    const section = buildPersonaSection({ personaHints: [] });
    expect(section).toBe('');
  });

  it('有提示生成正确格式', () => {
    const section = buildPersonaSection({ personaHints: ['hint1', 'hint2'] });
    expect(section).toContain('【人格适配提示】');
    expect(section).toContain('- hint1');
    expect(section).toContain('- hint2');
  });
});

describe('ATTACHMENT_TONE_CONFIG 常量测试', () => {
  it('三种依恋类型都有配置', () => {
    expect(ATTACHMENT_TONE_CONFIG).toHaveProperty('焦虑型');
    expect(ATTACHMENT_TONE_CONFIG).toHaveProperty('回避型');
    expect(ATTACHMENT_TONE_CONFIG).toHaveProperty('安全型');
  });

  it('各类型有正确的压力级别', () => {
    expect(ATTACHMENT_TONE_CONFIG['焦虑型'].pressure).toBe('low');
    expect(ATTACHMENT_TONE_CONFIG['回避型'].pressure).toBe('very_low');
    expect(ATTACHMENT_TONE_CONFIG['安全型'].pressure).toBe('medium');
  });
});

describe('LOVE_STYLE_HINTS 常量测试', () => {
  it('包含常见恋爱风格', () => {
    expect(LOVE_STYLE_HINTS['真诚型']).toBeTruthy();
    expect(LOVE_STYLE_HINTS['陪伴型']).toBeTruthy();
    expect(LOVE_STYLE_HINTS['浪漫型']).toBeTruthy();
  });
});

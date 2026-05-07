const path = require('path');

const WIKI_PATH = path.join(__dirname, '../../../../../vault/wiki');

describe('WikiRag 20 场景集成测试', () => {
  let wikiRag;

  beforeAll(async () => {
    wikiRag = new (require('../wikiRag'))(WIKI_PATH);
    await wikiRag.ready;
  });

  function assertResult(results) {
    const totalSize = JSON.stringify(results).length;
    expect(results.concepts).toBeDefined();
    expect(totalSize).toBeGreaterThan(0);
    expect(totalSize).toBeLessThan(150 * 1024);
  }

  test('01 聊天卡壳', () => {
    const r = wikiRag.retrieve('聊天总是她回一两个字就没了', '聊天卡壳', { coachesUsed: [{ name: '熊猫' }] });
    const titles = r.concepts.map(c => c.title);
    expect(titles).toContain('聊天');
    assertResult(r);
  });

  test('02 邀约约会', () => {
    const r = wikiRag.retrieve('想约她出来喝咖啡怎么开口', '邀约约会', { coachesUsed: [{ name: 'Leon' }] });
    assertResult(r);
  });

  test('03 关系拉伸', () => {
    const r = wikiRag.retrieve('怎么判断能不能牵手了', '关系拉伸', { coachesUsed: [{ name: '熊猫' }] });
    assertResult(r);
  });

  test('04 废物测试', () => {
    const r = wikiRag.retrieve('她问我是不是对谁都这样', '废物测试', { coachesUsed: [{ name: '熊猫' }] });
    assertResult(r);
  });

  test('05 心态问题', () => {
    const r = wikiRag.retrieve('聊了几个都失败了很崩溃', '心态问题', { coachesUsed: [{ name: '凯哥' }] });
    assertResult(r);
  });

  test('06 长期关系', () => {
    const r = wikiRag.retrieve('在一起半年她越来越冷淡', '长期关系', { coachesUsed: [{ name: '小得' }] });
    assertResult(r);
  });

  test('07 朋友圈建设', () => {
    const r = wikiRag.retrieve('发什么朋友圈能吸引女生', '朋友圈建设', { coachesUsed: [] });
    assertResult(r);
  });

  test('08 社交软件', () => {
    const r = wikiRag.retrieve('探探上匹配了怎么开场', '社交软件', { coachesUsed: [{ name: '熊猫' }] });
    assertResult(r);
  });

  test('09 分手挽回', () => {
    const r = wikiRag.retrieve('分手一个月了还能挽回吗', '分手挽回', { coachesUsed: [{ name: '小得' }] });
    assertResult(r);
  });

  test('10 情绪调动', () => {
    const r = wikiRag.retrieve('为什么我聊天总像在汇报工作', '情绪调动', { coachesUsed: [{ name: 'Leon' }] });
    assertResult(r);
  });

  test('11 搭讪', () => {
    const r = wikiRag.retrieve('街头看到一个女生怎么搭讪', '搭讪', { coachesUsed: [{ name: '凯哥' }] });
    assertResult(r);
  });

  test('12 升高关系', () => {
    const r = wikiRag.retrieve('约会了几次怎么升级关系', '升高关系', { coachesUsed: [{ name: '熊猫' }] });
    assertResult(r);
  });

  test('13 异地恋', () => {
    const r = wikiRag.retrieve('异地怎么维持感情', '异地恋', { coachesUsed: [{ name: '小得' }] });
    assertResult(r);
  });

  test('14 价值展示', () => {
    const r = wikiRag.retrieve('我条件一般怎么展示价值', '价值展示', { coachesUsed: [{ name: '凯哥' }] });
    assertResult(r);
  });

  test('15 无匹配兜底（歌曲）', () => {
    const r = wikiRag.fallbackQueryMatch('你觉得这首歌怎么样');
    // 没有概念包含"歌"作为同义词，返回空数组是正确行为
    expect(r).toBeDefined();
    expect(Array.isArray(r)).toBe(true);
  });

  test('16 多导师组合', () => {
    const r = wikiRag.retrieve('凯哥和Leon都怎么说的', '邀约约会', { coachesUsed: [{ name: '凯哥' }, { name: 'Leon' }] });
    expect(r.entities.length).toBeGreaterThanOrEqual(2);
    assertResult(r);
  });

  test('17 长文本问题', () => {
    const long = '我和她认识三个月了，之前聊得还行但最近突然不回我了，可能是因为上周约她她说忙没出来，我现在不知道该怎么办';
    const r = wikiRag.retrieve(long, '聊天卡壳', { coachesUsed: [{ name: '熊猫' }] });
    assertResult(r);
  });

  test('18 极短问题', () => {
    const r = wikiRag.retrieve('怎么聊', '聊天卡壳', { coachesUsed: [] });
    assertResult(r);
  });

  test('19 混合场景（夜店+聊天）', () => {
    const r = wikiRag.retrieve('在夜店搭讪的，之后怎么聊', '搭讪', { coachesUsed: [{ name: '凯哥' }] });
    assertResult(r);
  });

  test('20 空 coachesUsed 不崩溃', () => {
    const r = wikiRag.retrieve('怎么聊天', '聊天卡壳', { coachesUsed: [] });
    expect(r.entities).toEqual([]);
    expect(r.summaries).toEqual([]);
    assertResult(r);
  });
});
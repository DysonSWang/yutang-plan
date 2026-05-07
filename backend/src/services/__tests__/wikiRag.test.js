const path = require('path');

const WIKI_PATH = path.join(__dirname, '../../../../../vault/wiki');

describe('WikiRag', () => {
  let wikiRag;

  beforeAll(async () => {
    wikiRag = new (require('../wikiRag'))(WIKI_PATH);
    await wikiRag.ready;
  });

  test('retrieve returns concepts for 聊天卡壳', () => {
    const results = wikiRag.retrieve('聊天总是她回一两个字就没了', '聊天卡壳', {
      coachesUsed: [{ name: '熊猫' }]
    });
    expect(results.concepts.length).toBeGreaterThan(0);
    const conceptTitles = results.concepts.map(c => c.title);
    expect(conceptTitles).toContain('聊天');
  });

  test('retrieve returns entities for 熊猫', () => {
    const results = wikiRag.retrieve('聊天总是她回一两个字就没了', '聊天卡壳', {
      coachesUsed: [{ name: '熊猫' }]
    });
    expect(results.entities.length).toBeGreaterThan(0);
    expect(results.entities[0].title).toContain('熊猫');
  });

  test('fallbackQueryMatch works when problemType mapping misses', () => {
    const results = wikiRag.fallbackQueryMatch('这首歌真好听');
    expect(results).toBeDefined();
  });

  test('extractKeyContent preserves table rows', () => {
    const content = `## 邀约步骤\n| 序号 | 动作 | 时机 |\n| 1 | 模糊邀约 | 聊到高点 |\n一些描述文字\n- 列表项`;
    const key = wikiRag.extractKeyContent(content, 200);
    expect(key).toContain('|');
  });

  test('truncateToTokenBudget reduces long text', () => {
    const long = '你好'.repeat(5000);
    const truncated = wikiRag.truncateToTokenBudget(long, 1000);
    expect(truncated.length).toBeLessThan(long.length);
  });

  test('mapProblemTypeToConcepts handles all known types', () => {
    const types = ['聊天卡壳', '关系拉伸', '邀约约会', '心态问题', '废物测试', '朋友圈建设', '搭讪', '长期关系'];
    for (const type of types) {
      const concepts = wikiRag.mapProblemTypeToConcepts(type);
      expect(concepts.length).toBeGreaterThan(0);
    }
  });

  test('findCasesByMentorAndType returns cases', () => {
    const cases = wikiRag.findCasesByMentorAndType(['熊猫'], '邀约约会');
    expect(cases).toBeDefined();
  });
});
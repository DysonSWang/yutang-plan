const path = require('path');
const fs = require('fs');
const fm = require('gray-matter');
const fg = require('fast-glob');
const LRUCache = require('lru-cache').LRUCache;

const PROBLEM_TYPE_MAP = {
  '聊天卡壳': ['聊天', '障碍区', '价值展示'],
  '关系拉伸': ['拉伸', '肢体接触', '表白时机'],
  '邀约约会': ['邀约', '约会', '夜晚场合'],
  '心态问题': ['心态建设', '奖品心态', '需求感管理'],
  '分手挽回': ['分手与挽回', '矛盾处理'],
  '长期关系': ['长期关系', '框架规则'],
  '情绪调动': ['情绪判断', '推拉技巧'],
  '社交软件': ['社交软件全攻略', '展示面'],
  '废物测试': ['废物测试', '反驳处理', 'IOD判断'],
  '朋友圈建设': ['展示面', '社交认证', '社交软件'],
  '搭讪': ['搭讪', '资源获取', '夜晚场合'],
  '价值展示': ['价值展示', '吸引', 'DHV'],
  '升高关系': ['拉伸', '肢体接触', '暧昧升级'],
  '长期关系经营': ['长期关系', '框架规则', '沟通'],
  '异地恋': ['长期关系', '沟通', '信任'],
};

const TYPE_KEYWORDS = {
  '聊天卡壳': ['聊天', '话术', '开场'],
  '关系拉伸': ['拉伸', '暧昧', '肢体'],
  '邀约约会': ['邀约', '约会', '电话'],
  '心态问题': ['心态', '障碍', '崩溃'],
  '分手挽回': ['挽回', '分手', '复合'],
  '长期关系': ['长期', '相处', '经营'],
  '情绪调动': ['情绪', '推拉', '波动'],
  '社交软件': ['社交', '软件', '探探', '积木'],
  '废物测试': ['废物测试', '反驳'],
  '朋友圈建设': ['展示面', '朋友圈'],
  '搭讪': ['搭讪', '资源'],
  '价值展示': ['价值', 'DHV'],
  '升高关系': ['拉伸', '暧昧'],
  '长期关系经营': ['长期', '相处'],
  '异地恋': ['异地', '信任'],
};

function estimateTokens(text) {
  try {
    const tokenizer = require('gpt-tokenizer');
    return tokenizer.tokenize(text).length;
  } catch (e) {
    return Math.ceil(text.length / 2);
  }
}

class WikiRag {
  constructor(wikiPath) {
    this.wikiPath = wikiPath;
    this.indexCachePath = path.join(wikiPath, '.wiki-index.json');
    this.contentCache = new LRUCache({ max: 50 });
    this._index = null;
    this.ready = this.loadOrBuildIndex();
  }

  async loadOrBuildIndex() {
    if (fs.existsSync(this.indexCachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(this.indexCachePath, 'utf8'));
        if (cached._version === 1 && cached._builtAt) {
          this._index = cached;
          return cached;
        }
      } catch (e) { /* 缓存损坏，重新构建 */ }
    }
    return this.buildIndex();
  }

  async buildIndex() {
    const [conceptFiles, entityFiles, caseFiles, summaryFiles] = await Promise.all([
      fg('concepts/*/index.md', { cwd: this.wikiPath, suppressErrors: true }),
      fg('entities/*.md', { cwd: this.wikiPath, suppressErrors: true }),
      fg('案例库/**/*.md', { cwd: this.wikiPath, suppressErrors: true }),
      fg('summaries/*.md', { cwd: this.wikiPath, suppressErrors: true }),
    ]);

    const byTitle = {};
    const byMentor = {};
    const cases = [];
    const synonyms = {};

    for (const file of conceptFiles) {
      try {
        const fullPath = path.join(this.wikiPath, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        const parsed = fm(content);
        // 优先 frontmatter title，回退到目录名
        const title = parsed.data.title || path.basename(path.dirname(file));
        byTitle[title] = { path: fullPath, fm: parsed.data, type: 'concept' };
        // 也用目录名建索引（部分 concept 的 frontmatter title 与目录名不同）
        const dirName = path.basename(path.dirname(file));
        if (dirName !== title) byTitle[dirName] = { path: fullPath, fm: parsed.data, type: 'concept' };
        if (parsed.data.synonyms) {
          synonyms[title] = Array.isArray(parsed.data.synonyms) ? parsed.data.synonyms : [parsed.data.synonyms];
          // synonym 也建索引
          for (const syn of synonyms[title]) {
            byTitle[syn] = { path: fullPath, fm: parsed.data, type: 'concept' };
          }
        }
      } catch (e) { /* 跳过解析失败的文件 */ }
    }

    for (const file of entityFiles) {
      try {
        const fullPath = path.join(this.wikiPath, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        const parsed = fm(content);
        const title = parsed.data.title || path.basename(file, '.md');
        byTitle[title] = { path: fullPath, fm: parsed.data, type: 'entity' };
        // mentor 字段不存在时，用文件名充当导师名
        const mentor = parsed.data.mentor || path.basename(file, '.md');
        if (!byMentor[mentor]) byMentor[mentor] = { entity: null, summaries: [] };
        byMentor[mentor].entity = { title, path: fullPath, fm: parsed.data };
      } catch (e) { /* 跳过 */ }
    }

    for (const file of caseFiles) {
      try {
        const fullPath = path.join(this.wikiPath, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        const parsed = fm(content);
        const filename = path.basename(file);
        // frontmatter 字段是中文"导师"，回退到文件名解析
        const mentor = parsed.data.导师 || parsed.data.mentor || '';
        const mentorMatch = filename.match(/^(.+?)-\d+-/);
        const mentorFromFile = mentorMatch ? mentorMatch[1] : mentor;
        cases.push({
          title: parsed.data.title || filename,
          filename,
          mentor: mentor || mentorFromFile,
          path: fullPath,
          fm: parsed.data
        });
      } catch (e) { /* 跳过 */ }
    }

    for (const file of summaryFiles) {
      const filename = path.basename(file, '.md');
      const parts = filename.split('-');
      if (parts.length >= 2) {
        const mentor = parts[0];
        if (!byMentor[mentor]) byMentor[mentor] = { entity: null, summaries: [] };
        byMentor[mentor].summaries.push({ filename, path: path.join(this.wikiPath, file) });
      }
    }

    this._index = { byTitle, byMentor, cases, synonyms, _version: 1, _builtAt: Date.now() };
    this._asyncSaveIndex();
    return this._index;
  }

  retrieve(query, problemType, girlContext) {
    if (!this._index) return { concepts: [], entities: [], summaries: [], cases: [] };

    const results = { concepts: [], entities: [], summaries: [], cases: [] };
    const seenTitles = new Set();

    const conceptNames = this.mapProblemTypeToConcepts(problemType);
    for (const name of conceptNames) {
      if (this._index.byTitle[name] && !seenTitles.has(name)) {
        seenTitles.add(name);
        results.concepts.push(this.loadConcept(this._index.byTitle[name]));
      }
    }

    if (results.concepts.length === 0) {
      const fallbackConcepts = this.fallbackQueryMatch(query);
      for (const c of fallbackConcepts.slice(0, 2)) {
        if (!seenTitles.has(c.title)) {
          seenTitles.add(c.title);
          results.concepts.push(c);
        }
      }
    }

    const coaches = girlContext?.coachesUsed || [];
    for (const coach of coaches) {
      const mentorData = this._index.byMentor[coach.name];
      if (!mentorData) continue;

      if (mentorData.entity && !seenTitles.has(mentorData.entity.title)) {
        seenTitles.add(mentorData.entity.title);
        results.entities.push(this.loadEntity(mentorData.entity));
      }

      const summaries = this.findSummariesByMentorAndType(coach.name, problemType);
      for (const s of summaries.slice(0, 5)) {
        results.summaries.push(s);
      }
    }

    const cases = this.findCasesByMentorAndType(coaches.map(c => c.name), problemType);
    results.cases = cases.slice(0, 3);

    for (const concept of results.concepts) {
      const related = concept.fm?.related?.concepts || [];
      for (const rel of related.slice(0, 2)) {
        if (this._index.byTitle[rel] && !seenTitles.has(rel)) {
          seenTitles.add(rel);
          results.concepts.push(this.loadConcept(this._index.byTitle[rel], { compress: true }));
        }
      }
    }

    return results;
  }

  loadConcept(entry, opts = {}) {
    const { compress } = opts;
    const cached = this.contentCache.get(entry.path);
    if (cached) return cached;

    try {
      const content = fs.readFileSync(entry.path, 'utf8');
      const parsed = fm(content);
      let body = parsed.content;

      if (compress) {
        body = this.extractKeyContent(body, 1500);
      } else {
        body = this.extractKeyContent(body, 3000);
      }

      const result = {
        title: parsed.data.title || path.basename(path.dirname(entry.path)),
        fm: parsed.data,
        body,
        insights: this.extractKeyInsights(body, parsed.data)
      };

      this.contentCache.set(entry.path, result);
      return result;
    } catch (e) {
      return { title: entry.path, fm: {}, body: '', insights: [] };
    }
  }

  loadEntity(entry) {
    const cached = this.contentCache.get(entry.path);
    if (cached) return cached;

    try {
      const content = fs.readFileSync(entry.path, 'utf8');
      const parsed = fm(content);
      const result = {
        title: parsed.data.title || entry.title,
        fm: parsed.data,
        body: this.extractKeyContent(parsed.content, 2500),
        insights: this.extractKeyInsights(parsed.content, parsed.data)
      };
      this.contentCache.set(entry.path, result);
      return result;
    } catch (e) {
      return { title: entry.title, fm: {}, body: '', insights: [] };
    }
  }

  extractKeyContent(content, maxChars = 2000) {
    const lines = content.split('\n');
    const keyLines = [];
    let currentChars = 0;
    let tableRowCount = 0;

    for (const line of lines) {
      const isTableRow = line.startsWith('|');
      const isHeading = line.startsWith('##');
      const isList = line.startsWith('-') || line.startsWith('*');
      const isKey = line.includes('【') || line.includes('核心') || line.includes('话术') || line.includes('关键');

      if ((isTableRow || isHeading || isList || isKey) && currentChars + line.length <= maxChars * 1.2) {
        keyLines.push(line);
        currentChars += line.length;
        if (isTableRow) tableRowCount++;
      } else if (currentChars + line.length <= maxChars) {
        keyLines.push(line);
        currentChars += line.length;
      }

      if (currentChars > maxChars) break;
    }

    return keyLines.join('\n') || content.slice(0, maxChars);
  }

  extractKeyInsights(content, frontmatter) {
    if (frontmatter?.key_insights?.length > 0) {
      return frontmatter.key_insights;
    }
    const sentences = content.match(/[^。！？.!?]+[。！？.!?]?/g) || [];
    const keySentences = sentences.filter(s =>
      s.includes('核心') || s.includes('关键') || s.includes('重要') || s.includes('注意')
    );
    return keySentences.slice(0, 3);
  }

  fallbackQueryMatch(query) {
    const results = [];
    for (const [canonical, aliases] of Object.entries(this._index.synonyms || {})) {
      if (aliases.some(alias => query.includes(alias))) {
        if (this._index.byTitle[canonical]) {
          results.push(this.loadConcept(this._index.byTitle[canonical], { compress: true }));
        }
      }
    }
    return results;
  }

  findSummariesByMentorAndType(mentor, problemType) {
    const mentorData = this._index.byMentor[mentor];
    if (!mentorData) return [];

    const typeKeywords = this.getTypeKeywords(problemType);
    const summaries = mentorData.summaries || [];

    let matched = summaries.filter(s => typeKeywords.some(kw => s.filename.includes(kw)));

    if (matched.length < 3) {
      const broadKeywords = this.getTypeKeywords(problemType).map(k => k.charAt(0));
      const extra = summaries.filter(s => broadKeywords.some(kw => s.filename.includes(kw)));
      matched = [...matched, ...extra.filter(e => !matched.includes(e))];
    }

    return matched.slice(0, 10);
  }

  findCasesByMentorAndType(mentors, problemType) {
    if (!mentors || mentors.length === 0) return [];
    const typeKeywords = this.getTypeKeywords(problemType);
    return this._index.cases
      .filter(c => mentors.includes(c.mentor) && typeKeywords.some(kw => c.title.includes(kw)))
      .slice(0, 5);
  }

  getTypeKeywords(problemType) {
    return TYPE_KEYWORDS[problemType] || TYPE_KEYWORDS['聊天卡壳'] || [];
  }

  mapProblemTypeToConcepts(problemType) {
    return PROBLEM_TYPE_MAP[problemType] || [];
  }

  truncateToTokenBudget(text, maxTokens) {
    const tokens = estimateTokens(text);
    if (tokens <= maxTokens) return text;

    const ratio = (maxTokens / tokens) * 0.9;
    const targetChars = Math.floor(text.length * ratio);
    return text.slice(0, targetChars);
  }

  _asyncSaveIndex() {
    const tempPath = this.indexCachePath + '.tmp';
    fs.writeFile(tempPath, JSON.stringify(this._index), () => {
      fs.rename(tempPath, this.indexCachePath, () => {});
    });
  }
}

module.exports = WikiRag;
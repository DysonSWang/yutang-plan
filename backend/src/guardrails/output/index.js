/**
 * Output Guardrails - 输出安全层
 *
 * 包含：
 * 1. 情感操控检测
 * 2. 大师名字过滤
 * 3. Markdown 清理
 * 4. 自适应长度限制
 * 5. 专业术语清理
 */

const MAX_RESPONSE_LENGTH = 2000;

// ---- Coach Names Filter ----
const COACH_NAMES = [
  '纳爷', '王哥', '大迪', '脱不花', '凯哥', '莫哥',
  '林老头', '寻诺', '郝哥', '童锦程', '桐哥',
  'xuge', 'wang', 'dadi', 'ziyang', 'haoge', 'naye', 'tuobuhua',
];

// ---- Emotional Manipulation Detection ----
const EMOTIONAL_MANIPULATION_PATTERNS = [
  { pattern: /不要告诉任何人|别跟别人说|只有我们俩知道|这是我们之间的|秘密地|不能跟朋友说|别跟你家人说/i, label: '孤立策略' },
  { pattern: /都是你的错|[你您].*让我失望|[你您].*让我伤心|[你您]应该感到愧疚|[你您]欠我的|都是因为[你您]|[你您]怎么能这样/i, label: '愧疚操控' },
  { pattern: /如果你不|你要是不|你再这样的话|不听我的就|你不这么做的话|我就会|我就离开你|我就|分手|拉黑/i, label: '威胁施压' },
  { pattern: /花钱.*证明|买.*才爱|送.*才爱|转账.*爱|为我.*才|舍得.*才是爱/i, label: '交易型爱情' },
  { pattern: /我太爱你了|你是最特别的|我离不开你|命中注定|我从未这样|我为你|你是唯一|比你更好的人|比你更懂我/i, label: '爱情轰炸' },
  { pattern: /虽然.*但是|你也就.*不过|你也可以.*就是|虽然你不.*但我可以|就算你.*我也/i, label: '贬低后修复' },
  { pattern: /你记错了|你想太多了|你太敏感了|其实没那么|不是你想的那样|你应该没那么|我没说过|你搞错了|你误解了/i, label: '煤气灯效应' },
  { pattern: /我要查你|我要看你的|你应该对我|我有权利知道|必须告诉我|不许有秘密|你必须/i, label: '边界侵犯' },
];

// ---- Professional Terms ----
const PROFESSIONAL_TERMS = [
  /置信度|置信区间|确定性/i,
  /框架组|原则\]|\[原则\]|\[框架\]/i,
  /大师名字|教练称号|角色名/g,
];

// ---- Lightweight Manipulation Patterns (for streaming) ----
const STREAM_MANIPULATION_PATTERNS = [
  /不要告诉任何人|别跟别人说|只有我们俩/i,
  /都是你的错|你让我失望/i,
  /如果你不|你要是不|你再这样的话/i,
  /花钱.*证明|舍得.*才是爱/i,
  /我太爱你了|你是最特别的|我离不开你/i,
  /你记错了|你想太多了|你太敏感了/i,
];

/**
 * 检测情感操控模式
 */
function detectEmotionalManipulation(text) {
  if (!text) return { detected: false, matches: [] };

  const matches = [];
  for (const { pattern, label } of EMOTIONAL_MANIPULATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const idx = text.search(pattern);
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + match[0].length + 20);
      const snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
      matches.push({ label, snippet: snippet.replace(/\n/g, ' ').trim() });
    }
  }

  return { detected: matches.length > 0, matches };
}

/**
 * 过滤大师名字
 */
function filterCoachNames(text) {
  if (!text) return text;
  let cleaned = text;
  for (const name of COACH_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(escaped, 'g'), '');
  }
  return cleaned;
}

/**
 * 清理 Markdown 格式
 */
function stripMarkdown(text) {
  if (!text) return text;

  let cleaned = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
  cleaned = cleaned.replace(/(_)([^_]+)(_)/g, '$2');
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
  cleaned = cleaned.replace(/^[\-\*]\s+/gm, '');
  cleaned = cleaned.replace(/^\d+\.\s+/gm, '');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  cleaned = cleaned.replace(/^[\-\*_]{3,}\s*$/gm, '');

  return cleaned;
}

/**
 * 清理专业术语
 */
function cleanProfessionalTerms(text) {
  if (!text) return text;

  let cleaned = text;
  cleaned = cleaned.replace(/置信度[：:]\s*(\w+)/g, '把握: $1');
  cleaned = cleaned.replace(/置信度/gi, '把握');
  cleaned = cleaned.replace(/置信区间/gi, '确定性');
  cleaned = cleaned.replace(/\[框架组\]/gi, '');
  cleaned = cleaned.replace(/\[原则\]/gi, '');
  cleaned = cleaned.replace(/\[框架\]/gi, '');

  return cleaned;
}

/**
 * 检查内容长度
 */
function checkLength(text) {
  if (!text) return { withinLimit: true, length: 0, overBy: 0 };

  const length = text.length;
  const overBy = Math.max(0, length - MAX_RESPONSE_LENGTH);

  return {
    withinLimit: length <= MAX_RESPONSE_LENGTH,
    length,
    maxLength: MAX_RESPONSE_LENGTH,
    overBy
  };
}

/**
 * 完整输出安全检查
 */
function runOutputGuardrails(text) {
  const results = { text, checks: {}, passed: true, warnings: [] };

  // 情感操控检测
  const manipulationCheck = detectEmotionalManipulation(text);
  results.checks.emotionalManipulation = manipulationCheck;
  if (manipulationCheck.detected) {
    results.passed = false;
    const labels = manipulationCheck.matches.map(m => m.label).join('、');
    results.warnings.push(`检测到情感操控模式: ${labels}`);
  }

  // 长度检查
  const lengthCheck = checkLength(text);
  results.checks.length = lengthCheck;
  if (!lengthCheck.withinLimit) {
    results.warnings.push(`回复长度 ${lengthCheck.length} 超过限制，已截断`);
    results.text = text.slice(0, MAX_RESPONSE_LENGTH);
  }

  // 格式清理
  results.text = cleanProfessionalTerms(results.text);

  return results;
}

/**
 * 流式输出保护（每个 chunk）
 */
function streamGuardrails(chunk) {
  if (!chunk) return { safe: true };

  let modified = false;
  let reasons = [];
  let cleaned = chunk;

  // 1. 过滤大师名字
  const hadNames = cleaned;
  cleaned = filterCoachNames(cleaned);
  if (cleaned !== hadNames) {
    reasons.push('教练名字');
    modified = true;
  }

  // 2. 情感操控轻量检测
  for (const re of STREAM_MANIPULATION_PATTERNS) {
    if (re.test(cleaned)) {
      reasons.push('情感操控模式(流式)');
      modified = true;
      break;
    }
  }

  // 3. Markdown 清理
  const preStrip = cleaned;
  cleaned = stripMarkdown(cleaned);
  if (cleaned !== preStrip) {
    reasons.push('Markdown格式');
    modified = true;
  }

  // 4. 清理空白
  const trimmed = cleaned.trim();
  if (trimmed !== cleaned) {
    cleaned = trimmed;
    modified = true;
  }

  if (!cleaned) {
    return { safe: false, reason: '内容为空（被过滤）', filtered: '' };
  }

  return modified
    ? { safe: false, reason: reasons.join(', '), filtered: cleaned }
    : { safe: true };
}

/**
 * 格式验证（用于 debug/日志）
 */
function validateFormat(text) {
  if (!text) return { valid: true, issues: [] };

  const issues = [];

  if (/\*\*[^*]+\*\*/.test(text)) issues.push('包含加粗标记 **');
  if (/(?<!\*)\*[^*]+\*(?!\*)/.test(text)) issues.push('包含斜体标记 *');
  for (const pattern of PROFESSIONAL_TERMS) {
    if (pattern.test(text)) issues.push(`包含专业术语: ${pattern.source}`);
  }
  for (const name of COACH_NAMES) {
    if (text.includes(name)) issues.push(`包含教练名字: ${name}`);
  }

  return { valid: issues.length === 0, issues };
}

/**
 * 创建 chunk 去重处理器
 */
function createChunkDeduplicator() {
  let lastChunk = '';
  let accumulated = '';
  const TAIL_CHARS = 30;

  return {
    check(content) {
      if (!content) return true;
      if (content === lastChunk) return true;

      const tail = accumulated.slice(-TAIL_CHARS * 3);
      if (tail && content.length <= tail.length) {
        if (tail.includes(content) || endsWithOverlap(tail, content)) return true;
      }

      lastChunk = content;
      accumulated += content;
      return false;
    },

    getAccumulated() { return accumulated; },
    reset() { lastChunk = ''; accumulated = ''; }
  };
}

function endsWithOverlap(tail, chunk) {
  if (!tail || !chunk) return false;
  const suffix = tail.slice(-chunk.length);
  return suffix === chunk && chunk.length <= 2;
}

module.exports = {
  MAX_RESPONSE_LENGTH,
  detectEmotionalManipulation,
  filterCoachNames,
  stripMarkdown,
  cleanProfessionalTerms,
  checkLength,
  runOutputGuardrails,
  streamGuardrails,
  validateFormat,
  createChunkDeduplicator,
  COACH_NAMES,
};
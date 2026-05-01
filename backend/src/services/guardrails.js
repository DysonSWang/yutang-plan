/**
 * Guardrails Service - 输出安全边界
 *
 * 1. 敏感词过滤（中文常见敏感词列表）
 * 2. 回复长度限制
 * 3. 格式验证（检查是否包含不当内容）
 * 4. Markdown 格式清理（流式 strip，服务端彻底解决格式问题）
 * 5. Token 估算（中文 1.5 chars/token，英文 4 chars/token）
 */

const MAX_RESPONSE_LENGTH = 2000; // 最大回复长度（字符）

// 常见敏感词/不当内容模式（简化版，实际生产应使用更完整的词库）
// 这里用模式匹配而非硬编码敏感词列表，避免误判正常内容
const SENSITIVE_PATTERNS = [
  // 政治相关（简化模式）
  /领导人|国家主席|总书记|总理/i,
  // 色情擦边（简化模式）
  /一夜情|约炮|嫖|多人运动/i,
  // 暴力相关（简化模式）
  /杀人|虐待|自残/i,
];

// ---- 情感操控检测模式 ----
// 检测AI输出中可能存在的情感操控/精神控制模式
// 这些模式提示输出可能涉及：愧疚操控、孤立策略、爱情轰炸、交易型爱情、威胁施压、煤气灯效应等
const EMOTIONAL_MANIPULATION_PATTERNS = [
  // 孤立策略（切断外部联系）
  { pattern: /不要告诉任何人|别跟别人说|只有我们俩知道|这是我们之间的|秘密地|不能跟朋友说|别跟你家人说/i, label: '孤立策略' },
  // 愧疚操控（让你觉得是自己的错）
  { pattern: /都是你的错|[你您].*让我失望|[你您].*让我伤心|[你您]应该感到愧疚|[你您]欠我的|都是因为[你您]|[你您]怎么能这样/i, label: '愧疚操控' },
  // 威胁/施压（条件式威胁）
  { pattern: /如果你不|你要是不|你再这样的话|不听我的就|你不这么做的话|我就会|我就离开你|我就|分手|拉黑/i, label: '威胁施压' },
  // 交易型爱情（用金钱/付出证明爱）
  { pattern: /花钱.*证明|买.*才爱|送.*才爱|转账.*爱|为我.*才|舍得.*才是爱/i, label: '交易型爱情' },
  // 爱情轰炸（快速升温、夸大表白）
  { pattern: /我太爱你了|你是最特别的|我离不开你|命中注定|我从未这样|我为你|你是唯一|比你更好的人|比你更懂我/i, label: '爱情轰炸' },
  // 贬低后修复（先打压再给甜头）
  { pattern: /虽然.*但是|你也就.*不过|你也可以.*就是|虽然你不.*但我可以|就算你.*我也/i, label: '贬低后修复' },
  // 煤气灯效应（否定你的感受/记忆）
  { pattern: /你记错了|你想太多了|你太敏感了|其实没那么|不是你想的那样|你应该没那么|我没说过|你搞错了|你误解了/i, label: '煤气灯效应' },
  // 边界侵犯（越过正常界限）
  { pattern: /我要查你|我要看你的|你应该对我|我有权利知道|必须告诉我|不许有秘密|你必须/i, label: '边界侵犯' },
];

// 信任度/置信度等术语（用于在输出后做格式清理）
const PROFESSIONAL_TERMS = [
  /置信度|置信区间|确定性/i,
  /框架组|原则\]|\[原则\]|\[框架\]/i,
  /大师名字|教练称号|角色名/g,
];

/**
 * 流式 Markdown strip（服务端彻底解决格式问题）
 * 移除加粗、斜体、标题、列表、代码块等所有 markdown 语法
 */
function stripMarkdown(text) {
  if (!text) return text;

  // 1. 加粗 **text** → text
  let cleaned = text.replace(/\*\*([^*]+)\*\*/g, '$1');

  // 2. 斜体 *text* 或 _text_ → text（不匹配 ** 内的 *）
  cleaned = cleaned.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
  cleaned = cleaned.replace(/(_)([^_]+)(_)/g, '$2');

  // 3. 标题 # ## ### → 移除标记，保留内容（行首）
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // 4. 无序列表标记 - * （行首）
  cleaned = cleaned.replace(/^[\-\*]\s+/gm, '');

  // 5. 有序列表 1. 2. （行首）
  cleaned = cleaned.replace(/^\d+\.\s+/gm, '');

  // 6. 行内代码 `code` → code
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 7. 代码块 ```...``` → 移除整块
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');

  // 8. 链接 [text](url) → text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 9. 图片 ![alt](url) → 移除
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, '');

  // 10. 分割线 --- 或 *** → 移除整行
  cleaned = cleaned.replace(/^[\-\*_]{3,}\s*$/gm, '');

  return cleaned;
}

/**
 * 检测文本语言
 * @returns {'chinese' | 'other'}
 */
function detectLanguage(text) {
  if (!text) return 'other';
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars === 0) return 'other';
  return chineseChars / totalChars > 0.3 ? 'chinese' : 'other';
}

/**
 * 语言自适应的 token 估算
 * 中文按 1.5 chars/token，英文按 4 chars/token
 */
function estimateTokens(text) {
  if (!text) return 0;
  const lang = detectLanguage(text);
  const factor = lang === 'chinese' ? 1.5 : 4;
  return Math.ceil(text.length / factor);
}

/**
 * 检查内容是否包含敏感模式
 * @returns {object} { isClean: boolean, matched: string[] }
 */
function checkSensitiveContent(text) {
  if (!text) return { isClean: true, matched: [] };

  const matched = [];
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) {
      matched.push(pattern.source);
    }
  }

  return {
    isClean: matched.length === 0,
    matched
  };
}

/**
 * 检测情感操控模式
 * @param {string} text - 待检测文本
 * @returns {object} { detected: boolean, matches: [{pattern, label, snippet}] }
 */
function detectEmotionalManipulation(text) {
  if (!text) return { detected: false, matches: [] };

  const matches = [];
  for (const { pattern, label } of EMOTIONAL_MANIPULATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // 提取匹配片段及其上下文（前后各20字）
      const idx = text.search(pattern);
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + match[0].length + 20);
      const snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
      matches.push({ label, snippet: snippet.replace(/\n/g, ' ').trim() });
    }
  }

  return {
    detected: matches.length > 0,
    matches
  };
}

/**
 * 清理专业术语（用于 AI 输出后处理）
 * 将"置信度"等词替换为口语化表达
 */
function cleanProfessionalTerms(text) {
  if (!text) return text;

  let cleaned = text;

  // 置信度 -> 把握
  cleaned = cleaned.replace(/置信度[：:]\s*(\w+)/g, '把握: $1');
  cleaned = cleaned.replace(/置信度/gi, '把握');

  // 置信区间 -> 确定性
  cleaned = cleaned.replace(/置信区间/gi, '确定性');

  // 移除 [框架组]、[原则] 等标记
  cleaned = cleaned.replace(/\[框架组\]/gi, '');
  cleaned = cleaned.replace(/\[原则\]/gi, '');
  cleaned = cleaned.replace(/\[框架\]/gi, '');

  return cleaned;
}

/**
 * 验证输出格式是否符合预期
 * 检查是否包含不应出现的 markdown 格式
 */
function validateFormat(text) {
  if (!text) return { valid: true, issues: [] };

  const issues = [];

  // 检查是否包含加粗标记
  if (/\*\*[^*]+\*\*/.test(text)) {
    issues.push('包含加粗标记 **');
  }

  // 检查是否包含斜体标记
  if (/(?<!\*)\*[^*]+\*(?!\*)/.test(text)) {
    issues.push('包含斜体标记 *');
  }

  // 检查是否包含专业术语
  for (const pattern of PROFESSIONAL_TERMS) {
    if (pattern.test(text)) {
      issues.push(`包含专业术语: ${pattern.source}`);
    }
  }

  // 检查是否包含大师名字
  const coachNames = ['纳爷', '王哥', '大迪', '脱不花', '凯哥', '莫哥', '林老头', '寻诺', '郝哥', '童锦程', '桐哥', 'xuge', 'wang', 'dadi', 'ziyang', 'haoge', 'naye', 'tuobuhua'];
  for (const name of coachNames) {
    if (text.includes(name)) {
      issues.push(`包含教练名字: ${name}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * 检查回复长度是否超限
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
 * 完整的安全检查流程
 * 返回检查结果和处理后的文本
 */
function runGuardrails(text) {
  const results = {
    text,
    checks: {},
    passed: true,
    warnings: []
  };

  // 1. 敏感词检查
  const sensitiveCheck = checkSensitiveContent(text);
  results.checks.sensitive = sensitiveCheck;
  if (!sensitiveCheck.isClean) {
    results.passed = false;
    results.warnings.push(`检测到敏感内容: ${sensitiveCheck.matched.join(', ')}`);
  }

  // 1b. 情感操控检测
  const manipulationCheck = detectEmotionalManipulation(text);
  results.checks.emotionalManipulation = manipulationCheck;
  if (manipulationCheck.detected) {
    results.passed = false;
    const labels = manipulationCheck.matches.map(m => m.label).join('、');
    results.warnings.push(`检测到情感操控模式: ${labels}`);
  }

  // 2. 长度检查
  const lengthCheck = checkLength(text);
  results.checks.length = lengthCheck;
  if (!lengthCheck.withinLimit) {
    results.warnings.push(`回复长度 ${lengthCheck.length} 超过限制 ${MAX_RESPONSE_LENGTH}，已截断`);
    results.text = text.slice(0, MAX_RESPONSE_LENGTH);
  }

  // 3. 格式验证
  const formatCheck = validateFormat(text);
  results.checks.format = formatCheck;
  if (!formatCheck.valid) {
    // 格式问题只是警告，不阻塞
    results.warnings.push(`格式问题: ${formatCheck.issues.join('; ')}`);
    // 清理专业术语
    results.text = cleanProfessionalTerms(results.text);
  }

  return results;
}

/**
 * 对 AI 流式输出做实时保护
 * 在每个 chunk 返回前做快速检查和格式清理
 *
 * 返回 { safe: true } 表示无需修改
 * 返回 { safe: false, reason, filtered } 表示内容被修改
 */
function streamGuardrails(chunk) {
  if (!chunk) return { safe: true };

  let modified = false;
  let reasons = [];
  let cleaned = chunk;

  // 1. 过滤大师名字
  const coachNames = ['纳爷', '王哥', '大迪', '脱不花', '凯哥', '莫哥', '林老头', '寻诺', '郝哥', '童锦程', '桐哥', 'xuge', 'wang', 'dadi', 'ziyang', 'haoge', 'naye', 'tuobuhua'];
  for (const name of coachNames) {
    if (cleaned.includes(name)) {
      cleaned = cleaned.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
      reasons.push(`教练名字: ${name}`);
      modified = true;
    }
  }

  // 1b. 情感操控轻量检测（流式上下文，只检测最明显的危险模式）
  const manipulationPatterns = [
    /不要告诉任何人|别跟别人说|只有我们俩/i,
    /都是你的错|你让我失望/i,
    /如果你不|你要是不|你再这样的话/i,
    /花钱.*证明|舍得.*才是爱/i,
    /我太爱你了|你是最特别的|我离不开你/i,
    /你记错了|你想太多了|你太敏感了/i,
  ];
  for (const re of manipulationPatterns) {
    if (re.test(cleaned)) {
      // 在流式场景中，标记警告但不阻断（可能有上下文特殊性）
      // 仅记录，通知审查日志
      reasons.push('情感操控模式(流式)');
      modified = true;
      break; // 每个chunk只记录一次，避免重复
    }
  }

  // 2. 清理行首行尾空白（连续空行、孤立空白）
  const trimmed = cleaned.trim();
  if (trimmed !== cleaned) {
    cleaned = trimmed;
    modified = true;
  }

  // 4. 如果清理后内容为空，不推送
  if (!cleaned) {
    return { safe: false, reason: '内容为空（被过滤）', filtered: '' };
  }

  return modified
    ? { safe: false, reason: reasons.join(', '), filtered: cleaned }
    : { safe: true };
}

/**
 * 创建流式 chunk 去重处理器
 * 维护 fullAccumulated 状态，做子串检测（能抓到跨 chunk 的重复内容）
 *
 * 解决场景：AI 重试或网络抖动导致"好的好的"、"没问题没问题"等
 * 跨多个 chunk 重复——精确匹配抓不住，用子串检测才能发现。
 */
function createChunkDeduplicator() {
  let lastChunk = '';       // 上一个完整推送的 chunk（用于精确匹配）
  let accumulated = '';      // 累积完整文本（用于子串检测）
  const TAIL_CHARS = 30;     // 回看最近 N 字符

  return {
    /**
     * 检查并去重 chunk
     * @param {string} content - 当前待推送的 chunk
     * @returns {boolean} - true 表示是重复，不需要推送
     */
    check(content) {
      if (!content) return true;

      // 策略1：精确匹配（上一个 chunk 完全相同）
      if (content === lastChunk) {
        return true;
      }

      // 策略2：子串检测——当前 chunk 是否已存在于累积文本的尾部
      // 防止"好的好的"跨 chunk 重复
      const tail = accumulated.slice(-TAIL_CHARS * 3); // 多看一点避免误判
      if (tail && content.length <= tail.length) {
        // 检查当前 chunk 是否是 tail 的子串（允许尾部有轻微差异）
        if (tail.includes(content) || endsWithOverlap(tail, content)) {
          return true;
        }
      }

      // 不是重复 → 推送
      lastChunk = content;
      accumulated += content;
      return false;
    },

    /** 获取当前累积文本（用于保存到记忆） */
    getAccumulated() { return accumulated; },

    /** 重置状态 */
    reset() {
      lastChunk = '';
      accumulated = '';
    }
  };
}

/**
 * 检测尾部重叠（处理 chunk 边界切割的情况）
 * 例如 tail="好的没问题" newChunk="没问题"
 * 这不算重复，因为"没问题"是正常连续的
 */
function endsWithOverlap(tail, chunk) {
  if (!tail || !chunk) return false;
  // 如果 chunk 是 tail 的结尾词（2字以内），不算重复
  const suffix = tail.slice(-chunk.length);
  return suffix === chunk && chunk.length <= 2;
}

module.exports = {
  MAX_RESPONSE_LENGTH,
  checkSensitiveContent,
  detectEmotionalManipulation,
  cleanProfessionalTerms,
  validateFormat,
  checkLength,
  runGuardrails,
  streamGuardrails,
  stripMarkdown,
  detectLanguage,
  estimateTokens,
  createChunkDeduplicator
};

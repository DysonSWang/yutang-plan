/**
 * Guardrails Service - 输出安全边界
 *
 * 1. 敏感词过滤（中文常见敏感词列表）
 * 2. 回复长度限制
 * 3. 格式验证（检查是否包含不当内容）
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

// 信任度/置信度等术语（用于在输出后做格式清理）
const PROFESSIONAL_TERMS = [
  /置信度|置信区间|确定性/i,
  /框架组|原则\]|\[原则\]|\[框架\]/i,
  /大师名字|教练称号|角色名/g,
];

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
 * 在每个 chunk 返回前做快速检查
 */
function streamGuardrails(chunk) {
  // 流式场景下只做基本检查，不做全文分析
  // 1. 检查 chunk 是否包含大师名字
  const coachNames = ['纳爷', '王哥', '大迪', '脱不花', '凯哥', '莫哥', '林老头', '寻诺', '郝哥', '童锦程', '桐哥'];
  for (const name of coachNames) {
    if (chunk.includes(name)) {
      return {
        safe: false,
        reason: `包含教练名字: ${name}`,
        filtered: chunk.replace(new RegExp(name, 'g'), '')
      };
    }
  }

  // 2. 检查是否包含加粗标记
  if (/\*\*[^*]+\*\*/.test(chunk)) {
    return {
      safe: false,
      reason: '包含加粗标记',
      filtered: chunk.replace(/\*\*([^*]+)\*\*/g, '$1')
    };
  }

  return { safe: true };
}

module.exports = {
  MAX_RESPONSE_LENGTH,
  checkSensitiveContent,
  cleanProfessionalTerms,
  validateFormat,
  checkLength,
  runGuardrails,
  streamGuardrails
};

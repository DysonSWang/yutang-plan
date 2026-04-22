/**
 * Compaction Service - CC风格的会话压缩
 *
 * 参考 Claude Code compact.rs 机制：
 * 1. Token预算驱动的压缩触发（而非固定消息数）
 * 2. 递归压缩链（Previously/Newly compacted context）
 * 3. Summary压缩（优先级行选择 + 硬限制）
 * 4. 保留最近消息verbatim
 */

const { getAIConfig } = require('../config');

// ---- 配置 ----
const PRESERVE_RECENT_MESSAGES = 4; // 最近N条消息原样保留
const MAX_ESTIMATED_TOKENS = 8000;   // 触发压缩的token阈值（留buffer给prompt）
const MAX_CHARS = 1200;             // Summary压缩：最大字符数
const MAX_LINES = 24;               // Summary压缩：最大行数
const MAX_LINE_CHARS = 160;         // Summary压缩：单行最大字符数
const ESTIMATION_FACTOR = 4;        // 字符数 / ESTIMATION_FACTOR ~= token数

// ---- Token估算 ----
/**
 * 估算单条消息的token数（按字符粗估）
 */
function estimateMessageTokens(message) {
  if (!message) return 0;
  const content = typeof message === 'string' ? message : (message.content || '');
  return Math.ceil(content.length / ESTIMATION_FACTOR) + 2;
}

/**
 * 估算一组消息的总token数
 */
function estimateTotalTokens(messages) {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

// ---- Summary Compression ----
/**
 * 判断行是否是核心详情行（优先级0）
 */
function isCoreDetail(line) {
  const corePrefixes = [
    '- Scope:', '- Current work:', '- Pending work:',
    '- Key files referenced:', '- Tools mentioned:',
    '- Recent user requests:', '- Previously compacted context:',
    '- Newly compacted context:'
  ];
  return corePrefixes.some(p => line.startsWith(p));
}

/**
 * 判断行是否是章节标题（优先级1）
 */
function isSectionHeader(line) {
  const trimmed = line.trim();
  return /^#+\s/.test(trimmed) ||
         /^[A-Z][A-Za-z\s]+:$/.test(trimmed) ||
         /^【.+】$/.test(trimmed) ||
         trimmed.endsWith('：') || trimmed.endsWith(':');
}

/**
 * 判断行是否是bullet item（优先级2）
 */
function isBulletItem(line) {
  const t = line.trim();
  return t.startsWith('- ') || t.startsWith('* ') || t.startsWith('  - ') || t.startsWith('  * ');
}

/**
 * 计算行优先级（0=最高，3=最低）
 */
function linePriority(line) {
  const trimmed = line.trim();
  if (!trimmed) return 4; // 空行最低
  if (isCoreDetail(trimmed)) return 0;
  if (trimmed === 'Summary:' || trimmed === 'Conversation summary:') return 0;
  if (isSectionHeader(trimmed)) return 1;
  if (isBulletItem(trimmed)) return 2;
  return 3;
}

/**
 * 压缩summary文本：优先级行选择 + 硬限制
 * 返回压缩后的文本
 */
function compressSummary(summary) {
  if (!summary) return '';

  // 规范化：移除多余空白、合并重复行
  const lines = summary.split('\n');
  const normalized = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // 截断超长行
    const truncated = trimmed.length > MAX_LINE_CHARS
      ? trimmed.slice(0, MAX_LINE_CHARS - 3) + '...'
      : trimmed;
    // 去重
    if (!seen.has(truncated)) {
      seen.add(truncated);
      normalized.push(truncated);
    }
  }

  // 按优先级排序，同优先级按原文顺序
  const withPriority = normalized.map(line => ({
    line,
    priority: linePriority(line)
  }));
  withPriority.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return 0; // 保持原顺序
  });

  // 贪婪选择：在限制内放入尽可能多的行
  const selected = [];
  let totalChars = 0;
  let lineCount = 0;
  let omitted = false;

  for (const { line } of withPriority) {
    const needed = line.length + (selected.length > 0 ? 1 : 0); // +1 for newline
    if (
      totalChars + needed <= MAX_CHARS &&
      lineCount + 1 <= MAX_LINES
    ) {
      selected.push(line);
      totalChars += needed;
      lineCount++;
    } else {
      omitted = true;
    }
  }

  const compressed = selected.join('\n');
  return omitted ? compressed + '\n...\n(N additional lines omitted)' : compressed;
}

// ---- Summary Generation Prompt ----
/**
 * 生成压缩摘要的AI prompt
 */
function buildSummarizePrompt(messages, existingSummary = null, context = {}) {
  const messagesText = messages.map(m =>
    `${m.role === 'user' ? '用户' : '教练'}: ${m.content}`
  ).join('\n\n');

  const hasExistingSummary = existingSummary && existingSummary.trim();

  // Few-shot examples showing exact expected output format
  const fewShot = `
【示例输入】
用户: 第一次约她出来，她说比较忙，但说下周可以
教练: 那女生能主动给替代时间窗口，说明窗口还在。但不要太急，先等下周，不要追着问具体哪天。
用户: 她上周还说想看电影，感觉她不是完全没兴趣
教练: 约电影是好的信号，说明她有预期感。但不能硬约成，要让她觉得是自然发生的，不是刻意追求。
用户: 我约她周五晚上，她说那天下班晚，约周末呢？

【示例输出】
## Summary
- Scope: 约女生看电影，被婉拒后约周末
- Current work: 等待女生确认周末时间，不要主动追问
- Pending work: 确定周末约会内容，提前准备
- Key insights: "下周可以"是积极信号，等她主动给时间；约电影=她有预期感但需自然化
- Relationship state: 暧昧初期，她愿意出来但有顾虑`;

  let systemPrompt = `你是童锦程，两性关系专家。你的任务是把对话历史压缩成结构化摘要。

压缩规则：
1. 提取关键信息：客户诉求、女生阶段、关系状态、当前进展、待办事项
2. 用简洁中文，不要废话，每行15-50字
3. 优先保留：客户反馈、情绪信号、关系升级信号、经验教训、教练给出的关键判断
4. 丢弃：礼貌性寒暄、重复确认、感谢回复、无关闲聊
5. 每行格式："- 标签: 内容"，标签从以下选取：Scope / Current work / Pending work / Key insights / Relationship state

${hasExistingSummary ? `
【历史压缩摘要】（新摘要如有冲突，以本次为准）
${existingSummary}
` : ''}

${fewShot}

【本次需要压缩的对话】
${messagesText}

输出格式（严格按此格式，不要写其他内容）：
## Summary
- Scope: （本次对话覆盖的主题）
- Current work: （当前正在推进的事）
- Pending work: （待处理的事项）
- Key insights: （关键发现/教训，保留教练的核心判断）
- Relationship state: （关系状态简述）`;

  return systemPrompt;
}

// ---- Recursive Compaction ----
/**
 * 合并新旧压缩摘要（递归链）
 * 生成包含 "Previously compacted context:" 和 "Newly compacted context:" 的合并文本
 */
function mergeCompactSummaries(existingSummary, newSummary) {
  if (!existingSummary || !existingSummary.trim()) {
    return newSummary;
  }

  // 提取新旧摘要中的关键信息（highlight extraction）
  const existingLines = (existingSummary || '').split('\n')
    .map(l => l.trim())
    .filter(l => l && l !== 'Summary:' && l !== 'Conversation summary:');

  const newLines = (newSummary || '').split('\n')
    .map(l => l.trim())
    .filter(l => l && l !== 'Summary:' && l !== 'Conversation summary:');

  // 去重
  const allLines = [...existingLines];
  const seen = new Set(existingLines.map(l => l.toLowerCase()));
  for (const line of newLines) {
    if (!seen.has(line.toLowerCase())) {
      seen.add(line.toLowerCase());
      allLines.push(line);
    }
  }

  const merged = allLines.join('\n');

  // 再次压缩以确保不过长
  return compressSummary(merged);
}

/**
 * 追加到压缩链
 */
function appendToCompactionChain(existingChain, newSummary) {
  const chain = existingChain ? JSON.parse(existingChain) : [];
  chain.push({
    seq: chain.length + 1,
    summary: newSummary,
    timestamp: new Date().toISOString()
  });

  // 限制链长度（最多保留10个历史摘要）
  if (chain.length > 10) {
    chain.shift();
    // 重新编号
    chain.forEach((c, i) => c.seq = i + 1);
  }

  return JSON.stringify(chain);
}

/**
 * 构建压缩后的continuation消息
 * 这会替换被压缩的旧消息，作为新的system消息
 */
function buildCompactContinuationMessage(compactionResult, preserveRecentMessages, hardConstraints = null) {
  const { summary, removedCount, chain } = compactionResult;

  // 压缩summary以符合硬限制
  const compressedSummary = compressSummary(summary);

  // 构建硬约束部分（必须保留的信息）
  let hardConstraintsBlock = '';
  if (hardConstraints) {
    const { taboos, emotionalTriggers, thingsToAvoid, dealbreakers, stage } = hardConstraints;
    const items = [];
    if (taboos && taboos.length) items.push(`雷区：${taboos.join('、')}`);
    if (thingsToAvoid && thingsToAvoid.length) items.push(`禁忌话题：${thingsToAvoid.join('、')}`);
    if (emotionalTriggers && emotionalTriggers.length) items.push(`情绪触发点：${emotionalTriggers.join('、')}`);
    if (dealbreakers && dealbreakers.length) items.push(`绝对雷区：${dealbreakers.join('、')}`);
    if (stage) items.push(`当前阶段：${stage}`);

    if (items.length > 0) {
      hardConstraintsBlock = `\n\n【硬约束】（压缩后必须保留，下次对话时必须遵守）\n${items.join('\n')}\n`;
    }
  }

  // 构建chain信息（如果有历史压缩）
  let chainInfo = '';
  if (chain && chain.length > 0) {
    // 最多展示最近2个历史摘要作为引用
    const recentChain = chain.slice(-2);
    const historyLines = recentChain.map(c =>
      `  - [Compaction #${c.seq}] ${c.summary.slice(0, 80)}${c.summary.length > 80 ? '...' : ''}`
    ).join('\n');
    chainInfo = `\n\n[历史压缩摘要链]\n${historyLines}`;
  }

  let note = '';
  if (preserveRecentMessages) {
    note = '\n\n注：最近几条消息已原样保留在下方。';
  }

  return `【对话已压缩】（已移除${removedCount}条早期消息）
${compressedSummary}${hardConstraintsBlock}${chainInfo}${note}`;
}

/**
 * 判断是否应该触发压缩
 */
function shouldCompact(memory) {
  return memory.tokenCount >= MAX_ESTIMATED_TOKENS;
}

/**
 * 获取被压缩部分的起始位置（跳过已压缩的summary + chain）
 */
function getCompactedPrefixLen(memory) {
  // 跳过summary消息（如果存在）
  return memory.summary ? 1 : 0;
}

/**
 * 生成摘要（调用AI）
 */
async function generateSummary(messages, existingSummary = null, context = {}) {
  const aiConfig = getAIConfig();
  const prompt = buildSummarizePrompt(messages, existingSummary, context);

  try {
    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 600
      })
    });

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    // 清理markdown
    content = content.replace(/^```markdown\n?/i, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();

    return content;
  } catch (error) {
    console.error('[Compaction] Summary generation failed:', error);
    // 回退：生成简单摘要
    const first = messages[0]?.content || '';
    const last = messages[messages.length - 1]?.content || '';
    return `[自动压缩摘要] 对话${messages.length}条。首条: "${first.slice(0, 50)}..." 末条: "${last.slice(0, 50)}..."`;
  }
}

module.exports = {
  PRESERVE_RECENT_MESSAGES,
  MAX_ESTIMATED_TOKENS,
  MAX_CHARS,
  MAX_LINES,
  MAX_LINE_CHARS,
  estimateMessageTokens,
  estimateTotalTokens,
  compressSummary,
  buildSummarizePrompt,
  mergeCompactSummaries,
  appendToCompactionChain,
  buildCompactContinuationMessage,
  shouldCompact,
  getCompactedPrefixLen,
  generateSummary
};

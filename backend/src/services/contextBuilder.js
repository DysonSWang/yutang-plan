/**
 * 上下文构建服务 - 构建AI教练的上下文Prompt
 * 参考 Claude compact.rs 机制，支持信息分层和按需召回
 */

const prisma = require('../prisma');
const path = require('path');

// ---- 新鲜度保护 ----

const STALENESS_THRESHOLD_HOURS = 24;

/**
 * 获取女生档案字段的新鲜度信息（用于 system prompt 注入）
 * @param {object} girlInfo - 女生档案对象
 * @returns {object} - { hasStaleField, warnings[] }
 */
function getProfileFreshnessInfo(girlInfo) {
  const warnings = [];
  const now = Date.now();

  if (girlInfo?.tensionScoreUpdatedAt) {
    const tensionAgeHours = Math.round((now - new Date(girlInfo.tensionScoreUpdatedAt).getTime()) / (1000 * 60 * 60));
    if (tensionAgeHours >= STALENESS_THRESHOLD_HOURS) {
      warnings.push(`[档案新鲜度警告] 热度评分基于 ${tensionAgeHours}h 前的信息，建议结合最新互动判断是否仍适用`);
    }
  }

  if (girlInfo?.intimacyLevelUpdatedAt) {
    const intimacyAgeHours = Math.round((now - new Date(girlInfo.intimacyLevelUpdatedAt).getTime()) / (1000 * 60 * 60));
    if (intimacyAgeHours >= STALENESS_THRESHOLD_HOURS) {
      warnings.push(`[档案新鲜度警告] 亲密度评估基于 ${intimacyAgeHours}h 前的信息，建议结合最新互动判断是否仍适用`);
    }
  }

  return { hasStaleField: warnings.length > 0, warnings };
}

// ---- WikiRag 单例 ----

let _wikiRagInstance = null;

function getWikiRagInstance() {
  if (!_wikiRagInstance) {
    const wikiPath = path.join(__dirname, '../../../../vault/wiki');
    const WikiRag = require('./wikiRag');
    _wikiRagInstance = new WikiRag(wikiPath);
  }
  return _wikiRagInstance;
}

function formatWikiContext(results) {
  const parts = ['【知识库参考】'];

  for (const concept of results.concepts) {
    parts.push(`\n## 核心概念：${concept.title}`);
    if (concept.insights?.length > 0) {
      parts.push(`\n关键洞察：${concept.insights.join('；')}`);
    }
    parts.push(`\n${concept.body}`);
  }

  for (const entity of results.entities) {
    parts.push(`\n## 导师方法论：${entity.title}`);
    if (entity.insights?.length > 0) {
      parts.push(`\n关键洞察：${entity.insights.join('；')}`);
    }
    parts.push(`\n${entity.body}`);
  }

  if (results.summaries.length > 0) {
    parts.push('\n## 实战案例');
    for (const summary of results.summaries) {
      parts.push(`\n- 【${summary.filename}】`);
    }
  }

  if (results.cases.length > 0) {
    parts.push('\n## 案例库');
    for (const c of results.cases) {
      parts.push(`\n- 【${c.filename}】${c.title}`);
    }
  }

  return parts.join('\n');
}

function estimateTokens(text) {
  try {
    const tokenizer = require('gpt-tokenizer');
    return tokenizer.tokenize(text).length;
  } catch (e) {
    return Math.ceil(text.length / 2);
  }
}

// ---- Relevance Filtering ----

/**
 * Extract Chinese/English keywords from user message for relevance scoring
 */
function extractKeywords(text, minLen = 2) {
  if (!text) return [];
  // Match Chinese chars, English words, and numbers
  const matches = text.match(/[一-鿿]{2,}/g) || [];
  const english = text.match(/[a-zA-Z]{3,}/g) || [];
  return [...matches, ...english].filter(w => w.length >= minLen);
}

/**
 * Score a context item by keyword overlap with user message
 * Returns 0 (irrelevant) to 1 (highly relevant)
 */
function scoreRelevance(item, keywords, textExtractor) {
  if (!keywords.length) return 0.5; // neutral if no keywords
  const text = textExtractor(item).toLowerCase();
  const hits = keywords.filter(k => text.includes(k.toLowerCase()));
  return hits.length / keywords.length;
}

/**
 * Filter and rank signals by relevance to current user message
 */
function filterSignalsByRelevance(signals, keywords) {
  if (!keywords.length) return signals;
  const scored = signals.map(s => ({
    ...s,
    score: scoreRelevance(s, keywords, i => `${i.event || ''} ${i.type || ''}`)
  }));
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Filter learnings by relevance (keyword overlap on content/scene/type)
 */
function filterLearningsByRelevance(learnings, keywords) {
  if (!keywords.length) return learnings.slice(0, 10);
  const scored = learnings.map(l => ({
    ...l,
    score: scoreRelevance(l, keywords, i => `${i.content || ''} ${i.scene || ''} ${i.type || ''}`)
  }));
  return scored
    .filter(l => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

/**
 * Budget-aware context section builder
 * Truncates sections to fit within maxChars
 */
function buildContextSection(label, content, maxChars) {
  if (!content) return '';
  const header = `\n【${label}】\n`;
  const available = maxChars - header.length;
  if (available <= 0) return '';
  if (content.length <= available) return header + content;
  // Truncate with ellipsis
  return header + content.slice(0, available - 4) + '...';
}

// ---- Main Context Builder ----

/**
 * 构建AI教练的上下文Prompt（预算感知 + 相关性过滤）
 * @param {string} clientId - 客户ID
 * @param {string} girlId - 女生ID（可选）
 * @param {string} userMessage - 用户当前问题（用于相关性过滤）
 * @param {Object} opts - 选项
 * @param {number} opts.maxContextChars - 最大上下文字符数（预算感知）
 * @param {number} opts.turnCount - 当前对话轮次（深度感知）
 * @param {number} opts.compactionCount - 已压缩次数（深度感知）
 */
async function buildAICoachContext(clientId, girlId, userMessage, opts = {}) {
  const { maxContextChars = 2000, turnCount = 0, compactionCount = 0, clientProfile = null } = opts;
  const keywords = extractKeywords(userMessage);
  // 1. 获取客户信息
  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      nickname: true,
      serviceStage: true,
      familyBackground: true,
      familyStructure: true,
      familyAtmosphere: true,
      familyBurden: true,
      relationshipAttitude: true
    }
  });

  // 2. 获取女生信息（如果指定）
  let girlInfo = null;
  let recentSignals = [];
  let pendingActions = [];
  let observations = [];
  let conversationSummary = '';

  if (girlId) {
    const girl = await prisma.girl.findUnique({
      where: { id: girlId }
    });

    // 安全验证：客户只能访问自己的女生
    if (girl && girl.clientId !== clientId) {
      return {
        girlInfo: null,
        recentSignals: [],
        pendingActions: [],
        observations: [],
        conversationSummary: '',
        client: null
      };
    }

    if (girl) {
      girlInfo = {
        id: girl.id,
        name: girl.name,
        stage: girl.stage,
        sourcePlatform: girl.sourcePlatform,
        intimacyLevel: girl.intimacyLevel,
        intimacyLevelUpdatedAt: girl.intimacyLevelUpdatedAt,
        tensionScore: girl.tensionScore || 5.0,
        tensionScoreUpdatedAt: girl.tensionScoreUpdatedAt,
        age: girl.age,
        occupation: girl.occupation,
        personality: (() => {
          if (!girl.personality) return {};
          try { return JSON.parse(girl.personality); }
          catch { return { raw: girl.personality }; }
        })(),
        notes: girl.notes,
        updatedAt: girl.updatedAt,
        lastContact: girl.lastContact,
        // M007 S01 新增：关系阶段
        relationshipStage: girl.relationshipStage,
        relationshipStageUpdatedAt: girl.relationshipStageUpdatedAt
      };

      // 解析 signals（保留最近30天的）
      if (girl.signals) {
        try {
          const allSignals = JSON.parse(girl.signals);
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          recentSignals = allSignals.filter(s => new Date(s.date) >= thirtyDaysAgo);
        } catch (e) {
          recentSignals = [];
        }
      }

      // 解析 pendingActions
      if (girl.pendingActions) {
        try {
          pendingActions = JSON.parse(girl.pendingActions);
        } catch (e) {
          pendingActions = [];
        }
      }

      // 解析 observations
      if (girl.observations) {
        try {
          observations = JSON.parse(girl.observations);
        } catch (e) {
          observations = [];
        }
      }

      conversationSummary = girl.conversationSummary || '';
    }
  }

  // 3. 获取客户经验（先取更多，再做相关性过滤）
  const rawLearnings = await prisma.clientLearning.findMany({
    where: {
      clientId,
      OR: girlId ? [{ girlId }] : [{ girlId: null }]
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  const learnings = filterLearningsByRelevance(rawLearnings, keywords);

  // 3b. 相关性过滤 signals
  const filteredSignals = filterSignalsByRelevance(recentSignals, keywords);

  // 4. 组装上下文（按优先级分配预算）
  const sections = [];

  // 女生档案（固定，无关预算，AI需要基本信息）
  if (girlInfo) {
    const profile = `${girlInfo.name} | ${girlInfo.stage || '未知'} | 热度${girlInfo.tensionScore || 5}/10 | 亲密度${girlInfo.intimacyLevel || 1}`;
    sections.push({ label: '女生档案', content: profile, priority: 0 });
    sections.push({ label: '性格', content: `沟通风格:${girlInfo.personality?.communicationStyle || '未知'} MBTI:${girlInfo.personality?.mbti || '未知'}`, priority: 1 });

    // 新鲜度警告（优先级-1，确保始终在最前）
    const { hasStaleField, warnings } = getProfileFreshnessInfo(girlInfo);
    if (hasStaleField) {
      sections.push({ label: '档案新鲜度警告', content: warnings.join('\n'), priority: -1 });
    }
  }

  // 近期信号（相关性过滤后）
  if (filteredSignals.length > 0) {
    const signalsText = filteredSignals.map(s => {
      const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
      return `${icon} ${s.event} — ${s.date}`;
    }).join('\n');
    sections.push({ label: '近期关键信号', content: signalsText, priority: 2 });
  }

  // 待推进事项（相关性过滤）
  if (pendingActions.length > 0) {
    const scoredActions = pendingActions.map(a => ({
      content: a,
      score: scoreRelevance({ event: a }, keywords, i => i.event || '')
    })).sort((a, b) => b.score - a.score);
    const topActions = scoredActions.slice(0, 3);
    if (topActions.length > 0) {
      sections.push({ label: '待推进事项', content: topActions.map(a => `- ${a.content}`).join('\n'), priority: 3 });
    }
  }

  // 观察记录
  if (observations.length > 0) {
    sections.push({ label: '观察记录', content: observations.slice(0, 3).map(o => `- ${o}`).join('\n'), priority: 4 });
  }

  // 经验教训（相关性过滤后）
  if (learnings.length > 0) {
    const learningsText = learnings.map(l => `[${l.type}] ${l.scene}: ${l.content}`).join('\n');
    sections.push({ label: '经验教训', content: learningsText, priority: 5 });
  }

  // 对话摘要（如果存在）
  if (conversationSummary) {
    sections.push({ label: '对话摘要', content: conversationSummary, priority: 6 });
  }

  // 按优先级填充预算
  const contextInfo = sections.map(s => buildContextSection(s.label, s.content, maxContextChars / sections.length)).join('');

  // ---- Wiki 知识库注入 ----
  let wikiContext = '';
  if (userMessage) {
    try {
      const wikiRag = getWikiRagInstance();
      await wikiRag.ready;

      // 从 contextBuilder 的调用方获取 routingMeta（通过 opts 传入）
      const routingMeta = opts.routingMeta || {};
      const wikiResults = wikiRag.retrieve(userMessage, routingMeta.routedType, {
        coachesUsed: routingMeta.coachesUsed,
        scene: girlInfo?.preferredScene
      });

      if (wikiResults.concepts.length > 0 || wikiResults.entities.length > 0) {
        // 限制 Wiki 内容数量，避免干扰 AI 判断
        const limitedResults = {
          ...wikiResults,
          concepts: wikiResults.concepts.slice(0, 3),  // 最多 3 个 concepts
          entities: wikiResults.entities.slice(0, 2),  // 最多 2 个 entities
          summaries: wikiResults.summaries.slice(0, 5),  // 最多 5 个 summaries
        };
        const wikiContextText = formatWikiContext(limitedResults);
        const wikiTokens = estimateTokens(wikiContextText);
        const MAX_WIKI_TOKENS = 10000; // 限制在 10K，避免过长干扰

        wikiContext = wikiTokens > MAX_WIKI_TOKENS
          ? wikiRag.truncateToTokenBudget(wikiContextText, MAX_WIKI_TOKENS)
          : wikiContextText;
      }
    } catch (e) {
      console.warn('[contextBuilder] WikiRag 加载失败:', e.message);
    }
  }

  return {
    client,
    clientProfile, // 客户画像，用于路由权重和语气调整
    girlInfo,
    recentSignals: filteredSignals,
    pendingActions,
    observations,
    conversationSummary,
    learnings,
    // 原始数据引用（AI可按需查询）
    rawData: {
      signals: recentSignals,
      pendingActions,
      observations
    },
    // 预算感知上下文（主使用）
    contextInfo,
    contextMeta: {
      turnCount,
      compactionCount,
      maxContextChars,
      keywordCount: keywords.length,
      sectionCount: sections.length
    },
    // Wiki 知识上下文
    wikiContext
  };
}

/**
 * 构建女生档案摘要（约300字）
 * @param {object} girlInfo - 女生信息
 * @param {array} recentSignals - 近期信号
 * @param {string} conversationSummary - 对话摘要
 */
function buildGirlProfileSummary(girlInfo, recentSignals) {
  if (!girlInfo) return '未选择特定女生';

  const signalsText = recentSignals.length > 0
    ? recentSignals.map(s => {
        const icon = s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]';
        const flag = s.type === 'negative' ? ' ⚠️' : '';
        return `${icon} ${s.event} — ${s.date}${flag}`;
      }).join('\n')
    : '暂无近期信号';

  // M007 S01 新增：关系阶段标签
  const STAGE_LABELS = { EXPLORATION: '探索期', FLIRTING: '暧昧期', ADVANCEMENT: '推进期', CONFIRMATION: '确认期', STABLE: '稳定期' };
  const relationshipStageLabel = girlInfo.relationshipStage ? STAGE_LABELS[girlInfo.relationshipStage] || girlInfo.relationshipStage : '未设置';

  return `## ${girlInfo.name} | 旧阶段:${girlInfo.stage || '未知'} | 新关系阶段:${relationshipStageLabel} | ${girlInfo.updatedAt ? new Date(girlInfo.updatedAt).toLocaleDateString() : '未知'}

### 关系热度
${girlInfo.tensionScore}/10 ${getTensionEmoji(girlInfo.tensionScore)}

### 关键信号（近30天）
${signalsText}

### 当前进度
- 亲密度：${'❤️'.repeat(girlInfo.intimacyLevel || 1)}
- 平台：${girlInfo.sourcePlatform || '未知'}
${girlInfo.notes ? `- 备注：${girlInfo.notes}` : ''}`;
}

/**
 * 构建客户画像摘要
 */
function buildClientProfileSummary(client) {
  if (!client) return '客户信息未知';

  return `### 客户画像
家庭背景：${client.familyBackground || '未知'}
家庭结构：${client.familyStructure || '未知'}
婚姻态度：${client.relationshipAttitude || '未知'}
服务阶段：${client.serviceStage || '未知'}`;
}

/**
 * 获取热度emoji
 */
function getTensionEmoji(score) {
  if (score >= 8) return '🔥🔥🔥';
  if (score >= 7) return '🔥🔥';
  if (score >= 5) return '🔥';
  if (score >= 3) return '❄️';
  return '❄️❄️';
}

/**
 * 获取上下文摘要（用于快速注入）
 */
async function getContextSummary(clientId, girlId) {
  const context = await buildAICoachContext(clientId, girlId);

  return {
    girlProfile: buildGirlProfileSummary(context.girlInfo, context.recentSignals),
    clientProfile: buildClientProfileSummary(context.client),
    recentSignals: context.recentSignals,
    pendingActions: context.pendingActions,
    pendingActionsText: context.pendingActions.length > 0
      ? context.pendingActions.map(a => `- ${a}`).join('\n')
      : '暂无待推进事项',
    observations: context.observations,
    learnings: context.learnings,
    conversationSummary: context.conversationSummary
  };
}

module.exports = {
  buildAICoachContext,
  getContextSummary,
  buildGirlProfileSummary,
  buildClientProfileSummary,
  getProfileFreshnessInfo
};

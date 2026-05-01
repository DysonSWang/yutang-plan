/**
 * Coach Persona Service - M007 S06
 *
 * 结构化人格适配引擎：
 * 1. 支持多维人格适配（学习风格/客户类型/依恋类型/节奏偏好）
 * 2. 加载未使用字段（attachmentStyle/loveStyle/clientBestApproach）
 * 3. 中期会话语气调整（mid-session adaptation）
 * 4. 所有端点均可调用（不限于 /situation）
 */

const prisma = require('../prisma');
const { getClientCoachPreferences } = require('./clientCoachProfile');
const { getAllLearnings } = require('./learning');

// 学习风格配置
const LEARNING_STYLE_CONFIG = {
  '强': { depth: 'deep', explanation: '详细', examples: true, rationale: true },
  '中': { depth: 'moderate', explanation: '适中', examples: true, rationale: false },
  '弱': { depth: 'moderate', explanation: '适中', examples: true, rationale: false }
};

// 客户类型 → 教练行为模式
const CLIENT_TYPE_BEHAVIORS = {
  '执行型': { directiveStyle: 'step_by_step', avoidLongText: true, giveActionFirst: true },
  '质疑型': { directiveStyle: 'explain_first', avoidLongText: false, giveActionFirst: false },
  '自主型': { directiveStyle: 'framework_only', avoidLongText: true, giveActionFirst: false }
};

// 依恋类型 → 语气校准（M007 S06 新增）
const ATTACHMENT_TONE_CONFIG = {
  '焦虑型': {
    pressure: 'low',
    reassurance: 'high',
    boundary: 'medium',
    summary: '确认感受→给方案→避免施压',
    hints: [
      '先确认对方的情绪和诉求，表达理解',
      '给出具体行动方案但不强推节奏',
      '避免使用"你应该"/"你必须"等施压语言',
      '可以多说"不着急"/"按你的节奏来"'
    ]
  },
  '回避型': {
    pressure: 'very_low',
    reassurance: 'medium',
    boundary: 'high',
    summary: '给空间→减少追问→尊重节奏',
    hints: [
      '不要连环追问，给对方留思考空间',
      '避免紧迫感语言如"你要抓紧"/"不能再拖了"',
      '尊重对方的独立需求，决策权完全交还',
      '可以用"随时可以找我"/"不急"等宽松语言'
    ]
  },
  '安全型': {
    pressure: 'medium',
    reassurance: 'medium',
    boundary: 'medium',
    summary: '平衡型→正常推进即可',
    hints: [
      '保持正常推进节奏即可',
      '给予积极正面的反馈'
    ]
  }
};

// 恋爱风格 → 沟通框架（M007 S06 新增）
const LOVE_STYLE_HINTS = {
  '真诚型': '以真实情感为核心，回复强调真诚和情感共鸣',
  '陪伴型': '强调陪伴和支持，回复中体现长期承诺意愿',
  '言语型': '多给语言表达建议，回复中体现甜言蜜语的作用',
  '身体型': '侧重肢体语言和氛围营造的暗示',
  '浪漫型': '强调仪式感和浪漫氛围的营造'
};

/**
 * 结构化人格适配器（M007 S06）
 */
class PersonaAdapter {
  constructor(clientProfile, clientId, options = {}) {
    this.clientProfile = clientProfile || {};
    this.clientId = clientId;
    this.options = options;
    this._hints = [];
    this._behaviorConfig = {};
    this._midSessionHints = [];
  }

  /**
   * 构建人格适配提示（主入口）
   */
  async build(girlId) {
    this._loadLearningStyle();
    this._loadClientType();
    this._loadAntiFrustration();
    this._loadCooperation();
    this._loadPacePreference();
    this._loadAttachmentStyle();      // M007 S06 新增
    this._loadLoveStyle();            // M007 S06 新增
    this._loadClientBestApproach();   // M007 S06 新增
    await this._loadCoachPreferences();
    await this._loadLearnings(girlId);

    return {
      personaHints: [...this._hints, ...this._midSessionHints],
      behaviorConfig: this._behaviorConfig,
      summary: this._buildSummary(),
      learningStyle: this._getLearningStyleConfig(),
      clientTypeBehavior: this._behaviorConfig,
      attachmentConfig: this._getAttachmentConfig(),
      loveStyleHint: this._getLoveStyleHint(),
    };
  }

  /**
   * 中期会话语气调整（M007 S06 新增）
   * @param {string} emotionalSignal - 'frustrated' | 'confused' | 'motivated' | 'stuck'
   * @param {string} lastResponse - AI最后一条回复的关键词
   */
  adaptMidSession(emotionalSignal, lastResponse = '') {
    this._midSessionHints = [];

    switch (emotionalSignal) {
      case 'frustrated':
        this._midSessionHints.push('注意：客户可能感到受挫，语气更鼓励，避免否定语言');
        this._midSessionHints.push('多说"这很正常"/"很多人都会这样"/"调整一下就好"');
        this._midSessionHints.push('把问题拆小，给一个容易完成的最小行动');
        break;

      case 'confused':
        this._midSessionHints.push('客户可能感到困惑，用更直白的方式解释');
        this._midSessionHints.push('避免专业术语，用生活化的比喻说明');
        this._midSessionHints.push('适当用"简单来说"/"打个比方"开头');
        break;

      case 'motivated':
        this._midSessionHints.push('客户状态积极，可以适当推进节奏');
        this._midSessionHints.push('给予肯定和鼓励，支持当前势头');
        this._midSessionHints.push('适时给出稍高难度的建议（客户现在能接受挑战）');
        break;

      case 'stuck':
        this._midSessionHints.push('客户感觉陷入困境，换一个角度切入');
        this._midSessionHints.push('先帮客户分析现状，再给出备选方案');
        this._midSessionHints.push('避免重复之前的建议，换一个策略方向');
        break;
    }

    return this;
  }

  // === Private methods ===

  _addHint(hint) {
    if (hint) this._hints.push(hint);
  }

  _addHints(hints) {
    hints.forEach(h => this._addHint(h));
  }

  _loadLearningStyle() {
    const ability = this.clientProfile?.learningAbility || '中';
    const config = LEARNING_STYLE_CONFIG[ability] || LEARNING_STYLE_CONFIG['中'];

    if (config.explanation === '精简') {
      this._addHints([
        '回复精简到最核心的1-2条，不要超过3段',
        '直接说结论，背景原因可以省略'
      ]);
    } else if (config.explanation === '详细') {
      this._addHints([
        '展开分析，给出原因和背景知识',
        '举具体例子帮助理解（最好用场景化描述）'
      ]);
    } else {
      this._addHints(['回复详实完整，展开分析并给出可操作的具体建议']);
    }
  }

  _loadClientType() {
    const type = this.clientProfile?.clientType;
    const behavior = CLIENT_TYPE_BEHAVIORS[type];

    if (behavior) {
      Object.assign(this._behaviorConfig, behavior);

      switch (behavior.directiveStyle) {
        case 'step_by_step':
          this._addHints([
            '用编号步骤给出明确行动指引，每步一句话',
            '先说"第一步"/"第二步"，清晰明了'
          ]);
          break;
        case 'explain_first':
          this._addHints([
            '先说"我建议这样，因为..."，解释原因再给结论',
            '最后说具体操作步骤'
          ]);
          break;
        case 'framework_only':
          this._addHints([
            '给出分析框架和判断标准，让客户自己做决策',
            '可以问"你觉得哪个更适合你？"引导自主思考'
          ]);
          break;
      }
    }
  }

  _loadAntiFrustration() {
    const level = this.clientProfile?.antiFrustrationLevel || 5;
    if (level <= 3) {
      this._addHints([
        '语气更鼓励、更耐心，多给正向反馈',
        '避免施压语言，不要说"你应该早点..."',
        '遇到挫折时先肯定再建议'
      ]);
    } else if (level >= 8) {
      this._addHints(['可以直接指出问题，不用过度铺垫']);
    }
  }

  _loadCooperation() {
    const level = this.clientProfile?.coachCooperationLevel
      || (this.clientProfile?.coachCooperation === '配合' ? 8
          : this.clientProfile?.coachCooperation === '抵触' ? 2 : 5);

    if (level <= 2) {
      this._addHints(['优先给出最核心的建议，同时完整分析背景和原因']);
    } else if (level >= 7) {
      this._addHints(['可以给完整分析和多步行动计划']);
    }
  }

  _loadPacePreference() {
    const pace = this.clientProfile?.pacePreference;
    if (pace === '快节奏') {
      this._addHints(['建议直接有力，推进关系不要拖泥带水，分析展开完整']);
    } else if (pace === '慢热型') {
      this._addHints(['稳妥优先，先建立舒适感再考虑拉伸关系']);
    } else if (pace === '稳健型') {
      this._addHints(['稳步推进，找到合适的时机再行动']);
    }
  }

  _loadAttachmentStyle() {
    const style = this.clientProfile?.attachmentStyle;
    const config = ATTACHMENT_TONE_CONFIG[style];

    if (config) {
      this._behaviorConfig.attachmentConfig = config;
      this._addHints(config.hints);
    }
  }

  _loadLoveStyle() {
    const style = this.clientProfile?.loveStyle;
    if (style && LOVE_STYLE_HINTS[style]) {
      this._addHint(LOVE_STYLE_HINTS[style]);
    }
    // 恋爱语言
    const langs = [];
    for (let i = 1; i <= 5; i++) {
      const lang = this.clientProfile[`loveLanguage${i}`];
      if (lang) langs.push(lang);
    }
    if (langs.length > 0) {
      this._addHint(`客户的恋爱语言偏好：${langs.join('、')}，回复中可适当体现`);
    }
  }

  _loadClientBestApproach() {
    const approach = this.clientProfile?.clientBestApproach;
    if (approach) {
      this._addHint(`客户的最佳策略方向：${approach}`);
      this._behaviorConfig.bestApproach = approach;
    }

    const topics = this.clientProfile?.clientRecommendedTopics;
    if (topics) {
      try {
        const parsed = typeof topics === 'string' ? JSON.parse(topics) : topics;
        if (Array.isArray(parsed) && parsed.length > 0) {
          this._addHint(`推荐话题方向：${parsed.slice(0, 3).join('、')}`);
        }
      } catch {}
    }

    const risks = this.clientProfile?.clientRiskFactors;
    if (risks) {
      try {
        const parsed = typeof risks === 'string' ? JSON.parse(risks) : risks;
        if (Array.isArray(parsed) && parsed.length > 0) {
          this._addHint(`需要注意的风险点：${parsed.slice(0, 2).join('、')}`);
        }
      } catch {}
    }
  }

  async _loadCoachPreferences() {
    if (!this.clientId) return;
    try {
      const prefs = await getClientCoachPreferences(this.clientId);
      if (prefs?.hasData && prefs?.summary) {
        this._addHint(`教练偏好：${prefs.summary}`);
      }
    } catch (e) {
      console.warn('[PersonaAdapter] 加载教练偏好失败:', e.message);
    }
  }

  async _loadLearnings(girlId) {
    if (!this.clientId) return;
    try {
      const learnings = await getAllLearnings(this.clientId, girlId);
      if (learnings.length > 0) {
        const recent = learnings.slice(0, 3);
        const types = [...new Set(recent.map(l => l.type))];
        this._addHint(`当前学习重点：${types.join('、')}`);
      }
    } catch (e) {
      console.warn('[PersonaAdapter] 加载 learnings 失败:', e.message);
    }
  }

  _buildSummary() {
    const allHints = [...this._hints, ...this._midSessionHints];
    return allHints.length > 0 ? allHints.join('；') : '';
  }

  _getLearningStyleConfig() {
    const ability = this.clientProfile?.learningAbility || '中';
    return LEARNING_STYLE_CONFIG[ability] || LEARNING_STYLE_CONFIG['中'];
  }

  _getAttachmentConfig() {
    const style = this.clientProfile?.attachmentStyle;
    return ATTACHMENT_TONE_CONFIG[style] || null;
  }

  _getLoveStyleHint() {
    const style = this.clientProfile?.loveStyle;
    return LOVE_STYLE_HINTS[style] || null;
  }
}

/**
 * 构建动态人格提示（兼容旧API）
 */
async function buildDynamicPersona({ clientProfile, clientId, girlId }) {
  const adapter = new PersonaAdapter(clientProfile, clientId);
  return adapter.build(girlId);
}

/**
 * 中期会话语气调整（兼容旧API）
 */
function adaptMidSession(persona, emotionalSignal, lastResponse) {
  const adapter = new PersonaAdapter(persona);
  return adapter.adaptMidSession(emotionalSignal, lastResponse);
}

/**
 * 构建人格适配 prompt 区块
 */
function buildPersonaSection(persona) {
  if (!persona || persona.personaHints.length === 0) {
    return '';
  }

  return `
【人格适配提示】
${persona.personaHints.map(h => `- ${h}`).join('\n')}
`;
}

/**
 * 构建完整人格适配（便捷函数，供所有AI端点调用）
 */
async function buildFullPersona({ clientProfile, clientId, girlId, emotionalSignal, lastResponse }) {
  const adapter = new PersonaAdapter(clientProfile, clientId);
  const persona = await adapter.build(girlId);

  if (emotionalSignal) {
    adapter.adaptMidSession(emotionalSignal, lastResponse);
    persona.personaHints = [...persona.personaHints, ...adapter._midSessionHints];
  }

  return persona;
}

module.exports = {
  PersonaAdapter,
  buildDynamicPersona,
  buildPersonaSection,
  buildFullPersona,
  adaptMidSession,
  LEARNING_STYLE_CONFIG,
  CLIENT_TYPE_BEHAVIORS,
  ATTACHMENT_TONE_CONFIG,
  LOVE_STYLE_HINTS,
};

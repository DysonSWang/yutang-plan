# 情感教练系统升级方案

> 版本：v1.0
> 日期：2026-04-22
> 状态：待评审

---

## 一、现状分析

### 1.1 当前架构

```
routes/aiCoach.js
├── /situation - 情况咨询
├── /analyze-chat - 聊天分析
├── /reply-suggestions - 回复建议
└── /optimize-reply - 话术优化

coaches/configs/
├── general.js   ← systemPrompt只有1句话 ❌
├── naye.js     ← 只有1句话
├── tuobuhua.js ← 只有1句话
└── tong.js     ← 只有1句话

coaches/skills/index.js
└── 工具：get_girl_context, update_tension, add_signal等
```

### 1.2 存在的问题

| 问题 | 影响 | 严重度 |
|------|------|--------|
| 教练systemPrompt太简单 | AI输出质量低 | 高 |
| 没有利用已有大师skill | 资源浪费 | 高 |
| 各教练风格不统一 | 用户体验不一致 | 中 |
| 缺少动态路由 | 无法针对问题类型调用合适教练 | 高 |

### 1.3 已有资源

```
/home/admin/.claude/skills/
├── 王哥-perspective/SKILL.md        ✅ 神聊七步、IOD化解
├── 大迪-perspective/SKILL.md       ✅ 吸引>追、窗口期
├── 昊哥-perspective/SKILL.md       ✅ 高位框架、性张力
├── love-perspectives/
│   ├── kaige-perspective/           ✅ 拉伸阶段
│   ├── moge-perspective/            ✅ 长期关系
│   ├── tuobuhua-perspective/        ✅ 沟通力
│   ├── xuge-perspective/            ✅ 社交认证
│   ├── xunuo-perspective/          ✅ 心态建设
│   ├── tong-jincheng-perspective/   ✅ 真心/深情
│   └── ziyang-perspective/         ✅ 碎片技巧
└── love-panel-perspective/          ✅ 评审团汇总
```

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      yutang Web系统                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户请求（情况咨询/聊天分析/回复建议）                        │
│         ↓                                                   │
│  ┌─────────────────────────────────────────┐               │
│  │          Router（路由层）                │               │
│  │   识别问题类型 → 确定调用哪些大师skill     │               │
│  └─────────────────────────────────────────┘               │
│         ↓                                                   │
│  ┌─────────────────────────────────────────┐               │
│  │       Skill Loader（加载层）             │               │
│  │   读取服务端skill JSON文件              │               │
│  └─────────────────────────────────────────┘               │
│         ↓                                                   │
│  ┌─────────────────────────────────────────┐               │
│  │      Prompt Builder（构建层）            │               │
│  │   整合大师视角 → 构建完整prompt         │               │
│  └─────────────────────────────────────────┘               │
│         ↓                                                   │
│  ┌─────────────────────────────────────────┐               │
│  │       Coach Engine（执行层）            │               │
│  │   调用AI → 返回结果                     │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、Skill核心数据文件

### 3.1 目录结构

```
backend/src/coaches/
├── skills/                      ← 用户无法直接访问
│   ├── INDEX.json              # 索引（技能对照表）
│   ├── wang.json              # 王哥核心
│   ├── dadi.json              # 大迪核心
│   ├── haoge.json             # 昊哥核心
│   ├── kaige.json             # 凯哥核心
│   ├── moge.json              # Mo哥核心
│   ├── tuobuhua.json          # 脱不花核心
│   ├── tong.json             # 童锦程核心
│   ├── xuge.json             # 旭哥核心
│   ├── naye.json             # 纳爷核心
│   ├── linlaotou.json        # 林老头核心
│   ├── leon.json             # Leon核心
│   ├── xunuo.json            # 许诺核心
│   └── ziyang.json           # 子阳核心
├── loader.js                  # 加载skill
├── router.js                 # 路由判断
├── promptBuilder.js          # prompt构建
└── configs/
    └── master.js             # 主配置（引用上述模块）
```

### 3.2 INDEX.json（技能对照表）

```json
{
  "skills": {
    "wang": {
      "name": "王哥",
      "file": "wang.json",
      "specialties": ["聊天分析", "IOD化解", "话术优化"]
    },
    "dadi": {
      "name": "大迪",
      "file": "dadi.json",
      "specialties": ["窗口判断", "吸引>追", "撤退策略"]
    },
    "haoge": {
      "name": "昊哥",
      "file": "haoge.json",
      "specialties": ["性张力", "高位框架", "情绪波动"]
    },
    "kaige": {
      "name": "凯哥",
      "file": "kaige.json",
      "specialties": ["关系拉伸", "阶段推进"]
    },
    "moge": {
      "name": "Mo哥",
      "file": "moge.json",
      "specialties": ["长期关系", "框架规则"]
    },
    "tuobuhua": {
      "name": "脱不花",
      "file": "tuobuhua.json",
      "specialties": ["沟通力", "情感连接"]
    },
    "tong": {
      "name": "童锦程",
      "file": "tong.json",
      "specialties": ["真心判断", "长期承诺"]
    },
    "xuge": {
      "name": "旭哥",
      "file": "xuge.json",
      "specialties": ["社交认证", "资源拓展"]
    },
    "naye": {
      "name": "纳爷",
      "file": "naye.json",
      "specialties": ["深层逻辑", "多维分析"]
    },
    "linlaotou": {
      "name": "林老头",
      "file": "linlaotou.json",
      "specialties": ["价值幻觉", "筛选强攻"]
    },
    "leon": {
      "name": "Leon",
      "file": "leon.json",
      "specialties": ["演化心理", "亲职投资"]
    },
    "xunuo": {
      "name": "许诺",
      "file": "xunuo.json",
      "specialties": ["心态建设", "障碍区", "量变质变"]
    },
    "ziyang": {
      "name": "子阳",
      "file": "ziyang.json",
      "specialties": ["碎片技巧", "实用话术"]
    }
  },
  "routing": {
    "聊天卡壳": ["wang", "dadi", "ziyang"],
    "关系拉伸": ["kaige", "moge", "linlaotou"],
    "长期关系": ["tuobuhua", "tong", "moge"],
    "分手挽回": ["xuge", "dadi", "wang"],
    "价值判断": ["haoge", "leon", "linlaotou"],
    "性张力不足": ["haoge", "leon", "wang"],
    "心态问题": ["xunuo", "haoge"],
    "沟通问题": ["tuobuhua", "tong"],
    "通用": ["naye", "wang", "dadi"]
  }
}
```

### 3.3 wang.json（示例）

```json
{
  "name": "王哥",
  "title": "神聊觉醒创始人",
  "tagline": "谋事以身入局，举其圣天半子",
  "principles": [
    {
      "id": "shenliao7",
      "name": "神聊七步",
      "type": "framework",
      "description": "聊天不是回一句话，而是系统推演七步",
      "steps": [
        {"order": 1, "name": "关系", "question": "当前关系阶段是什么？"},
        {"order": 2, "name": "状态", "question": "对方当前状态如何？"},
        {"order": 3, "name": "背后内容", "question": "这句话背后的真实含义？"},
        {"order": 4, "name": "IoI/IoD", "question": "是兴趣指标还是无兴趣指标？"},
        {"order": 5, "name": "解决方法", "question": "应该给IoI还是化解IoD？"},
        {"order": 6, "name": "定局", "question": "最终要达成什么结果？"},
        {"order": 7, "name": "破局操控", "question": "如何操控节奏引导结果？"}
      ],
      "apply": "分析聊天时，先走一遍七步再给建议"
    },
    {
      "id": "advance_retreat",
      "name": "可进可退原则",
      "type": "rule",
      "description": "任何回应必须同时预留进退空间",
      "check": "她接了能往上走吗？她不接你能退回来吗？",
      "example": "邀约时说'我朋友约我去干嘛，好玩就不去了'，她同意就约，她放鸽子你也不损失",
      "apply": "检查每个建议是否满足可进可退"
    },
    {
      "id": "iod_resolve",
      "name": "IOD五步化解",
      "type": "technique",
      "description": "面对无兴趣指标，用这五步化解",
      "steps": ["曲解", "打压", "自然合理化", "逆向合理化", "抛问题"],
      "example": "女说'大猪蹄子' → '大哪里大了？'",
      "apply": "面对冷淡/敷衍/攻击时使用"
    }
  ],
  "decision_heuristics": [
    {
      "id": "relation_first",
      "rule": "关系先行",
      "description": "同样一句话，对陌生人vs女友含义完全不同",
      "apply": "任何聊天开始前先判断关系"
    },
    {
      "id": "window_test",
      "rule": "窗口期识别",
      "description": "久不联系突然主动≠窗口，可能是被别的男人甩了没选择",
      "apply": "冷淡对象突然热情时要分析背后原因"
    },
    {
      "id": "triple_preview",
      "rule": "三次反推",
      "description": "预判她接下来会说什么、预判你接下来怎么接、预判往哪个方向走",
      "apply": "说一句要想后面三句"
    }
  ],
  "style": {
    "expression": "清单体为主，先给框架再填案例，短句急促",
    "vocabulary": ["实战", "神聊七步", "关系", "状态", "IOI/IOD", "甜狗", "牛逼"],
    "certainty": "斩钉截铁，不留余地"
  }
}
```

### 3.4 dadi.json（示例）

```json
{
  "name": "大迪",
  "title": "实战派导师",
  "tagline": "吸引>追，窗口期思维",
  "principles": [
    {
      "id": "attract_not_pursue",
      "name": "吸引>追",
      "type": "core_principle",
      "description": "不是追她，是让她被你吸引",
      "opposite": "追她、讨好她、粘着她",
      "apply": "判断当前策略是追还是吸引，调整方向"
    },
    {
      "id": "window_thinking",
      "name": "窗口期思维",
      "type": "decision_framework",
      "description": "先判断窗口期，再决定进攻还是撤退",
      "windows": [
        {"type": "开放", "signs": ["主动找你", "回复快", "语气热情"], "action": "进攻"},
        {"type": "收缩", "signs": ["回复变慢", "语气变冷", "不主动"], "action": "观察"},
        {"type": "关闭", "signs": ["完全不回", "已读不回", "明确拒绝"], "action": "撤退"}
      ]
    },
    {
      "id": "retreat_when_rejected",
      "name": "被拒即撤",
      "type": "action_rule",
      "description": "窗口关闭后，停止投入，等她重新主动",
      "retreat_levels": [
        {"level": "轻度", "action": "降低回复频率，她发你回，不主动"},
        {"level": "中度", "action": "停止主动，她发你也延迟回"},
        {"level": "重度", "action": "她发你回，她不找你你消失（测试用）"}
      ],
      "duration": "7-14天",
      "signal": "她开始主动找你 → 可以重新接触"
    },
    {
      "id": "need_management",
      "name": "需求感管理",
      "type": "awareness",
      "description": "不要暴露你的需求感",
      "signs": ["秒回", "主动发消息", "解释自己", "追问原因"],
      "anti_patterns": ["连环夺命call", "长篇大论解释", "问她为什么不回"]
    }
  ]
}
```

---

## 四、核心模块设计

### 4.1 Loader模块 (loader.js)

```javascript
/**
 * Skill Loader - 加载并解析skill核心数据
 */

const fs = require('fs');
const path = require('path');
const CONFIG = require('./skills/INDEX.json');

const SKILL_DIR = path.join(__dirname, 'skills');

// Skill缓存
const skillCache = new Map();

/**
 * 加载单个skill
 */
function loadSkill(skillId) {
  if (skillCache.has(skillId)) {
    return skillCache.get(skillId);
  }

  const skillInfo = CONFIG.skills[skillId];
  if (!skillInfo) {
    return null;
  }

  const filePath = path.join(SKILL_DIR, skillInfo.file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  skillCache.set(skillId, data);
  return data;
}

/**
 * 批量加载多个skill
 */
function loadSkills(skillIds) {
  return skillIds.map(id => loadSkill(id)).filter(Boolean);
}

/**
 * 加载所有skill（用于索引）
 */
function loadAllSkills() {
  return Object.keys(CONFIG.skills).map(id => loadSkill(id));
}

/**
 * 获取路由配置
 */
function getRoutingConfig() {
  return CONFIG.routing;
}

// 安全读取，防止路径遍历
function safeLoadSkill(skillId) {
  const validIds = Object.keys(CONFIG.skills);
  if (!validIds.includes(skillId)) {
    return null;
  }

  const skillInfo = CONFIG.skills[skillId];
  const filePath = path.join(SKILL_DIR, skillInfo.file);

  // 防止路径遍历攻击
  if (!filePath.startsWith(SKILL_DIR)) {
    return null;
  }

  return loadSkill(skillId);
}

module.exports = {
  loadSkill,
  loadSkills,
  loadAllSkills,
  getRoutingConfig,
  safeLoadSkill
};
```

### 4.2 Router模块 (router.js)

```javascript
/**
 * Question Router - 问题类型路由
 */

const { loadSkills, getRoutingConfig } = require('./loader');

/**
 * 识别问题类型
 */
function routeQuestion(question, context = {}) {
  const q = (question || '').toLowerCase();
  const routing = getRoutingConfig();

  // 优先级判断
  const checks = [
    { keywords: ['分手', '挽回', '前任', '前女友', '前男友'], type: '分手挽回' },
    { keywords: ['冷淡', '不回', '忽冷忽热', '不热情', '敷衍'], type: '聊天卡壳' },
    { keywords: ['拉伸', '牵手', '暧昧', '推进', '升级'], type: '关系拉伸' },
    { keywords: ['长期', '结婚', '女友', '男朋友', '在一起很久'], type: '长期关系' },
    { keywords: ['该不该', '选择', '放弃', '继续', '止损'], type: '价值判断' },
    { keywords: ['没感觉', '没张力', '性', '床上'], type: '性张力不足' },
    { keywords: ['心态', '焦虑', '崩溃', '难受', '绝望', '难过'], type: '心态问题' },
    { keywords: ['沟通', '说话', '表达', '聊天'], type: '沟通问题' },
  ];

  // 根据上下文增强判断
  if (context.girlId && context.girlStage) {
    if (['约会', '暧昧', '女朋友'].includes(context.girlStage)) {
      if (q.includes('冷淡') || q.includes('不回')) {
        return '长期关系';
      }
    }
  }

  // 执行关键词匹配
  for (const check of checks) {
    for (const keyword of check.keywords) {
      if (q.includes(keyword)) {
        return check.type;
      }
    }
  }

  return '通用';
}

/**
 * 获取问题对应的skill列表
 */
function getSkillsForQuestion(question, context = {}) {
  const type = routeQuestion(question, context);
  const routing = getRoutingConfig();
  const skillIds = routing[type] || routing['通用'];

  return loadSkills(skillIds);
}

/**
 * 获取多维度skill（用于复杂问题）
 */
function getMultiDimensionalSkills(question, context = {}) {
  const primaryType = routeQuestion(question, context);
  const routing = getRoutingConfig();
  const primarySkills = routing[primaryType] || routing['通用'];

  // 检查是否需要多维度
  const hasComplexIndicators = [
    question.includes('但是'),
    question.includes('而且'),
    question.includes('同时'),
    question.includes('又')
  ];

  if (hasComplexIndicators.some(Boolean)) {
    const extraSkills = routing['通用'] || [];
    return loadSkills([...new Set([...primarySkills, ...extraSkills])]);
  }

  return loadSkills(primarySkills);
}

module.exports = {
  routeQuestion,
  getSkillsForQuestion,
  getMultiDimensionalSkills
};
```

### 4.3 Prompt构建器 (promptBuilder.js)

```javascript
/**
 * Prompt Builder - 构建AI教练prompt
 */

const { getMultiDimensionalSkills } = require('./router');

/**
 * 构建综合教练prompt
 */
function buildMasterPrompt(question, context = {}, options = {}) {
  const {
    girlInfo = null,
    conversationHistory = [],
    turnCount = 0
  } = options;

  // 获取相关skill
  const skills = getMultiDimensionalSkills(question, context);

  // 构建大师视角部分
  const masterSection = skills.map(skill => {
    return buildMasterSection(skill);
  }).join('\n\n');

  // 构建女生上下文
  const contextSection = buildContextSection(girlInfo);

  // 构建历史对话
  const historySection = buildHistorySection(conversationHistory, turnCount);

  // 构建输出要求
  const outputSection = buildOutputSection();

  return `
你是鱼塘AI情感教练，综合多位顶级情感大师的视角，为用户提供专业分析和建议。

【大师视角】

${masterSection}

${contextSection}

${historySection}

${outputSection}
`.trim();
}

/**
 * 构建单个大师视角
 */
function buildMasterSection(skill) {
  const principles = skill.principles || [];

  const principlesText = principles.map(p => {
    if (p.steps && Array.isArray(p.steps)) {
      const stepsText = p.steps.map((s, i) => {
        const stepName = typeof s === 'string' ? s : s.name;
        const question = s.question || '';
        return `  ${i + 1}. ${stepName}${question ? ` - ${question}` : ''}`;
      }).join('\n');
      return `【${p.name}】${p.description || ''}\n${stepsText}\n  适用：${p.apply || ''}`;
    } else {
      return `【${p.name}】${p.description || ''}\n  原则：${p.rule || ''}\n  适用：${p.apply || ''}`;
    }
  }).join('\n\n');

  return `
【${skill.name}】${skill.title || ''}
${skill.tagline ? `「${skill.tagline}」` : ''}

${principlesText}
`;
}

/**
 * 构建女生上下文
 */
function buildContextSection(girlInfo) {
  if (!girlInfo) {
    return '【女生上下文】暂无';
  }

  const personality = girlInfo.personality || {};

  return `
【女生上下文】
- 昵称：${girlInfo.name || '未知'}
- 当前阶段：${girlInfo.stage || '未知'}
- 关系热度：${girlInfo.tensionScore || 5}/10
- 亲密度：${girlInfo.intimacyLevel || 1}

【性格画像】
- 沟通风格：${personality.communicationStyle || '未知'}
- 情绪触发点：${(personality.emotionalTriggers || []).join('、') || '暂无'}
- 聊天禁忌：${(personality.thingsToAvoid || []).join('、') || '暂无'}
- 喜欢话题：${(personality.talkingTopics || []).join('、') || '未知'}
`;
}

/**
 * 构建历史对话
 */
function buildHistorySection(history, turnCount) {
  if (!history || history.length === 0) {
    return '【对话历史】新鲜会话';
  }

  const recentHistory = history.slice(-5);
  const historyText = recentHistory.map(h => {
    const role = h.role === 'user' ? '用户' : '教练';
    return `${role}：${h.content}`;
  }).join('\n');

  return `
【对话历史】（第${turnCount}轮，已压缩）
${historyText}
`;
}

/**
 * 构建输出要求
 */
function buildOutputSection() {
  return `
【当前问题】
（用户输入的问题）

【输出要求】
1. 【窗口期判断】第一时间判断窗口状态（开放/收缩/关闭/信号不明）
2. 【核心分析】分析问题本质，1-2句话
3. 【具体建议】可执行的操作建议，附可进可退检查
4. 【置信度】标注置信度（确定/不确定/信息不足）
5. 【追问】如信息不足，主动追问1个关键问题

要求：简洁有力，300字以内，像老朋友给建议。
`;
}

/**
 * 构建聊天分析prompt
 */
function buildChatAnalysisPrompt(chatHistory, context) {
  const skills = getMultiDimensionalSkills('聊天分析', context);

  return `
你是聊天分析专家，综合${skills.map(s => s.name).join('、')}的视角，分析以下聊天记录。

【聊天记录】
${chatHistory}

【分析框架】
${skills.map(s => {
  const framework = s.principles?.find(p => p.type === 'framework');
  return framework ? `${s.name}的${framework.name}：${framework.steps?.map((step, i) => `${i+1}.${typeof step === 'string' ? step : step.name}`).join(' → ')}` : '';
}).filter(Boolean).join('\n')}

请输出：
{
  "windowStatus": "开放/收缩/关闭/信号不明",
  "keySignals": ["关键信号列表"],
  "girlSignals": ["女生积极信号"],
  "riskSignals": ["风险信号"],
  "suggestions": ["操盘手建议"]
}
`;
}

module.exports = {
  buildMasterPrompt,
  buildChatAnalysisPrompt
};
```

---

## 五、API集成设计

### 5.1 修改后的 aiCoach.js 路由

```javascript
/**
 * AI教练路由 - 升级版
 */

// 引入新模块
const { loadAllSkills, getRoutingConfig } = require('../coaches/loader');
const { routeQuestion } = require('../coaches/router');
const { buildMasterPrompt, buildChatAnalysisPrompt } = require('../coaches/promptBuilder');

/**
 * 情况咨询 - 综合教练
 */
router.post('/situation', authMiddleware, async (req, res) => {
  try {
    const { situation, girlId, stream = true } = req.body;

    if (!situation) {
      return res.status(400).json({ error: '情况描述是必需的' });
    }

    // 构建prompt
    const prompt = buildMasterPrompt(situation, { girlId }, {
      girlInfo: context.girlInfo,
      conversationHistory: context.history || [],
      turnCount: context.turnCount || 0
    });

    // 调用AI
    const response = await callAI(prompt);

    // 返回
    res.json({ success: true, analysis: response });
  } catch (error) {
    console.error('[AICoach] 情况咨询失败:', error);
    res.status(500).json({ error: '分析失败' });
  }
});

/**
 * 聊天分析
 */
router.post('/analyze-chat', authMiddleware, async (req, res) => {
  try {
    const { chatHistory, girlId } = req.body;

    const prompt = buildChatAnalysisPrompt(chatHistory, { girlId });
    const response = await callAI(prompt, { outputFormat: 'json' });

    res.json({ success: true, analysis: JSON.parse(response) });
  } catch (error) {
    console.error('[AICoach] 聊天分析失败:', error);
    res.status(500).json({ error: '分析失败' });
  }
});

/**
 * 获取可用教练列表（用于前端展示）
 */
router.get('/coaches', (req, res) => {
  const skills = loadAllSkills();
  const routing = getRoutingConfig();

  res.json({
    success: true,
    coaches: skills.map(s => ({
      id: s.id || s.name,
      name: s.name,
      title: s.title,
      specialties: s.principles?.map(p => p.name) || []
    })),
    routing: Object.keys(routing).map(type => ({
      type,
      coaches: routing[type].map(id => skills.find(s => s.id === id)?.name || id)
    }))
  });
});
```

### 5.2 与现有tools的集成

```javascript
// 保留现有的tools调用能力
const { tools: coachTools } = require('./skills/index');

// 在prompt中注入tool说明
function buildMasterPromptWithTools(question, context, options = {}) {
  const basePrompt = buildMasterPrompt(question, context, options);

  const toolSection = `
【可用工具】
当你需要获取女生信息或记录数据时，可以使用以下工具：
- get_girl_context: 获取女生完整上下文
- update_tension: 调整女生热度评分
- add_signal: 添加信号记录
- record_learning: 记录经验教训
- search_history: 搜索历史经验

使用工具示例：
当用户问"她现在对我什么态度"时，先用get_girl_context获取信息再分析。
`;

  return basePrompt + toolSection;
}
```

---

## 六、安全考虑

### 6.1 文件访问安全

```
skills/                        ← 放在 src/coaches/ 下
├── 用户无法通过URL直接访问
├── 只通过 loader.js 读取
└── 不在 static 目录下
```

### 6.2 数据安全

```javascript
// 防止路径遍历攻击
function safeLoadSkill(skillId) {
  const validIds = Object.keys(CONFIG.skills);
  if (!validIds.includes(skillId)) {
    return null;
  }

  const skillInfo = CONFIG.skills[skillId];
  const filePath = path.join(SKILL_DIR, skillInfo.file);

  // 防止路径遍历
  if (!filePath.startsWith(SKILL_DIR)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}
```

### 6.3 Prompt注入防护

```javascript
// 用户输入过滤
function sanitizeUserInput(input) {
  if (!input) return '';

  return input
    .replace(/\[.*?\]/g, '')           // 移除类似[SYSTEM]的标记
    .replace(/^(你是一个|你是).*?(：|:)/, '')  // 移除角色扮演指令
    .replace(/<\/?[^>]+>/g, '')       // 移除HTML标签
    .substring(0, 2000);               // 限制长度
}
```

---

## 七、部署结构

```
yutang-plan/
├── backend/
│   └── src/
│       └── coaches/
│           ├── skills/                      ← 核心数据（用户看不到）
│           │   ├── INDEX.json
│           │   ├── wang.json
│           │   ├── dadi.json
│           │   └── ...
│           ├── loader.js                   ← 模块代码
│           ├── router.js
│           ├── promptBuilder.js
│           ├── configs/
│           │   └── master.js
│           └── index.js
│       └── routes/
│           └── aiCoach.js                  ← 修改使用新模块
└── frontend/
    └── ...
```

---

## 八、实施计划

### Phase 1: 数据准备（1天）
- [ ] 创建 skills/ 目录结构
- [ ] 创建 INDEX.json
- [ ] 提取13位大师的核心逻辑到 JSON 文件
- [ ] 验证JSON格式

### Phase 2: 核心模块（2天）
- [ ] 实现 loader.js
- [ ] 实现 router.js
- [ ] 实现 promptBuilder.js
- [ ] 单元测试

### Phase 3: API集成（2天）
- [ ] 修改 aiCoach.js
- [ ] 保留现有tools集成
- [ ] 流式响应支持
- [ ] 错误处理

### Phase 4: 前端集成（1天）
- [ ] 更新教练选择UI
- [ ] 显示大师视角标签
- [ ] 调试

### Phase 5: 测试与优化（2天）
- [ ] 功能测试
- [ ] 安全测试
- [ ] 性能测试
- [ ] 上线

**预估工期：8个工作日**

---

## 九、评审要点

| 评审维度 | 评审问题 |
|---------|---------|
| **架构合理性** | Router → Loader → PromptBuilder 的分层是否清晰？ |
| **数据文件格式** | JSON结构是否合理？扩展性如何？ |
| **安全方案** | 还有什么安全风险？ |
| **性能考虑** | Skill缓存、加载策略是否足够？ |
| **维护性** | 更新skill是否方便？ |
| **兼容性** | 能复用现有的tools吗？ |
| **前端集成** | API设计是否满足前端需求？ |

---

## 十、附录

### A. 各大师专长对照表

| 大师 | 核心专长 | 适用场景 |
|------|---------|---------|
| 王哥 | 神聊七步、IOD化解 | 聊天分析、话术优化 |
| 大迪 | 窗口判断、吸引>追 | 实战判断、撤退策略 |
| 昊哥 | 性张力、高位框架 | 情绪问题、张力不足 |
| 凯哥 | 关系拉伸、阶段推进 | 拉伸关系 |
| Mo哥 | 长期关系、框架规则 | 长期关系问题 |
| 脱不花 | 沟通力、情感连接 | 沟通问题 |
| 童锦程 | 真心判断、长期承诺 | 真心判断 |
| 旭哥 | 社交认证、资源拓展 | 社交问题 |
| 纳爷 | 深层逻辑、多维分析 | 复杂问题 |
| 林老头 | 价值幻觉、筛选强攻 | 价值判断 |
| Leon | 演化心理、亲职投资 | 演化视角 |
| 许诺 | 心态建设、量变质变 | 心态问题 |
| 子阳 | 碎片技巧、实用话术 | 实用技巧 |

### B. 问题类型路由表

| 问题类型 | 调用大师 |
|---------|---------|
| 聊天卡壳 | 王哥、大迪、子阳 |
| 关系拉伸 | 凯哥、Mo哥、林老头 |
| 长期关系 | 脱不花、童锦程、Mo哥 |
| 分手挽回 | 旭哥、大迪、王哥 |
| 价值判断 | 昊哥、Leon、林老头 |
| 性张力不足 | 昊哥、Leon、王哥 |
| 心态问题 | 许诺、昊哥 |
| 沟通问题 | 脱不花、童锦程 |
| 通用 | 纳爷、王哥、大迪 |

---

*本方案由 Claude Code 生成，日期：2026-04-22*

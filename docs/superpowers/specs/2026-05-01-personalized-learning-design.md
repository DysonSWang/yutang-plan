# 因材施教 · 个性化学习引擎 设计文档

> 基于统一标准文稿，为每个用户生成适合其个人情况的专属学习版本。

**目标：** 千元级付费用户根据自身画像获得量身定制的教材内容——案例、建议、行动方案全部因人而异，同时保留标准版作为对照。

**架构：** 后台批量异步生成 + 双版本切换 + 画像变更触发重新生成。标准原文不动，专属版为完整个性化全文。

**技术栈：** Express.js + Prisma + SQLite（后端），React + Chakra UI + Vite（前端），DeepSeek Pro（LLM 改写引擎）

---

## 1. 用户旅程

### 1.1 首次进入 · 档案不完善（完善度 < 70%）

章节顶部显示引导卡片，告知用户完善档案后可生成专属版本。标准版正文正常显示。

```
┌─────────────────────────────────────────────┐
│  第 01 章 · 心态建设                          │
│  ┌───────────────────────────────────────┐  │
│  │  因材施教 · 专属学习版本              │  │
│  │                                        │  │
│  │ 完善个人档案后，系统将根据你的性格、     │  │
│  │ 段位、学习风格，为你量身生成专属版本。   │  │
│  │ 案例、建议、行动方案全部因人而异。       │  │
│  │                                        │  │
│  │ 档案完善度：65%  [去完善 →]             │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [标准版正文...]                              │
└─────────────────────────────────────────────┘
```

### 1.2 档案达标 · 待生成（完善度 ≥ 70%）

```
┌─────────────────────────────────────────────┐
│  ┌───────────────────────────────────────┐  │
│  │  档案完善度 93% · 可生成专属版本       │  │
│  │                                        │  │
│  │ 系统将根据你的 27 项档案数据，           │  │
│  │ 逐章生成专属内容。预计 3-5 分钟。        │  │
│  │                                        │  │
│  │ [ 生成我的专属版本]                    │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [标准版正文...]                              │
└─────────────────────────────────────────────┘
```

### 1.3 生成中

显示进度条与当前正在生成的章节名称，用户可继续阅读标准版，非阻塞。

```
┌─────────────────────────────────────────────┐
│  ┌───────────────────────────────────────┐  │
│  │  正在为你定制专属版本                  │  │
│  │                                        │  │
│  │ ████████████░░░░░░ 第 8/21 章           │  │
│  │ 当前：第 08 章 · 沟通吸引                │  │
│  │                                        │  │
│  │ 生成完成后将自动通知，可继续阅读标准版    │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [标准版正文...]                              │
└─────────────────────────────────────────────┘
```

### 1.4 已生成 · 双版本切换

顶部显示已生成状态和最后更新时间，默认显示专属版，可随时切换到公共版。

```
┌─────────────────────────────────────────────┐
│  第 01 章 · 心态建设        [专属版 ● 公共版]  │
│  ┌───────────────────────────────────────┐  │
│  │  专属版本已就绪 · 最后更新 2 小时前    │  │
│  │ 档案更新后，[重新生成] 以获得最新匹配   │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [专属版正文——全文已个性化...]                │
└─────────────────────────────────────────────┘
```

### 1.5 档案更新后

档案被修改后，章节顶部提示「档案已更新，专属版本可能已过时」，用户可手动触发重新生成。

### 1.6 学习列表页增强

每章增加个性化状态标识：✅ 已定制 / 🔄 生成中 / — 待生成

---

## 2. 完善度计算

### 2.1 字段权重

| 权重 | 分组 | 字段 |
|------|------|------|
| 3 | 性格画像 | personality, emotionalStable, eqLevel, communicationStyle, socialStyle |
| 3 | 情感状态 | relationshipAttitude, pastRelationshipSummary, marriageHistory, emotionalWounds, exPartnerTaboos |
| 3 | 情感目标 | emotionalGoal, relationshipGoal, commitmentWillingness, emotionalMaturity |
| 3 | 学习能力 | learningAbility, coachCooperation, feedbackQuality |
| 3 | 价值画像 | strengths, weaknesses |
| 3 | 客户类型 | clientType |
| 3 | 认知评估 | selfValuePerception, cognitiveAccuracy |
| 2 | 基础信息 | age, occupation, education, income, height, residence, hometown |
| 2 | 外貌资源 | appearance, dressingStyle |
| 2 | 约会偏好 | preferredTransportMode, preferredDateStyle, dateBudget |
| 1 | 家庭背景 | familyBackground, familyStructure, familyAtmosphere, familyBurden, familyMembers |
| 1 | 资源投入 | assetsLevel, budgetRange, timeInvestment, serviceStage |

### 2.2 计算公式

```
完善度 = (核心字段完成数 × 3 + 重要字段完成数 × 2 + 外围字段完成数 × 1) / 满分 × 100%
```

字段完成判定：String 类型非 NULL 且非空字符串；Int 类型非 NULL。均视为已完成。

### 2.3 解锁分档

| 完善度 | 解锁内容 |
|--------|---------|
| < 70% | 标准版 + 引导卡片（引导完善档案） |
| ≥ 70% | 可触发全量生成 |
| ≥ 95% | 全量生成 + 生成后自动切换专属版 |

---

## 3. 后台批量生成流程

### 3.1 时序

```
用户点击「生成专属版本」
        │
        ▼
  POST /api/membership/learning/generate-all
        │
        ▼
  检查档案完善度 ≥ 70%？ ──否──→ 400 "档案完善度不足，请先完善档案"
        │是
        ▼
  创建 batch 记录（batchId, userId, status=processing）
  返回 batchId
        │
        ▼
  后台异步队列逐章处理：
  ┌──────────────────────────────────────┐
  │ for each chapter (按 orderIndex):     │
  │   1. 检查画像是否变更（对比 snapshot） │
  │      - 未变更且已有生成 → 跳过        │
  │   2. 构建个性化提示词（见第 5 节）     │
  │   3. 调用 DeepSeek Pro 生成全文       │
  │   4. 存储到 personalized_chapters     │
  │   5. 更新 batch 进度 (completed + 1)  │
  │   6. 通过 WebSocket 推送进度给前端     │
  └──────────────────────────────────────┘
        │
        ▼
  全部完成 → 推送通知 + 前端自动切换到专属版
```

### 3.2 并发策略

- 同一用户的章节必须串行生成（保证内容连贯性）
- 不同用户的生成任务可以并行

---

## 4. 存储设计

### 4.1 个性化内容表

```prisma
model PersonalizedChapter {
  id               String   @id @default(uuid())
  userId           String
  chapterId        String
  content          String   // 完整个性化 Markdown 全文
  profileSnapshot  String   // 生成时的用户画像 JSON，用于判断是否过期
  status           String   @default("pending") // pending | generating | completed | failed
  batchId          String   // 同一批次生成共享
  errorMessage     String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([userId, chapterId])
  @@index([batchId])
  @@map("personalized_chapters")
}
```

### 4.2 批量任务表

```prisma
model GenerationBatch {
  id             String   @id @default(uuid())
  userId         String
  status         String   @default("processing") // processing | completed | failed
  totalChapters  Int
  completedCount Int      @default(0)
  failedCount    Int      @default(0)
  createdAt      DateTime @default(now())
  completedAt    DateTime?

  @@map("generation_batches")
}
```

### 4.3 个性化事件表（数据闭环）

```prisma
model PersonalizationEvent {
  id        String   @id @default(uuid())
  userId    String
  chapterId String
  event     String   // impression | switch_to_personalized | switch_to_public | regenerate | profile_updated
  metadata  String?  // JSON: {profileCompleteness, batchId, ...}
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
  @@map("personalization_events")
}
```

### 4.4 过期判断

画像更新后，比较当前画像 JSON 与 `profileSnapshot`：
- 不一致 → 专属版标记为"可能过时"，前端提示用户重新生成
- 一致 → 继续使用，无需重新生成

---

## 5. LLM 改写引擎

### 5.1 模型

**DeepSeek Pro** (`deepseek-chat` 用于改写，`deepseek-reasoner` 用于复杂度高的章节)

选择原因：中文理解准确，改写自然不堆砌辞藻，不会为了改而改。

### 5.2 不改的硬约束

| 不可改 | 原因 |
|--------|------|
| 章节标题和副标题 | 版本一致性 |
| 段落结构和顺序 | 保持教学逻辑线完整 |
| 核心概念和定义 | 知识点不可变形 |
| 表格数据 | 数据不可篡改 |
| 章节间的交叉引用 | "如第 3 章所述" 等引用保持准确 |
| Markdown 格式标记 | `---`、`###`、`**粗体**` 等保持结构一致 |

### 5.3 可个性化的维度

| 类型 | 方式 |
|------|------|
| 开篇引入 | 从通用开头改为基于用户情况的切入 |
| 举例和场景 | 替换为匹配用户年龄、职业、城市、预算的具体例子 |
| 解释深度 | 学习能力弱 → 扩展白话解释；学习能力强 → 精简 |
| 行动建议 | 章末行动项基于 clientType 和 weaknesses 定制 |
| 语气措辞 | 基于 personality、emotionalMaturity 调整全文语气 |
| 侧重点 | 用户短板相关段落适当展开，强项段落适当精简 |
| 过往关联 | 基于 pastRelationshipSummary、emotionalWounds 在相关话题处插入关联提醒 |

### 5.4 个性化指令维度映射

按 User 模型实际字段分组：

#### 基础信息 → 场景匹配
| 字段 | 指令 |
|------|------|
| age | 社交场景、约会对象年龄段、沟通方式全部匹配实际年龄 |
| occupation | 职业场景、时间安排、社交圈层基于实际职业 |
| education | 理论深度和表达方式匹配学历层次 |
| income | 消费建议、约会预算、形象投入建议匹配收入水平 |
| height | 形象建议中涉及穿搭、体态时参考实际身高 |
| residence | 约会地点、活动推荐、季节穿搭基于所在城市 |
| hometown | 涉及家庭观念、地域文化差异时参考籍贯 |

#### 外貌资源 → 形象建议定制
| 字段 | 指令 |
|------|------|
| appearance | 形象章节所有建议针对用户实际外貌特征 |
| dressingStyle | 穿搭建议基于用户现有风格，给出改进方向而非全盘否定 |

#### 家庭背景 → 观念匹配
| 字段 | 指令 |
|------|------|
| familyBackground | 涉及婚恋观念、消费观念时参考家庭出身 |
| familyStructure | 涉及长期关系、婚姻话题时参考家庭结构 |
| familyAtmosphere | 涉及情感表达方式时参考原生家庭氛围 |
| familyBurden | 涉及时间投入、经济规划时考虑养老负担 |
| familyMembers | 涉及家庭介绍、关系推进节奏时参考家庭成员情况 |

#### 性格画像 → 语气与沟通风格
| 字段 | 指令 |
|------|------|
| personality | 全文语气匹配性格类型——内向多用鼓励句式，外向多用挑战句式 |
| emotionalStable | 稳定性低 → 增加情绪管理引导；稳定性高 → 简化安抚性内容 |
| eqLevel | 情商低 → 多解释"为什么对方会有这种反应"；情商高 → 简化心理学铺垫 |
| communicationStyle | 匹配用户沟通风格——含蓄者教他利用含蓄优势而非强行改话多 |
| socialStyle | 社交被动 → 给低社交压力的替代方案；社交达人 → 发挥社交优势 |

#### 情感状态 → 过往经验关联
| 字段 | 指令 |
|------|------|
| relationshipAttitude | 认真 → 强调长期价值；随便 → 强调真诚和责任 |
| pastRelationshipSummary | 涉及情史模式时关联用户过往，指出重复的问题或进步 |
| marriageHistory | 涉及婚姻话题时，根据婚史调整建议视角 |
| emotionalWounds | 涉及信任、承诺话题时，不触发情伤，给出对应修复建议 |
| exPartnerTaboos | 涉及择偶标准、筛选时，关联用户介意的前任类型 |

#### 情感目标 → 建议激进程度
| 字段 | 指令 |
|------|------|
| emotionalGoal | 家里催 → 增加父母沟通、相亲策略；空虚 → 先解决自我价值再追爱 |
| relationshipGoal | 短期 → 强调边界和筛选效率；长期 → 强调渐进投入和相处质量 |
| commitmentWillingness | 意愿低 → 不强推关系绑定；意愿高 → 引导正确表达承诺的方式 |
| emotionalMaturity | 幼稚 → 多解释"为什么"；成熟 → 简化心理分析，直接给策略 |

#### 学习能力 → 内容难度与密度
| 字段 | 指令 |
|------|------|
| learningAbility | 弱 → 每章核心概念不超过 3 个，复杂概念附白话解释和具象例子 |
| coachCooperation | 抵触 → 多用"你可以试试这样"而非"你应该这样"，减少说教感 |
| feedbackQuality | 无反馈 → 每章末尾主动设 2-3 个引导性问题，帮助用户思考和反馈 |

#### 价值画像 → 扬长补短
| 字段 | 指令 |
|------|------|
| strengths | 在相关章节中明确指出"你这点做对了，继续强化"，给出进阶用法 |
| weaknesses | 在相关章节中给出针对该短板的具体提升方案 |

#### 客户类型 → 内容结构
| 字段 | 指令 |
|------|------|
| clientType | 执行型 → 章末附 3-5 条可执行行动项；质疑型 → 关键结论附理论依据；自主型 → 多给选择路径，少给确定答案 |

#### 约会偏好 → 实战场景定制
| 字段 | 指令 |
|------|------|
| preferredTransportMode | 涉及约会出现行的场景，默认使用用户偏好的出行方式 |
| preferredDateStyle | 涉及约会形式的举例和建议，全部匹配用户偏好 |
| dateBudget | 约会花费建议、餐厅推荐全部在用户预算范围内 |

#### 认知评估 → 认知校准
| 字段 | 指令 |
|------|------|
| selfValuePerception | 关联用户自认为的优势，在相关章节中验证或校正这个认知 |
| cognitiveAccuracy | 高估 → 适当加入现实检验；低估 → 多肯定、给出量化标准帮他看见自己 |

#### 资源投入 → 可行性匹配
| 字段 | 指令 |
|------|------|
| assetsLevel | 涉及物质展示、形象投资时匹配用户资产水平 |
| budgetRange | 所有涉及花钱的建议全部在预算范围内 |
| timeInvestment | 时间少 → 给高效的"最小可行行动"；时间充裕 → 给更完整的执行方案 |
| serviceStage | 不同服务阶段的建议重心不同——背调侧重筛选，约会侧重推进 |

### 5.5 系统提示词

```
你是追爱AI的专属教材改写引擎。

## 核心原则
1. 保持原文的主题、结构、段落顺序、核心概念完全不变
2. 只替换：举例场景、解释深度、行动建议、语气措辞
3. 段落数量不变，段落长度可微调（±30%），不能把一段拆成多段
4. 每个修改必须有明确的原因——这个改动让「这个用户」理解更好或执行更容易
5. 如果某个段落对该用户已经足够适合，保留原文，不强行改写
6. 不要添加原文没有的新概念或新理论
7. 章节标题、表格数据、其他章节引用保持不变
8. Markdown 格式标记（###、**粗体**、---、|表格|）保持原样
```

---

## 6. API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/membership/learning/:chapterId` | 标准版（不变，现有接口） |
| GET | `/api/membership/learning/:chapterId?version=personalized` | 返回该用户的专属版全文 |
| GET | `/api/membership/learning/personalized-status` | 返回所有章节的个性化状态列表 |
| POST | `/api/membership/learning/generate-all` | 触发全量批量生成，返回 batchId |
| GET | `/api/membership/learning/generate-status/:batchId` | 轮询生成进度 |
| POST | `/api/membership/learning/regenerate` | 画像更新后手动触发重新生成 |

### 6.1 响应示例

**GET /learning/:chapterId?version=personalized**
```json
{
  "success": true,
  "chapter": { "...标准字段..." },
  "personalized": {
    "content": "个性化全文 Markdown...",
    "status": "completed",
    "generatedAt": "2026-05-01T12:00:00Z",
    "isStale": false
  }
}
```

**GET /learning/personalized-status**
```json
{
  "success": true,
  "batchStatus": null,
  "chapters": [
    { "chapterId": "01", "status": "completed", "generatedAt": "..." },
    { "chapterId": "02", "status": "completed", "generatedAt": "..." },
    { "chapterId": "03", "status": "pending" }
  ]
}
```

---

## 7. 前端改造点

| 文件 | 改动 |
|------|------|
| `ChapterDetail.jsx` | 新增顶部个性化入口卡片（4 种状态）；版本切换 Toggle（专属版/公共版）；生成进度条 |
| `Learning.jsx` | 每章增加个性化状态标识（✅/🔄/—） |
| `ClientProfile.jsx` | 完善档案后提示"是否重新生成专属版本" |
| `api.js` | 新增 4 个 API 方法 |
| 新增 `PersonalizationBanner.jsx` | 顶部卡片组件（4 种状态复用） |

### 7.1 版本切换逻辑

```
componentDidMount / chapterId 变化:
  if 有 completed 状态的 personalized_chapter:
    默认显示专属版
  else:
    显示标准版

用户点击切换 Toggle:
  专属版 → 公共版: 立即切换（标准版本地渲染）
  公共版 → 专属版: 从 API 获取 personalized_chapter 内容后切换
```

---

## 8. 生成状态流转

```
pending → generating → completed
                     → failed (记录 errorMessage，支持重试)
```

- `pending`: 初始状态，尚未开始生成
- `generating`: 当前正在调用 LLM 生成
- `completed`: 生成成功，内容可用
- `failed`: 生成失败，errorMessage 记录原因

---

## 9. 文件清单

| 操作 | 文件 | 职责 |
|------|------|------|
| 新增 | `backend/prisma/schema.prisma` | PersonalizedChapter + GenerationBatch + PersonalizationEvent 模型 |
| 新增 | `backend/src/services/personalizationEngine.js` | 核心引擎：提示词构建、LLM 调用编排、批量任务管理 |
| 修改 | `backend/src/routes/membership.js` | 新增 5 个 API 端点 |
| 新增 | `frontend/src/components/PersonalizationBanner.jsx` | 顶部个性化入口卡片（4 种状态） |
| 修改 | `frontend/src/pages/client/ChapterDetail.jsx` | 集成 Banner + 版本切换 |
| 修改 | `frontend/src/pages/client/Learning.jsx` | 章节列表个性化状态标识 |
| 修改 | `frontend/src/utils/api.js` | 新增 API 方法 |

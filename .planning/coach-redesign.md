# 主动教练重构设计方案 · 大师团评审

## 一、现状问题

### 1.1 缓存只按时间，不按数据变化

当前缓存逻辑（第107-116行）：
```js
// 5分钟内同一 key 不重推
if (cached && (now - cached.timestamp) < 5 * 60 * 1000)
```
**问题**：切出去 3 秒又切回来，只要没到 5 分钟，内容一模一样照样推。用户看到重复内容，体验差。

### 1.2 缺少「失联提醒」维度的主动推送

现有 prompt 只基于档案信息生成建议，不判断「最后联系时间」。如果一个女生 5 天没联系了，没有任何「该联系了」的提醒，这是最重要的行动建议来源。

### 1.3 缺少每日计划维度

没有「今天你应该做什么」的维度聚合。每个女生独立分析，缺乏整体优先级排序和行动排程。

### 1.4 忽略了用户本身状态对教练的影响

现有设计只对女生档案做 dataHash，但教练建议的质量取决于两个维度：
- **目标侧（Girl）**：女生状态 → 决定「该对她做什么」
- **自身侧（User）**：用户状态 → 决定「教练该用什么语气、策略、开放程度」

用户情绪不稳（`emotionalStable` 低）或抗压差（`antiFrustrationLevel` 低）时，教练应该更温和、多给正向反馈；配合度高时可以直接给行动指令；配合度低时需要先共情再引导。

如果用户档案变了但没触发重推，教练可能还用旧语气说教，用户体验差。

---

## 二、女生档案关键信号字段

由 `prisma/schema.prisma` Girl 模型，**参与推荐判断的字段**（用于 dataHash 比对）：

| 字段 | 类型 | 说明 | 变化时重推 |
|------|------|------|----------|
| `tensionScore` | Float | 关系热度 1.0~10.0 | ✅ 必须 |
| `intimacyLevel` | Int | 亲密度 1~5 | ✅ 必须 |
| `stage` | String | 当前阶段 | ✅ 必须 |
| `lastContact` | DateTime | 最后联系时间 | ⚠️ 超过24h → 强提醒 |
| `signals` | JSON[] | 关键信号列表 | ✅ 有新增 → 重推 |
| `pendingActions` | JSON[] | 待推进事项 | ✅ 有变化 → 重推 |
| `notes` | String | 备注 | ❌ 不重推 |
| `personality` | JSON | MBTI/沟通风格 | ❌ 不重推 |

**不参与 dataHash 的字段**：age、occupation、education、appearance、interests、matePreferences 等——变了不影响当下行动建议。

### 2.2 用户档案关键信号字段

由 `prisma/schema.prisma` User 模型，参与推荐判断的字段：

| 字段 | 类型 | 说明 | 变化时重推 |
|------|------|------|----------|
| `currentStage` | String | 关系阶段进度 | ✅ 必须 |
| `stageProgress` | Int | 阶段进度 0-100% | ✅ 必须 |
| `trustLevel` | Int | 信任度 1-5 | ✅ 必须 |
| `interactionHeat` | Float | 互动热度 1.0-10.0 | ✅ 必须 |
| `signals` | JSON[] | 用户观察到的信号 | ✅ 有新增 → 重推 |
| `pendingActions` | JSON[] | 用户待办事项 | ✅ 必须 |
| `serviceStage` | String | 服务阶段 | ✅ 必须 |
| `emotionalStable` | Int | 情绪稳定性 1-10 | ✅ 必须（影响语气） |
| `antiFrustrationLevel` | Int | 抗压能力 1-10 | ✅ 必须（影响策略激进程度） |
| `coachCooperation` | String | 配合度 | ✅ 必须（影响说话方式） |
| `clientType` | String | 客户类型 | ✅ 必须（影响教练风格） |

**不参与 dataHash 的字段**：occupation、education、height、appearance、familyBackground、personality MBTI、饮食偏好、资产级别、预算范围等——这些决定了教练的「内容池」，不影响当下的语气和策略。

**为什么 emotionalStable 和 antiFrustrationLevel 必须参与？**

这两个字段决定了教练的语气：
- 情绪稳定 + 抗压强 → 可以直接说问题给行动指令
- 情绪不稳或抗压差 → 需要先共情，再给建议，语气更温和
- 如果用户上周「情绪触发」了一次（signals 里新增了挫折信号），教练语气应该变化

---

## 三、重构设计方案

### 3.1 dataHash 比对机制

**核心原则**：变化了才推新内容，不变则复用缓存。

#### 3.1.1 Hash 计算方式

后端生成 dataHash = `MD5(girlHash + "::" + userHash)`

```
girlHash = tensionScore + intimacyLevel + stage + sortedSignalsId + sortedPendingActions
userHash = currentStage + stageProgress + trustLevel + interactionHeat
          + serviceStage + emotionalStable + antiFrustrationLevel
          + coachCooperation + clientType
          + sortedUserSignalsId + sortedUserPendingActions
```

girlHash 和 userHash **都必须参与**。女生状态变了 → 重推；用户状态变了（如情绪触发、抗压变化、信任升级）→ 也重推。

只取关键行动字段序列化，不把所有字段都塞进去。

#### 3.1.2 缓存结构升级

```json
// coachCacheRef[key]
{
  "content": "AI 生成的建议文本",
  "timestamp": 1713000000000,
  "girlDataHash": "a3f7c2e1...",
  "userDataHash": "b8c4d5f6...",
  "overallHash": "a3f7c2e1::b8c4d5f6"
}
```

#### 3.1.3 触发逻辑（双维度）

```
前端切换女生 → 发请求到后端（含 cachedGirlHash + cachedUserHash）
  │
  ├─ 后端计算当前 girlDataHash + userDataHash
  │
  ├─ girlHash === cachedGirlHash && userHash === cachedUserHash
  │   → 返回 { cached: true, content: 缓存内容 }
  │   → 前端直接用缓存，不调 AI
  │
  └─ 任一 hash 变化 → 生成新建议 + 更新缓存
      → 前端流式展示
      → 附带变化原因标签（如「🔥 热度上升」「😤 用户情绪波动」）
```

**优势**：变化检测在服务端做，前端无需自己比对数据，防止前端数据不同步。双维度确保用户状态变化也能触发重推。

#### 3.1.4 额外触发：失联提醒

`lastContact` 字段不参与 dataHash（因为它几乎每次都在变，会导致频繁重推），但作为**独立判断维度**：

| 失联时长 | 处理方式 |
|---------|---------|
| < 24h | 不提醒，正常流程 |
| 1-3 天 | 建议末尾附加一句「小提醒」 |
| 3-7 天 | 建议中强调优先级 |
| > 7 天 | 专门段落提醒，置顶 |

### 3.2 无女生时的每日计划模式

**目标**：每天首次进入时，给用户一个「今日行动清单」，不是模糊的学习建议。

#### Prompt 改造方向

```
【今日概况】
总鱼数：8  🔥热度高：2  🌡️热度中：3  ❄️热度低：3

【失联提醒】
⚠️ 小花（热度7）：已 5 天没联系，最后互动是正向信号
⚠️ 小美（热度6）：已 2 天没联系，暧昧阶段待推进

【今日优先级】
1. 🔴 小花 → 先问候破冰，热度7有正向信号，今天联系最合适
2. 🟡 小美 → 推进暧昧阶段，可以约周末
3. 🟢 其他 → 维持现状，不急

【行动建议】
- 今天给小花发一条问候消息，不要太正式
- 可以用「你上次说的那个...」作为切入点
- ...
```

#### 关键设计

- **每日模式 vs 即时模式**：无女生时的建议，分两种触发
  - `?mode=daily`：每天第一次进入时，全量生成（含今日清单）
  - 默认：快速概览，按热度排序
- **每日缓存**：以「天」为单位缓存，过午夜清缓存
- **热度梯度排序**：热度高的优先提醒，失联时间长的优先提醒

### 3.3 选女生时的状态变化推送（双维度）

#### 女生侧状态变化事件

| 事件 | 描述 | 推送优先级 |
|------|------|----------|
| `stage_change` | 阶段升级/降级 | P0，强制推送 |
| `signal_new` | 新增了正向/负向信号 | P0，强制推送 |
| `tension_change` | 热度变化 ±1 | P1，比较显著才推 |
| `pendingAction_update` | 待推进事项变化 | P1，强制推送 |
| `chat_log_new` | 新增了代聊记录 | P2，不推送 |
| `contact_stale` | 超过 N 天没联系 | P1，失联提醒 |

#### 用户侧状态变化事件

| 事件 | 描述 | 推送优先级 | 影响 |
|------|------|----------|------|
| `stage_progress` | 阶段进度变化 | P0，强制推送 | 教练给出下一阶段指导 |
| `trust_up` | 信任度提升 | P1，推送+语气更开放 | 教练可以分享更多实战细节 |
| `trust_down` | 信任度下降 | P0，强制推送 | 教练需要先修复关系，强调服务价值 |
| `emotional_trigger` | 新增情绪触发信号 | P0，强制推送 | 教练语气转向安抚+正向反馈 |
| `frustration_signal` | 新增挫折/放弃信号 | P0，强制推送 | 教练需要共情+重塑信心 |
| `cooperation_change` | 配合度变化 | P1，推送 | 决定教练语气是命令式还是引导式 |
| `service_stage_change` | 服务阶段切换 | P0，强制推送 | 教练关注重点完全改变 |
| `pending_action_done` | 完成了某个待办 | P2，不推送 | 前端标记即可 |

**核心逻辑**：女生侧变化决定「做什么」，用户侧变化决定「怎么做（语气/策略）」。两者独立，都触发重推。

#### 推送时附带「变化原因标签」

前端展示时附加一个小标签，让用户知道为什么这条建议是新生成的：

```
AI 教练（🔥 热度从5升到6）
---
小花现在处于暧昧阶段，关系进展顺利...
```

### 3.4 自由对话（无女生时也能聊）

**场景**：用户不只是被动接收建议，而是主动提问或讨论。

#### 设计

右侧面板底部增加一个小输入框（无女生时显示，选女生后隐藏）：

```
┌─────────────────────────────┐
│ AI 主动教练                  [刷新] │
├─────────────────────────────┤
│ 小花热度7，暧昧阶段...        │
│                             │
├─────────────────────────────┤
│ [输入框: 问教练问题...]       │
└─────────────────────────────┘
```

复用已有的 `/api/ai-coach/situation` 接口（自由对话模式），流式输出到同一面板。

---

## 四、后端改动清单

### 4.1 新增接口参数

```
GET /api/ai-coach/girl-summary/:girlId
  ?cachedGirlHash=xxx    // 前端传来的女生缓存 hash
  ?cachedUserHash=xxx     // 前端传来的用户缓存 hash
  → 返回 { cached: bool, content: string, girlDataHash, userDataHash, changeReason }

GET /api/ai-coach/overview
  ?mode=daily            // 每日计划模式
  ?cachedUserHash=xxx     // 每日缓存 hash（按天缓存 + 用户状态）
  → 返回 { cached: bool, content: string, userDataHash }
```

### 4.2 dataHash 生成函数（双维度）

```js
// 女生侧 hash
function computeGirlDataHash(girl) {
  const signalsIds = (girl.signals || []).map(s => s.id || `${s.event}|${s.date}`);
  const pendingActions = girl.pendingActions || [];
  const raw = [
    girl.tensionScore,
    girl.intimacyLevel,
    girl.stage,
    signalsIds.join(','),
    pendingActions.join(',')
  ].join('|');
  return crypto.createHash('md5').update(raw).digest('hex');
}

// 用户侧 hash
function computeUserDataHash(user) {
  const userSignals = (user.signals || []).map(s => `${s.event}|${s.date}`);
  const userPending = user.pendingActions || [];
  const raw = [
    user.currentStage,
    user.stageProgress,
    user.trustLevel,
    user.interactionHeat,
    user.serviceStage,
    user.emotionalStable,
    user.antiFrustrationLevel,
    user.coachCooperation,
    user.clientType,
    userSignals.join(','),
    userPending.join(',')
  ].join('|');
  return crypto.createHash('md5').update(raw).digest('hex');
}
```

### 4.3 变化原因标签生成

```js
function detectChangeReason(prev, curr) {
  const reasons = [];
  if (prev.girlHash !== curr.girlHash) {
    // 比对具体字段确定变化来源
    if (prev.tensionScore !== curr.tensionScore) reasons.push('🔥 热度变化');
    if (prev.stage !== curr.stage) reasons.push('📍 阶段变化');
    if (prev.signals?.length !== curr.signals?.length) reasons.push('📡 新信号');
  }
  if (prev.userHash !== curr.userHash) {
    if (prev.trustLevel !== curr.trustLevel) reasons.push('🤝 信任度变化');
    if (prev.emotionalStable !== curr.emotionalStable) reasons.push('😤 情绪波动');
    if (prev.antiFrustrationLevel !== curr.antiFrustrationLevel) reasons.push('💪 抗压变化');
    if (prev.serviceStage !== curr.serviceStage) reasons.push('🎯 服务阶段变化');
  }
  return reasons.join(' + ') || '数据更新';
}
```

### 4.4 失联提醒生成函数

```js
function computeStaleAlert(girl) {
  if (!girl.lastContact) return null;
  const daysSince = Math.floor((Date.now() - girl.lastContact) / (1000*60*60*24));
  if (daysSince < 1) return null;
  if (daysSince <= 3) return `⚠️ ${girl.name} 已 ${daysSince} 天没联系了`;
  if (daysSince <= 7) return `🔴 ${girl.name} 已 ${daysSince} 天没联系，优先级上调`;
  return `🚨 ${girl.name} 已 ${daysSince} 天没联系，需要主动破冰`;
}
```

### 4.5 每日缓存 Key

```js
// 按「天」缓存，无女生时的每日建议
const dailyKey = `daily:${clientId}:${YYYYMMDD}`;
```

---

## 五、待评审决策点

### D1：Hash 比对放前端还是后端？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A. 后端比对（推荐）** | 数据一致，前端无需同步状态 | 多一次请求 |
| B. 前端比对 | 省请求，但需前端维护数据快照 | 数据可能不同步，增加复杂度 |

**建议**：方案 A，后端比对。女生档案数据由后端管理，后端是唯一真相源。

### D1b：用户 hash 变化了但女生没选，要不要推？

| 方案 | 描述 |
|------|------|
| **A. 不推（推荐）** | 无女生时 overview 是按天缓存的，用户 hash 变化时 daily cache 已包含 |
| B. 立即推 | 用户情绪波动时立即给出安抚，但可能频繁打扰 |

**建议**：方案 A。overview 按天缓存，用户状态变化通过每日推送感知即可，无需实时打扰。

### D2：每日计划缓存以什么为 key？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A. clientId + 日期（推荐）** | 每个客户每天只推一次 | 如果档案变化了，当天看不到新建议 |
| B. clientId + 日期 + dataHash | 档案变化 → 新建议 | 可能一天推多次 |

**建议**：方案 A。每日只推一次，用户可以手动刷新。如果档案有显著变化（stage 变化等），会通过 `girl-summary` 路由感知到，不用等每日计划。

### D3：失联提醒的阈值怎么定？

| 方案 | 描述 |
|------|------|
| **A. 固定阈值（推荐）** | 1天/3天/7天 三档提醒 |
| B. 动态阈值 | 按 stage 调整：暧昧阶段 2 天就算失联，聊天阶段 5 天 |

**建议**：先做固定阈值，后续看数据再调动态。

### D4：无女生时的自由对话，是新增接口还是复用 situation？

| 方案 | 描述 |
|------|------|
| **A. 复用 situation（推荐）** | 无需新增接口，只调整 prompt |
| B. 新增 chat 接口 | 独立 session，更清晰的对话历史 |

**建议**：方案 A。复用 situation 接口，prompt 里告知 AI「当前没有选中的女生，给通用建议」。

---

## 六、Prompt 改造要点

### 6.1 女生专项（girl-summary）

在现有 prompt 基础上，增加：

```
失联提醒：${staleAlert || '暂无'}
最后联系：${lastContactText || '暂无记录'}

请主动分析：...(保留现有4点)
5. 如果失联，提醒操盘手现在该主动联系了，给出切入话题建议
```

### 6.2 全局概览（overview）—— 每日计划模式

```
【今日追爱概况】
总鱼数：${allGirls.length}
热度分布：🔥高(${hot}) 🌡️中(${warm}) ❄️低(${cold})

【失联提醒】（按失联天数排序）
${staleAlerts.map(g => `⚠️ ${g.name} 已 ${g.days} 天没联系`).join('\n') || '暂无失联'}

【今日行动优先级】
${girlsSortedByPriority.map((g, i) =>
  `${i+1}. ${g.name}（${g.stage}，热度${g.tensionScore}）
  → ${g.topAction}`
).join('\n')}

请给出今日整体策略和行动建议。
```

---

## 七、实施计划（预估）

| 阶段 | 内容 | 工作量 |
|------|------|------|
| Phase 1 | dataHash 后端比对（女生 + 用户双维度）+ 变化原因标签 + 女生侧推送逻辑 | 中 |
| Phase 2 | 失联提醒生成逻辑 | 小 |
| Phase 3 | 每日计划模式 + 每日缓存 | 中 |
| Phase 4 | 无女生时自由对话输入框 | 小 |

---

## 八、风险点

1. **dataHash 计算需要完整对象**：需要从 Prisma 查 DB 获取 signals/pendingActions JSON 字段，需要先 JSON.parse。
2. **女生侧信号没有唯一 ID**：signals 数组里的对象没有 `id` 字段，只能用 `event + date` 作为哈希锚点。如果同一天记录了两个相同 event，会被当作同一个。这是可接受的近似。
3. **每日缓存过午夜问题**：如果用户在 23:59 进入一次，00:01 又进入，会被当作两次（因为 key 里的日期变了）。缓存会被正确更新，不是 bug。
4. **用户 signals 里情绪触发信号的误判**：用户可能在某天集中记录多条 signals，导致 hash 频繁变化。**缓解**：signals 里的情绪类信号（`emotional_trigger` 类型）单独拎出来比对，而非全部 signals 数组。
5. **double hash 命中导致推送减少**：加入用户 hash 后，任一不变就不推，可能过度保守。**缓解**：用户 hash 变化的核心字段（`emotionalStable`、`antiFrustrationLevel`）是数值型，1分的波动也触发——这是合理的，因为教练语气应该对这些敏感。

---

## 九、评审问题

1. **Hash 比对放前端还是后端？**
2. **每日计划缓存 key 怎么定？**
3. **失联提醒阈值怎么设置更合理？**
4. **女生信号没有唯一 ID，hash 怎么算？**（用 event+date 作为锚点可以吗？）
5. **用户 hash 变化但没选女生，要立即推吗？**（还是等每日推送？）
6. **Phase 1-4 的优先级是否合适？** 建议先做 Phase 1+2，再做 3+4。
7. **用户 emotionalStable/antiFrustrationLevel 这些主观评分，1 分波动就触发是否过于敏感？**（可以考虑设 ±2 的阈值）

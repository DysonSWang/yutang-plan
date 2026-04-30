# 管理端用户活跃度追踪功能设计

## 问题陈述

操盘手无法在管理端看到用户的真实活跃情况 — 无法判断"这个客户用没用起来，用在哪了"，也就无法决定优先跟进谁。目前只能凭感觉或客户主动反馈来判断。

---

## 需求拆解

1. **记录**：每次用户行为（登录、功能使用）都被记录
2. **聚合**：登录次数、功能使用次数、最后活跃时间
3. **趋势**：每日/每周活跃趋势（柱状图）
4. **分级**：高/中/低/沉睡 四级活跃度评分
5. **展示**：在管理端客户列表或详情页呈现

---

## 设计方案

### 一、数据库设计

**方案：混合模型 — Activity 日志表 + User 汇总字段**

`UserActivity` 表（明细日志，支持趋势）：

```prisma
model UserActivity {
  id        String   @id @default(uuid())
  userId    String
  type      String   // 'login' | 'ai_coach' | 'date_plan' | 'chat_message' | 'girl_add'
  date      DateTime @default(now())
  metadata  String?  // JSON，存额外信息（如聊天消息数、生成的方案ID等）
}
```

`User` 模型新增汇总字段：

```prisma
// 元数据
lastLogin   DateTime?  // 最后登录时间
loginCount  Int        @default(0)  // 累计登录次数
lastActive  DateTime?  // 最后活跃时间（含任何操作）
```

**为什么不用纯日志表？** 汇总字段让列表查询快（不需要 COUNT）；日志表支撑趋势图和精细分析。

**Activity type 设计理由：**
| type | 权重 | 说明 |
|------|------|------|
| `login` | 0（只记时间） | 登录本身不算价值，次数是行为信号 |
| `ai_coach` | 10分/次 | AI教练是核心付费功能 |
| `date_plan` | 15分/次 | 约会方案是强价值交付 |
| `chat_message` | 2分/条 | 聊天频繁但碎片，取消息数 |
| `girl_add` | 10分/次 | 加女生是进入系统的门槛动作 |

---

### 二、活跃度评分算法

**周得分 = 登录天数得分 + 功能使用得分**

**登录天数得分（0-30分）：**
- 每周登录 1 天 = 10 分
- 每周登录 2 天 = 20 分
- 每周登录 ≥3 天 = 30 分

**功能使用得分（0-70分）：**
| 功能 | 单次分值 | 上限 |
|------|---------|------|
| AI教练 | 10 | 30 |
| 约会方案 | 15 | 30 |
| 聊天消息 | 2 | 20 |
| 添加女生 | 10 | 10 |

**活跃度分级：**
| 分级 | 周得分 | 颜色 | 含义 |
|------|--------|------|------|
| 🟢 高活跃 | ≥70 | green | 深度使用，重点维护 |
| 🟡 中活跃 | 40-69 | yellow | 正常跟进，激励多用 |
| 🔴 低活跃 | 10-39 | orange | 濒临沉睡，需激活 |
| ⚪ 沉睡 | <10 或 14天无登录 | gray | 优先激活对象 |

**沉睡单独判定：** 无论得分多少，只要 `lastActive` 距今超过 14 天，强制标为沉睡。

---

### 三、后端改动

#### 3.1 Schema 变更（`prisma/schema.prisma`）

```prisma
model User {
  // ... 现有字段 ...

  // 新增
  lastLogin   DateTime?
  loginCount  Int        @default(0)
  lastActive DateTime?

  // 关系
  activities  UserActivity[]
}

model UserActivity {
  id       String   @id @default(uuid())
  userId   String
  user     User     @relation(fields: [userId], references: [id])
  type     String   // 'login' | 'ai_coach' | 'date_plan' | 'chat_message' | 'girl_add'
  date     DateTime @default(now())
  metadata String?  // JSON
}
```

#### 3.2 登录时记录（`src/routes/auth.js`）

```javascript
// 登录成功 → 更新 lastLogin, loginCount, lastActive
await prisma.user.update({
  where: { id: user.id },
  data: {
    lastLogin: new Date(),
    loginCount: { increment: 1 },
    lastActive: new Date()
  }
});

// 记录 activity
await prisma.userActivity.create({
  data: { userId: user.id, type: 'login' }
});
```

#### 3.3 功能使用时记录

在以下端点的 handler 末尾追加记录调用：

| 端点 | type | 位置 |
|------|------|------|
| `POST /ai-coach/situation` | `ai_coach` | AI教练调用后 |
| `POST /ai-coach/agent-chat` | `ai_coach` | AI教练调用后 |
| `POST /membership/dating-plan/generate` | `date_plan` | 生成成功后 |
| `POST /chat/messages` | `chat_message` | 发消息后 |
| `POST /girls/client-add` | `girl_add` | 添加女生后 |

#### 3.4 活跃数据 API（`src/routes/activity.js` 新建）

```
GET /api/admin/activity/clients
  - 返回所有客户的汇总活跃数据（lastLogin, loginCount, lastActive, weeklyScore, level）
  - 支持 ?level=high/medium/low/dormant 过滤

GET /api/admin/activity/clients/:id
  - 返回该客户的每日活跃趋势（最近30天）
  - GET /api/admin/activity/clients/:id/trend?days=30

GET /api/admin/activity/clients/:id/feature-usage
  - 返回各功能使用次数统计
```

**响应格式：**

```json
// GET /api/admin/activity/clients
{
  "success": true,
  "clients": [
    {
      "userId": "xxx",
      "nickname": "张三",
      "lastLogin": "2026-05-01T10:00:00Z",
      "loginCount": 42,
      "lastActive": "2026-05-01T14:30:00Z",
      "weeklyScore": 85,
      "level": "high",
      "featureUsage": {
        "aiCoachCalls": 12,
        "datePlans": 3,
        "chatMessages": 156,
        "girlsAdded": 2
      }
    }
  ]
}
```

---

### 四、管理端前端改动

#### 4.1 Clients.jsx 新增「活跃」Tab

在现有客户详情 Modal 中新增 Tab 页：

```
[基本信息] [档案] [活跃] [...
```

**活跃 Tab 内容：**

1. **活跃度概览卡片（顶部）：**
   - 当前分级 Badge（高/中/低/沉睡）
   - 周得分（百分制）
   - 最后活跃时间

2. **功能使用统计（SimpleGrid 卡片）：**
   - AI教练调用次数
   - 约会方案生成次数
   - 聊天消息数
   - 添加女生数
   - 累计登录次数

3. **活跃趋势图（Bar Chart）：**
   - 横向柱状图，X轴 = 最近30天，Y轴 = 每日活跃得分
   - 颜色随高度变化（低=橙，高=绿）

4. **沉睡提示：**
   - 如果分级为沉睡，显示红色提示条："该用户已连续14天未活跃，建议主动联系"

---

### 五、文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `backend/prisma/schema.prisma` | 新增 UserActivity 模型，User 新增 lastLogin/loginCount/lastActive 字段 |
| `backend/src/routes/auth.js` | 登录成功时更新 lastLogin/loginCount/lastActive，记录 activity |
| `backend/src/routes/activity.js` | 新建，暴露管理端活跃数据 API |
| `backend/src/routes/aiCoach.js` | ai_coach 活动记录 |
| `backend/src/routes/membership.js` | date_plan 活动记录 |
| `backend/src/routes/chat.js` | chat_message 活动记录 |
| `backend/src/routes/girls.js` | girl_add 活动记录 |
| `frontend/src/pages/admin/Clients.jsx` | 新增活跃 Tab，含概览/功能统计/趋势图 |
| `frontend/src/utils/api.js` | 新增 activity API 调用（可选，Tab懒加载） |

---

### 六、依赖与风险

- **风险**：需要在多个端点追加活动记录代码，属于跨文件散点改动。建议在 `membershipService` 中封装 `recordActivity(userId, type, metadata)`，各端点调用同一个函数，降低遗漏概率。
- **性能**：UserActivity 表随时间增长，趋势查询需加索引 `userId + date`。30天趋势用 `GROUP BY DATE(date)` 查询，单用户数据量可控（每天最多几十条）。
- **沉睡检测**：在读取客户列表时实时计算 `lastActive` 距今天数，不需要定时任务。

---

### 七、验证方式

1. 创建测试用户，手动触发各功能操作
2. 调用 `GET /api/admin/activity/clients` 验证数据聚合正确
3. 调用 `GET /api/admin/activity/clients/:id/trend` 验证趋势数据
4. 在管理端查看活跃 Tab，确认图表和分级显示正确
5. 沉睡用户（14天无操作）显示红色提示

---

## 管理端总看板设计

### 入口

在管理侧边栏新增菜单项：

```
[icon] 活跃看板
```

路径：`/admin/activity`

---

### 页面布局

```
┌─────────────────────────────────────────────────────┐
│  侧边栏                                                │
│  ─────────────────────────────────────────────────  │
│  工作台                                                │
│  客户管理                                              │
│  女生管理                                              │
│  约会管理                                              │
│  代聊记录                                              │
│  活跃看板  ← 新增                                      │
│  会员管理                                              │
└─────────────────────────────────────────────────────┘
```

---

### 看板内容

#### 第一行：4个汇总指标卡

| 指标卡 | 内容 | 颜色 |
|--------|------|------|
| 总用户数 | 128 人 | 白 |
| 本周活跃 | 42 人（33%） | 绿 |
| 本周新增 | 8 人 | 蓝 |
| 沉睡用户 | 23 人（18%） | 红 |

**周活跃率** = 本周活跃用户 / 总用户，百分比显示在括号内。

---

#### 第二行：活跃度分布 + 趋势图

**左侧（35%宽）：活跃度分布**

饼图或环形图，显示高/中/低/沉睡四级分布：

```
高活跃    12人  9%
中活跃    38人  30%
低活跃    55人  43%
沉睡      23人  18%
```

色块：绿 / 黄 / 橙 / 灰

**右侧（65%宽）：每日活跃趋势折线图**

X轴 = 近30天，Y轴 = 每日活跃用户数。

双线：一条线是"日活跃用户数"，一条线是"日活跃得分均值"。

图例标注最高点日期和数值。

---

#### 第三行：本周功能使用 + 沉睡名单

**左侧（50%宽）：本周功能使用排行**

```
本周功能使用次数
───────────────────
AI教练调用      342 次
约会方案生成    127 次
添加女生         45 次
聊天消息      2,847 条
```

支持排序切换（本周/本月/全部时间）

**右侧（50%宽）：沉睡用户名单**

表格，最紧急的在最上面：

| 昵称 | 注册时间 | 最后活跃 | 沉睡天数 | 操作 |
|------|---------|---------|---------|------|
| 张三 | 2026-01-15 | 4月18日 | 13天 | 发提醒 |
| 李四 | 2026-02-20 | 4月1日 | 30天 | 发提醒 |

点击「发提醒」触发站内通知推送。

沉睡判定：最后活跃时间距今超过14天。

---

### 文件修改清单（更新）

| 文件 | 修改内容 |
|------|---------|
| `backend/prisma/schema.prisma` | UserActivity模型，User新增lastLogin/loginCount/lastActive字段 |
| `backend/src/routes/auth.js` | 登录时记录lastLogin/loginCount/lastActive |
| `backend/src/routes/activity.js` | 新建，管理端API（汇总+趋势+沉睡名单） |
| `backend/src/services/activityService.js` | 新建，recordActivity()函数+活跃度计算 |
| `backend/src/routes/aiCoach.js` | ai_coach活动记录 |
| `backend/src/routes/membership.js` | date_plan活动记录 |
| `backend/src/routes/chat.js` | chat_message活动记录 |
| `backend/src/routes/girls.js` | girl_add活动记录 |
| `frontend/src/pages/admin/ActivityBoard.jsx` | 新建，活跃看板页面 |
| `frontend/src/pages/admin/Clients.jsx` | 活跃Tab（概览+统计+趋势+分级） |
| `frontend/src/utils/api.js` | 活跃相关API调用 |
| `frontend/src/components/Sidebar.jsx` | 侧边栏新增「活跃看板」菜单 |

---

### API 扩展（新增）

```
GET /api/admin/activity/dashboard
  - 返回全局看板数据：总用户数、本周活跃、本周新增、沉睡数、活跃度分布、功能使用排行

GET /api/admin/activity/dormant-users
  - 返回沉睡用户列表（lastActive距今>14天）

GET /api/admin/activity/trend?days=30
  - 返回每日活跃趋势数据
```

---

## 优先级

**P0（必须）：**
1. Schema 变更 + Auth 登录记录
2. activityService 记录函数封装
3. 管理端 API（汇总 + 趋势 + 沉睡名单）
4. ActivityBoard.jsx 总看板页面
5. Clients.jsx 活跃 Tab（概览 + 统计 + 趋势 + 分级）

**P1（增强）：**
6. 沉睡用户「发提醒」功能
7. 趋势图时间切换（7天/30天/90天）

**P2（后续）：**
8. 按活跃度排序客户列表
9. 活跃度周报推送

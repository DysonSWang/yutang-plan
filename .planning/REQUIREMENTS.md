# 鱼塘计划 · Requirements

## v1 Requirements

### 认证 AUTH

- [x] **AUTH-01**: 用户登录/登出功能 — 已完成
  - 操作员、管理员、客户三种角色

### 客户管理 CLIENT

- [x] **CLIENT-01**: 客户档案管理 — 已完成
  - 增删改查 + 服务阶段追踪
  - 客户筛选 + 排序

### 女生资源 GIRL

- [x] **GIRL-01**: 女生资源管理 — 已完成
  - 增删改查 + 热度评分
  - 阶段追踪 (搭讪→聊天→约会→暧昧→确定)
  - 信号记录 + 待办事项

### 聊天 CHAT

- [x] **CHAT-01**: 聊天消息收发 — 已完成
  - 实时消息推送 (Socket.IO)
  - 代聊发送功能
  - 聊天历史记录

### AI Coach AI

- [x] **AI-01**: AI Coach Tool Use — 已完成
  - get_girl_context 工具
  - add_signal 工具
  - update_tension 工具
  - record_learning 工具
  - search_history 工具

- [x] **AI-02**: 多轮对话记忆 — 已完成
  - ConversationMemory 表
  - 自动摘要
  - 记忆恢复

- [x] **AI-03**: 经验学习提取 — 已完成
  - ClientLearning 表
  - 关键词检索
  - AI 自动提取

### 用户界面 UI

- [x] **UI-01**: 移动端导航 — 已完成
  - 操盘手端底部 Tab
  - 客户端底部 Tab

- [x] **UI-02**: 响应式布局 — 已完成
  - 桌面端侧边栏
  - 移动端全宽 + 底部导航

---

## v2 Requirements (待开发)

- [ ] **PWA-01**: PWA 支持 (离线可用)
- [ ] **PUSH-01**: 推送通知
- [ ] **ANALYTICS-01**: 数据分析看板

---

## Out of Scope

- [ ] 微信小程序 — 暂不开发
- [ ] 视频聊天 — 暂不开发
- [ ] 支付系统 — 暂不开发

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| AUTH-01 | 1 | ✅ |
| CLIENT-01 | 1 | ✅ |
| GIRL-01 | 1 | ✅ |
| CHAT-01 | 1 | ✅ |
| AI-01 | 2 | ✅ |
| AI-02 | 2 | ✅ |
| AI-03 | 2 | ✅ |
| UI-01 | 3 | ✅ |
| UI-02 | 3 | 🔄 |

---
*Last updated: 2026-04-17*

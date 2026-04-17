# 鱼塘计划 · UI 设计契约 — Phase 3

**Phase:** 3 — 移动端优化  
**目标:** 操盘手端移动化适配

---

## 1. Concept & Vision

鱼塘计划是私密社交服务 SaaS，操盘手（情感专家）大部分时间在手机上工作。移动端需要保证：
- 快速切换功能模块
- 关键信息一目了然
- 表单输入便捷
- 在弱网络环境下也能流畅使用

设计风格：深色主题，低调专业，符合"情感咨询"的私密感。

---

## 2. Design Language

### 颜色系统

| Token | 色值 | 用途 |
|-------|------|------|
| Primary | `#319795` (teal.500) | 主色调，链接、按钮高亮 |
| Secondary | `#1A202C` (gray.800) | 卡片背景 |
| Accent | `#38B2AC` (teal.400) | 图标、Tab 高亮 |
| Background | `#1A202C` (gray.900) | 页面背景 |
| Surface | `#2D3748` (gray.700) | 侧边栏、底部导航 |
| Text Primary | `#F7FAFC` (gray.50) | 主文本 |
| Text Secondary | `#A0AEC0` (gray.400) | 次要文本 |
| Error | `#FC8181` (red.400) | 错误状态 |
| Success | `#68D391` (green.400) | 成功状态 |

### 字体

- **主字体**: Chakra Petch / Inter (系统回退)
- **中文字体**: Noto Sans SC
- **等宽字体**: Fira Code (代码/数字)

### 间距系统

- 基础单位: `4px`
- 间距层级: `4, 8, 12, 16, 24, 32, 48, 64`
- 移动端内容内边距: `16px`
- 移动端卡片内边距: `12px`

### 响应式断点

| Breakpoint | 宽度 | 布局 |
|------------|------|------|
| Base | < 1024px | 移动端（底部 Tab） |
| LG | ≥ 1024px | 桌面端（侧边栏） |

---

## 3. Layout & Structure

### 桌面端 (≥1024px)

```
┌──────────────────────────────────────────────┐
│ 220px Sidebar │ Main Content Area            │
│               │                              │
│ [Logo]        │ [Page Content]               │
│               │                              │
│ [Nav Items]   │                              │
│               │                              │
│ [User Info]  │                              │
└──────────────────────────────────────────────┘
```

### 移动端 (<1024px)

```
┌──────────────────────────────────────────────┐
│ [Page Content]               │ 100%          │
│                              │               │
│                              │               │
├──────────────────────────────┤               │
│ [工作台] [客户] [女生] [聊天] [军师] [进度] │ 底部 Tab
└──────────────────────────────────────────────┘
```

### 底部 Tab 导航

| Item | 图标 | 标签 |
|------|------|------|
| 工作台 | DashboardIcon | 工作台 |
| 客户管理 | UsersIcon | 客户 |
| 女生资源 | FemaleIcon | 女生 |
| 聊天中心 | ChatIcon | 聊天 |
| 军师工具 | BrainIcon | 军师 |
| 进度管理 | ChartIcon | 进度 |

---

## 4. Features & Interactions

### 4.1 导航交互

| 行为 | 结果 |
|------|------|
| 点击 Tab | 切换页面，当前 Tab 高亮 (teal.400) |
| 当前页面 | Tab 图标+文字变为 teal.400 |
| Hover (桌面) | 背景变为 teal.700，颜色变亮 |
| Active | 背景 teal.600，文字白色 |

### 4.2 移动端安全区域

- 底部导航添加 `pb="env(safe-area-inset-bottom)"`
- 确保 iPhone X 及以上设备不被底栏遮挡

### 4.3 响应式内容

| 元素 | 桌面 | 移动端 |
|------|------|--------|
| 页面内边距 | `p={6}` (24px) | `p={4}` (16px) |
| 卡片内边距 | `p={6}` (24px) | `p={4}` (16px) |
| 表格 | 全宽展示 | 可横向滚动 |

### 4.4 触摸目标

- 最小触摸目标: `44x44px` (符合 WCAG)
- Tab 项目: `minW="60px"`, 垂直 padding `py={2}`

---

## 5. Component Inventory

### 5.1 移动端底部导航栏

```jsx
// 位置: AdminLayout.jsx / ClientLayout.jsx
<Box
  position="fixed"
  bottom={0}
  left={0}
  right={0}
  bg="gray.800"
  borderTop="1px"
  borderColor="gray.700"
  zIndex={50}
  pb="env(safe-area-inset-bottom)"
>
  <HStack justify="space-around" py={2}>
    {/* Tab items */}
  </HStack>
</Box>
```

**状态:**
- Default: `color="gray.400"`
- Active: `color="teal.400"`
- Hover: `color="teal.300"`

### 5.2 侧边栏 (桌面端)

```jsx
<Box
  w="220px"
  bg="gray.800"
  position="fixed"
  h="100vh"
  left={0}
  top={0}
  display={{ base: 'none', lg: 'block' }}
/>
```

### 5.3 内容区域

```jsx
// 桌面端留出侧边栏宽度
<Box ml={{ base: 0, lg: '220px' }} />

// 移动端为底部导航留空间
<Box pb={{ base: '80px', lg: 0 }} />
```

---

## 6. Technical Approach

### 框架

- **UI 库**: Chakra UI v2
- **响应式**: Chakra 的 `display={{ base: 'none', lg: 'block' }}` 语法
- **图标**: 自定义 Icon 组件 (Heroicons 风格)

### 实现文件

| 文件 | 修改内容 |
|------|----------|
| `AdminLayout.jsx` | 添加 `MobileBottomNav` 组件 |
| `ClientLayout.jsx` | 添加 `MobileBottomNav` 组件 + 未读红点 |

### 断点使用

```jsx
// 隐藏/显示
display={{ base: 'none', lg: 'block' }}

// 间距响应式
p={{ base: 4, md: 6 }}

// 底部留空
pb={{ base: '80px', lg: 6 }}
```

---

## 7. Verification Checklist

- [x] 移动端底部 Tab 导航实现
- [x] 桌面端侧边栏保留
- [x] 安全区域适配
- [x] 触摸目标尺寸符合要求
- [x] 响应式间距调整
- [x] z-index 层级正确

---

**UI-SPEC Version:** 1.0  
**Created:** 2026-04-17  
**Status:** ✅ Approved

# 追AI · 品牌视觉规范 v1.0

> 本文档是追AI产品的核心品牌视觉规范，定义色彩、字体、图标、动效、阴影等所有视觉维度的标准。
> 所有新增 UI 代码必须严格遵循本规范。

---

## 1. 品牌概述

**产品名称**: 追AI
**Slogan**: 让每一次心动都有迹可循
**产品定位**: AI 驱动的情感教练工具，面向有情感成长需求的男性用户
**视觉关键词**: 暖金、克制、内敛、高级感
**Logo 核心隐喻**: 两只手 + 一个 ai = 一次连接。从指尖到指尖，是情感最真实的物理隐喻。

**Logo 图形**: Z（追首字母）内含 "ai"，上下象形为两只手，通过中间的 "ai" 相牵——寓意每一次心动都是两双手跨越距离的连接。

---

## 2. 品牌色板

### 2.1 主色 — Gold（琥珀金）

| 色阶 | 色值 | 用途 |
|------|------|------|
| `gold.50` | `#fef8e5` | 极淡高亮背景 |
| `gold.100` | `#fdf0c2` | 浅色背景 |
| `gold.200` | `#fbe286` | 次级高亮 |
| `gold.300` | `#f6cf50` | Hover 渐变上端 |
| `gold.400` | `#f0c030` | Hover 渐变下端 |
| **`gold.500`** | **`#e2b044`** | **主色：CTA、高亮、选中态** |
| `gold.600` | `#c99a30` | 按钮渐变下端 |
| `gold.700` | `#a87e25` | Active 态 |
| `gold.800` | `#86631d` | 深色强调 |
| `gold.900` | `#634816` | 极深强调 |

> **Logo 来源色** `#c4874c`（SVG 中最深金）与 `gold.500 #e2b044` 属于同一色系，无需调整。
> **Logo 亮金** `#e5b170` 与 `gold.300` 接近。

### 2.2 强调色 — Rose（暖玫瑰棕）

| 色阶 | 色值 | 用途 |
|------|------|------|
| `rose.50` | `#fdf5f1` | 极淡背景 |
| `rose.100` | `#f9e5db` | 浅背景 |
| `rose.200` | `#f0c9b3` | 次级卡片 |
| `rose.300` | `#e5a885` | 头像/女性相关场景 |
| `rose.400` | `#d48b5e` | 女性用户标识 |
| **`rose.500`** | **`#c17f59`** | **强调色：女性/情感相关元素** |
| `rose.600` | `#a86845` | 深色强调 |
| `rose.700` | `#8a5538` | 次级文字 |
| `rose.800` | `#6b422b` | 边框 |
| `rose.900` | `#4d2f1e` | 极深强调 |

### 2.3 中性色 — Warm（暖灰黑）

| 色阶 | 色值 | 用途 |
|------|------|------|
| `warm.50` | `#f5f0e8` | 正文文字 |
| `warm.100` | `#e8dfcf` | 次级文字 |
| `warm.200` | `#d1c4a8` | 占位符/装饰 |
| `warm.300` | `#baa981` | 次级图标 |
| `warm.400` | `#a38e5a` | 次级边框 |
| `warm.500` | `#8c7333` | 禁用态文字 |
| `warm.600` | `#6b5828` | 深色辅助 |
| `warm.700` | `#4a3d1c` | 深色卡片 |
| `warm.800` | `#2d2d28` | 卡片背景 |
| `warm.900` | `#1a1a18` | Modal/弹出层背景 |
| **`warm.950`** | **`#111110`** | **页面背景** |

### 2.4 功能色

| 语义名 | 色值 | 用途 |
|--------|------|------|
| `success.500` | `#22c55e` | 成功、正向反馈 |
| `warning.500` | `#f59e0b` | 警告、提示 |
| `error.500` | `#ef4444` | 错误、危险操作 |

---

## 3. 字体系统

### 3.1 字体栈

| 用途 | 字体栈 | 回退 |
|------|--------|------|
| **Heading** | `DM Serif Display` | `Noto Serif SC`, `STSong`, serif |
| **Body** | `Inter` | `Noto Sans SC`, `PingFang SC`, `Microsoft YaHei`, sans-serif |
| **Mono** | `JetBrains Mono` | `Consolas`, monospace |

### 3.2 字号层级

| 名称 | 大小 | 用途 |
|------|------|------|
| `xs` | 12px | 标签、角标 |
| `sm` | 14px（默认）/ 13px | 次级说明 |
| `md` | 16px | 正文（桌面） |
| `base` | 14px（默认）/ 15px（平板） | 正文（移动） |
| `lg` | 18px | 卡片标题 |
| `xl` | 20px | Section 标题 |
| `2xl` | 24px | 页面标题 |
| `3xl` | 30px | 大标题 |

> 移动端 base 字号 14px，桌面 15px，平板 16px。

---

## 4. 图标规范

**来源**: `src/components/Icons.jsx` — 项目自定义 Feather 风格 SVG 图标集
**原则**: 全产品线统一使用此目录下的图标，**严禁使用 Emoji 作为 UI 图标**

### 4.1 图标命名规范

| 规范 | 示例 |
|------|------|
| PascalCase | `CalendarIcon`, `SparklesIcon` |
| 功能性命名 | `CheckCircleIcon` 而非 `SuccessIcon` |
| 避免缩写 | `UserIcon` 而非 `UsrIcon` |

### 4.2 图标尺寸规范

| 场景 | 尺寸 | 示例 |
|------|------|------|
| 内联装饰 | 12–14px | Badge 内的 Icon |
| 工具栏/按钮 | 18–20px | Tab 图标 |
| 功能入口 | 24px | 导航图标 |
| 空状态/插画 | 48–64px | EmptyState |

### 4.3 图标颜色规范

| 场景 | 色值 |
|------|------|
| 导航/选中态 | `gold.500` |
| 次级/未选中 | `rgba(245, 240, 232, 0.4)` |
| 装饰性图标 | `rgba(245, 240, 232, 0.4)` |
| 功能强调 | `gold.400` |

### 4.4 已有图标清单（37 个）

```
导航/导航: FishIcon(追AI Logo), ChatIcon, SparklesIcon, BookIcon, UserIcon
女性/约会: FemaleIcon, GiftIcon, HeartIcon, CalendarIcon
状态/反馈: CheckIcon, CheckCircleIcon, WarningIcon, InfoIcon, AlertIcon
媒体/输入: CameraIcon, MicIcon, StopIcon, SpeakerIcon
通用工具: SearchIcon, ClockIcon, MapPinIcon, ArrowLeftIcon, RefreshIcon
数据/内容: ClipboardIcon, CreditCardIcon, BrainIcon, ChartIcon, FireIcon
其他: DashboardIcon, UsersIcon, LockIcon, SnowIcon, StarsIcon, InboxIcon
```

---

## 5. 阴影与辉光

### 5.1 阴影

| 名称 | 值 | 用途 |
|------|-----|------|
| `card` | `0 4px 24px rgba(0,0,0,0.4)` | 卡片默认阴影 |
| `elevated` | `0 8px 40px rgba(0,0,0,0.5)` | Modal/弹出层 |

### 5.2 辉光（Gold Glow）

| 名称 | 值 | 用途 |
|------|-----|------|
| `glow-gold` | `0 0 24px rgba(226,176,68,0.22)` | 按钮 Hover / 选中态 |
| `glow-gold-lg` | `0 0 40px rgba(226,176,68,0.32)` | 重要 CTA Hover |
| `glow-rose` | `0 0 20px rgba(193,127,89,0.15)` | 女性相关元素 |

---

## 6. 卡片设计规范

### 6.1 卡片默认态

```js
{
  bg: 'warm.900',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: { base: 'md', md: 'lg' },
  // 微妙内光 — 左上角微亮
  _before: {
    content: '""',
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%)',
    pointerEvents: 'none',
  }
}
```

### 6.2 卡片悬停态（400ms ease-out）

```js
{
  transform: 'translateY(-3px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(226,176,68,0.08)',
  borderColor: 'rgba(226,176,68,0.15)',
}
```

---

## 7. 按钮规范

### 7.1 Solid Button（主要 CTA）

```js
// 默认态
bgGradient: 'linear-gradient(135deg, gold.500, gold.600)'
color: 'warm.950'

// Hover 态（250ms ease-out）
bgGradient: 'linear-gradient(135deg, gold.300, gold.400)'
boxShadow: '0 0 28px rgba(226,176,68,0.30)'
transform: 'scale(1.02)'

// Active 态（100ms ease-in）
bg: 'gold.700'
transform: 'scale(0.97)'
```

### 7.2 Ghost Button（次级操作）

```js
color: 'rgba(245,240,232,0.6)'
_hover: { bg: 'rgba(255,255,255,0.06)', color: 'warm.50' }
```

### 7.3 Outline Button（边框强调）

```js
borderColor: 'gold.500'
color: 'gold.500'
_hover: {
  bg: 'rgba(226,176,68,0.12)',
  borderColor: 'gold.400',
  boxShadow: '0 0 16px rgba(226,176,68,0.12)'
}
```

---

## 8. 表单规范

### 8.1 Input / Textarea

```js
// 默认态
bg: 'rgba(255,255,255,0.03)'
color: 'warm.50'
borderColor: 'rgba(255,255,255,0.08)'

// Hover
bg: 'rgba(255,255,255,0.05)'

// Focus
bg: 'rgba(255,255,255,0.05)'
borderColor: 'gold.500'
boxShadow: '0 0 0 3px rgba(226,176,68,0.15)'

// Placeholder
color: 'rgba(245,240,232,0.4)'   // 占位符满足 WCAG 对比度
```

> **注意**: `_placeholder` 对比度最低 0.4（`#b28b54`），正文文字对比度 0.55 以上。

### 8.2 Select

```js
bg: 'warm.800'
color: 'warm.50'
borderColor: 'rgba(255,255,255,0.08)'
_hover: { bg: 'warm.700' }
```

---

## 9. 对比度与可访问性

### 9.1 文字对比度规则

> 基于 `warm.950 #111110` 背景，辅助功能标准 WCAG AA（4.5:1）

| 用途 | 透明度 | 色值 | 对比度（与 #111110） |
|------|--------|------|---------------------|
| 正文文字 | `0.55` | `rgba(245,240,232,0.55)` | ~5.5:1 ✅ |
| 次级文字/标签 | `0.6` | `rgba(245,240,232,0.6)` | ~6.3:1 ✅ |
| 占位符文字 | `0.4` | `rgba(245,240,232,0.4)` | ~3.5:1 ⚠️ 仅限 Placeholder |
| 装饰性图标 | `0.4` | `rgba(245,240,232,0.4)` | ~3.5:1 ⚠️ 仅限装饰 |
| _hover borderColor | `0.2` | `rgba(245,240,232,0.2)` | N/A（非文本） |

> **严格禁止**: 正文/标签文字使用低于 `rgba(245,240,232,0.55)` 的透明度。

### 9.2 全局禁止模式

```jsx
// ❌ 错误：正文文字对比度不足
<Text color="rgba(245,240,232,0.2)">内容</Text>
<Text color="rgba(245,240,232,0.3)">内容</Text>

// ✅ 正确
<Text color="rgba(245,240,232,0.6)">正文内容</Text>
<Text color="rgba(245,240,232,0.55)">正文内容</Text>

// ❌ 错误：占位符使用正文对比度（浪费配额）
Input placeholder color="rgba(245,240,232,0.6)"

// ✅ 正确
Input placeholder color="rgba(245,240,232,0.4)"
```

---

## 10. 动效规范

### 10.1 时长层级

| 场景 | 时长 | 示例 |
|------|------|------|
| 微交互 | 150ms | 按钮按压反馈 |
| 状态切换 | 250ms | 按钮 Hover/Active |
| 卡片悬停 | 400ms ease-out | 卡片上浮 + 辉光 |
| Modal 弹出 | Chakra 默认 | scale 动画 |
| Skeleton 闪烁 | 1.5s ease-in-out | 内容加载骨架屏 |

### 10.2 Toast 持续时间

| 类型 | 时长 |
|------|------|
| success | 2000ms |
| warning | 3000ms |
| error | 4000ms |

### 10.3 动画原则

- 使用 `ease-out` 进入，`ease-in` 退出
- 退出动画时长约为进入的 60–70%
- 移动端优先，避免过度动画
- 支持 `prefers-reduced-motion`

---

## 11. Logo 使用规范

### 11.1 Logo 文件

| 文件 | 尺寸 | 用途 |
|------|------|------|
| `public/logo.svg` | 矢量 | 源文件，优先使用 |
| `public/logo.png` | 512×512 | 兼容性降级 |
| `public/favicon.png` | 32×32 | 浏览器 Tab |
| `public/pwa-192x192.png` | 192×192 | iOS 主屏 |
| `public/pwa-512x512.png` | 512×512 | Android 主屏 / 应用商店 |

### 11.2 Logo 使用场景

```jsx
// AppLogo 组件（全局）
<Image src="/logo.png" alt="追AI" />

// Chat 页面内 Mo哥 头像
<Image src="/logo.png" alt="Mo哥" w="24px" h="24px" />
```

### 11.3 Logo 安全区

Logo 周围保留最小 1/10 边距，避免与其他元素贴边。

---

## 12. 品牌违规检查清单

新增 UI 代码时自查：

- [ ] 正文文字 `≥ rgba(245,240,232,0.55)`，禁止 `0.2/0.3/0.35`
- [ ] 占位符文字 `rgba(245,240,232,0.4)`
- [ ] UI 图标全部使用 `Icons.jsx`，无 Emoji
- [ ] 按钮使用 `colorScheme="gold"`，或 theme Button variants
- [ ] 卡片使用 `Card` 组件，包含内光效果
- [ ] 所有组件通过 `theme.js` 变量引用色彩，不用硬编码
- [ ] Toast 时长遵循规范（success 2s / warning 3s / error 4s）
- [ ] 动效时长符合本规范第 10 节

---

## 13. 参考文件

| 文件 | 说明 |
|------|------|
| `frontend/src/theme.js` | 品牌色彩、字体、组件样式定义 |
| `frontend/src/components/Icons.jsx` | 37 个 SVG 图标 |
| `frontend/public/logo.svg` | 矢量 Logo 源文件 |
| `frontend/public/logo.png` | Logo PNG（512×512） |

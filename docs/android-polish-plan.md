# 追AI Android App 打磨计划

## 现状诊断

| 项目 | 状态 |
|------|------|
| Capacitor 框架 | ✅ 已集成 v8.3.1，`cap doctor` 通过 |
| Android 原生壳 | ✅ 已有，MainActivity 已配置 FLAG_SECURE |
| 签名 | ✅ keystore 已配置（versionCode 21 / 1.1.1） |
| APK | ✅ 已有 4 个历史 APK 文件 |
| Capacitor 插件 | App, Browser, Filesystem, FileOpener |
| 前端移动端适配 | ✅ 已有底部 Tab 导航、响应式布局 |
| 版本更新 | ✅ VersionUpdateModal 已实现 APK 下载+安装 |

## 打磨任务清单

### Phase 1: 构建与性能（最高优先级）

**1.1 PWA Service Worker 在 Capacitor 中禁用**
- 问题：生产模式下 PWA 插件会注册 SW，但在 Capacitor WebView 中文件从 `asset://` 加载，SW 可能报错或无效缓存
- 方案：在 `vite.config.js` 中加条件判断 `isCapacitor` 环境时跳过 VitePWA 插件
- 文件：`vite.config.js`

**1.2 Google Fonts 预加载优化**
- 问题：`index.html` 通过 `cdn.jsdelivr.net` 加载 Google Fonts，WebView 首次打开有网络延迟
- 方案：添加 `<link rel="preload">` 或改用系统字体回退链，减少 FOUT（字体闪烁）
- 文件：`index.html`

**1.3 WebView 性能优化**
- 问题：Capacitor 默认 WebView 设置较基础
- 方案：
  - `MainActivity.java` 中配置 WebView 硬件加速、DOM 存储、Mixed Content 模式
  - 启用 `setDomStorageEnabled(true)`、`setAllowFileAccess(true)`
  - 配置 WebViewClient 缓存策略
- 文件：`MainActivity.java`

**1.4 ProGuard 混淆（可选，减小 APK 体积）**
- 当前 `minifyEnabled false`
- 启用后 APK 预计减小 30-40%（当前 ~4MB → ~2.5MB）
- 文件：`app/build.gradle`

### Phase 2: 视觉与体验

**2.1 启动屏统一**
- 问题：HTML splash（带粒子动效的精美设计）与原生 splash（480x320 静态 PNG）视觉不一致
- 方案：
  - 生成与 HTML splash 一致的原生 splash 图（深色背景 #0a0f1a + 金色 logo）
  - 确保原生 splash → HTML splash → 内容页 的过渡流畅无闪烁
- 文件：`res/drawable/splash.png`

**2.2 启动图标更新**
- 当前图标在各 dpi 目录已有，但需要检查视觉质量
- 建议使用 `@capacitor/assets` 从统一源图生成全套图标
- 文件：`res/mipmap-*/` 系列

**2.3 安全区域适配**
- 已有 `pb="env(safe-area-inset-bottom)"` 和 `viewport-fit=cover`
- 验证刘海屏/挖孔屏的顶部状态栏适配（`padding-top: env(safe-area-inset-top)`）
- 文件：`ClientLayout.jsx`, `index.html`

### Phase 3: 原生能力增强

**3.1 相机/相册原生插件**
- 添加 `@capacitor/camera` 插件
- 用户可在聊天/记录中直接拍照或选图，而非通过浏览器文件选择器
- 体验更流畅，支持原生图片压缩

**3.2 推送通知（Push Notifications）**
- 添加 `@capacitor/push-notifications` 插件
- 接入 FCM（Firebase Cloud Messaging）
- 后端需配合：推送新消息/提醒时调用 FCM API
- 需要 `google-services.json` 配置文件（当前 build.gradle 已有逻辑但文件不存在）

**3.3 本地通知（Local Notifications）**
- 添加 `@capacitor/local-notifications` 插件
- 用于约会提醒、学习提醒等本地定时通知
- 不需要后端配合

**3.4 Haptics（触觉反馈）**
- 添加 `@capacitor/haptics` 插件
- 在关键交互（点赞、发送消息、Tab 切换）添加轻微震动反馈
- 显著提升"原生感"

### Phase 4: 健壮性与发布

**4.1 构建脚本自动化**
- 创建 `scripts/build-android.sh`：一键完成 build → cap sync → cap build → 签名 → 输出 APK
- 包含版本号自动递增

**4.2 错误上报增强**
- 已有 `frontendErrorCapture.js` 和版本检测中的 `captureError`
- 确保 Capacitor 环境下的网络错误能正确上报
- 添加 WebView 崩溃捕获

**4.3 网络断开处理**
- Capacitor App 离线时需有友好提示
- Socket.IO 断线重连机制验证
- 添加离线状态 UI 提示条

**4.4 版本号管理**
- `version.js` 中硬编码 VERSION='1.1.1' BUILD=21 需与 `build.gradle` 同步
- 建议构建脚本自动同步版本号

## 执行顺序

```
Phase 1（构建与性能）→ Phase 2（视觉与体验）→ Phase 3（原生能力）→ Phase 4（发布准备）
```

Phase 1-2 是核心打磨项（1-2 周），Phase 3-4 是增值项（额外 1 周）。

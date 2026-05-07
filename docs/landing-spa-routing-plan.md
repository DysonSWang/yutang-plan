# 落地页 + SPA 分流部署方案

## Context

落地页（营销页）和 SPA 应用需要共存：
- 落地页：`https://zhuiai.club/` → 纯静态营销页
- SPA：`https://zhuiai.club/app/` → React 应用
- 登录页：`https://zhuiai.club/login` → 转发到 `/app/login`
- 管理后台：`https://zhuiai.club/admin` → 转发到 `/app/admin`
- 客户端：`https://zhuiai.club/chat` 等 → 转发到 `/app/chat`

## 架构设计

```
                    nginx
                      │
          ┌────────────┴────────────┐
          ▼                         ▼
    / (落地页)                  /app/* (SPA)
    /index.html                 React Router
    静态文件                       │
                                 ├── /login  → 登录页
                                 ├── /admin  → 管理后台
                                 ├── /chat    → 客户端聊天
                                 └── ...
```

### Nginx 路由规则

| 路径 | 目标 | 说明 |
|------|------|------|
| `/` | 落地页 | `/var/www/zhuiai/app/` |
| `/app/*` | SPA | `/var/www/zhuiai/app-spa/` |
| `/login` | 301 → `/app/login` | 登录页重定向 |
| `/admin` | 301 → `/app/admin` | 管理后台重定向 |
| `/chat` | 301 → `/app/chat` | 客户端聊天重定向 |
| 其他客户端路由 | 301 → `/app/<path>` | 全部转发 |
| `/api/*` | 后端 API | 代理到 127.0.0.1:3005 |
| `/socket.io/*` | WebSocket | 代理到后端 |
| `/apk/*` | APK 下载 | 静态文件 |
| `/assets/*` | SPA 资源 | `/var/www/zhuiai/app-spa/assets/` |
| `/favicon.png` 等 | SPA 静态资源 | 同上 |

### 前端配置变更

**文件**: `vite.config.js`
```javascript
base: '/app/',  // 从 '/' 改为 '/app/'
```

**App.jsx 路由基础路径**:
- React Router BrowserRouter 的 basename 设为 `/app`

### 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `vite.config.js` | `base: '/app/'` |
| `App.jsx` | BrowserRouter 添加 `basename="/app"` |
| `nginx.conf` (服务器) | 添加重定向规则 |

## 实施步骤

### Step 1: 修改 vite.config.js

```javascript
export default defineConfig({
  base: '/app/',  // SPA 部署在 /app/ 路径
  // ...
})
```

### Step 2: 修改 App.jsx

```jsx
<BrowserRouter basename={import.meta.env.PROD && !isCapacitorApp() ? '/app' : '/'}>
```

### Step 3: 重新构建前端

```bash
cd /home/admin/zhuiai/frontend
npm run build
```

### Step 4: 修改 nginx 配置（服务器）

```nginx
# 落地页（默认）
location / {
    alias /var/www/zhuiai/app/;
    index index.html;
}

# SPA（/app/ 路径）
location /app/ {
    alias /var/www/zhuiai/app-spa/;
    index index.html;
    try_files $uri $uri/ /app/index.html;
}

# 客户端路由重定向
location /login { return 301 /app/login; }
location /admin { return 301 /app/admin; }
location /chat { return 301 /app/chat; }
location /ai-coach { return 301 /app/ai-coach; }
location /my-pond { return 301 /app/my-pond; }
location /dates { return 301 /app/dates; }
location /learning { return 301 /app/learning; }
location /profile { return 301 /app/profile; }

# API 和其他（按需添加重定向）
```

### Step 5: 上传到服务器

```bash
# 上传 dist 到 /var/www/zhuiai/app-spa/
# 上传 index.html（落地页）到 /var/www/zhuiai/app/
# 重启 nginx
```

## 验证清单

- [ ] `https://zhuiai.club/` → 显示落地页
- [ ] `https://zhuiai.club/app/` → 显示 SPA 首页
- [ ] `https://zhuiai.club/app/admin` → 管理后台
- [ ] `https://zhuiai.club/app/login` → 登录页
- [ ] `https://zhuiai.club/admin` → 301 重定向到 `/app/admin`
- [ ] `https://zhuiai.club/api/version/check` → API 正常

## NOT in scope

- 后端代码修改
- 数据库修改
- APK 分发路径变更
# 追爱AI 运维实践指南

> 基于「生产就绪运维框架」的方法论，针对追爱AI（1后端+1前端+SQLite）的落地指南

---

## 1. 当前状态评估

| 维度 | 当前状态 | 与框架差距 |
|------|---------|-----------|
| **监控** | 仅 Uptime Kuma 检查 `/api/version/check` | 缺少错误追踪 |
| **可观测性** | 直接 `pm2 logs` 查看日志 | 无法按用户维度查询 |
| **部署验证** | 有固定脚本 + 登录接口验证 | 依赖 LLM 执行（已改进）|
| **SLO** | 未定义 | 缺失 |
| **Error Budget** | 未跟踪 | 缺失 |
| **告警** | 仅 HTTP 200/500 | 无延迟/错误率告警 |

---

## 2. 当前状态（已完成）

| 改进项 | 状态 | 完成日期 |
|--------|------|---------|
| Sentry 错误追踪 | ✅ 已完成 | 2026-05-18 |
| 固定脚本部署 | ✅ 已完成 | 2026-05-18 |
| 登录接口验证 | ✅ 已完成 | 2026-05-18 |

---

## 3. 改进计划（按优先级）

### P0 - 立即修复（不影响当前发版）

#### 2.1 添加错误追踪（Sentry）

```bash
# 安装
cd /home/admin/zhuiai/backend
npm install @sentry/node @sentry/integrations

# 配置
```

创建 `/home/admin/zhuiai/backend/src/middleware/sentry.js`：

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.Integrations.Http({ breadcrumbs: true, tracing: true }),
  ],
  tracesSampleRate: 0.1,
});

module.exports = Sentry;
```

在 `src/index.js` 中引入：

```javascript
const Sentry = require('./middleware/sentry');

// 所有错误路由
app.use(Sentry.Handlers.errorHandler());
```

`.env` 添加：

```
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

#### 2.2 独立故障域监控

当前监控和应用共用大里服务器。建议：

| 监控类型 | 工具 | 成本 |
|---------|------|------|
| Uptime + HTTP 监控 | Uptime Kuma 自托管在小腾 | 0 |
| 告警 | Bark/Server酱 免费版 | 0 |
| 备选 | Better Stack Free (50次/小时) | 0 |

---

### P1 - 下个版本（影响发版流程）

#### 2.3 定义 SLO

```javascript
// /api/version/check 响应时间
const VERSION_CHECK_SLO = {
  latency_p99: 200,  // ms
  error_rate: 0.5,   // %
};

// /api/auth/login 响应时间
const AUTH_SLO = {
  latency_p99: 500,  // ms
  error_rate: 1.0,   // %
};
```

#### 2.4 添加健康检查接口

```bash
# 健康检查（包含数据库连接）
curl -s https://zhuiai.club/api/health
# 期望：{"status":"ok","db":"ok","latency":15}
```

---

### P2 - 长期优化

#### 2.5 告警阈值配置

| 指标 | 警告 | 紧急 |
|------|------|------|
| `/api/version/check` 延迟 | > 300ms | > 1s |
| `/api/auth/login` 延迟 | > 500ms | > 2s |
| HTTP 5xx 比率 | > 0.1% | > 1% |
| CPU 利用率 | > 60% | > 80% |
| 磁盘使用 | > 70% | > 90% |

#### 2.6 复盘模板

```markdown
# 追爱AI 故障复盘 - YYYY-MM-DD

## 事件概述
- 时间：
- 影响：
- 持续：

## 时间线
- HH:MM 问题发现
- HH:MM 根因确认
- HH:MM 修复部署
- HH:MM 完全恢复

## 根因分析
1.

## 改进措施
- [ ] 1.
- [ ] 2.

## 行动项
| 负责人 | 任务 | 截止日期 |
|--------|------|----------|
```

---

## 3. 部署后验证清单

基于「部署即验证」原则，每次发版必须：

```bash
# 1. Web 版正常
curl -sI https://zhuiai.club/app/ | grep 200

# 2. API 版本正确
curl -s https://zhuiai.club/api/version/check | jq '.buildNumber'

# 3. 核心接口（登录）正常 ⚠️ 关键
curl -s -X POST https://zhuiai.club/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"test","password":"test"}' \
  | jq '.success'

# 4. 数据库连接正常
sqlite3 /data/zhuiai/data/database.db 'PRAGMA integrity_check;'
# 期望：ok

# 5. Symlink 正常
ls -la /data/zhuiai/backend/ | grep data
# 期望：data -> /data/zhuiai/data
```

---

## 4. 监控清单（60秒定位）

```
□ curl -s https://zhuiai.club/api/version/check  # API 响应
□ pm2 logs --lines 50 --nostream                  # 最近日志
□ sqlite3 /data/zhuiai/data/database.db 'PRAGMA integrity_check;'  # 数据库
□ ls -la /data/zhuiai/backend/ | grep data         # Symlink
□ free -m                                          # 内存
□ df -h                                            # 磁盘
□ pm2 list                                         # 进程状态
```

---

## 5. 故障响应

| 级别 | 定义 | 响应时间 |
|------|------|---------|
| P0 | 服务完全不可用 | 立即 |
| P1 | 登录/聊天核心功能故障 | 30 分钟 |
| P2 | 非核心功能降级 | 4 小时 |

**P0 止血步骤**：
```bash
# 1. 回滚
ssh root@120.77.9.177 "cd /data/zhuiai/backend && pm2 stop && mv backend backend.broken && mv backend.bak1 backend && pm2 start"

# 2. 验证
curl -s https://zhuiai.club/api/auth/login -X POST -H "Content-Type: application/json" -d '{"phone":"test","password":"test"}'

# 3. 通知
# Server酱发送通知
```

---

## 6. 缺口总结

| 改进项 | 当前 | 目标 | 优先级 | 状态 |
|--------|------|------|--------|------|
| 错误追踪 | 无 | Sentry | P0 | ✅ 已完成 |
| 健康检查接口 | 无 | `/api/health` | P1 | 待做 |
| SLO 定义 | 无 | 2 个核心 SLI | P1 | 待做 |
| 独立告警 | 无 | Bark/Server酱 | P2 | 待做 |
| 复盘机制 | 无 | 每次故障后 | P2 | 待做 |

---

## 7. Sentry 配置指南

### 7.1 创建项目

1. 访问 https://sentry.io 创建账号
2. 创建新项目（选择 Node.js/Express）
3. 获取 DSN，格式如：
   ```
   https://xxxxx@sentry.io/xxxxx
   ```

### 7.2 配置环境变量

在服务器 `.env` 中添加：
```bash
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

### 7.3 验证

部署后访问 https://sentry.io 检查：
- 是否有新的错误事件
- 请求追踪是否正常工作

### 7.4 告警配置（可选）

在 Sentry 后台配置：
- Email 告警（错误率 > 5%）
- Slack 集成（可选）

---

## 7. 相关文件

| 文件 | 用途 |
|------|------|
| [deploy.sh](/home/admin/zhuiai/scripts/deploy.sh) | 部署脚本（含 symlink 验证）|
| [verify.sh](/home/admin/zhuiai/scripts/verify.sh) | 验证脚本（含登录接口）|
| [upload-apk.sh](/home/admin/zhuiai/scripts/upload-apk.sh) | APK 上传脚本 |
| [ecosystem.config.js](/home/admin/zhuiai/backend/ecosystem.config.js) | PM2 配置 |
| [SKILL.md](/home/admin/.claude/skills/release/SKILL.md) | 发布 SOP v4.5 |

---

**文档版本**: v1.0
**更新日期**: 2026-05-18
**参考框架**: 生产就绪运维框架 v1.0
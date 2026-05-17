# 追爱AI · 生产环境热升级 SOP

> 本文档描述如何在不停服的情况下平滑升级后端服务
>
> **版本**: v3.0 (基于生产运维框架增强：symlink架构、告警通知、Sentry)
> **更新日期**: 2026-05-16

---

## ⚠️ 重大修订 (v3.0)

| # | 问题 | 修复 | 来源 |
|---|------|------|------|
| 1 | PM2 stop/start 有数秒停机 | 改用 `pm2 reload` | 可靠性专家 |
| 2 | 回滚不恢复数据库 | 回滚前先备份数据库 | 数据库专家 |
| 3 | 缺少健康监控 | 增加健康检查脚本 + 告警 | 可靠性专家 |
| 4 | 无写入窗口保护 | 升级前进入维护模式 | 数据库专家 |
| 5 | 回滚无验证 | 回滚后验证服务正常 | 流程专家 |
| 6 | 缺少通知机制 | 升级前通知相关人 | 流程专家 |
| 7 | SSH root 直接登录 | 创建运维账户 + 密钥认证 | 安全专家 |
| 8 | data目录随backend迁移导致问题 | 使用symlink解耦数据与代码 | 架构专家 |
| 9 | health check无外部告警 | 接入钉钉/Bark通知 | 监控专家 |
| 10 | 无Sentry错误追踪 | 接入Sentry SDK | 可观测性专家 |

---

## 一、升级流程

### 1.0 升级前准备（本地执行）

```bash
# 1. 确认代码已提交
cd /home/admin/zhuiai
git status  # 应无未提交更改
git pull origin main

# 2. 检查版本一致性
node scripts/check-version.js

# 3. 通知相关人员（邮件/群消息）
# 示例：计划 10:00 开始升级，预计 15 分钟

# 4. 确认 package-lock.json 存在
ls package-lock.json

# 5. 预估耗时：npm install ~3min, prisma generate ~1min, 切换 ~1min
```

### 1.1 打包上传

```bash
# 打包后端代码（排除敏感目录）
cd /home/admin/zhuiai
tar --exclude='node_modules' \
    --exclude='.env' \
    --exclude='data' \
    --exclude='logs' \
    --exclude='*.db' \
    --exclude='prisma/data' \
    --exclude='.git' \
    -czf - backend/ | \
ssh ops@120.77.9.177 "mkdir -p /data/zhuiai/backend.new && tar -xzf - -C /data/zhuiai/backend.new --strip-components=1"
```

### 1.2 服务器端配置

```bash
# SSH 到大里服务器（使用运维账户 ops）
ssh ops@120.77.9.177
sudo su -  # 仅必要时提权

# 进入新版本目录
cd /data/zhuiai/backend.new

# 清理旧 node_modules（如有残留）
rm -rf node_modules

# 安装依赖
npm install

# 生成 Prisma Client
npx prisma generate

# 复制环境变量（保持生产配置）
cp ../backend/.env .env

# 检查 schema 是否有变更
if git diff --stat ../backend/prisma/schema.prisma 2>/dev/null | grep -q schema.prisma; then
    echo "检测到 schema 变更，将执行数据库迁移..."
fi

# 验证关键文件存在
ls -la src/index.js node_modules/.prisma/client/index.js
```

### 1.3 升级前备份（关键步骤）

```bash
# 1. 备份当前数据库（必须在切换前执行）
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp /data/zhuiai/data/database.db /data/zhuiai/data/database.preupgrade_${TIMESTAMP}.db

# 2. 验证数据库完整性
sqlite3 /data/zhuiai/data/database.db "PRAGMA integrity_check;"

# 3. 进入维护模式（禁止新写入）
# 方式A：使用 nginx 维护页面
# 方式B：在 .env 中设置 MAINTENANCE_MODE=true 并重启

# 4. 确认无活跃连接
lsof -i :3005 | grep -v ^COMMAND | wc -l  # 应为 0
```

### 1.4 执行切换（Zero Downtime）

```bash
# 备份当前版本
rm -rf /data/zhuiai/backend.bak2
mv /data/zhuiai/backend /data/zhuiai/backend.bak1

# 切换到新版本
mv /data/zhuiai/backend.new /data/zhuiai/backend

# 使用 pm2 reload 实现零停机热替换
pm2 reload zhuiai-backend

# 验证进程状态
pm2 status
pm2 info zhuiai-backend | grep -E 'status|uptime|memory'
```

### 1.5 升级后验证

```bash
# 1. API 健康检查（含响应时间）
RESPONSE=$(curl -s -w '\n%{http_code}:%{time_total}s' https://zhuiai.club/api/version/check)
echo "$RESPONSE"

# 2. 数据库读写测试
curl -s -X POST https://zhuiai.club/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"health_check_test","password":"test"}' | jq -r '.code'  # 应返回特定错误码，非网络错误

# 3. WebSocket 连接测试
curl -s -I https://zhuiai.club/socket.io/ | grep -E 'HTTP|Upgrade'

# 4. 检查错误日志
pm2 logs zhuiai-backend --err --lines 50 | grep -iE 'error|warn|fatal'

# 5. 资源使用检查
pm2 status
free -h
df -h /
```

### 1.6 退出维护模式 & 通知

```bash
# 1. 退出维护模式
# 将 MAINTENANCE_MODE=false 或移除

# 2. 再次验证核心接口正常

# 3. 发送升级完成通知
# 包含：版本号、升级时间、是否回滚、注意事项
```

---

## 二、回滚方案

### 2.1 快速回滚（1 分钟内完成）

```bash
ssh ops@120.77.9.177 "
  # 备份当前版本（回滚前最后保护）
  TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
  cp /data/zhuiai/data/database.db /data/zhuiai/data/database.rollback_\${TIMESTAMP}.db

  # 停止服务
  pm2 stop zhuiai-backend

  # 回滚代码
  rm -rf /data/zhuiai/backend
  mv /data/zhuiai/backend.bak1 /data/zhuiai/backend

  # 重启服务
  pm2 start /data/zhuiai/backend/src/index.js --name zhuiai-backend

  # 验证（关键：必须验证回滚成功）
  sleep 5
  HTTP_CODE=\$(curl -s -o /dev/null -w '%{http_code}' https://zhuiai.club/api/version/check)
  if [ \"\$HTTP_CODE\" = \"200\" ]; then
    echo '回滚成功'
  else
    echo '回滚失败！需要人工介入' >> /data/zhuiai/logs/alert.log
    exit 2
  fi
"
```

### 2.2 回滚后验证

```bash
# 完整验证清单
curl -s https://zhuiai.club/api/version/check | jq .
pm2 status
pm2 logs zhuiai-backend --err --lines 20

# 通知相关人员（回滚完成）
```

---

## 三、回滚触发条件

| 条件 | 动作 | 说明 |
|------|------|------|
| API 健康检查连续 **3 次**失败 | 必须回滚 | 可能是严重问题 |
| PM2 重启超过 **5 次** | 必须回滚 | 进程不稳定 |
| 数据库连接失败 | 必须回滚 | 数据层问题 |
| 核心接口 500 错误 | 必须回滚 | 业务逻辑问题 |
| 非核心接口偶尔超时 | 可尝试修复 | 观察 5 分钟 |

---

## 四、目录结构规范（Symlink架构）

```
/data/zhuiai/
├── backend/                    # 当前运行版本（代码）
│   └── data → /data/zhuiai/data  # symlink指向独立数据目录
├── data/                       # 独立数据目录（与代码解耦）
│   ├── database.db            # 生产数据库
│   ├── database.preupgrade_*.db  # 升级前备份（保留 3 个）
│   └── database.rollback_*.db   # 回滚前备份（临时）
├── releases/                   # 版本归档
│   ├── v1.5.8.tgz
│   └── v1.5.7.tgz
└── logs/
    ├── upgrade.log           # 升级日志
    ├── backup.log            # 备份日志
    └── alert.log             # 告警日志
```

### Symlink架构优势

| 优势 | 说明 |
|------|------|
| **数据独立** | 升级时 `backend/` 整体替换，数据不受影响 |
| **无拷贝** | 不需要 `cp -r data` 操作，避免数据丢失 |
| **简化回滚** | 回滚只涉及代码，不涉及数据目录 |
| **便于备份** | 数据目录始终在固定位置 |

### 创建Symlink（已执行）

```bash
# 确认symlink存在
ls -la /data/zhuiai/backend/data
# 应显示: data → /data/zhuiai/data

# 如果需要重建symlink
ln -sf /data/zhuiai/data /data/zhuiai/backend/data
```

### 命名规范

- 备份目录：`backend@v{version}/`
- 数据库备份：`database.{type}_{timestamp}.db`

### 清理策略

| 目录/文件 | 保留策略 |
|-----------|----------|
| `backend/` | 当前运行，始终一个 |
| `backend@v*/` | 保留最近 2 个版本 |
| `releases/*.tgz` | 保留最近 10 个版本 |
| `database.preupgrade_*.db` | 保留 3 个 |
| `database.rollback_*.db` | 回滚成功后删除 |
| 日志文件 | 保留 30 天 |

---

## 五、Sentry错误追踪集成

### 5.1 为什么需要Sentry

| 传统方式 | Sentry方式 |
|---------|-----------|
| 用户报bug才知道有问题 | 错误发生时立即通知 |
| 不知道影响多少用户 | 精确统计影响用户数 |
| 不知道错误堆栈 | 完整错误上下文+源码定位 |
| 无法复现问题 | 重现率大幅提升 |

### 5.2 安装Sentry SDK

```bash
cd /data/zhuiai/backend
npm install @sentry/node --save
```

### 5.3 配置Sentry（在index.js开头）

```javascript
import * as Sentry from '@sentry/node';

// 初始化Sentry（替换DSN）
Sentry.init({
    dsn: 'https://xxxxx@xxxx.ingest.sentry.io/xxxxx',
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,  // 10%采样用于性能追踪
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
```

### 5.4 在PM2配置中启用

```javascript
module.exports = {
  apps: [{
    name: 'zhuiai-backend',
    script: './src/index.js',
    // ... 其他配置
    env: {
      NODE_ENV: 'production',
      SENTRY_DSN: 'https://xxxxx@xxxx.ingest.sentry.io/xxxxx'
    }
  }]
}
```

### 5.5 告警通知配置

在 Sentry Dashboard → Project → Settings → Alerts 配置：
- 新错误时发送邮件通知
- 错误率突增时触发钉钉/邮件通知

---

## 六、PM2 进程管理

### 6.1 推荐配置

创建 `/data/zhuiai/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'zhuiai-backend',
    script: './src/index.js',
    cwd: '/data/zhuiai/backend',
    instances: 1,           // 单实例，避免 SQLite 并发问题
    exec_mode: 'fork',     // fork 模式
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    env: {
      NODE_ENV: 'production'
    },
    // 重要：Zero Downtime 必须使用 reload
    // stop/start 会造成服务中断
  }]
}
```

### 6.2 常用命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs zhuiai-backend --lines 100

# 重启（会中断服务！）
pm2 restart zhuiai-backend

# 重载（Zero Downtime）- 唯一正确方式
pm2 reload zhuiai-backend

# 优雅停止
pm2 stop zhuiai-backend

# 保存配置
pm2 save
```

### 6.3 健康检查脚本（增强版）

创建 `/data/zhuiai/health-check.sh`:

```bash
#!/bin/bash
# 健康检查脚本 v3.0 - 基于生产运维框架
# 功能：API检测 + DB完整性 + 外部告警 + 资源监控
# 建议通过 cron 每分钟执行

API_URL="https://zhuiai.club/api/version/check"
DB_PATH="/data/zhuiai/data/database.db"
LOG_FILE="/data/zhuiai/logs/health.log"
ALERT_FILE="/data/zhuiai/logs/alert.log"

# 钉钉通知函数（替换实际CHANNEL_ID）
send_dingtalk() {
    local msg="$1"
    curl -s -X POST "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"追爱AI告警: $msg\"}}" 2>/dev/null
}

# Bark通知函数（替换实际KEY）
send_bark() {
    local msg="$1"
    curl -s "https://api.day.app/YOUR_BARK_KEY/追爱AI告警/$msg" 2>/dev/null
}

log() { echo "[$(date)] $1" >> "$LOG_FILE"; }

# 1. API 响应时间检测
RESPONSE_TIME=$(curl -s -w '%{time_total}' -o /dev/null "$API_URL")
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL")

if (( $(echo "$RESPONSE_TIME > 3" | bc -l) )) || [ "$HTTP_CODE" != "200" ]; then
    MSG="API异常: HTTP=$HTTP_CODE, 延迟=${RESPONSE_TIME}s"
    echo "[$(date)] ALERT: $MSG" >> "$ALERT_FILE"
    send_bark "$MSG"
fi

# 2. 数据库完整性检测（关键！）
if [ -f "$DB_PATH" ]; then
    DB_CHECK=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null)
    if [ "$DB_CHECK" != "ok" ]; then
        MSG="数据库损坏: $DB_CHECK"
        echo "[$(date)] ALERT: $MSG" >> "$ALERT_FILE"
        send_bark "$MSG"
    fi
fi

# 3. PM2 进程状态检测
STATUS=$(pm2 show zhuiai-backend 2>/dev/null | grep "status" | awk '{print $4}')
RESTARTS=$(pm2 show zhuiai-backend 2>/dev/null | grep "restarts" | awk '{print $4}')

if [ "$STATUS" != "online" ]; then
    MSG="PM2状态异常: $STATUS"
    echo "[$(date)] ALERT: $MSG" >> "$ALERT_FILE"
    send_bark "$MSG"
fi

# 重启次数过多告警
if [ "$RESTARTS" -gt 5 ]; then
    MSG="PM2重启过多: ${RESTARTS}次"
    echo "[$(date)] ALERT: $MSG" >> "$ALERT_FILE"
    send_bark "$MSG"
fi

# 4. 内存使用率
MEM_PCT=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
if [ "$MEM_PCT" -gt 85 ]; then
    MSG="内存使用率高: ${MEM_PCT}%"
    echo "[$(date)] ALERT: $MSG" >> "$ALERT_FILE"
    send_bark "$MSG"
fi

# 5. 磁盘使用率
DISK_PCT=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_PCT" -gt 80 ]; then
    MSG="磁盘空间不足: ${DISK_PCT}%"
    echo "[$(date)] ALERT: $MSG" >> "$ALERT_FILE"
    send_bark "$MSG"
fi

# 6. I/O wait 检测（识别硬件问题）
IO_WAIT=$(top -bn1 | grep "Cpu(s)" | awk '{print $8}' | sed 's/%id,//')
if (( $(echo "$IO_WAIT > 50" | bc -l) )); then
    MSG="I/O wait过高: ${IO_WAIT}%，可能存在硬件问题"
    echo "[$(date)] ALERT: $MSG" >> "$ALERT_FILE"
fi

echo "[$(date)] 健康检查完成: API=${HTTP_CODE}, 延迟=${RESPONSE_TIME}s, 内存=${MEM_PCT}%, DB=${DB_CHECK:-未检测}" >> "$LOG_FILE"
```

设置 cron:
```bash
# 每分钟执行健康检查
* * * * * /data/zhuiai/health-check.sh >> /data/zhuiai/logs/health-cron.log 2>&1

# 保留日志（避免无限增长）
find /data/zhuiai/logs -name "*.log" -mtime +30 -delete
```

---

## 六、升级检查清单

### 升级前

| # | 检查项 | 命令/操作 | 预期 |
|---|--------|---------|------|
| 1 | 确认数据库正常 | `sqlite3 /data/zhuiai/data/database.db "PRAGMA integrity_check;"` | OK |
| 2 | 备份数据库 | `cp database.db database.preupgrade_$(date +%Y%m%d%H%M%S).db` | 文件存在 |
| 3 | 确认磁盘空间 | `df -h /` | > 20% 可用 |
| 4 | 确认 PM2 状态 | `pm2 status` | online |
| 5 | 确认 Cron 正常 | `crontab -l` | 有备份任务 |
| 6 | 通知相关人员 | 发送升级开始通知 | 已发送 |
| 7 | 检查 git 状态 | `git status` | 无未提交更改 |
| 8 | 检查 schema 变更 | `git diff backend/prisma/schema.prisma` | 无或已计划 |

### 升级中

| # | 检查项 | 命令/操作 | 预期 |
|---|--------|---------|------|
| 1 | node_modules 安装 | `ls node_modules \| wc -l` | > 400 个包 |
| 2 | Prisma 生成成功 | `ls node_modules/.prisma/client/index.js` | 存在 |
| 3 | 环境变量正确 | `cat .env \| grep DATABASE` | 指向生产库 |
| 4 | 端口已释放 | `lsof -i :3005 \| wc -l` | 0（切换前） |
| 5 | PM2 reload 成功 | `pm2 status` | online |

### 升级后

| # | 检查项 | 命令/操作 | 预期 |
|---|--------|---------|------|
| 1 | PM2 在线 | `pm2 status` | online |
| 2 | API 200 | `curl -s -o /dev/null -w '%{http_code}' https://zhuiai.club/api/version/check` | 200 |
| 3 | API 响应时间 | `curl -s -w '%{time_total}' -o /dev/null /api/version/check` | < 3s |
| 4 | 数据库写入 | `curl -X POST /api/... -d {...}` | 成功 |
| 5 | 无 ERROR 日志 | `pm2 logs --err --lines 50` | 无 ERROR |
| 6 | Socket.IO 正常 | `curl -s -I /socket.io/` | 101 Upgrade |
| 7 | 内存使用正常 | `free -h \| grep Mem` | < 85% |
| 8 | 发送升级完成通知 | 邮件/群消息 | 已发送 |

---

## 七、常见问题

### 7.1 升级后 502 Bad Gateway

**原因**: 后端未启动成功或端口未释放

**解决**:
```bash
# 检查端口
lsof -i :3005

# 查看日志
pm2 logs zhuiai-backend --lines 100

# 如果端口未释放
pm2 stop all
pkill -f "node.*index.js"
pm2 start zhuiai-backend
```

### 7.2 Prisma Client 版本不匹配

**原因**: schema.prisma 有更新

**解决**:
```bash
cd /data/zhuiai/backend
npx prisma generate
npx prisma db push --accept-data-loss
pm2 reload zhuiai-backend
```

### 7.3 端口被占用

**原因**: 旧进程未退出

**解决**:
```bash
pm2 stop all
pkill -f "node.*index.js"
sleep 2
pm2 start zhuiai-backend
```

### 7.4 数据库损坏

**原因**: SQLite 热升级冲突或写入中断

**解决**:
```bash
# 恢复最近的有效备份
ls -t /data/zhuiai/data/database.preupgrade_*.db | head -1
cp /data/zhuiai/data/database.preupgrade_20260515_030000.db /data/zhuiai/data/database.db
pm2 reload zhuiai-backend
```

### 7.5 回滚失败

**原因**: bak1 目录损坏

**解决**:
```bash
# 检查 bak2
ls -la /data/zhuiai/backend.bak2/

# 使用更早的版本
mv /data/zhuiai/backend /data/zhuiai/backend.failed
mv /data/zhuiai/backend.bak2 /data/zhuiai/backend
pm2 start /data/zhuiai/backend/src/index.js --name zhuiai-backend
```

---

## 八、自动化脚本

### 8.1 升级脚本

创建 `/data/zhuiai/upgrade.sh`:

```bash
#!/bin/bash
# 追爱AI 热升级脚本 v3.0
# 用法: ./upgrade.sh [version]
# 示例: ./upgrade.sh 1.5.8
# 更新：使用symlink架构，数据库独立于backend目录

set -e

VERSION=${1:-$(date +%Y%m%d_%H%M%S)}
BACKEND_DIR="/data/zhuiai/backend"
BACKEND_NEW="/data/zhuiai/backend.new"
BACKEND_BAK="/data/zhuiai/backend.bak1"
DATA_DIR="/data/zhuiai/data"           # 独立数据目录
DB_PATH="$DATA_DIR/database.db"        # 数据库在独立目录
LOG_FILE="/data/zhuiai/logs/upgrade.log"
ALERT_FILE="/data/zhuiai/logs/alert.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "[$(date)] $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[$(date)] 警告: $1${NC}" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[$(date)] 错误: $1${NC}" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}[$(date)] $1${NC}" | tee -a "$LOG_FILE"; }

log "===== 开始升级 v$VERSION ====="

# 1. 检查新版本目录
if [ ! -d "$BACKEND_NEW" ]; then
    error "backend.new 目录不存在"
    exit 1
fi

# 2. 复制环境变量
if [ ! -f "$BACKEND_NEW/.env" ]; then
    log "复制环境变量..."
    cp "$BACKEND_DIR/.env" "$BACKEND_NEW/.env"
fi

# 3. 检查依赖
if [ ! -d "$BACKEND_NEW/node_modules" ]; then
    error "node_modules 不存在，请先执行 npm install"
    exit 1
fi

if [ ! -f "$BACKEND_NEW/node_modules/.prisma/client/index.js" ]; then
    error "Prisma Client 未生成"
    exit 1
fi

# 4. 数据库备份（关键步骤！symlink架构下仍然需要）
log "备份数据库..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
# 数据库在独立目录，symlink架构下路径不变
cp "$DB_PATH" "$DATA_DIR/database.preupgrade_${TIMESTAMP}.db"
if [ $? -eq 0 ]; then
    success "数据库备份成功: database.preupgrade_${TIMESTAMP}.db"
else
    error "数据库备份失败，升级中止"
    exit 1
fi

# 4.1 验证数据库完整性
DB_CHECK=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null)
if [ "$DB_CHECK" != "ok" ]; then
    warn "数据库完整性检查异常: $DB_CHECK"
fi

# 5. 备份当前版本
log "备份当前版本..."
rm -rf "$BACKEND_BAK"
mv "$BACKEND_DIR" "$BACKEND_BAK"

# 6. 切换到新版本
log "切换到新版本..."
mv "$BACKEND_NEW" "$BACKEND_DIR"

# 6.1 确认symlink存在（切换后验证）
if [ ! -L "$BACKEND_DIR/data" ]; then
    warn "Symlink丢失，正在重建..."
    ln -sf "$DATA_DIR" "$BACKEND_DIR/data"
fi

# 7. 使用 pm2 reload 实现零停机
log "重载服务..."
pm2 reload zhuiai-backend

# 8. 等待服务启动
sleep 5

# 9. 验证（关键）
log "验证服务..."
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' https://zhuiai.club/api/version/check)

if [ "$HTTP_CODE" = "200" ]; then
    success "升级成功！HTTP: $HTTP_CODE"
    log "===== 升级完成 v$VERSION ====="
    exit 0
else
    error "升级失败 HTTP: $HTTP_CODE，开始回滚..."
    
    # 回滚
    pm2 stop zhuiai-backend
    rm -rf "$BACKEND_DIR"
    mv "$BACKEND_BAK" "$BACKEND_DIR"
    pm2 start "$BACKEND_DIR/src/index.js" --name zhuiai-backend
    
    # 验证回滚
    sleep 5
    ROLLBACK_CODE=$(curl -s -o /dev/null -w '%{http_code}' https://zhuiai.club/api/version/check)
    
    if [ "$ROLLBACK_CODE" = "200" ]; then
        success "回滚成功"
        log "===== 升级失败，已回滚 ====="
        exit 1
    else
        error "回滚失败！需要人工介入"
        echo "[$(date)] 回滚失败！需要人工检查" >> "$ALERT_FILE"
        exit 2
    fi
fi
```

设置执行权限:
```bash
chmod 750 /data/zhuiai/upgrade.sh  # 仅运维组可执行
chown ops:ops /data/zhuiai/upgrade.sh
```

### 8.2 回滚脚本

创建 `/data/zhuiai/rollback.sh`:

```bash
#!/bin/bash
# 回滚脚本 v2.0

set -e

LOG_FILE="/data/zhuiai/logs/upgrade.log"
ALERT_FILE="/data/zhuiai/logs/alert.log"

log() { echo "[$(date)] $1" | tee -a "$LOG_FILE"; }

log "===== 开始回滚 ====="

# 1. 备份当前版本（最后保护）
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp /data/zhuiai/data/database.db /data/zhuiai/data/database.rollback_${TIMESTAMP}.db
log "当前数据库已备份: database.rollback_${TIMESTAMP}.db"

# 2. 停止服务
pm2 stop zhuiai-backend

# 3. 回滚代码
rm -rf /data/zhuiai/backend
mv /data/zhuiai/backend.bak1 /data/zhuiai/backend

# 4. 重启服务
pm2 start /data/zhuiai/backend/src/index.js --name zhuiai-backend

# 5. 验证（关键）
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' https://zhuiai.club/api/version/check)

if [ "$HTTP_CODE" = "200" ]; then
    log "===== 回滚成功 ====="
    exit 0
else
    log "===== 回滚失败！需要人工介入 ====="
    echo "[$(date)] 回滚失败！需要人工检查" >> "$ALERT_FILE"
    exit 2
fi
```

---

## 九、版本管理规范

| 字段 | 位置 | 示例 |
|------|------|------|
| `version` | `backend/package.json` | `1.5.8` |
| `latestVersion` | `backend/src/routes/version.js` | `1.5.8` |
| `buildNumber` | `backend/src/routes/version.js` | `50` |
| `versionName` | `frontend/android/app/build.gradle` | `1.5.8` |
| `versionCode` | `frontend/android/app/build.gradle` | `50` |

### Git Tag 集成（推荐）

```bash
# 升级前打标签
cd /home/admin/zhuiai
git tag v1.5.8
git push origin v1.5.8

# 服务器端记录版本
ssh ops@120.77.9.177 "echo 'v1.5.8' > /data/zhuiai/backend/.version"
```

### 版本一致性检查

```bash
# 本地执行
node /home/admin/zhuiai/scripts/check-version.js

# 预期输出：
# frontend/android/app/build.gradle: 1.5.8 (50)
# backend/src/routes/version.js: 1.5.8 (50)
# package.json: 1.5.8
# 一致性: ✅ 通过
```

---

## 十、安全加固（基于安全评审）

### 10.1 SSH 访问

| 建议 | 操作 |
|------|------|
| 使用 SSH 密钥认证 | 创建 `ops` 运维账户，使用密钥登录 |
| 禁止 root 直接登录 | `PermitRootLogin no` |
| 使用 fail2ban | 锁定连续登录失败 |

### 10.2 文件权限

```bash
# .env 文件
chmod 600 /data/zhuiai/backend/.env
chown ops:ops /data/zhuiai/backend/.env

# 数据目录
chmod 755 /data/zhuiai/data
chmod 640 /data/zhuiai/data/database.db

# 日志目录
chmod 755 /data/zhuiai/logs
```

### 10.3 审计日志

日志格式（JSON）:
```json
{
  "timestamp": "2026-05-15T10:00:00Z",
  "user": "ops",
  "host": "dali",
  "action": "upgrade",
  "version": "1.5.8",
  "result": "success",
  "duration": 45
}
```

---

## 十一、联系信息

| 角色 | 联系方式 | 职责 |
|------|---------|------|
| 运维 | 大里服务器 `ops@120.77.9.177` | 升级执行 |
| 开发 | 本地执行打包 | 代码准备 |
| 测试 | 小里服务器 `149.129.227.54` | UAT 验证 |
| 告警 | `/data/zhuiai/logs/alert.log` | 问题通知 |

---

## 附录 A：评审专家意见摘要

| 专家 | 主要问题 | 评分 |
|------|---------|------|
| 安全专家 | root 直接登录、SSH 密钥缺失 | 2.8/10 |
| 可靠性专家 | PM2 重启停机、单机单点 | 99.5% 可用性 |
| 架构专家 | 版本追溯弱、无 Git Tag | 5.2/10 |
| 流程专家 | 缺少通知、回滚验证缺失 | 7/10 |
| 数据库专家 | SQLite 热升级风险、回滚不回库 | 高风险 |

---

## 附录 B：升级耗时预估

| 步骤 | 耗时 | 说明 |
|------|------|------|
| 打包上传 | 1-3 min | 取决于网络 |
| npm install | 2-5 min | 取决于包数量 |
| prisma generate | 1-2 min | |
| 数据库备份 | < 1 min | 取决于数据库大小 |
| PM2 reload | < 5s | 零停机 |
| 验证 | 1-2 min | |
| **总计** | **6-13 min** | |

---

*最后更新: 2026-05-16*
*基于生产运维框架 + 5位专家评审意见增强 v3.0*
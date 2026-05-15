# 追爱AI · 统一发布 SOP

> **版本**: v1.0
> **整合自**: `DEPLOY_SOP.md`、`HOT_UPGRADE_SOP.md`、`apk-release-guide.md`、`deploy-backend.sh`
> **更新日期**: 2026-05-15

---

## 一、服务器架构

| 角色 | 服务器 | IP | 目录 | 用途 |
|------|--------|-----|------|------|
| **生产** | 大里 | 120.77.9.177 | `/data/zhuiai/backend/` | 正式环境 |
| **UAT** | 小里 | 149.129.227.54 | `/home/zhuiai/backend/` | 测试验证 |

**自动备份机制**:
- 大里：每天 03:00 自动备份数据库 → `/data/zhuiai/db-backups/`
- 小里：每天 05:00 自动拉取大里最新备份覆盖本地

---

## 二、版本管理

### 2.1 版本号存放位置（三处必须同步）

| 文件 | 字段 | 当前值 |
|------|------|--------|
| [`frontend/src/utils/version.js`](../frontend/src/utils/version.js) | `VERSION` / `BUILD` | `1.5.8` / `50` |
| [`frontend/android/app/build.gradle`](../frontend/android/app/build.gradle) | `versionName` / `versionCode` | `1.5.8` / `50` |
| [`backend/src/routes/version.js`](../backend/src/routes/version.js) | `latestVersion` / `buildNumber` | `1.5.8` / `50` |

### 2.2 版本检查

```bash
# 发布前必须运行，三处不一致会报错
node /home/admin/zhuiai/scripts/check-version.js
```

### 2.3 升级类型

| 类型 | 触发条件 | 用户行为 |
|------|---------|---------|
| 强制升级 | `当前版本 < minVersion` | 无法关闭弹窗，必须更新 |
| 建议升级 | `当前版本 < latestVersion` | 可选"稍后再说" |
| 无需升级 | `当前版本 >= latestVersion` | 无提示 |

### 2.4 发版时更新步骤

1. 修改 `frontend/src/utils/version.js` 中的 `VERSION` 和 `BUILD`
2. 修改 `frontend/android/app/build.gradle` 中的 `versionName` 和 `versionCode`
3. 修改 `backend/src/routes/version.js` 中的 `latestVersion`、`buildNumber`、`updateDescription`
4. 运行 `node scripts/check-version.js` 确认一致
5. 提交代码并打 Git Tag：`git tag v1.5.8 && git push origin v1.5.8`

---

## 三、场景一：后端热升级（零停机）

> 适用于：后端代码变更，无需重新构建前端

### 3.1 前置检查

```bash
cd /home/admin/zhuiai
git status                                    # 应无未提交更改
git pull origin main
node scripts/check-version.js                 # 版本一致性检查
```

### 3.2 打包上传到大里

```bash
cd /home/admin/zhuiai
tar --exclude='node_modules' \
    --exclude='.env' \
    --exclude='data' \
    --exclude='logs' \
    --exclude='*.db' \
    --exclude='prisma/data' \
    --exclude='.git' \
    -czf - backend/ | \
ssh root@120.77.9.177 "mkdir -p /data/zhuiai/backend.new && tar -xzf - -C /data/zhuiai/backend.new --strip-components=1"
```

### 3.3 服务器端准备

```bash
ssh root@120.77.9.177
cd /data/zhuiai/backend.new

rm -rf node_modules
npm install
npx prisma generate
cp ../backend/.env .env                      # 复制生产环境变量
ls -la src/index.js node_modules/.prisma/client/index.js   # 验证关键文件
```

### 3.4 数据库备份（关键）

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp /data/zhuiai/data/database.db /data/zhuiai/data/database.preupgrade_${TIMESTAMP}.db
sqlite3 /data/zhuiai/data/database.db "PRAGMA integrity_check;"   # 应返回 OK
```

### 3.5 执行切换

```bash
# 备份当前版本
rm -rf /data/zhuiai/backend.bak2
mv /data/zhuiai/backend /data/zhuiai/backend.bak1

# 切换到新版本
mv /data/zhuiai/backend.new /data/zhuiai/backend

# 零停机重载（必须用 reload，不能用 stop/start）
pm2 reload zhuiai-backend
pm2 status
```

### 3.6 验证

```bash
# API 健康检查
curl -s https://zhuiai.club/api/version/check | jq .

# WebSocket 检查
curl -s -I https://zhuiai.club/socket.io/ | grep -E 'HTTP|Upgrade'

# 错误日志检查
pm2 logs zhuiai-backend --err --lines 20
```

### 3.7 快速回滚（如验证失败）

```bash
# 备份当前数据库（回滚前保护）
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp /data/zhuiai/data/database.db /data/zhuiai/data/database.rollback_${TIMESTAMP}.db

# 回滚代码
pm2 stop zhuiai-backend
rm -rf /data/zhuiai/backend
mv /data/zhuiai/backend.bak1 /data/zhuiai/backend

# 重启并验证
pm2 start /data/zhuiai/backend/src/index.js --name zhuiai-backend
sleep 5
curl -s -o /dev/null -w '%{http_code}' https://zhuiai.club/api/version/check   # 应返回 200
```

### 3.8 回滚触发条件

| 条件 | 动作 |
|------|------|
| API 健康检查连续 3 次失败 | **必须回滚** |
| PM2 重启超过 5 次 | **必须回滚** |
| 数据库连接失败 | **必须回滚** |
| 核心接口 500 错误 | **必须回滚** |
| 非核心接口偶尔超时 | 观察 5 分钟，尝试修复 |

---

## 四、场景二：全量部署（前端 + 后端）

> 适用于：前端 UI 变更、全量发布

### 4.1 前端构建

```bash
cd /home/admin/zhuiai/frontend
npm run build                                 # 输出到 dist/
```

### 4.2 上传前端到大里

```python
import paramiko, subprocess

host, user, password = "120.77.9.177", "root", "W199191w"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=30)
sftp = client.open_sftp()

# 打包本地 dist
subprocess.run(["tar", "czf", "/tmp/zhuiai-dist.tar.gz", "-C",
    "/home/admin/zhuiai/frontend/dist", "."], check=True)

# 上传并解压
sftp.put("/tmp/zhuiai-dist.tar.gz", "/tmp/zhuiai-dist.tar.gz")
sin, sout, serr = client.exec_command(
    "rm -rf /var/www/zhuiai/app-spa/* && "
    "tar xzf /tmp/zhuiai-dist.tar.gz -C /var/www/zhuiai/app-spa/ && "
    "rm /tmp/zhuiai-dist.tar.gz && echo OK"
)
sout.channel.recv_exit_status()
print(sout.read().decode())
client.close()
```

### 4.3 后端部署

使用第三节「后端热升级」流程。

### 4.4 验证

```bash
# 前端页面
curl -s "https://zhuiai.club/" | grep -o '<title>.*</title>'

# API
curl -s "https://zhuiai.club/api/version/check" | jq .

# 管理后台
curl -s "https://zhuiai.club/admin" | grep -o '<title>.*</title>'
```

---

## 五、场景三：APK 发布

> 适用于：Android App 新版本发布

### 5.1 版本号更新

按第二节更新三处版本文件，运行 `check-version.js` 确认。

### 5.2 构建 APK

```bash
cd /home/admin/zhuiai/frontend

# 构建前端（APK 必须用 build:android，不能用 npm run build）
npm run build:android
```

> **注意**：`npm run build` 是 Web 版（路径 `/app/assets/`），APK 必须用 `npm run build:android`（路径 `/assets/`）。

### 5.3 验证 APK 内置资源

```bash
# 确认资源路径正确（应为 /assets/，不含 /app/）
unzip -p /home/admin/zhuiai/frontend/android/app/build/outputs/apk/release/app-release.apk \
  assets/public/index.html | grep -o 'src="/[^"]*' | head -1
```

### 5.4 上传到自建托管

```python
import paramiko

host, user, password = "120.77.9.177", "root", "W199191w"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=30)
sftp = client.open_sftp()

APK_LOCAL = "/home/admin/zhuiai/frontend/android/app/build/outputs/apk/release/app-release.apk"
sftp.put(APK_LOCAL, "/var/www/zhuiai/apk/app.apk")
print("APK 已上传到 https://zhuiai.club/apk/app.apk")
client.close()
```

### 5.5 上传到蒲公英（可选备份）

```bash
APK_PATH="/home/admin/zhuiai/frontend/android/app/build/outputs/apk/release/app-release.apk"

curl -X POST \
  -F "file=@${APK_PATH}" \
  -F "uKey=3e311caa422730d4aab2619e9a879dc2" \
  -F "_api_key=18f6e9b73043917c2c229951ade52ff7" \
  -F "buildUpdateDescription=版本更新" \
  -F "buildVersion=1.5.8" \
  -F "buildVersionNo=50" \
  https://www.pgyer.com/apiv2/app/upload
```

### 5.6 后端版本接口更新 & 重启

后端 `version.js` 中的 `downloadUrl` 应指向自建托管：
```javascript
downloadUrl: 'https://zhuiai.club/apk/app.apk'
```

按第三节流程部署后端（包含版本文件更新）。

### 5.7 验证

```bash
# APK 下载
curl -sI "https://zhuiai.club/apk/app.apk" | grep HTTP

# 版本检测接口
curl -s "https://zhuiai.club/api/version/check" | jq .
```

---

## 六、场景四：UAT 验证流程

> 新版本先在小里验证，通过后再部署大里

### 6.1 部署到小里

```python
import paramiko, subprocess

host, user, password = "149.129.227.54", "root", "W199191w"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=30)
sftp = client.open_sftp()

# 上传后端代码
subprocess.run(["tar", "czf", "/tmp/backend.tar.gz", "-C",
    "/home/admin/zhuiai", "--exclude=node_modules", "--exclude=.env",
    "--exclude=data", "--exclude=*.db", "backend"], check=True)
sftp.put("/tmp/backend.tar.gz", "/tmp/backend.tar.gz")
sin, sout, serr = client.exec_command(
    "cd /home/zhuiai && rm -rf backend.new && mkdir backend.new && "
    "tar xzf /tmp/backend.tar.gz -C backend.new --strip-components=1 && "
    "cd backend.new && npm install && npx prisma generate && "
    "cp ../backend/.env .env && echo OK"
)
sout.channel.recv_exit_status()
print(sout.read().decode())
client.close()
```

### 6.2 切换小里到新版本

```python
sin, sout, serr = client.exec_command(
    "cd /home/zhuiai && "
    "rm -rf backend.bak && mv backend backend.bak && "
    "mv backend.new backend && "
    "ps aux | grep 'node.*index.js' | grep -v grep | awk '{print $2}' | xargs -r kill && "
    "sleep 2 && "
    "cd backend && nohup node src/index.js > /dev/null 2>&1 & "
    "sleep 3 && curl -s http://localhost:3005/api/version/check | head -c 200"
)
```

### 6.3 UAT 验证清单

| 检查项 | 操作 |
|--------|------|
| 前端页面 | 浏览器访问 `https://zhuiai.uat/` 或小里 IP |
| API 接口 | 测试核心业务接口 |
| 登录功能 | admin/admin123 登录 |
| AI 教练 | 测试对话功能 |
| 版本检测 | 验证升级弹窗逻辑 |

### 6.4 验证通过后部署大里

使用第三节「后端热升级」流程。

---

## 七、nginx 配置参考

```nginx
# SPA（React 应用）
location / {
    alias /var/www/zhuiai/app-spa/;
    index index.html;
    try_files $uri $uri/ /index.html;
}

# API（后端服务）
location /api/ {
    proxy_pass http://127.0.0.1:3005;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# WebSocket
location /socket.io/ {
    proxy_pass http://127.0.0.1:3005/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}

# APK 下载
location /apk/ {
    alias /var/www/zhuiai/apk/;
    add_header Content-Disposition attachment;
}
```

nginx 常用命令：
```bash
ssh root@120.77.9.177 "nginx -t"           # 测试配置
ssh root@120.77.9.177 "nginx -s reload"    # 重载配置
```

---

## 八、PM2 进程管理

### 8.1 推荐配置

```javascript
// /data/zhuiai/ecosystem.config.js
module.exports = {
  apps: [{
    name: 'zhuiai-backend',
    script: './src/index.js',
    cwd: '/data/zhuiai/backend',
    instances: 1,           // 单实例（SQLite 不支持并发写入）
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    env: { NODE_ENV: 'production' }
  }]
}
```

### 8.2 常用命令

| 命令 | 用途 | 停机时间 |
|------|------|---------|
| `pm2 status` | 查看状态 | 无 |
| `pm2 logs zhuiai-backend --lines 100` | 查看日志 | 无 |
| `pm2 reload zhuiai-backend` | **零停机重载**（推荐） | **0s** |
| `pm2 restart zhuiai-backend` | 重启（会中断） | 3-10s |
| `pm2 stop zhuiai-backend` | 停止 | 完全停机 |

> **铁律**：生产环境只用 `pm2 reload`，禁止 `pm2 stop/start`。

---

## 九、目录结构

### 9.1 本地开发

```
/home/admin/zhuiai/
├── frontend/                  # 前端代码
│   ├── src/
│   │   └── utils/version.js   # 版本号：VERSION + BUILD
│   ├── dist/                  # Web 构建产物
│   └── android/
│       └── app/build.gradle   # 版本号：versionName + versionCode
├── backend/                   # 后端代码
│   ├── src/
│   │   ├── index.js           # 入口
│   │   └── routes/version.js  # 版本检测接口
│   └── data/database.db       # SQLite 数据库
├── scripts/
│   └── check-version.js       # 版本一致性检查
├── docs/                      # 文档
└── deploy-backend.sh          # 后端部署脚本
```

### 9.2 大里（生产）

```
/data/zhuiai/
├── backend/                   # 当前运行版本
├── backend.bak1/              # 上一个版本（用于回滚）
├── backend.bak2/              # 更早版本
├── backend.new/               # 待切换的新版本（升级过程中）
├── data/
│   ├── database.db            # 生产数据库
│   ├── database.preupgrade_*.db  # 升级前备份
│   └── database.rollback_*.db    # 回滚前备份
├── db-backups/                # 每日自动备份（cron 03:00）
│   └── database_YYYYMMDD_HHMMSS.db.gz
├── logs/
│   ├── upgrade.log            # 升级日志
│   └── health.log             # 健康检查日志
└── ecosystem.config.js        # PM2 配置
```

### 9.3 小里（UAT）

```
/home/zhuiai/
├── backend/                   # 当前运行版本
├── backend.bak/               # 上一个版本
└── sync-from-dali.sh          # 每日同步脚本（cron 05:00）
```

---

## 十、数据库管理

### 10.1 备份

- **自动备份**：大里 cron `0 3 * * * /data/zhuiai/backup.sh`
- **UAT 同步**：小里 cron `0 5 * * * /home/zhuiai/sync-from-dali.sh`
- **升级前备份**：每次热升级必须手动执行（见第三节 3.4）

### 10.2 数据库路径

```bash
# 确认实际数据库位置
ssh root@120.77.9.177 "cat /data/zhuiai/backend/.env | grep DATABASE"
# 输出: DATABASE_URL=file:./data/database.db
# 实际路径: /data/zhuiai/backend/data/database.db
```

### 10.3 恢复

```bash
# 从升级前备份恢复
cp /data/zhuiai/data/database.preupgrade_20260515_100000.db /data/zhuiai/data/database.db
pm2 reload zhuiai-backend

# 从每日备份恢复
cd /data/zhuiai/db-backups/
ls -lt | head -5                                    # 找最新备份
gunzip -k database_20260515_030000.db.gz
cp database_20260515_030000.db /data/zhuiai/data/database.db
pm2 reload zhuiai-backend
```

---

## 十一、健康检查

### 11.1 手动检查

```bash
# API 健康
curl -s https://zhuiai.club/api/version/check | jq .

# PM2 状态
ssh root@120.77.9.177 "pm2 status"

# 内存使用
ssh root@120.77.9.177 "free -h"

# 磁盘空间
ssh root@120.77.9.177 "df -h /"

# 错误日志
ssh root@120.77.9.177 "pm2 logs zhuiai-backend --err --lines 20"
```

### 11.2 自动健康检查（cron）

大里服务器 `/data/zhuiai/health-check.sh`：

```bash
#!/bin/bash
API_URL="https://zhuiai.club/api/version/check"
LOG_FILE="/data/zhuiai/logs/health.log"
ALERT_FILE="/data/zhuiai/logs/alert.log"

# API 响应时间
RESPONSE_TIME=$(curl -s -w '%{time_total}' -o /dev/null "$API_URL")
if (( $(echo "$RESPONSE_TIME > 3" | bc -l) )); then
    echo "[$(date)] ALERT: API 响应 ${RESPONSE_TIME}s > 3s" >> "$ALERT_FILE"
fi

# HTTP 状态码
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL")
if [ "$HTTP_CODE" != "200" ]; then
    echo "[$(date)] ALERT: HTTP $HTTP_CODE" >> "$ALERT_FILE"
fi

# PM2 状态
STATUS=$(pm2 show zhuiai-backend | grep status | awk '{print $4}')
if [ "$STATUS" != "online" ]; then
    echo "[$(date)] ALERT: PM2 $STATUS" >> "$ALERT_FILE"
fi

# 内存使用率
MEM_PCT=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
if [ "$MEM_PCT" -gt 85 ]; then
    echo "[$(date)] ALERT: 内存 ${MEM_PCT}%" >> "$ALERT_FILE"
fi
```

cron：`* * * * * /data/zhuiai/health-check.sh`

---

## 十二、发布检查清单

### 发布前

| # | 检查项 | 命令 | 预期 |
|---|--------|------|------|
| 1 | 版本一致 | `node scripts/check-version.js` | ✅ 通过 |
| 2 | 代码已提交 | `git status` | 无未提交更改 |
| 3 | 数据库正常 | `sqlite3 database.db "PRAGMA integrity_check;"` | OK |
| 4 | 磁盘空间 | `df -h /` | > 20% 可用 |
| 5 | PM2 状态 | `pm2 status` | online |

### 发布中

| # | 检查项 | 命令 | 预期 |
|---|--------|------|------|
| 1 | 依赖安装 | `ls node_modules/.prisma/client/index.js` | 存在 |
| 2 | 环境变量 | `cat .env \| grep DATABASE` | 指向生产库 |
| 3 | 数据库备份 | `ls database.preupgrade_*` | 文件存在 |
| 4 | PM2 reload | `pm2 status` | online |

### 发布后

| # | 检查项 | 命令 | 预期 |
|---|--------|------|------|
| 1 | API 200 | `curl -s -o /dev/null -w '%{http_code}' /api/version/check` | 200 |
| 2 | API 响应时间 | `curl -s -w '%{time_total}' -o /dev/null /api/version/check` | < 3s |
| 3 | 无错误日志 | `pm2 logs --err --lines 20` | 无 ERROR |
| 4 | WebSocket | `curl -s -I /socket.io/` | 101 Upgrade |
| 5 | 内存正常 | `free -h` | < 85% |

---

## 十三、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 502 Bad Gateway | 后端未启动 | 检查 `pm2 status`，查看日志 |
| Prisma 版本不匹配 | schema 有更新 | `npx prisma generate && pm2 reload` |
| 端口被占用 | 旧进程未退出 | `pm2 stop all && pkill -f "node.*index.js" && pm2 start zhuiai-backend` |
| 页面显示落地页 | nginx alias 指向错误 | 检查 nginx 配置，确保 alias 指向 `app-spa` |
| 登录跳转回登录页 | token 无效或过期 | 检查 localStorage，或重新登录 |
| APK 安装失败 | 资源路径错误 | 确认用 `npm run build:android` 而非 `npm run build` |
| 版本检测不生效 | 后端未重启 | 重启后端，确认 `version.js` 已更新 |
| 数据库损坏 | 写入中断 | 恢复 `database.preupgrade_*` 备份 |

---

## 十四、紧急联系

| 角色 | 联系方式 |
|------|---------|
| 运维 | 大里 `root@120.77.9.177` |
| UAT | 小里 `root@149.129.227.54` |
| 告警日志 | `/data/zhuiai/logs/alert.log` |

---

*最后更新: 2026-05-15*
*整合自: DEPLOY_SOP.md, HOT_UPGRADE_SOP.md v2.0, apk-release-guide.md, deploy-backend.sh*

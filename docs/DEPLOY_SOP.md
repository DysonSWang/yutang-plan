# 追爱AI · 小里服务器部署 SOP

## 服务器信息

| 服务器 | IP | 目录 | 登录方式 |
|--------|-----|------|---------|
| 小里（生产） | 149.129.227.54 | 前端：`/var/www/zhuiai/app-spa/` 后端：`/home/zhuiai/backend/` | 密码：W199191w |
| 小腾 | 118.25.94.81 | 备用 | SSH 密钥 |

---

## 一、Web 前端部署

### 1.1 本地构建

```bash
cd /home/admin/zhuiai/frontend
npm run build
```

### 1.2 上传到服务器

```python
import paramiko, subprocess

host, user, password = "149.129.227.54", "root", "W199191w"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=30)
sftp = client.open_sftp()

# 打包本地 dist
subprocess.run(["tar", "czf", "/tmp/zhuiai-dist.tar.gz", "-C",
    "/home/admin/zhuiai/frontend/dist", "."], check=True)

# 上传并解压到 app-spa
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

### 1.3 验证部署

```bash
# 检查文件存在
curl -s "https://zhuiai.club/assets/index-DNBJoewO.js" | head -c 100

# 检查页面 title
curl -s "https://zhuiai.club/admin" | grep -o '<title>.*</title>'
```

---

## 二、后端部署

### 2.1 上传后端代码

```python
import paramiko

host, user, password = "149.129.227.54", "root", "W199191w"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=30)
sftp = client.open_sftp()

# 关键文件需要单独上传（如 version.js、routes 等）
sftp.put("/home/admin/zhuiai/backend/src/routes/version.js",
         "/home/zhuiai/backend/src/routes/version.js")
print("后端关键文件已上传")

# 重启后端服务
sin, sout, serr = client.exec_command(
    "ps aux | grep 'node.*index.js' | grep -v grep | awk '{print 建议更新}' "
    "| xargs -r kill 2>/dev/null; sleep 1; "
    "cd /home/zhuiai/backend && nohup node src/index.js "
    "> /var/log/zhuiai-backend.log 2>&1 & echo PID:$!"
)
sout.channel.recv_exit_status()
print(sout.read().decode())
client.close()
```

### 2.2 验证后端

```bash
# 检查进程
ssh root@149.129.227.54 "ps aux | grep 'node.*index.js' | grep -v grep"

# 检查 API
curl -s "https://zhuiai.club/api/version/check" | jq .
```

---

## 三、nginx 配置

### 3.1 关键路径配置

```
/var/www/zhuiai/app-spa/    → React SPA 应用（前端）
/var/www/zhuiai/app/         → 落地页（仅备案用，可忽略）
/var/www/zhuiai/apk/         → APK 下载目录
```

### 3.2 nginx location 配置（参考）

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

### 3.3 常用 nginx 命令

```bash
# 测试配置
ssh root@149.129.227.54 "nginx -t"

# 重载配置
ssh root@149.129.227.54 "nginx -s reload"

# 查看配置
ssh root@149.129.227.54 "cat /etc/nginx/nginx.conf"
```

---

## 四、APK 打包发布

参考：[追AI 打包发布 SOP](https://github.com/anthropics/claude-code/blob/main/.claude/skills/release/SKILL.md)

### 4.1 构建 APK

```bash
cd /home/admin/zhuiai/frontend

# 构建前端（必须用 build:android，内置 CAPACITOR_BUILD=true）
npm run build:android
```

> **注意**：`npm run build` 是 Web 版，构建出的路径是 `/app/assets/`，不适用于 APK。APK 必须用 `npm run build:android`。

### 4.2 验证 APK 内置资源

构建后必须验证 APK 内的资源路径正确：

```bash
# APK 版 index.html 路径应该是 /assets/（不含 /app/）
unzip -p /home/admin/zhuiai/frontend/android/app/build/outputs/apk/release/app-release.apk \
  assets/public/index.html | grep -o 'src="/[^"]*' | head -1

# 应输出: src="/assets/index-*.js
# 如果看到 src="/app/assets/，说明构建命令错误
```

### 4.3 上传 APK 到托管

```python
import paramiko

host, user, password = "149.129.227.54", "root", "W199191w"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=30)
sftp = client.open_sftp()

APK_LOCAL = "/home/admin/zhuiai/frontend/android/app/build/outputs/apk/release/app-release.apk"
sftp.put(APK_LOCAL, "/var/www/zhuiai/apk/app-release.apk")
print("APK 已托管到 https://zhuiai.club/apk/app-release.apk")
client.close()
```

### 4.4 蒲公英备份（可选）

### 5.1 版本文件更新（三处必须同步）

| 文件 | 字段 |
|------|------|
| `frontend/src/utils/version.js` | `VERSION` / `BUILD` |
| `frontend/android/app/build.gradle` | `versionName` / `versionCode` |
| `backend/src/routes/version.js` | `latestVersion` / `buildNumber` / `minVersion` |

### 5.2 检查版本一致性

```bash
node /home/admin/zhuiai/scripts/check-version.js
```

---

## 六、快速验证清单

| 检查项 | 命令/操作 | 预期结果 |
|--------|----------|---------|
| 前端页面 | 访问 `https://zhuiai.club/admin` | 显示管理后台登录页 |
| API 健康 | `curl -s "https://zhuiai.club/api/version/check" \| jq .` | 返回版本信息 |
| 管理员登录 | 浏览器访问 `/admin`，输入 admin/admin123 | 登录成功跳转工作台 |
| APK 下载 | 访问 `https://zhuiai.club/apk/app-release.apk` | 弹出下载对话框 |

---

## 七、回滚操作

### 前端回滚

```python
# 找回之前的 dist 包（如果有备份）
sftp.put("/path/to/backup/dist.tar.gz", "/tmp/zhuiai-dist.tar.gz")
sin, sout, serr = client.exec_command(
    "rm -rf /var/www/zhuiai/app-spa/* && "
    "tar xzf /tmp/zhuiai-dist.tar.gz -C /var/www/zhuiai/app-spa/ && "
    "rm /tmp/zhuiai-dist.tar.gz"
)
```

### 后端回滚

```bash
# 查看 git 历史，找之前的 commit
ssh root@149.129.227.54 "cd /home/zhuiai/backend && git log --oneline -5"

# 回滚到指定版本
ssh root@149.129.227.54 "cd /home/zhuiai/backend && git checkout <commit-hash>"

# 重启服务
ssh root@149.129.227.54 "killall node; cd /home/zhuiai/backend && nohup node src/index.js > /var/log/zhuiai-backend.log 2>&1 &"
```

---

## 八、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 页面显示落地页 | nginx alias 指向错误目录 | 检查 nginx 配置，确保 alias 指向 app-spa |
| API 404 | 后端服务未启动 | ssh 到服务器检查 node 进程 |
| 登录跳转回登录页 | token 无效或过期 | 检查 localStorage 的 token，或重新登录 |
| APK 下载失败 | 文件不存在 | 检查 /var/www/zhuiai/apk/ 目录 |
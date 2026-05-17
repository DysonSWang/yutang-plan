# 追爱AI · SOP v3.0 更新总结

**更新日期**: 2026-05-16
**版本**: v3.0

---

## 更新内容

### 1. 目录结构（Symlink架构）

**问题**：之前 `backend/` 包含 `data/` 目录，每次升级需要 `cp -r data` 操作，容易出错和数据丢失。

**解决**：使用 symlink 解耦数据和代码：
```
/data/zhuiai/
├── backend/           # 代码（整体替换）
│   └── data → /data/zhuiai/data  # symlink
├── data/              # 独立数据目录
│   └── database.db
```

**优势**：
- 升级时 `backend/` 整体替换，数据不受影响
- 不需要 `cp -r data` 操作
- 简化回滚操作

---

### 2. 健康检查脚本（增强版 v3.0）

**新增功能**：
| 功能 | 说明 |
|------|------|
| 外部告警 | 接入 Bark/钉钉通知 |
| DB完整性 | `PRAGMA integrity_check` 检测 |
| I/O wait | 识别硬件问题 |
| 重启监控 | PM2 重启次数告警 |
| 磁盘监控 | 避免磁盘满 |

**通知渠道**：
```bash
# Bark（iOS推送）
curl -s "https://api.day.app/YOUR_BARK_KEY/追爱AI告警/$msg"

# 钉钉（群机器人）
curl -X POST "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"追爱AI告警: $msg\"}}"
```

---

### 3. Sentry错误追踪集成

**新增章节**：五、Sentry错误追踪集成

| 传统方式 | Sentry方式 |
|---------|-----------|
| 用户报bug才知道有问题 | 错误发生时立即通知 |
| 不知道影响多少用户 | 精确统计影响用户数 |
| 不知道错误堆栈 | 完整错误上下文+源码定位 |

**安装**：
```bash
cd /data/zhuiai/backend
npm install @sentry/node --save
```

---

### 4. 升级脚本更新

`upgrade.sh` 更新到 v3.0：
- 使用独立数据目录 `$DATA_DIR/database.db`
- 切换后验证 symlink 存在
- 备份前检查数据库完整性

---

## 待接入项（需要手动配置）

| 项目 | 操作 | 状态 |
|------|------|------|
| Bark通知 | 替换 `YOUR_BARK_KEY` | 待配置 |
| 钉钉通知 | 替换实际 access_token | 待配置 |
| Sentry | 替换实际 DSN | 待配置 |

---

## 告警阈值（基于生产运维框架）

| 指标 | 警告 | 紧急 |
|------|------|------|
| API延迟 | > 3s | > 5s |
| 错误率 | > 0.1% | > 1% |
| 内存使用 | > 70% | > 85% |
| 磁盘使用 | > 80% | > 90% |
| I/O wait | > 50% | > 70% |
| PM2重启 | > 3次 | > 5次 |

---

## 文件清单

| 文件 | 说明 |
|------|------|
| `/home/admin/zhuiai/docs/HOT_UPGRADE_SOP.md` | 热升级SOP v3.0 |
| `/home/admin/zhuiai/docs/DEPLOY_SOP.md` | 部署SOP（已同步） |
| `/data/zhuiai/health-check.sh` | 健康检查脚本（需部署） |
| `/data/zhuiai/ecosystem.config.js` | PM2配置 |

---

## 下一步

1. **配置告警渠道**：
   - 申请 Bark Key
   - 创建钉钉群机器人
   - 填入 health-check.sh

2. **接入 Sentry**：
   - 在 sentry.io 创建项目
   - 获取 DSN
   - 配置 index.js

3. **部署健康检查脚本**：
   ```bash
   scp health-check.sh ops@120.77.9.177:/data/zhuiai/health-check.sh
   ```
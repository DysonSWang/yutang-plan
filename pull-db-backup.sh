#!/bin/bash
# 从小里服务器拉取最新数据库备份
# 由 cron 触发，每天 3:30 执行（服务器 3:00 备份完再拉）

REMOTE=root@149.129.227.54
REMOTE_DIR=/home/zhuiai/backups
LOCAL_DIR=/home/admin/zhuiai/db-backups

mkdir -p "$LOCAL_DIR"

# 拉取今天最新的备份
TODAY=$(date +%Y%m%d)
scp "${REMOTE}:${REMOTE_DIR}/database_${TODAY}"*.db.gz "$LOCAL_DIR/" 2>/dev/null

PULLED=$(ls "$LOCAL_DIR"/database_${TODAY}*.db.gz 2>/dev/null | wc -l)
if [ "$PULLED" -gt 0 ]; then
  echo "[$(date)] 拉取成功"
else
  echo "[$(date)] 拉取失败" >&2
  exit 1
fi

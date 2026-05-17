#!/bin/bash
# 从大里服务器拉取最新数据库备份
# 执行时间: 每天凌晨 4:00（服务器 3:00 备份完再拉）

REMOTE="root@120.77.9.177"
REMOTE_DIR="/data/zhuiai/db-backups"
LOCAL_DIR="/home/admin/zhuiai/db-backups"

mkdir -p "$LOCAL_DIR"

# 拉取今天最新的备份
TODAY=$(date +%Y%m%d)
scp "${REMOTE}:${REMOTE_DIR}/database_${TODAY}"*.db.gz "$LOCAL_DIR/" 2>/dev/null

PULLED=$(ls "$LOCAL_DIR"/database_${TODAY}*.db.gz 2>/dev/null | wc -l)
if [ "$PULLED" -gt 0 ]; then
  echo "[$(date)] 拉取成功: $PULLED 个文件"
else
  # 如果今天没有，尝试拉取昨天的
  YESTERDAY=$(date -d "yesterday" +%Y%m%d)
  scp "${REMOTE}:${REMOTE_DIR}/database_${YESTERDAY}"*.db.gz "$LOCAL_DIR/" 2>/dev/null
  PULLED=$(ls "$LOCAL_DIR"/database_${YESTERDAY}*.db.gz 2>/dev/null | wc -l)
  if [ "$PULLED" -gt 0 ]; then
    echo "[$(date)] 拉取成功(昨日): $PULLED 个文件"
  else
    echo "[$(date)] 拉取失败: 未找到备份文件" >&2
    exit 1
  fi
fi

#!/bin/bash
# 追AI 后端部署脚本
# 用法: ./deploy-backend.sh
#
# 自动完成：代码上传 → 数据库同步 → Prisma 生成 → 重启服务

set -e

REMOTE="root@149.129.227.54"
REMOTE_DIR="/home/zhuiai/backend"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================="
echo "  追AI 后端部署"
echo "========================================="

# Step 1: 上传代码
echo ""
echo "[1/5] 上传代码到服务器..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'data/' \
  --exclude 'logs/' \
  --exclude '.env' \
  --exclude 'prisma/dev.db' \
  "$LOCAL_DIR/" "$REMOTE:$REMOTE_DIR/"

# Step 2: 上传 .env（排除在 rsync 之外，需要单独处理）
echo "[2/5] 检查 .env 同步..."
# 只上传 .env 如果服务器上还没有
ssh "$REMOTE" "test -f $REMOTE_DIR/.env || echo 'WARN: 服务器上缺少 .env 文件'"

# Step 3: 数据库 schema 同步（关键！）
echo "[3/5] 同步数据库 schema..."
ssh "$REMOTE" "cd $REMOTE_DIR && npx prisma db push --accept-data-loss --skip-generate"

# Step 4: 生成 Prisma Client
echo "[4/5] 生成 Prisma Client..."
ssh "$REMOTE" "cd $REMOTE_DIR && npx prisma generate"

# Step 5: 重启服务
echo "[5/5] 重启后端服务..."
ssh "$REMOTE" "
  cd $REMOTE_DIR
  # 找到并停止旧的 node 进程
  OLD_PID=\$(ps aux | grep 'node.*src/index.js' | grep -v grep | awk '{print \$2}')
  if [ -n \"\$OLD_PID\" ]; then
    echo \"停止旧进程 PID: \$OLD_PID\"
    kill \$OLD_PID
    sleep 2
  fi
  # 启动新进程
  nohup node $REMOTE_DIR/src/index.js > /dev/null 2>&1 &
  sleep 3
  # 验证
  NEW_PID=\$(ps aux | grep 'node.*src/index.js' | grep -v grep | awk '{print \$2}')
  if [ -n \"\$NEW_PID\" ]; then
    echo \"后端已重启，PID: \$NEW_PID\"
    # 快速健康检查
    HTTP_CODE=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3005/api/auth/login -X POST -H 'Content-Type: application/json' -d '{}')
    if [ \"\$HTTP_CODE\" = \"400\" ] || [ \"\$HTTP_CODE\" = \"401\" ]; then
      echo \"健康检查通过 (HTTP \$HTTP_CODE)\"
    else
      echo \"WARN: 健康检查异常 (HTTP \$HTTP_CODE)\"
    fi
  else
    echo \"ERROR: 后端启动失败！\"
    exit 1
  fi
"

echo ""
echo "========================================="
echo "  部署完成"
echo "========================================="

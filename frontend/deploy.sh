#!/bin/bash
# 追AI 前端部署脚本
# 用法: ./deploy.sh
#
# 自动完成：构建 → 清除旧 assets → 同步新文件

set -e

REMOTE="root@149.129.227.54"
REMOTE_DIR="/var/www/zhuiai/app-spa"

echo "========================================="
echo "  追AI 前端部署"
echo "========================================="

# Step 1: 构建
echo ""
echo "[1/3] 构建生产版本..."
cd "$(dirname "$0")"
npm run build

# Step 2: 清除旧 assets（关键！Vite hash 每次不同，不删会 404）
echo "[2/3] 清除旧 assets..."
ssh "$REMOTE" "rm -rf $REMOTE_DIR/assets"
echo "旧 assets 已删除"

# Step 3: 同步新文件
echo "[3/3] 同步到服务器..."
cd dist
tar -czf - . | ssh "$REMOTE" "cd $REMOTE_DIR && tar -xzf - --strip-components=1"

echo ""
echo "========================================="
echo "  前端部署完成"
echo "========================================="
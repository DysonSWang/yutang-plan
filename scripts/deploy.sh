#!/bin/bash
#
# 追爱AI 核心部署脚本 v1.0
# 用途：零停机热升级后端 + Web
# 使用：bash /home/admin/zhuiai/scripts/deploy.sh
# 依赖：deploy.sh 只调用本地命令，upload-apk.sh 负责 APK
#

set -e

# ============ 配置（固定值，勿修改）============
HOST="120.77.9.177"
USER="root"
PORT="22"
BACKEND_DIR="/data/zhuiai/backend"
DATA_DIR="/data/zhuiai/data"
WEB_DIR="/var/www/zhuiai/app-spa"
LOG_FILE="/tmp/deploy-$(date +%Y%m%d_%H%M%S).log"

# ============ 颜色 ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ============ 日志函数 ============
log()   { echo -e "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"; }
info()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}" | tee -a "$LOG_FILE"; }
warn()  { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}" | tee -a "$LOG_FILE"; }

# ============ 获取密码 ============
get_password() {
    if [ -n "$ZHUIAI_SERVER_PASSWORD" ]; then
        echo "$ZHUIAI_SERVER_PASSWORD"
    elif [ -f ~/.zhuiai-server-password ]; then
        cat ~/.zhuiai-server-password
    else
        echo "W199191w"  # fallback
    fi
}

PASSWORD=$(get_password)

# ============ SSH 执行 ============
ssh_cmd() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -p $PORT ${USER}@${HOST} "$1"
}

# ============ SCP 上传 ============
scp_file() {
    local local_path="$1"
    local remote_path="$2"
    sshpass -p "$PASSWORD" scp -o ConnectTimeout=30 -P $PORT "$local_path" ${USER}@${HOST}:"$remote_path"
}

# ============ 磁盘检查 ============
check_disk() {
    local usage=$(ssh_cmd "df -h / | tail -1 | awk '{print \$5}' | sed 's/%//'")
    log "磁盘使用率: ${usage}%"
    if [ "$usage" -gt 85 ]; then
        error "磁盘空间不足 (${usage}%)，部署中止"
        exit 1
    fi
    info "磁盘空间检查通过"
}

# ============ 数据库备份 ============
backup_db() {
    local ts=$(date +%Y%m%d_%H%M%S)
    local db_path="$DATA_DIR/database.db"
    log "备份数据库..."
    ssh_cmd "cp $db_path $DATA_DIR/database.preupgrade_${ts}.db"
    local result=$(ssh_cmd "sqlite3 $db_path 'PRAGMA integrity_check;'")
    if [ "$result" = "ok" ]; then
        info "数据库备份成功"
    else
        error "数据库完整性检查失败: $result"
        exit 1
    fi
}

# ============ 部署 Web ============
deploy_web() {
    log "部署 Web..."
    cd /home/admin/zhuiai/frontend
    tar czf /tmp/zhuiai-dist.tar.gz -C dist .
    scp_file /tmp/zhuiai-dist.tar.gz /tmp/
    ssh_cmd "rm -rf $WEB_DIR/* && tar xzf /tmp/zhuiai-dist.tar.gz -C $WEB_DIR/ && rm /tmp/zhuiai-dist.tar.gz && echo WEB_OK"
    info "Web 部署完成"
}

# ============ 部署后端 ============
deploy_backend() {
    log "部署后端..."
    cd /home/admin/zhuiai

    # 打包（排除 node_modules, .git, data, .env, *.db）
    tar czf /tmp/zhuiai-backend.tar.gz \
        --exclude=node_modules \
        --exclude=.git \
        --exclude=data \
        --exclude=.env \
        --exclude=prisma/data \
        --exclude=*.db \
        --exclude=coverage \
        backend

    scp_file /tmp/zhuiai-backend.tar.gz /tmp/

    # 解压到新目录
    ssh_cmd "cd $BACKEND_DIR && rm -rf backend.new && mkdir -p backend.new && tar xzf /tmp/zhuiai-backend.tar.gz -C backend.new --strip-components=1 && rm /tmp/zhuiai-backend.tar.gz && cp .env backend.new/.env && echo BACKEND_OK"

    # 安装依赖
    log "安装后端依赖..."
    ssh_cmd "cd $BACKEND_DIR/backend.new && npm install --production 2>&1 | tail -3 && npx prisma generate 2>&1 | tail -2 && echo DEP_OK"

    info "后端部署完成"
}

# ============ 切换版本 ============
switch_version() {
    log "切换版本..."
    ssh_cmd "cd $BACKEND_DIR && \
        rm -rf backend.bak2 2>/dev/null || true && \
        mv backend backend.bak2 2>/dev/null || true && \
        mv backend backend.bak1 2>/dev/null || true && \
        mv backend.new backend && \
        echo SWITCH_OK"

    # 强制重建 symlink（防止 tar 打包空目录）
    log "重建 data symlink..."
    ssh_cmd "[ -L backend/data ] && echo 'SYMLINK_EXISTS' || (rm -rf backend/data && ln -sf $DATA_DIR backend/data && echo 'SYMLINK_REBUILT')"
    ssh_cmd "ls -la $BACKEND_DIR/ | grep data"

    info "版本切换完成"
}

# ============ 重启服务 ============
restart_service() {
    log "重启 PM2 服务..."
    ssh_cmd "cd $BACKEND_DIR && pm2 start ecosystem.config.js --env production && sleep 3 && echo PM2_OK"
    info "服务重启完成"
}

# ============ 主流程 ============
main() {
    echo ""
    info "===== 追爱AI 部署脚本 v1.0 ====="
    echo ""

    check_disk
    backup_db
    deploy_web
    deploy_backend
    switch_version
    restart_service

    echo ""
    info "===== 部署完成 ====="
    info "日志: $LOG_FILE"
    echo ""
}

main "$@"
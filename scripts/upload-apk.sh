#!/bin/bash
#
# 追爱AI APK 上传脚本 v1.0
# 用途：构建并上传 APK 到服务器
# 使用：bash /home/admin/zhuiai/scripts/upload-apk.sh
#

set -e

# ============ 配置 ============
HOST="120.77.9.177"
USER="root"
PORT="22"
FRONTEND_DIR="/home/admin/zhuiai/frontend"
APK_DIR="$FRONTEND_DIR/android/app/build/outputs/apk/release"

# ============ 颜色 ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ============ 日志函数 ============
log()   { echo -e "[$(date '+%H:%M:%S')] $1"; }
info()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
error() { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}"; exit 1; }

# ============ 获取密码 ============
get_password() {
    if [ -n "$ZHUIAI_SERVER_PASSWORD" ]; then
        echo "$ZHUIAI_SERVER_PASSWORD"
    elif [ -f ~/.zhuiai-server-password ]; then
        cat ~/.zhuiai-server-password
    else
        echo "W199191w"
    fi
}

PASSWORD=$(get_password)

# ============ SCP 上传 ============
scp_file() {
    sshpass -p "$PASSWORD" scp -o ConnectTimeout=30 -P $PORT "$1" ${USER}@${HOST}:"$2"
}

ssh_cmd() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -p $PORT ${USER}@${HOST} "$1"
}

# ============ 主流程 ============
main() {
    echo ""
    log "===== 追爱AI APK 上传脚本 v1.0 ====="
    echo ""

    # 1. 清理缓存
    log "清理缓存..."
    rm -rf $FRONTEND_DIR/dist
    rm -rf $FRONTEND_DIR/android/app/src/main/assets/public
    rm -rf $FRONTEND_DIR/android/app/build

    # 2. 构建 Web
    log "构建 Web..."
    cd $FRONTEND_DIR && npm run build

    # 3. 同步到 Android
    log "同步到 Android..."
    npx cap sync android

    # 4. 构建 APK
    log "构建 APK..."
    cd $FRONTEND_DIR/android && ./gradlew assembleRelease

    # 5. 重命名为 zhuiai.apk
    log "重命名 APK..."
    cp $APK_DIR/app-release.apk $APK_DIR/zhuiai.apk

    # 6. 上传到服务器
    log "上传 APK..."
    scp_file $APK_DIR/zhuiai.apk /var/www/zhuiai/apk/zhuiai.apk

    # 7. 清理服务器旧 APK，保留 zhuiai.apk
    log "清理旧版本..."
    ssh_cmd "cd /var/www/zhuiai/apk && rm -f app-release.apk app.apk && ln -sf zhuiai.apk app.apk" 2>/dev/null || true

    info "APK 上传完成: https://zhuiai.club/apk/zhuiai.apk"
}

main "$@"
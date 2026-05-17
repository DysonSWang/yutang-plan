#!/bin/bash
#
# 追爱AI 部署验证脚本 v1.0
# 用途：验证 Web + API + 核心接口（登录）是否正常
# 使用：bash /home/admin/zhuiai/scripts/verify.sh
#

set -e

# ============ 配置 ============
DOMAIN="https://zhuiai.club"

# ============ 颜色 ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ============ 日志函数 ============
log()   { echo -e "[$(date '+%H:%M:%S')] $1"; }
info()  { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}"; }
error() { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}"; }

# ============ 验证函数 ============
check_url() {
    local name="$1"
    local url="$2"
    local expected_code="${3:-200}"

    log "检查: $name"
    local code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url")
    if [ "$code" = "$expected_code" ]; then
        info "$name 正常 (HTTP $code)"
        return 0
    else
        error "$name 失败 (HTTP $code)"
        return 1
    fi
}

check_json_api() {
    local name="$1"
    local url="$2"
    local method="${3:-GET}"
    local body="$4"

    log "检查: $name"

    local response
    if [ "$method" = "POST" ]; then
        response=$(curl -s -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "$body" \
            --max-time 10)
    else
        response=$(curl -s "$url" --max-time 10)
    fi

    # 检查是否返回有效 JSON（包含 "success" 或 "code"）
    if echo "$response" | grep -q '"success"\|"code"'; then
        info "$name 正常"
        echo "    响应: $(echo $response | head -c 100)..."
        return 0
    else
        error "$name 失败"
        echo "    响应: $response"
        return 1
    fi
}

# ============ 主流程 ============
main() {
    echo ""
    log "===== 追爱AI 验证脚本 v1.0 ====="
    echo ""

    local failed=0

    # 1. Web 主页
    check_url "Web 主页" "$DOMAIN/app/" || failed=$((failed+1))

    # 2. API 版本检查
    check_json_api "API 版本检查" "$DOMAIN/api/version/check" || failed=$((failed+1))

    # 3. 核心接口：登录（依赖数据库）⚠️
    check_json_api "登录接口（核心）" "$DOMAIN/api/auth/login" "POST" '{"phone":"test","password":"test"}' || failed=$((failed+1))

    # 4. APK 文件
    check_url "APK 下载" "$DOMAIN/apk/zhuiai.apk" || failed=$((failed+1))

    echo ""
    if [ $failed -eq 0 ]; then
        info "===== 所有验证通过 ====="
        exit 0
    else
        error "===== $failed 项验证失败 ====="
        exit 1
    fi
}

main "$@"
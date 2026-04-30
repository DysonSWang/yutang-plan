# 追爱AI APK 发布指南

## 版本信息

| 配置项 | 值 | 说明 |
|--------|---|------|
| 应用名称 | 追爱AI | |
| 包名 | com.zhuiai.app | |
| 下载平台 | 蒲公英 | https://www.pgyer.com |
| 最新版本 | 1.0.1 | |

---

## 一、版本更新流程

### 1.1 修改后端版本配置

文件位置：`backend/src/routes/version.js`

```javascript
const VERSION_CONFIG = {
  latestVersion: '1.0.2',           // 最新版本号（必须修改）
  minVersion: '1.0.0',              // 强制升级版本，低于此版本必须更新
  downloadUrl: 'https://www.pgyer.com/zhuiaiai',
  updateDescription: '1. 新增XXX功能\n2. 修复XXX问题\n3. 优化体验',
  buildNumber: 4                    // 递增（用于区分同一版本的多次上传）
};
```

### 1.2 构建前端

```bash
cd /home/admin/zhuiai/frontend
npm run build
```

### 1.3 同步到 Capacitor

```bash
npx cap sync android
```

### 1.4 构建 APK

```bash
cd /home/admin/zhuiai/frontend/android

# 设置环境变量
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=/home/admin/android-sdk

# Debug 版本（可调试）
./gradlew assembleDebug

# Release 版本（正式发布）
./gradlew assembleRelease
```

### 1.5 上传到蒲公英

```bash
# 获取 APK 文件路径
APK_PATH="/home/admin/zhuiai/frontend/android/app/build/outputs/apk/release/app-release-unsigned.apk"

# 上传到蒲公英
curl -X POST \
  -F "file=@${APK_PATH}" \
  -F "uKey=3e311caa422730d4aab2619e9a879dc2" \
  -F "_api_key=18f6e9b73043917c2c229951ade52ff7" \
  -F "buildUpdateDescription=1. 新增XXX功能\n2. 修复XXX问题" \
  -F "buildVersion=1.0.2" \
  -F "buildVersionNo=4" \
  https://www.pgyer.com/apiv2/app/upload
```

### 1.6 重启后端

```bash
cd /home/admin/zhuiai/backend
npm run dev
```

---

## 二、版本检测机制

### 2.1 升级类型

| 类型 | 触发条件 | 用户操作 |
|------|---------|---------|
| 强制升级 | 当前版本 < minVersion | 必须更新，无法关闭弹窗 |
| 建议升级 | 当前版本 < latestVersion | 可选择"稍后再说" |
| 无需升级 | 当前版本 >= latestVersion | 无提示 |

### 2.2 前端版本号

文件位置：`frontend/src/utils/version.js`

```javascript
const VERSION = '1.0.1';  // 当前 App 版本
const BUILD = 1;          // 构建号
```

**重要**：前端 VERSION 必须与后端 latestVersion 配合使用。

### 2.3 用户升级入口

1. **启动时自动检测**：App 打开时自动检测，有更新则弹窗
2. **我的页面手动检测**：我的 → 检查更新

---

## 三、蒲公英分发

### 3.1 下载地址

| 类型 | 链接 |
|------|------|
| 短链接 | https://www.pgyer.com/zhuiaiai |
| 下载二维码 | 蒲公英后台生成 |

### 3.2 用户安装流程

```
1. 打开下载链接或扫码
2. 点击"直接下载"
3. Android 提示开启"未知来源安装"权限
4. 安装后打开即可
```

### 3.3 API 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| file | APK 文件 | @app-release.apk |
| uKey | 用户 Key | 3e311caa422730d4aab2619e9a879dc2 |
| _api_key | API Key | 18f6e9b73043917c2c229951ade52ff7 |
| buildUpdateDescription | 更新说明 | 支持多行，用\n分隔 |
| buildVersion | 版本号 | 1.0.2 |
| buildVersionNo | 版本序号 | 递增数字 |

---

## 四、自动化脚本（可选）

创建 `/home/admin/zhuiai/scripts/release.sh`：

```bash
#!/bin/bash
set -e

# 配置
VERSION=${1:-"1.0.2"}
BUILD_NO=${2:-"4"}
APK_SOURCE="/home/admin/zhuiai/frontend/android/app/build/outputs/apk/release/app-release-unsigned.apk"
APK_DEST="/home/admin/zhuiai/frontend/zhuiai-app-${VERSION}.apk"

echo "=== 追爱AI APK 发布脚本 ==="
echo "版本: ${VERSION}"
echo "构建号: ${BUILD_NO}"

# 1. 修改后端版本（需要手动编辑 version.js）

# 2. 构建前端
echo ">>> 构建前端..."
cd /home/admin/zhuiai/frontend
npm run build

# 3. 同步到 Android
echo ">>> 同步到 Capacitor..."
npx cap sync android

# 4. 构建 APK
echo ">>> 构建 APK..."
cd /home/admin/zhuiai/frontend/android
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=/home/admin/android-sdk
./gradlew assembleRelease

# 5. 复制 APK
echo ">>> 复制 APK..."
cp ${APK_SOURCE} ${APK_DEST}

# 6. 上传到蒲公英
echo ">>> 上传到蒲公英..."
curl -X POST \
  -F "file=@${APK_DEST}" \
  -F "uKey=3e311caa422730d4aab2619e9a879dc2" \
  -F "_api_key=18f6e9b73043917c2c229951ade52ff7" \
  -F "buildUpdateDescription=版本更新" \
  -F "buildVersion=${VERSION}" \
  -F "buildVersionNo=${BUILD_NO}" \
  https://www.pgyer.com/apiv2/app/upload

echo "=== 发布完成 ==="
echo "下载链接: https://www.pgyer.com/zhuiaiai"
```

使用方式：
```bash
chmod +x /home/admin/zhuiai/scripts/release.sh
./release.sh 1.0.2 4
```

---

## 五、常见问题

### Q1: 用户看不到更新提示？

1. 检查后端是否重启
2. 检查前端 VERSION 是否与后端 latestVersion 匹配
3. 确认用户网络正常

### Q2: 蒲公英上传失败？

1. 检查 APK 文件是否存在
2. 检查 API Key 是否正确
3. 检查网络代理设置

### Q3: 如何回滚版本？

1. 修改 `version.js` 中的 `latestVersion` 为旧版本
2. 重启后端
3. 用户打开 App 会收到降级提示

### Q4: 如何强制所有用户更新？

设置 `minVersion` 为当前线上版本+1，例如：
```javascript
minVersion: '1.0.1'  // 所有低于 1.0.1 的版本必须更新
```

---

## 六、文件清单

| 文件 | 说明 |
|------|------|
| `backend/src/routes/version.js` | 版本检测接口 |
| `frontend/src/utils/version.js` | 前端版本配置 |
| `frontend/src/components/VersionUpdateModal.jsx` | 更新弹窗组件 |
| `frontend/src/App.jsx` | 启动时版本检测 |
| `frontend/src/pages/client/ClientProfile.jsx` | 手动检查更新入口 |

---

## 七、版本历史

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| 1.0.0 | 2026-04-30 | 初始版本 |
| 1.0.1 | 2026-04-30 | 新增版本检测功能，支持强制/建议升级 |

---

*最后更新：2026-04-30*

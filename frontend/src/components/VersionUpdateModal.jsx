import { Modal, ModalOverlay, ModalContent, ModalBody, ModalFooter, Button, Text, VStack, Flex, Progress, Box } from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { CapDownloader } from '@bricks-soft/cap-downloader';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { captureError } from '../utils/frontendErrorCapture';

function isDirectApkUrl(url) {
  return url && (url.endsWith('.apk') || url.includes('/download/') || url.includes('cdn-'));
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function VersionUpdateModal({ isOpen, onClose, upgradeType, latestVersion, updateDescription, downloadUrl, onForceUpdate }) {
  const isForce = upgradeType === 'force';
  const isSilent = upgradeType === 'silent';
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bytesDownloaded, setBytesDownloaded] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [error, setError] = useState(null);
  const [downloadCompleted, setDownloadCompleted] = useState(false);

  // 监听下载进度事件
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener;
    const setupListener = async () => {
      listener = await CapDownloader.addListener('downloadProgress', (event) => {
        if (event.status === 'downloading') {
          setProgress(event.progress || 0);
          setBytesDownloaded(event.bytesDownloaded || 0);
          setBytesTotal(event.bytesTotal || 0);
        } else if (event.status === 'completed') {
          setDownloading(false);
          setDownloadCompleted(true);
          // 非强制更新时关闭弹窗
          if (!isForce) {
            setTimeout(() => onClose(), 2000);
          }
        } else if (event.status === 'failed') {
          setDownloading(false);
          setError('下载失败，请重试');
        } else if (event.status === 'need_permission') {
          setDownloading(false);
          if (event.permission === 'install_unknown') {
            setError('请先开启「允许安装未知来源应用」权限，然后重试');
          } else if (event.permission === 'notification') {
            setError('建议开启通知权限，以便后台下载时接收进度提醒');
          }
        } else if (event.status === 'started') {
          // 下载已开始，等待进度事件
        }
      });
    };

    setupListener();

    return () => {
      if (listener) listener.remove();
    };
  }, [isForce, onClose]);

  // 监听 App 恢复前台事件，检查是否已安装
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener;
    const setupListener = async () => {
      listener = await App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive && downloadCompleted) {
          // App 回到前台，检查版本号是否已更新
          try {
            const info = await App.getInfo();
            if (info.version === latestVersion) {
              // 已安装新版本，关闭弹窗
              setDownloadCompleted(false);
              onClose();
            }
          } catch (err) {
            // 忽略错误
          }
        }
      });
    };

    setupListener();

    return () => {
      if (listener) listener.remove();
    };
  }, [downloadCompleted, latestVersion, onClose]);

  const handleUpdate = async () => {
    // 非直链 URL → 用系统浏览器打开
    if (!isDirectApkUrl(downloadUrl)) {
      await Browser.open({ url: downloadUrl });
      if (!isForce) onClose();
      return;
    }

    // 非原生平台 → 跳转浏览器
    if (!Capacitor.isNativePlatform()) {
      await Browser.open({ url: downloadUrl });
      if (!isForce) onClose();
      return;
    }

    setDownloading(true);
    setError(null);
    setProgress(0);
    setBytesDownloaded(0);
    setBytesTotal(0);
    setDownloadCompleted(false);

    try {
      const filename = `zhuiai-${latestVersion}.apk`;

      // 使用 Android DownloadManager 下载，支持后台下载 + 通知栏进度
      await CapDownloader.downloadAndInstall({
        url: downloadUrl,
        filename: filename,
        title: '追AI 更新包',
        mimetype: 'application/vnd.android.package-archive',
      });

      // 下载完成，通知栏会提示安装
      setDownloading(false);
      setDownloadCompleted(true);
    } catch (err) {
      setDownloading(false);
      // 下载或安装失败，跳转浏览器作为 fallback
      await Browser.open({ url: downloadUrl });
      if (!isForce) onClose();
      captureError(err, { context: 'apk_download_install', downloadUrl });
    }
  };

  const handleCancel = async () => {
    if (downloading) {
      try {
        await CapDownloader.cancelDownload();
      } catch (err) {
        // 忽略取消错误
      }
    }
    setDownloading(false);
    setProgress(0);
    setBytesDownloaded(0);
    setBytesTotal(0);
    setDownloadCompleted(false);
  };

  const handleLater = () => {
    if (downloading) {
      // 正在下载时，允许后台继续下载
      onClose();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isForce ? () => {} : handleLater}
      closeOnOverlayClick={!isForce}
      closeOnEsc={!isForce}
      isCentered
      size="sm"
    >
      <ModalOverlay bg="blackAlpha.800" />
      <ModalContent
        bg="warm.900"
        border="1px solid"
        borderColor="warm.700"
        borderRadius="16px"
        mx={4}
      >
        <ModalBody p={6}>
          <VStack spacing={4} align="center">
            {/* 更新图标 */}
            <Flex
              w="64px"
              h="64px"
              borderRadius="full"
              bgGradient="linear(135deg, gold.500, gold.400)"
              align="center"
              justify="center"
              boxShadow="0 4px 20px rgba(226,176,68,0.3)"
              position="relative"
              overflow="hidden"
            >
              <Box position="absolute" top={0} left={0} right={0} h="50%" bg="rgba(255,255,255,0.15)" borderRadius="full" />
              <Text fontSize="3xl" position="relative" zIndex={1}>
                {downloadCompleted ? '✅' : '⬆️'}
              </Text>
            </Flex>

            {/* 标题 */}
            <Text
              color="white"
              fontSize="xl"
              fontWeight="bold"
              textAlign="center"
            >
              {downloadCompleted
                ? '下载完成'
                : isForce
                  ? '必须更新'
                  : '发现新版本'}
            </Text>

            {/* 版本号 */}
            <Text
              color="rgba(245,240,232,0.4)"
              fontSize="sm"
            >
              V{latestVersion}
            </Text>

            {/* 更新说明 */}
            {!downloading && !downloadCompleted && (
              <Text
                color="rgba(245,240,232,0.6)"
                fontSize="sm"
                textAlign="center"
                lineHeight="1.6"
              >
                {updateDescription || '修复问题，提升性能'}
              </Text>
            )}

            {/* 下载进度 */}
            {downloading && (
              <VStack w="100%" spacing={2}>
                <Text color="rgba(245,240,232,0.5)" fontSize="xs">
                  {progress > 0
                    ? `正在下载 ${progress}%`
                    : '正在准备下载...'}
                </Text>
                <Progress
                  value={progress}
                  isIndeterminate={progress === 0}
                  w="100%"
                  size="sm"
                  colorScheme="gold"
                  borderRadius="full"
                />
                {bytesTotal > 0 && (
                  <Text color="rgba(245,240,232,0.4)" fontSize="xs">
                    {formatBytes(bytesDownloaded)} / {formatBytes(bytesTotal)}
                  </Text>
                )}
                <Text color="rgba(245,240,232,0.3)" fontSize="xs">
                  下载完成后会通知您安装
                </Text>
              </VStack>
            )}

            {/* 下载完成 */}
            {downloadCompleted && (
              <VStack w="100%" spacing={2}>
                <Text color="rgba(245,240,232,0.6)" fontSize="sm" textAlign="center">
                  新版本已下载完成
                </Text>
                <Text color="rgba(245,240,232,0.4)" fontSize="xs" textAlign="center">
                  请在通知栏点击安装，或等待自动安装
                </Text>
              </VStack>
            )}

            {/* 下载错误或权限提示 */}
            {error && (
              <Text
                color={error.includes('权限') ? 'rgba(226,176,68,0.9)' : 'rgba(240,120,100,0.9)'}
                fontSize="xs"
                textAlign="center"
                bg={error.includes('权限') ? 'rgba(226,176,68,0.1)' : 'rgba(220,80,60,0.1)'}
                p={2}
                borderRadius="8px"
                w="100%"
              >
                {error}
              </Text>
            )}

            {/* 强制升级提示 */}
            {isForce && !downloading && !downloadCompleted && (
              <Text
                color="rgba(240,120,100,0.9)"
                fontSize="xs"
                textAlign="center"
                bg="rgba(220,80,60,0.1)"
                p={2}
                borderRadius="8px"
                w="100%"
              >
                当前版本过低，无法继续使用，请更新后重试
              </Text>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter px={6} pb={6}>
          <VStack spacing={3} w="100%">
            {!downloadCompleted && (
              <Button
                w="100%"
                size="md"
                bgGradient="linear(135deg, gold.500, gold.400)"
                color="warm.950"
                fontWeight="500"
                borderRadius="12px"
                _hover={{ transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(226,176,68,0.3)' }}
                onClick={downloading ? handleCancel : handleUpdate}
                isLoading={false}
              >
                {downloading
                  ? '取消下载'
                  : error?.includes('权限')
                    ? '重试下载'
                    : isDirectApkUrl(downloadUrl)
                      ? '直接下载 APK'
                      : '前往下载页面'}
              </Button>
            )}

            {!isForce && !downloading && (
              <Button
                w="100%"
                size="sm"
                variant="ghost"
                color="rgba(245,240,232,0.6)"
                onClick={handleLater}
                _hover={{ color: 'rgba(245,240,232,0.8)' }}
              >
                {downloading ? '后台下载' : '稍后再说'}
              </Button>
            )}
          </VStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

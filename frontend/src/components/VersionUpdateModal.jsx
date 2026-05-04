import { Modal, ModalOverlay, ModalContent, ModalBody, ModalFooter, Button, Text, VStack, Flex, Progress, Box } from '@chakra-ui/react';
import { useState } from 'react';
import { CapDownloader } from '@bricks-soft/cap-downloader';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { Browser } from '@capacitor/browser';
import { captureError } from '../utils/frontendErrorCapture';

function isDirectApkUrl(url) {
  return url && (url.endsWith('.apk') || url.includes('/download/') || url.includes('cdn-'));
}

export default function VersionUpdateModal({ isOpen, onClose, upgradeType, latestVersion, updateDescription, downloadUrl, onForceUpdate }) {
  const isForce = upgradeType === 'force';
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const handleUpdate = async () => {
    // 非直链 URL → 用系统浏览器打开
    if (!isDirectApkUrl(downloadUrl)) {
      await Browser.open({ url: downloadUrl });
      if (!isForce) onClose();
      return;
    }

    setDownloading(true);
    setError(null);
    setProgress(0);

    try {
      const filename = `zhuiai-${latestVersion}.apk`;

      // 使用 Android DownloadManager 下载（应用内，不跳浏览器）
      const result = await CapDownloader.download({
        url: downloadUrl,
        filename: filename,
        title: '追AI 更新包',
        mimetype: 'application/vnd.android.package-archive',
      });

      // 下载完成，打开 APK 安装
      await FileOpener.openFile({
        path: result.path,
        contentType: 'application/vnd.android.package-archive',
      });

      setDownloading(false);
      if (!isForce) onClose();
    } catch (err) {
      setDownloading(false);
      // 下载失败，跳转浏览器作为 fallback
      await Browser.open({ url: downloadUrl });
      if (!isForce) onClose();
      captureError(err, { context: 'apk_download_install', downloadUrl });
    }
  };

  const handleCancel = () => {
    setDownloading(false);
    setError(null);
    setProgress(0);
  };

  const handleLater = () => {
    onClose();
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
              <Text fontSize="3xl" position="relative" zIndex={1}>⬆️</Text>
            </Flex>

            {/* 标题 */}
            <Text
              color="white"
              fontSize="xl"
              fontWeight="bold"
              textAlign="center"
            >
              {isForce ? '必须更新' : '发现新版本'}
            </Text>

            {/* 版本号 */}
            <Text
              color="rgba(245,240,232,0.4)"
              fontSize="sm"
            >
              V{latestVersion}
            </Text>

            {/* 更新说明 */}
            <Text
              color="rgba(245,240,232,0.6)"
              fontSize="sm"
              textAlign="center"
              lineHeight="1.6"
            >
              {updateDescription || '修复问题，提升性能'}
            </Text>

            {/* 下载进度 */}
            {downloading && (
              <VStack w="100%" spacing={2}>
                <Text color="rgba(245,240,232,0.5)" fontSize="xs">
                  正在下载{progress > 0 ? ` ${progress}%` : '...'}
                </Text>
                <Progress
                  value={progress}
                  isIndeterminate={progress === 0}
                  w="100%"
                  size="sm"
                  colorScheme="gold"
                  borderRadius="full"
                />
              </VStack>
            )}

            {/* 下载错误 */}
            {error && (
              <Text
                color="rgba(240,120,100,0.9)"
                fontSize="xs"
                textAlign="center"
                bg="rgba(220,80,60,0.1)"
                p={2}
                borderRadius="8px"
                w="100%"
              >
                {error}
              </Text>
            )}

            {/* 强制升级提示 */}
            {isForce && !downloading && (
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
                : isDirectApkUrl(downloadUrl)
                  ? '直接下载 APK'
                  : '前往下载页面'}
            </Button>

            {!isForce && !downloading && (
              <Button
                w="100%"
                size="sm"
                variant="ghost"
                color="rgba(245,240,232,0.6)"
                onClick={handleLater}
                _hover={{ color: 'rgba(245,240,232,0.8)' }}
              >
                稍后再说
              </Button>
            )}
          </VStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

import { Modal, ModalOverlay, ModalContent, ModalBody, ModalFooter, Button, Text, VStack, Flex, Progress } from '@chakra-ui/react';
import { useState } from 'react';
import { Http } from '@capacitor-community/http';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { captureError } from '../utils/frontendErrorCapture';

export default function VersionUpdateModal({ isOpen, onClose, upgradeType, latestVersion, updateDescription, downloadUrl, onForceUpdate }) {
  const isForce = upgradeType === 'force';
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const handleUpdate = async () => {
    setDownloading(true);
    setError(null);
    setProgress(0);

    try {
      // 1. 直接下载 APK 到手机
      const downloadResult = await Http.downloadFile({
        url: downloadUrl,
        filePath: `zhuiai-${latestVersion}.apk`,
        fileDirectory: Directory.Documents,
        method: 'GET',
        progress: true,
        progressCallback: (data) => {
          if (data.totalExpected && data.totalReceived) {
            setProgress(Math.round((data.totalReceived / data.totalExpected) * 100));
          }
        },
      });

      // 2. 打开 APK 触发系统安装
      await FileOpener.openFile({
        path: downloadResult.path,
        contentType: 'application/vnd.android.package-archive',
      });

      setDownloading(false);
    } catch (err) {
      setDownloading(false);
      setError(err.message || '下载失败，请稍后重试');
      captureError(err, { context: 'apk_download_install' });
    }
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
              bg="gold.500"
              align="center"
              justify="center"
              boxShadow="0 4px 20px rgba(0,212,170,0.3)"
            >
              <Text fontSize="3xl">🚀</Text>
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
                  正在下载 {progress}%
                </Text>
                <Progress
                  value={progress}
                  w="100%"
                  size="sm"
                  colorScheme="gold"
                  borderRadius="full"
                  sx={{
                    'div[role="progressbar"]': {
                      background: 'linear-gradient(135deg, #00d4aa, #00e0b8)',
                    },
                  }}
                />
              </VStack>
            )}

            {/* 下载错误 */}
            {error && (
              <Text
                color="red.400"
                fontSize="xs"
                textAlign="center"
                bg="red.900"
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
                color="red.400"
                fontSize="xs"
                textAlign="center"
                bg="red.900"
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
              _hover={{ transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,212,170,0.3)' }}
              onClick={handleUpdate}
              isLoading={downloading}
              loadingText={downloading ? `下载中 ${progress}%` : ''}
              disabled={downloading}
            >
              {isForce ? '立即下载并安装' : '直接下载 APK'}
            </Button>

            {!isForce && !downloading && (
              <Button
                w="100%"
                size="sm"
                variant="ghost"
                color="rgba(245,240,232,0.2)"
                onClick={handleLater}
                _hover={{ color: 'rgba(245,240,232,0.6)' }}
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

import { Modal, ModalOverlay, ModalContent, ModalBody, ModalFooter, Button, Text, VStack, Flex } from '@chakra-ui/react';

export default function VersionUpdateModal({ isOpen, onClose, upgradeType, latestVersion, updateDescription, downloadUrl, onForceUpdate }) {
  const isForce = upgradeType === 'force';

  const handleUpdate = () => {
    window.open(downloadUrl, '_blank');
    if (isForce) {
      // 强制升级：打开下载页后不关闭弹窗
    } else {
      onClose();
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

            {/* 强制升级提示 */}
            {isForce && (
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
            >
              {isForce ? '立即更新' : '去下载'}
            </Button>

            {!isForce && (
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

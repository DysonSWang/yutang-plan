/**
 * 闪图查看器 — 满屏显示图片，支持闪图模式（5秒倒计时）和普通模式
 * 闪图模式：点击查看 → 满屏显示 → 5秒倒计时 → 自动burn
 * 普通模式：点击查看 → 满屏显示 → 手动关闭
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, Flex, Image, IconButton } from '@chakra-ui/react';
import { chat } from '../utils/api';

export default function FlashImageViewer({ isOpen, onClose, imageUrl, messageId, isFlashMode = false }) {
  const [remaining, setRemaining] = useState(5);
  const timerRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const handleBurn = useCallback(async () => {
    if (!messageId) return;
    try {
      await chat.burn(messageId);
    } catch (e) {
      console.error('[FlashImage] 销毁失败:', e);
    }
    onCloseRef.current();
  }, [messageId]);

  useEffect(() => {
    if (!isOpen) return;
    setRemaining(5);

    if (isFlashMode) {
      // 闪图模式：5秒倒计时
      timerRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleBurn();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isFlashMode, handleBurn]);

  const handleClose = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Flex
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg="blackAlpha.950"
      zIndex={9999}
      align="center"
      justify="center"
      direction="column"
      onClick={handleClose}
    >
      {/* 顶部信息 */}
      {isFlashMode && (
        <Flex
          position="absolute"
          top={6}
          align="center"
          gap={2}
          bg="blackAlpha.600"
          px={4}
          py={2}
          borderRadius="full"
        >
          <Text fontSize="lg">⚡</Text>
          <Text color="yellow.300" fontWeight="bold" fontSize="md">闪图</Text>
          <Text color="white" fontSize="md" fontWeight="bold" ml={2}>
            {remaining}s
          </Text>
        </Flex>
      )}

      {/* 关闭按钮 */}
      <IconButton
        position="absolute"
        top={4}
        right={4}
        icon={<Text fontSize="lg">✕</Text>}
        variant="ghost"
        color="white"
        _hover={{ bg: 'whiteAlpha.200' }}
        onClick={handleClose}
        aria-label="关闭"
        borderRadius="full"
        size="sm"
      />

      {/* 图片 */}
      <Image
        src={imageUrl}
        alt={isFlashMode ? "闪图" : "图片"}
        maxW="95vw"
        maxH="90vh"
        objectFit="contain"
        borderRadius="lg"
        onClick={e => e.stopPropagation()}
        boxShadow={isFlashMode ? "0 0 60px rgba(255,200,0,0.15)" : "0 4px 30px rgba(0,0,0,0.5)"}
      />

      {/* 底部提示 */}
      <Text
        position="absolute"
        bottom={6}
        color="whiteAlpha.500"
        fontSize="xs"
      >
        {isFlashMode
          ? `点击任意处关闭 · ${remaining}s后自动销毁`
          : '点击任意处关闭'}
      </Text>

      {/* 进度条（仅闪图模式） */}
      {isFlashMode && (
        <Box
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          h="3px"
          bg="whiteAlpha.200"
        >
          <Box
            h="100%"
            bg="yellow.400"
            w={`${(remaining / 5) * 100}%`}
            transition="width 1s linear"
          />
        </Box>
      )}
    </Flex>
  );
}

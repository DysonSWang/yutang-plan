/**
 * 闪图查看器 — 满屏显示图片，5秒后自动销毁
 * 类似QQ闪图：点击查看 → 满屏显示 → 5秒倒计时 → 自动burn
 */
import { useState, useEffect, useRef } from 'react';
import { Box, Text, Flex, Image, IconButton } from '@chakra-ui/react';
import { chat } from '../utils/api';

export default function FlashImageViewer({ isOpen, onClose, imageUrl, messageId, senderRole }) {
  const [remaining, setRemaining] = useState(5);
  const timerRef = useRef(null);
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

  useEffect(() => {
    if (!isOpen) return;

    setRemaining(5);
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

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  const handleBurn = async () => {
    if (!messageId) return;
    try {
      await chat.burn(messageId);
    } catch (e) {
      console.error('[FlashImage] 销毁失败:', e);
    }
    onClose();
  };

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
      {/* 闪图提示 */}
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
        src={`${API_BASE}${imageUrl}`}
        alt="闪图"
        maxW="90vw"
        maxH="85vh"
        objectFit="contain"
        borderRadius="lg"
        onClick={e => e.stopPropagation()}
        boxShadow="0 0 60px rgba(255,200,0,0.15)"
      />

      {/* 底部提示 */}
      <Text
        position="absolute"
        bottom={6}
        color="whiteAlpha.500"
        fontSize="xs"
      >
        点击任意处关闭 · {remaining}s后自动销毁
      </Text>

      {/* 进度条 */}
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
    </Flex>
  );
}

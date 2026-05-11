/**
 * 闪图查看器 — 阅后即焚消息满屏查看器
 * 点击查看 → 满屏显示 → 倒计时 → 时间到自动销毁
 * 关闭查看器/切换页面不会停止倒计时，时间到仍会被销毁
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, Flex, VStack, Button, IconButton, Spinner } from '@chakra-ui/react';
import { chat } from '../utils/api';
import { captureError } from '../utils/frontendErrorCapture';

// sessionStorage 持久化：刷新页面/切换路由后倒计时不丢失
const BURN_KEY_PREFIX = 'flash_burn_';

function getBurnEntry(messageId) {
  if (!messageId) return null;
  try {
    const raw = sessionStorage.getItem(BURN_KEY_PREFIX + messageId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function setBurnEntry(messageId, entry) {
  if (!messageId) return;
  try { sessionStorage.setItem(BURN_KEY_PREFIX + messageId, JSON.stringify(entry)); } catch {}
}

function delBurnEntry(messageId) {
  if (!messageId) return;
  try { sessionStorage.removeItem(BURN_KEY_PREFIX + messageId); } catch {}
}

function getPendingBurn(messageId) {
  if (!messageId) return null;
  const entry = getBurnEntry(messageId);
  if (!entry) return null;
  const now = Date.now();
  if (now >= entry.deadline) {
    delBurnEntry(messageId);
    return { expired: true };
  }
  return {
    expired: false,
    remaining: Math.ceil((entry.deadline - now) / 1000),
    totalDuration: entry.totalDuration,
  };
}

export default function FlashImageViewer({ isOpen, onClose, imageUrl, messageId, isBurnAfterRead = false, burnAfterSeconds = 5, mediaType = 'image' }) {
  const [remaining, setRemaining] = useState(5);
  const [totalDuration, setTotalDuration] = useState(5);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const timerRef = useRef(null);
  const burnRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const messageIdRef = useRef(messageId);
  const videoRef = useRef(null);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { messageIdRef.current = messageId; }, [messageId]);

  // 打开/切换时：检查持久化截止时间，决定重置还是恢复
  useEffect(() => {
    if (!isOpen) return;
    console.log('[FlashImage] 打开查看器:', { imageUrl, messageId, mediaType });
    const pending = getPendingBurn(messageId);
    if (pending?.expired) {
      handleBurn();
      return;
    }
    if (pending) {
      setRemaining(pending.remaining);
      setTotalDuration(pending.totalDuration);
    } else {
      // 阅后即焚模式使用传入的秒数
      const defaultSeconds = isBurnAfterRead ? (burnAfterSeconds || 5) : 5;
      setRemaining(defaultSeconds);
      setTotalDuration(defaultSeconds);
    }
    burnRef.current = false;
    setMediaLoaded(false);
    setLoadError(false);
  }, [isOpen, imageUrl, isBurnAfterRead, burnAfterSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBurn = useCallback(async () => {
    if (burnRef.current) return;
    burnRef.current = true;
    const mid = messageIdRef.current;
    if (!mid) return;
    delBurnEntry(mid);
    try {
      await chat.burn(mid);
    } catch (e) {
      captureError(e, { context: '[FlashImage] 销毁失败:' });
    }
    onCloseRef.current();
  }, []);

  // 视频加载元数据：根据视频时长设置倒计时
  const handleVideoMeta = useCallback((e) => {
    const hasPending = getBurnEntry(messageIdRef.current) !== null;
    const actualDuration = Math.ceil(e.target.duration);

    if (!hasPending) {
      // 自适应模式：使用视频实际时长
      const duration = Math.max(actualDuration, 5);
      setTotalDuration(duration);
      setRemaining(duration);
    }
    setMediaLoaded(true);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // 媒体加载完成后开始倒计时
  useEffect(() => {
    if (!isOpen || !isBurnAfterRead || !mediaLoaded) return;

    if (!getBurnEntry(messageId)) {
      setBurnEntry(messageId, {
        deadline: Date.now() + remaining * 1000,
        totalDuration,
      });
    }

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
  }, [isOpen, isBurnAfterRead, mediaLoaded, handleBurn, messageId, remaining, totalDuration]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    // 阅后即焚模式：点击关闭直接销毁
    if (isBurnAfterRead) {
      handleBurn();
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const isVideo = mediaType === 'video';
  const isAudio = mediaType === 'audio';

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
      <Flex
        position="absolute"
        top={6}
        align="center"
        gap={2}
        bg="blackAlpha.600"
        px={4}
        py={2}
        borderRadius="full"
        zIndex={1}
      >
        {isBurnAfterRead ? (
          <>
            <Text fontSize="lg">🔥</Text>
            <Text color="orange.300" fontWeight="bold" fontSize="md">阅后即焚</Text>
            {mediaLoaded ? (
              <Text color="white" fontSize="md" fontWeight="bold" ml={2}>
                {remaining}s
              </Text>
            ) : (
              <Spinner size="sm" color="orange.300" ml={2} />
            )}
          </>
        ) : (
          <Text color="white" fontSize="md" fontWeight="bold">媒体预览</Text>
        )}
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
        onClick={(e) => { e.stopPropagation(); handleClose(); }}
        aria-label="关闭"
        borderRadius="full"
        size="sm"
        zIndex={1}
      />

      {/* 加载中 */}
      {!mediaLoaded && (
        <Spinner size="xl" color="orange.300" thickness="3px" />
      )}

      {/* 媒体内容 — 视频用原生 <video> */}
      {isVideo ? (
        <Box
          maxW="95vw"
          maxH="85vh"
          borderRadius="lg"
          overflow="hidden"
          position="relative"
          boxShadow="0 4px 30px rgba(0,0,0,0.5)"
          sx={{
            '& video::-webkit-media-controls-enclosure': { display: 'none !important' },
            '& video::-webkit-media-controls': { display: 'none !important' },
          }}
        >
          {/* 视频暂停时：居中播放按钮 */}
          {videoPaused && mediaLoaded && (
            <Flex
              position="absolute"
              inset={0}
              align="center"
              justify="center"
              zIndex={2}
              pointerEvents="none"
            >
              <Flex
                w="64px"
                h="64px"
                borderRadius="full"
                bg="whiteAlpha.600"
                align="center"
                justify="center"
                backdropFilter="blur(4px)"
              >
                <Text fontSize="28px">▶</Text>
              </Flex>
            </Flex>
          )}
          <video
            ref={videoRef}
            src={imageUrl}
            controls={false}
            controlsList="nodownload nofullscreen"
            disablePictureInPicture
            autoPlay
            muted
            playsInline
            onCanPlay={() => {
              if (videoRef.current) {
                videoRef.current.play().catch(() => {});
              }
            }}
            onPlay={() => setVideoPaused(false)}
            onPause={() => setVideoPaused(true)}
            style={{ width: '100%', maxHeight: '85vh', borderRadius: '8px', display: 'block' }}
            onClick={e => {
              e.stopPropagation();
              if (!videoRef.current) return;
              if (videoRef.current.paused) {
                videoRef.current.play().catch(() => {});
              } else {
                videoRef.current.pause();
              }
            }}
            onContextMenu={e => e.preventDefault()}
            onLoadedMetadata={handleVideoMeta}
          />
        </Box>
      ) : isAudio ? (
        /* 音频类型 */
        <Box
          maxW="95vw"
          maxH="85vh"
          borderRadius="lg"
          p={8}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <audio
            ref={videoRef}
            src={imageUrl}
            controls={false}
            autoPlay
            playsInline
            onPlay={() => setVideoPaused(false)}
            onPause={() => setVideoPaused(true)}
            onLoadedMetadata={handleVideoMeta}
            onEnded={() => handleBurn()}
          />
          <Text color="white" fontSize="xl">🎵 音频播放中 {remaining}s</Text>
        </Box>
      ) : (
        /* 图片类型 - 使用原生 img 标签确保 APK WebView 兼容性 */
        <Flex
          position="relative"
          maxW="95vw"
          maxH="90vh"
          alignItems="center"
          justifyContent="center"
          direction="column"
          onClick={handleClose}
          onContextMenu={e => e.preventDefault()}
          cursor="pointer"
        >
          {/* 加载中状态 */}
          {!loadError && !mediaLoaded && (
            <Spinner size="xl" color="orange.300" thickness="3px" />
          )}

          {/* 加载失败状态 - 显示错误信息 */}
          {loadError && (
            <VStack spacing={4}>
              <Text fontSize="6xl">🖼️</Text>
              <Text color="white" fontSize="md">图片加载失败</Text>
              <Button
                size="sm"
                colorScheme="orange"
                onClick={(e) => {
                  e.stopPropagation();
                  setLoadError(false);
                  setMediaLoaded(false);
                  // 重新加载图片
                  const img = new Image();
                  img.src = imageUrl + (imageUrl.includes('?') ? '&t=' : '?t=') + Date.now();
                  img.onload = () => {
                    console.log('[FlashImage] 图片重新加载成功:', imageUrl);
                    setMediaLoaded(true);
                    setLoadError(false);
                  };
                  img.onerror = () => {
                    console.error('[FlashImage] 图片重新加载失败:', imageUrl);
                    setLoadError(true);
                    setMediaLoaded(true);
                  };
                }}
              >
                重试
              </Button>
            </VStack>
          )}

          {/* 实际图片 */}
          {!loadError && (
            <img
              src={imageUrl}
              alt="阅后即焚"
              style={{
                maxWidth: '95vw',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 4px 30px rgba(0,0,0,0.5)',
                display: mediaLoaded ? 'block' : 'none',
                WebkitTouchCallout: 'none',
                WebkitUserDrag: 'none',
                userSelect: 'none',
                pointerEvents: 'auto',
              }}
              onLoad={() => {
                console.log('[FlashImage] 图片加载成功:', imageUrl);
                setMediaLoaded(true);
                setLoadError(false);
              }}
              onError={(e) => {
                const errorMsg = `[FlashImage] 图片加载失败: ${imageUrl}`;
                console.error(errorMsg, e);
                setLoadError(true);
                setMediaLoaded(true);
                captureError(new Error(errorMsg), { context: 'FlashImageViewer', imageUrl, error: e.target?.error });
              }}
            />
          )}
        </Flex>
      )}

      {/* 底部提示 */}
      <Text
        position="absolute"
        bottom={6}
        color="whiteAlpha.500"
        fontSize="xs"
      >
        {mediaLoaded
          ? isBurnAfterRead
            ? `点击任意处关闭 · ${remaining}s后自动销毁`
            : '点击任意处关闭'
          : '加载中...'}
      </Text>
    </Flex>
  );
}

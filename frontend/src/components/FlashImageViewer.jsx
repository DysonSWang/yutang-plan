/**
 * 闪图查看器 — 满屏显示图片/视频，支持闪图模式（5秒倒计时）和普通模式
 * 闪图模式：点击查看 → 满屏显示 → 倒计时 → 自动burn
 * 关闭查看器/切换页面不会停止倒计时，闪图到时间仍会被销毁
 * 普通模式：点击查看 → 满屏显示 → 手动关闭
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, Flex, Image, IconButton, Spinner } from '@chakra-ui/react';
import { chat } from '../utils/api';
import { captureError } from '../utils/frontendErrorCapture';

// sessionStorage 持久化：刷新页面/切换路由后倒计时不丢失，关标签页自动清除
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

export default function FlashImageViewer({ isOpen, onClose, imageUrl, messageId, isFlashMode = false, mediaType = 'image', forceShow }) {
  const [remaining, setRemaining] = useState(5);
  const [totalDuration, setTotalDuration] = useState(5);
  const [hidden, setHidden] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
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
    const pending = getPendingBurn(messageId);
    if (pending?.expired) {
      handleBurn();
      return;
    }
    if (pending) {
      setRemaining(pending.remaining);
      setTotalDuration(pending.totalDuration);
    } else {
      setRemaining(5);
      setTotalDuration(5);
    }
    setHidden(false);
    burnRef.current = false;
    setMediaLoaded(false);
  }, [isOpen, imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // 再次打开已隐藏的查看器：只恢复可见，不重置倒计时
  useEffect(() => {
    if (forceShow != null && isOpen) {
      setHidden(false);
    }
  }, [forceShow, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 视频加载元数据：根据视频时长设置倒计时（最低3秒）
  // 如果有持久化的截止时间，不覆盖
  const handleVideoMeta = useCallback((e) => {
    const hasPending = getBurnEntry(messageIdRef.current) !== null;
    if (!hasPending) {
      const dur = Math.max(3, Math.ceil(e.target.duration));
      setTotalDuration(dur);
      setRemaining(dur);
    }
    setMediaLoaded(true);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // 媒体加载完成后开始倒计时，同时记录截止时间到模块级 Map
  useEffect(() => {
    if (!isOpen || !isFlashMode || !mediaLoaded) return;

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
  }, [isOpen, isFlashMode, mediaLoaded, handleBurn, messageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    if (isFlashMode) {
      setHidden(true);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const isVideo = mediaType === 'video';
  const mediaLabel = isVideo ? '视频' : '图片';

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
      display={hidden ? 'none' : 'flex'}
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
          zIndex={1}
        >
          <Text fontSize="lg">⚡</Text>
          <Text color="yellow.300" fontWeight="bold" fontSize="md">闪图</Text>
          {mediaLoaded ? (
            <Text color="white" fontSize="md" fontWeight="bold" ml={2}>
              {remaining}s
            </Text>
          ) : (
            <Spinner size="sm" color="yellow.300" ml={2} />
          )}
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
        zIndex={1}
      />

      {/* 加载中 */}
      {!mediaLoaded && isFlashMode && (
        <Spinner size="xl" color="yellow.300" thickness="3px" />
      )}

      {/* 媒体内容 — 视频用原生 <video> 避免 Chakra Box 吞掉布尔属性 */}
      {isVideo ? (
        <Box
          maxW="95vw"
          maxH="85vh"
          borderRadius="lg"
          overflow="hidden"
          position="relative"
          boxShadow={isFlashMode ? "0 0 60px rgba(255,200,0,0.15)" : "0 4px 30px rgba(0,0,0,0.5)"}
          sx={isFlashMode ? {
            '& video::-webkit-media-controls-enclosure': { display: 'none !important' },
            '& video::-webkit-media-controls': { display: 'none !important' },
          } : {}}
        >
          {/* 闪图视频暂停时：居中播放按钮 */}
          {isFlashMode && videoPaused && mediaLoaded && (
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
            controls={isFlashMode ? false : true}
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
      ) : (
        <Image
          src={imageUrl}
          alt={isFlashMode ? "闪图" : mediaLabel}
          maxW="95vw"
          maxH="90vh"
          objectFit="contain"
          borderRadius="lg"
          onClick={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
          onLoad={() => setMediaLoaded(true)}
          display={!mediaLoaded && isFlashMode ? 'none' : 'block'}
          boxShadow={isFlashMode ? "0 0 60px rgba(255,200,0,0.15)" : "0 4px 30px rgba(0,0,0,0.5)"}
          draggable={false}
          userSelect="none"
          css={{ WebkitTouchCallout: 'none', WebkitUserDrag: 'none' }}
        />
      )}

      {/* 底部提示 */}
      <Text
        position="absolute"
        bottom={6}
        color="whiteAlpha.500"
        fontSize="xs"
      >
        {isFlashMode
          ? (mediaLoaded ? `点击任意处关闭 · ${remaining}s后自动销毁` : '加载中...')
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
            w={`${(remaining / totalDuration) * 100}%`}
            transition="width 1s linear"
          />
        </Box>
      )}
    </Flex>
  );
}

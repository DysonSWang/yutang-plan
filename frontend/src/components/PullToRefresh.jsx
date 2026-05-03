import { useRef, useState, useCallback, useEffect } from 'react';
import { Box, HStack } from '@chakra-ui/react';

/**
 * 下拉刷新组件。
 *
 * 核心机制：
 * - 组件内层 Box 设为 overflow: auto，成为独立滚动容器
 * - touch 事件检测下拉手势，仅在 scrollTop === 0 时启用
 * - 拖动距离经阻尼曲线映射到 translateY，内容随之弹性下移
 * - 松手后距离 > 50px 触发刷新，否则回弹
 * - 刷新中顶部显示金色呼吸动画
 */
export default function PullToRefresh({ onRefresh, isRefreshing = false, children }) {
  const scrollRef = useRef(null);
  const touchState = useRef({ startY: 0, startScrollTop: 0, dragging: false, translated: false });
  const [pullY, setPullY] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleTouchStart = useCallback((e) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    if (isRefreshing || isAnimating) return;
    // 仅在顶部位置启用
    if (scrollEl.scrollTop > 0) return;
    touchState.current = {
      startY: e.touches[0].clientY,
      startScrollTop: scrollEl.scrollTop,
      dragging: true,
      translated: false,
    };
  }, [isRefreshing, isAnimating]);

  const handleTouchMove = useCallback((e) => {
    if (!touchState.current.dragging) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const dy = e.touches[0].clientY - touchState.current.startY;
    if (dy <= 0) {
      // 向上滑，忽略
      setPullY(0);
      touchState.current.translated = false;
      return;
    }

    // 再次检查 scrollTop（滚动位置可能在 touchmove 期间变化）
    if (scrollEl.scrollTop > 0) {
      touchState.current.dragging = false;
      setPullY(0);
      return;
    }

    // 阻尼曲线：距离越大阻力越大，max 80px
    const damped = Math.pow(dy, 0.85);
    const capped = Math.min(damped, 80);
    setPullY(capped);
    touchState.current.translated = true;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchState.current.dragging && !touchState.current.translated) return;
    const scrollEl = scrollRef.current;
    if (scrollEl) scrollEl.scrollTop = 0;

    if (pullY > 50 && onRefresh) {
      // 触发刷新
      setIsAnimating(true);
      setPullY(0);
      onRefresh().finally(() => {
        setIsAnimating(false);
      });
    } else {
      // 回弹
      setIsAnimating(true);
      setPullY(0);
      setTimeout(() => setIsAnimating(false), 300);
    }
    touchState.current.dragging = false;
    touchState.current.translated = false;
  }, [pullY, onRefresh]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const onScroll = () => {
      // 用户手动滚动时重置拖动状态
      if (touchState.current.dragging && scrollEl.scrollTop > 0) {
        touchState.current.dragging = false;
        setPullY(0);
      }
    };
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <Box
      position="relative"
      overflow="hidden"
      h="100%"
    >
      {/* 刷新指示器 — 固定在顶部，translateY 控制显隐 */}
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        h="60px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        pointerEvents="none"
        style={{
          transform: pullY > 0 ? `translateY(${pullY - 30}px)` : 'translateY(-30px)',
          opacity: pullY > 0 ? 1 : 0,
          transition: isAnimating ? 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 300ms ease' : 'none',
        }}
      >
        {isRefreshing || isAnimating ? (
          <HStack spacing={1.5}>
            <Box className="pull-refresh-dot" />
            <Box className="pull-refresh-dot" style={{ animationDelay: '200ms' }} />
            <Box className="pull-refresh-dot" style={{ animationDelay: '400ms' }} />
          </HStack>
        ) : (
          <Box
            w="20px"
            h="20px"
            borderRadius="50%"
            border="2px solid"
            borderColor="gold.500"
            opacity={Math.min(pullY / 50, 1)}
          />
        )}
      </Box>

      {/* 可滚动内容 */}
      <Box
        ref={scrollRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        overflow="auto"
        h="100%"
        style={{
          transform: pullY > 0 ? `translateY(${pullY}px)` : 'translateY(0)',
          transition: isAnimating ? 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
/**
 * 数字滚动动画组件
 * 从 0 平滑滚动到目标值，带缓动效果
 */
import { Text } from '@chakra-ui/react';
import { useState, useEffect } from 'react';

export default function AnimatedNumber({ value = 0, duration = 1500, ...rest }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(Math.round(ease * value));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <Text as="span" {...rest}>{display.toLocaleString()}</Text>;
}

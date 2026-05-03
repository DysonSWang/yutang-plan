import { useOutlet, useLocation, useNavigationType } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';

// 最多缓存的页面数，超过时淘汰最久未访问的页面
const MAX_KEEP_ALIVE = 8;

// 全局事件发射器，供 useKeepAliveData 和 useRouteLifecycle 监听
if (typeof window !== 'undefined' && !window.__keepAliveEventEmitter) {
  window.__keepAliveEventEmitter = new EventTarget();
}

/**
 * KeepAliveOutlet 替代 react-router-dom 的 Outlet。
 *
 * 核心机制：
 * - 子路由组件切换时不卸载，而是用 CSS display:none 隐藏
 * - 再次访问时 display:block 恢复，数据保持不变
 * - 超过 MAX_KEEP_ALIVE 时 LRU 淘汰最久未访问的页面
 * - 激活时触发静默数据刷新 + 页面生命周期事件
 */
export default function KeepAliveOutlet() {
  const element = useOutlet();
  const location = useLocation();
  const mountedRef = useRef({});
  const [keepAliveMap, setKeepAliveMap] = useState(new Map());
  const lruOrderRef = useRef([]);
  // 用于在 effect 同步读取上一次的 keys，避免 stale closure
  const prevKeysRef = useRef([]);

  // 获取当前路由的 keepAliveKey
  const getKey = useCallback((loc) => {
    return loc.pathname;
  }, []);

  // 当路由变化时，更新 keepAliveMap
  useEffect(() => {
    const key = getKey(location);

    let newKeys = [];

    setKeepAliveMap(prev => {
      const next = new Map(prev);

      if (!next.has(key) && element) {
        // 新路由，加入缓存
        next.set(key, {
          element,
          location,
        });

        // 更新 LRU 顺序
        lruOrderRef.current = lruOrderRef.current.filter(k => k !== key);
        lruOrderRef.current.push(key);

        // LRU 淘汰
        while (lruOrderRef.current.length > MAX_KEEP_ALIVE) {
          const evictKey = lruOrderRef.current.shift();
          next.delete(evictKey);
        }

        // 标记为新挂载
        mountedRef.current[key] = false;
      } else if (next.has(key)) {
        // 已存在，更新 element 以捕获子组件变化
        next.set(key, {
          element,
          location,
        });
      }

      newKeys = Array.from(next.keys());
      return next;
    });

    // 触发当前页面的激活事件（使用同步更新后的 keys）
    const emitter = window.__keepAliveEventEmitter;
    if (emitter) {
      // 非首次挂载时才触发激活（首次由组件自身的 useEffect 处理）
      if (mountedRef.current[key]) {
        emitter.dispatchEvent(new CustomEvent(key));
      }
      mountedRef.current[key] = true;

      // 找出需要 deactivate 的页面：存在于 prevKeys 但不存在于 newKeys
      // 这样即使 keepAliveMap 还未同步更新，deactivate 也不会遗漏
      const prevKeys = prevKeysRef.current;
      const toDeactivate = prevKeys.filter(k => k !== key && !newKeys.includes(k));
      for (const cachedKey of toDeactivate) {
        if (mountedRef.current[cachedKey]) {
          emitter.dispatchEvent(new CustomEvent(`${cachedKey}:deactivate`));
        }
      }

      // 更新 prevKeysRef
      prevKeysRef.current = newKeys;
    }
  }, [location.pathname, location.search]); // 当路径或参数变化时

  // 隐藏非当前页面的 key 列表
  const currentKey = getKey(location);
  const hiddenKeys = [];
  for (const key of keepAliveMap.keys()) {
    if (key !== currentKey) {
      hiddenKeys.push(key);
    }
  }

  return (
    <>
      {/* 当前页面 */}
      {keepAliveMap.has(currentKey) ? (
        keepAliveMap.get(currentKey).element
      ) : (
        element
      )}

      {/* 隐藏的缓存页面 */}
      {hiddenKeys.map(key => {
        const cached = keepAliveMap.get(key);
        if (!cached) return null;
        return (
          <div key={key} style={{ display: 'none', ariaHidden: true }}>
            {cached.element}
          </div>
        );
      })}
    </>
  );
}

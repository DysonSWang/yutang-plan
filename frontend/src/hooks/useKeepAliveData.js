import { useState, useRef, useEffect } from 'react';

/**
 * 页面级 keep-alive 数据管理 Hook。
 *
 * 核心逻辑：
 * - 首次加载 → isInitialLoad=true → 页面显示 Skeleton
 * - 再次激活 → isInitialLoad=false, isFetching=true → 页面显示旧数据，后台静默刷新
 *
 * @param {Function} fetcher - 数据获取函数 () => Promise<any>
 * @param {Object} options
 * @param {string} options.key - 路由标识，用于事件通信（通常用 window.location.pathname）
 * @param {boolean} options.refreshOnActivate - 再次激活时是否静默刷新，默认 true
 *
 * @returns {{ data, loading, error, isInitialLoad, isFetching, refresh }}
 */
export default function useKeepAliveData(fetcher, { key, refreshOnActivate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFetching, setIsFetching] = useState(true);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const configRef = useRef({ refreshOnActivate });
  configRef.current = { refreshOnActivate };

  const firstLoadRef = useRef(true);
  const mountedRef = useRef(true);

  // 核心 fetch 函数
  const fetchData = async (showLoading = true) => {
    if (!mountedRef.current) return;
    if (showLoading) {
      setLoading(true);
    }
    setIsFetching(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (mountedRef.current) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
      }
    } finally {
      if (mountedRef.current) {
        setIsFetching(false);
      }
    }
  };

  // 挂载时自动触发首次加载
  useEffect(() => {
    fetchData(true);
    firstLoadRef.current = false;
    return () => { mountedRef.current = false; };
  }, []);

  // 监听路由激活事件（再次切回此页面时静默刷新）
  useEffect(() => {
    if (!key) return;

    const handleActivate = () => {
      // 标记为非首次加载（确保 isInitialLoad 不再为 true）
      firstLoadRef.current = false;

      if (configRef.current.refreshOnActivate) {
        fetchData(false);
      }
    };

    const handleDeactivate = () => {
      mountedRef.current = false;
    };

    const emitter = window.__keepAliveEventEmitter;
    if (emitter) {
      emitter.addEventListener(key, handleActivate);
      emitter.addEventListener(`${key}:deactivate`, handleDeactivate);
    }

    return () => {
      if (emitter) {
        emitter.removeEventListener(key, handleActivate);
        emitter.removeEventListener(`${key}:deactivate`, handleDeactivate);
      }
    };
  }, [key]);

  // 手动刷新（供页面内按钮调用）
  const refresh = async () => {
    await fetchData(false);
  };

  return {
    data,
    loading,       // 首次加载时为 true
    error,
    isInitialLoad: firstLoadRef.current && loading,  // 仅首次加载且仍在 loading 时为 true
    isFetching,    // 任何 fetch 进行中为 true
    refresh,
  };
}

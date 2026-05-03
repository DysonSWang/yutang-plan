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

  // hasLoadedRef: 跟踪数据是否已成功加载过一次
  const hasLoadedRef = useRef(false);
  // initialFetchDoneRef: 跟踪首次 useEffect 是否已执行
  const initialFetchDoneRef = useRef(false);
  // mountedRef: 跟踪组件是否"有效挂载"（用于取消进行中的请求）
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
        hasLoadedRef.current = true;
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
        hasLoadedRef.current = true; // 即使出错也标记为已加载，避免无限 loading
      }
    } finally {
      if (mountedRef.current) {
        setIsFetching(false);
      }
    }
  };

  // 挂载时自动触发首次加载
  useEffect(() => {
    // 每次 effect 执行时重置 mounted 状态（处理 StrictMode 重复挂载）
    mountedRef.current = true;
    fetchData(true);
    initialFetchDoneRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 监听路由激活事件（再次切回此页面时静默刷新）
  useEffect(() => {
    if (!key) return;

    const handleActivate = () => {
      // 恢复 mounted 状态（页面重新可见）
      mountedRef.current = true;

      if (configRef.current.refreshOnActivate && hasLoadedRef.current) {
        fetchData(false);
      }
    };

    const handleDeactivate = () => {
      // 只有在数据已成功加载过后，才允许 deactivate 设置 mountedRef 为 false
      // 这防止了首次加载期间的竞态条件
      if (hasLoadedRef.current) {
        mountedRef.current = false;
      }
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
    isInitialLoad: !hasLoadedRef.current && loading,  // 尚未成功加载且正在 loading
    isFetching,    // 任何 fetch 进行中为 true
    refresh,
  };
}

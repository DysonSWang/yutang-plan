/**
 * useKeepAliveData Hook 单元测试
 *
 * 重点覆盖：
 * - 首次加载 skeleton 状态
 * - React 18 StrictMode 双挂载竞态条件（回归测试）
 * - 再次激活静默刷新
 * - 手动刷新
 * - 错误处理
 * - mountedRef 取消机制
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import useKeepAliveData from '../../hooks/useKeepAliveData';

// 创建测试用 EventEmitter mock
function createMockEmitter() {
  const listeners = {};
  return {
    addEventListener: vi.fn((event, cb) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    removeEventListener: vi.fn((event, cb) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(l => l !== cb);
      }
    }),
    dispatchEvent: vi.fn((event) => {
      const cbs = listeners[event.type] || [];
      cbs.forEach(cb => cb(event));
    }),
    _listeners: listeners,
  };
}

describe('useKeepAliveData', () => {
  let emitter;

  beforeEach(() => {
    emitter = createMockEmitter();
    window.__keepAliveEventEmitter = emitter;
  });

  // ─── 首次加载 ───

  it('首次加载时 loading 和 isFetching 都为 true', async () => {
    let resolvePromise;
    const fetcher = vi.fn().mockReturnValue(
      new Promise(resolve => { resolvePromise = resolve; })
    );
    const { result } = renderHook(() => useKeepAliveData(fetcher, { key: '/test' }));

    expect(result.current.isInitialLoad).toBe(true);
    expect(result.current.loading).toBe(true);
    expect(result.current.isFetching).toBe(true);
    expect(fetcher).toHaveBeenCalled();

    // 完成请求
    await act(async () => {
      resolvePromise({ items: [] });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isInitialLoad).toBe(false);
  });

  it('成功加载数据后 data 有值，isInitialLoad 为 false', async () => {
    const mockData = { girls: [{ id: 1, name: '小美' }] };
    const fetcher = vi.fn().mockResolvedValue(mockData);
    const { result } = renderHook(() => useKeepAliveData(fetcher, { key: '/test' }));

    await waitFor(() => expect(result.current.data).toEqual(mockData), { timeout: 3000 });
    expect(result.current.isInitialLoad).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('加载失败后 error 有值，isInitialLoad 为 false', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('网络错误'));
    const { result } = renderHook(() => useKeepAliveData(fetcher, { key: '/test' }));

    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 3000 });
    expect(result.current.isInitialLoad).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  // ─── StrictMode 回归测试 ───

  it('StrictMode 双挂载后仍能正常获取数据', async () => {
    const mockData = { count: 5 };
    const fetcher = vi.fn().mockResolvedValue(mockData);

    // 第一次挂载
    const { unmount } = renderHook(() => useKeepAliveData(fetcher, { key: '/test' }));

    // 模拟 StrictMode：先 unmount
    unmount();

    // 重新挂载（StrictMode 行为）
    const { result } = renderHook(() => useKeepAliveData(fetcher, { key: '/test' }));

    await waitFor(() => expect(result.current.data).toEqual(mockData), { timeout: 3000 });
    expect(result.current.isInitialLoad).toBe(false);
  });

  // ─── 再次激活（keep-alive 静默刷新） ───

  it('激活事件触发时静默刷新', async () => {
    const mockData = { items: [1, 2, 3] };
    const fetcher = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() =>
      useKeepAliveData(fetcher, { key: '/my-pond', refreshOnActivate: true })
    );

    // 等待首次加载完成
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    const callCount = fetcher.mock.calls.length;

    // 模拟激活事件
    await act(async () => {
      emitter.dispatchEvent(new CustomEvent('/my-pond'));
    });

    expect(fetcher).toHaveBeenCalledTimes(callCount + 1);
    expect(result.current.isInitialLoad).toBe(false);
  });

  it('refreshOnActivate=false 时激活不刷新', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [] });

    const { result } = renderHook(() =>
      useKeepAliveData(fetcher, { key: '/my-pond', refreshOnActivate: false })
    );

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    const callCount = fetcher.mock.calls.length;

    await act(async () => {
      emitter.dispatchEvent(new CustomEvent('/my-pond'));
    });

    expect(fetcher).toHaveBeenCalledTimes(callCount);
  });

  // ─── 手动刷新 ───

  it('refresh 函数可以手动触发刷新', async () => {
    const mockData = { version: 1 };
    const fetcher = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() => useKeepAliveData(fetcher, { key: '/test' }));

    await waitFor(() => expect(result.current.data).toEqual(mockData), { timeout: 3000 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    fetcher.mockResolvedValue({ version: 2 });

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ version: 2 });
  });
});

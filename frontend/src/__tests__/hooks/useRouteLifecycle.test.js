/**
 * useRouteLifecycle Hook 单元测试
 * 覆盖：路由激活/隐藏事件监听、便捷 Hook、cleanup
 */
import { renderHook, act } from '@testing-library/react';
import useRouteLifecycle, { useRouteActivated, useRouteDeactivated } from '../../hooks/useRouteLifecycle';

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

describe('useRouteLifecycle', () => {
  let emitter;

  beforeEach(() => {
    emitter = createMockEmitter();
    window.__keepAliveEventEmitter = emitter;
  });

  it('注册 activate 事件监听', () => {
    const onActivated = vi.fn();

    renderHook(() => useRouteLifecycle({ key: '/my-page', onActivated }));

    expect(emitter.addEventListener).toHaveBeenCalledWith('/my-page', onActivated);
  });

  it('注册 deactivate 事件监听', () => {
    const onDeactivated = vi.fn();

    renderHook(() => useRouteLifecycle({ key: '/my-page', onDeactivated }));

    expect(emitter.addEventListener).toHaveBeenCalledWith('/my-page:deactivate', onDeactivated);
  });

  it('activate 事件触发时调用回调', () => {
    const onActivated = vi.fn();

    renderHook(() => useRouteLifecycle({ key: '/my-page', onActivated }));

    act(() => {
      emitter.dispatchEvent(new CustomEvent('/my-page'));
    });

    expect(onActivated).toHaveBeenCalled();
  });

  it('deactivate 事件触发时调用回调', () => {
    const onDeactivated = vi.fn();

    renderHook(() => useRouteLifecycle({ key: '/my-page', onDeactivated }));

    act(() => {
      emitter.dispatchEvent(new CustomEvent('/my-page:deactivate'));
    });

    expect(onDeactivated).toHaveBeenCalled();
  });

  it('无 key 时不注册监听', () => {
    renderHook(() => useRouteLifecycle({ onActivated: vi.fn() }));

    expect(emitter.addEventListener).not.toHaveBeenCalled();
  });

  it('无 emitter 时不报错', () => {
    delete window.__keepAliveEventEmitter;

    expect(() => {
      renderHook(() => useRouteLifecycle({ key: '/my-page', onActivated: vi.fn() }));
    }).not.toThrow();
  });

  it('unmount 时移除监听', () => {
    const onActivated = vi.fn();

    const { unmount } = renderHook(() => useRouteLifecycle({ key: '/my-page', onActivated }));

    unmount();

    expect(emitter.removeEventListener).toHaveBeenCalledWith('/my-page', onActivated);
  });

  it('key 变化时重新注册', () => {
    const onActivated = vi.fn();
    const { rerender } = renderHook(
      ({ key }) => useRouteLifecycle({ key, onActivated }),
      { initialProps: { key: '/page1' } }
    );

    const initialCallCount = emitter.addEventListener.mock.calls.length;

    rerender({ key: '/page2' });

    // 移除旧监听
    expect(emitter.removeEventListener).toHaveBeenCalledWith('/page1', onActivated);
    // 注册新监听
    expect(emitter.addEventListener).toHaveBeenCalledWith('/page2', onActivated);
  });
});

describe('useRouteActivated 便捷 Hook', () => {
  let emitter;

  beforeEach(() => {
    emitter = createMockEmitter();
    window.__keepAliveEventEmitter = emitter;
  });

  it('仅监听激活事件', () => {
    const callback = vi.fn();

    renderHook(() => useRouteActivated('/my-page', callback));

    expect(emitter.addEventListener).toHaveBeenCalledWith('/my-page', callback);
    expect(emitter.addEventListener).not.toHaveBeenCalledWith('/my-page:deactivate', expect.any(Function));
  });

  it('激活事件触发时调用回调', () => {
    const callback = vi.fn();

    renderHook(() => useRouteActivated('/my-page', callback));

    act(() => {
      emitter.dispatchEvent(new CustomEvent('/my-page'));
    });

    expect(callback).toHaveBeenCalled();
  });
});

describe('useRouteDeactivated 便捷 Hook', () => {
  let emitter;

  beforeEach(() => {
    emitter = createMockEmitter();
    window.__keepAliveEventEmitter = emitter;
  });

  it('仅监听隐藏事件', () => {
    const callback = vi.fn();

    renderHook(() => useRouteDeactivated('/my-page', callback));

    expect(emitter.addEventListener).toHaveBeenCalledWith('/my-page:deactivate', callback);
    expect(emitter.addEventListener).not.toHaveBeenCalledWith('/my-page', expect.any(Function));
  });

  it('隐藏事件触发时调用回调', () => {
    const callback = vi.fn();

    renderHook(() => useRouteDeactivated('/my-page', callback));

    act(() => {
      emitter.dispatchEvent(new CustomEvent('/my-page:deactivate'));
    });

    expect(callback).toHaveBeenCalled();
  });
});

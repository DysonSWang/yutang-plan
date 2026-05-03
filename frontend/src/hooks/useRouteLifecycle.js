import { useRef, useEffect } from 'react';

/**
 * 路由生命周期 Hook。
 *
 * 当页面被 KeepAliveOutlet 激活/隐藏时触发回调。
 * 适用于清理编辑状态、暂停 SSE/轮询、重置 UI 状态等场景。
 *
 * @param {Object} options
 * @param {string} options.key - 路由标识，与 useKeepAliveData 的 key 一致
 * @param {Function} options.onActivated - 页面变为可见时回调
 * @param {Function} options.onDeactivated - 页面变为隐藏时回调
 */
export default function useRouteLifecycle({ key, onActivated, onDeactivated }) {
  const onActivatedRef = useRef(onActivated);
  const onDeactivatedRef = useRef(onDeactivated);
  onActivatedRef.current = onActivated;
  onDeactivatedRef.current = onDeactivated;

  useEffect(() => {
    if (!key) return;

    const emitter = window.__keepAliveEventEmitter;
    if (!emitter) return;

    if (onActivatedRef.current) {
      emitter.addEventListener(key, onActivatedRef.current);
    }
    if (onDeactivatedRef.current) {
      emitter.addEventListener(`${key}:deactivate`, onDeactivatedRef.current);
    }

    return () => {
      if (emitter) {
        if (onActivatedRef.current) {
          emitter.removeEventListener(key, onActivatedRef.current);
        }
        if (onDeactivatedRef.current) {
          emitter.removeEventListener(`${key}:deactivate`, onDeactivatedRef.current);
        }
      }
    };
  }, [key]);
}

/**
 * 便捷 Hook：仅监听激活事件。
 * 用于需要在页面可见时触发的场景（如 Chat 页的 chat-enter 事件）。
 */
export function useRouteActivated(key, callback) {
  useRouteLifecycle({ key, onActivated: callback });
}

/**
 * 便捷 Hook：仅监听隐藏事件。
 * 用于需要在页面隐藏时清理的场景（如取消编辑、停止 SSE）。
 */
export function useRouteDeactivated(key, callback) {
  useRouteLifecycle({ key, onDeactivated: callback });
}

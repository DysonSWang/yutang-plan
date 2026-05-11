import { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import { captureError } from '../utils/frontendErrorCapture';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || '';
const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const listenersRef = useRef({});
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  // 建立/断开 socket 连接（跟随 user 状态）
  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    // 已连接则不复建
    if (socketRef.current?.connected) return;

    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    socketRef.current.on('connect', () => {
      console.log('[SocketContext] 已连接');
      if (user.role === 'client') {
        socketRef.current.emit('client:join', user.id);
      } else {
        socketRef.current.emit('operator:join', user.id);
      }
    });

    socketRef.current.on('connect_error', (err) => {
      captureError(new Error(`Socket 连接错误: ${err.message}`), { context: 'socket_connect_error' });
    });

    socketRef.current.on('disconnect', (reason) => {
      console.warn('[SocketContext] 断开连接:', reason);
      if (reason === 'io server disconnect') {
        setTimeout(() => {
          socketRef.current?.connect();
        }, 1000);
      }
    });

    socketRef.current.on('reconnect_failed', () => {
      captureError(new Error('Socket 重连失败'), { context: 'socket_reconnect_failed' });
    });

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  // 注册监听器（支持多个组件监听同一事件，返回清理函数）
  const on = useCallback((event, handler) => {
    if (!socketRef.current) return () => {};
    socketRef.current.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  // 发送消息
  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  // 断开（供外部调用）
  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  // 聊天未读计数（供导航红点使用）
  const addChatUnread = useCallback((count = 1) => {
    setChatUnreadCount(prev => prev + count);
  }, []);

  const clearChatUnread = useCallback((count) => {
    if (count != null) {
      setChatUnreadCount(prev => Math.max(0, prev - count));
    } else {
      setChatUnreadCount(0);
    }
  }, []);

  return (
    <SocketContext.Provider value={{ socketRef, on, emit, disconnect, chatUnreadCount, addChatUnread, clearChatUnread }}>
      {children}
    </SocketContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be within SocketProvider');
  return ctx;
}

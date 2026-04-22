import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005';
const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const listenersRef = useRef({});

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
      // 加入对应房间
      if (user.role === 'client') {
        socketRef.current.emit('client:join', user.id);
      } else {
        socketRef.current.emit('operator:join', user.id);
      }
    });

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  // 注册监听器（自动处理去重）
  const on = useCallback((event, handler) => {
    if (!socketRef.current) return;
    // 移除旧监听器避免重复
    socketRef.current.off(event, listenersRef.current[event]);
    socketRef.current.on(event, handler);
    listenersRef.current[event] = handler;
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

  return (
    <SocketContext.Provider value={{ socketRef, on, emit, disconnect }}>
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

import { createContext, useContext, useState, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { auth } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('zhuiai_token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      // 设置较短超时，避免长时间等待
      const result = await Promise.race([
        auth.me(),
        new Promise((_, reject) => setTimeout(() => reject({ code: 'TIMEOUT' }), 5000))
      ]);
      if (result.success) {
        setUser(result.user);

        // 设置 Sentry 用户上下文
        Sentry.setUser({
          id: String(result.user.id),
          username: result.user.username,
          role: result.user.role,
        });
      } else {
        // token无效，清除
        localStorage.removeItem('zhuiai_token');
      }
    } catch (err) {
      // 超时或网络错误，保留token让用户可以重试
      console.warn('[Auth] 验证失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    const result = await auth.login(username, password);
    if (result.success) {
      localStorage.setItem('zhuiai_token', result.token);
      setUser(result.user);

      // 设置 Sentry 用户上下文
      Sentry.setUser({
        id: String(result.user.id),
        username: result.user.username,
        role: result.user.role,
      });
    }
    return result;
  };

  const logout = () => {
    localStorage.removeItem('zhuiai_token');
    sessionStorage.removeItem('zhuiai_unlocked');
    setUser(null);

    // 清除 Sentry 用户上下文
    Sentry.setUser(null);
  };

  const isAdmin = user?.role === 'admin';
  const isClient = user?.role === 'client';

  return (
    <AuthContext.Provider value={{ user, login, logout, checkAuth, loading, isAdmin, isClient }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

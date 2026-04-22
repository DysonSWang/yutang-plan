import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('yutang_token');
      if (token) {
        const result = await auth.me();
        if (result.success) {
          setUser(result.user);
        }
      }
    } catch {
      localStorage.removeItem('yutang_token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    const result = await auth.login(username, password);
    if (result.success) {
      localStorage.setItem('yutang_token', result.token);
      setUser(result.user);
    }
    return result;
  };

  const logout = () => {
    localStorage.removeItem('yutang_token');
    setUser(null);
  };

  const isOperator = user?.role === 'operator' || user?.role === 'admin';
  const isClient = user?.role === 'client';

  return (
    <AuthContext.Provider value={{ user, login, logout, checkAuth, loading, isOperator, isClient }}>
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

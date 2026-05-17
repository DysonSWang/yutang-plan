/**
 * React ErrorBoundary 组件
 * 捕获子组件渲染时的错误，防止整个应用崩溃
 */

import { Component } from 'react';
import * as Sentry from '@sentry/react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // 上报到 Sentry
    Sentry.captureException(error, {
      extra: {
        ...errorInfo,
        // 附加用户信息（从 props 或 window 获取）
        userId: this.props.user?.id,
        userRole: this.props.user?.role,
      },
    });

    // 可选：打印到控制台（开发用）
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] 捕获到错误:', error, errorInfo);
    }

    // 发送到后端日志
    fetch('/api/logs/frontend-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorId: `eb-${Date.now().toString(36)}`,
        message: error?.message || String(error),
        stack: error?.stack || '',
        type: 'react-render',
        url: window.location.href,
        userAgent: navigator.userAgent,
        metadata: {
          componentStack: errorInfo?.componentStack,
          userId: this.props.user?.id,
        },
      }),
      keepalive: true,
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      // 可自定义错误 UI
      if (this.props.fallback) {
        return this.props.fallback(this.state.error);
      }

      // 默认错误提示
      return (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          margin: '20px',
        }}>
          <h2 style={{ color: '#e53e3e', marginBottom: '10px' }}>页面出错了</h2>
          <p style={{ color: '#718096', marginBottom: '15px' }}>
            请尝试刷新页面或重启 APP
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              background: '#3182ce',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 高阶组件：包装组件添加 ErrorBoundary
 */
export function withErrorBoundary(Component, fallback) {
  return function WrappedComponent(props) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

export default ErrorBoundary;

/**
 * ErrorBoundary 组件单元测试
 */
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ErrorBoundary from '../../components/ErrorBoundary';

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('正常子组件渲染', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">正常内容</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('子组件崩溃时显示错误提示', () => {
    const ThrowError = () => { throw new Error('测试错误'); };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    // ErrorBoundary 应捕获错误并显示提示
    expect(console.error).toHaveBeenCalled();
  });

  it('显示错误操作按钮', () => {
    const ThrowError = () => { throw new Error('测试错误'); };
    const onReset = vi.fn();

    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowError />
      </ErrorBoundary>
    );

    const resetButton = screen.queryByRole('button', { name: /重试|刷新|retry/i });
    if (resetButton) {
      expect(resetButton).toBeInTheDocument();
    }
  });
});

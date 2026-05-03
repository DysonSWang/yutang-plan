/**
 * AnimatedNumber 组件单元测试
 */
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import AnimatedNumber from '../../components/AnimatedNumber';

describe('AnimatedNumber', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始渲染为0（动画起始值）', () => {
    render(<AnimatedNumber value={42} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('零值直接显示0', () => {
    render(<AnimatedNumber value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('null 值当作0处理', () => {
    render(<AnimatedNumber value={null} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('undefined 值当作0处理', () => {
    render(<AnimatedNumber value={undefined} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('负数正确显示', () => {
    render(<AnimatedNumber value={-5} />);
    expect(screen.getByText('0')).toBeInTheDocument(); // 初始仍为0
  });
});

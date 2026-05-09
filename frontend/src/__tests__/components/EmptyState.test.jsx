/**
 * EmptyState 组件单元测试
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmptyState from '../../components/EmptyState';

describe('EmptyState', () => {
  it('显示预设 pond 类型的图标和文案', () => {
    render(<EmptyState type="pond" />);

    expect(screen.getByText('缘分还未开始')).toBeInTheDocument();
    expect(screen.getByText(/添加缘分对象/)).toBeInTheDocument();
  });

  it('显示预设 notification 类型的文案', () => {
    render(<EmptyState type="notification" />);

    expect(screen.getByText('暂无新通知')).toBeInTheDocument();
  });

  it('显示预设 date 类型的文案', () => {
    render(<EmptyState type="date" />);

    expect(screen.getByText('暂无约会安排')).toBeInTheDocument();
  });

  it('显示预设 search 类型的文案', () => {
    render(<EmptyState type="search" />);

    expect(screen.getByText('未找到匹配结果')).toBeInTheDocument();
  });

  it('不传 type 时使用 default 预设', () => {
    render(<EmptyState />);

    expect(screen.getByText('暂无内容')).toBeInTheDocument();
  });

  it('自定义 title/desc 覆盖预设值', () => {
    render(
      <EmptyState
        type="pond"
        title="自定义标题"
        desc="自定义描述"
      />
    );

    expect(screen.getByText('自定义标题')).toBeInTheDocument();
    expect(screen.getByText('自定义描述')).toBeInTheDocument();
  });

  it('传入 actionLabel 和 onAction 时渲染按钮', () => {
    render(
      <EmptyState
        type="pond"
        actionLabel="完善档案"
        onAction={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '完善档案' })).toBeInTheDocument();
  });

  it('点击 action 按钮调用 onAction', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();

    render(
      <EmptyState
        actionLabel="去完善"
        onAction={onAction}
      />
    );

    await user.click(screen.getByRole('button', { name: '去完善' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('不传 onAction 时不渲染按钮', () => {
    const { container } = render(
      <EmptyState
        type="pond"
        actionLabel="去完善"
      />
    );

    expect(container.querySelector('button')).not.toBeInTheDocument();
  });

  it('sm 和 md 尺寸都能正常渲染', () => {
    const { unmount } = render(<EmptyState size="sm" />);
    expect(screen.getByText('暂无内容')).toBeInTheDocument();

    unmount();

    render(<EmptyState size="md" />);
    expect(screen.getByText('暂无内容')).toBeInTheDocument();
  });
});

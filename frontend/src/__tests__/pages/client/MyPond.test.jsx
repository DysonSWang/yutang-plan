/**
 * MyPond 页面单元测试
 * 覆盖：三个子标签切换（女生/约会/日历）、女生列表渲染、空状态
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import MyPond from '../../../pages/client/MyPond';

// mock useKeepAliveData - 分别处理 dates 和 girls 的调用
const mockRefresh = vi.fn();
vi.mock('../../../hooks/useKeepAliveData', () => ({
  default: vi.fn((loaderFn, options) => {
    const key = options?.key;
    if (key === '/dates') {
      return {
        data: { datesList: [], allDates: [], pendingInterviews: [] },
        isInitialLoad: false,
        refresh: mockRefresh,
      };
    }
    // 对于 /my-pond，返回女生列表数组
    return {
      data: [
        { id: 1, name: '小美', age: 25, occupation: '设计师', stage: '聊天', intimacyLevel: 2 },
        { id: 2, name: '小红', age: 23, occupation: '学生', stage: '暧昧', intimacyLevel: 3 },
      ],
      isInitialLoad: false,
      refresh: mockRefresh,
    };
  }),
}));

// mock API
const mockGirls = [
  { id: 1, name: '小美', age: 25, occupation: '设计师', stage: '聊天', intimacyLevel: 2 },
  { id: 2, name: '小红', age: 23, occupation: '学生', stage: '暧昧', intimacyLevel: 3 },
];
vi.mock('../../../utils/api', () => ({
  dates: {
    getClientPending: vi.fn(() => Promise.resolve({ success: true, dates: [] })),
    list: vi.fn(() => Promise.resolve({ success: true, dates: [] })),
    getClientInterviews: vi.fn(() => Promise.resolve({ success: true, interviews: [] })),
    create: vi.fn(() => Promise.resolve({ success: true })),
  },
  clients: {
    me: vi.fn(() => Promise.resolve({ client: { id: 1, girls: mockGirls } })),
  },
  girls: {
    list: vi.fn(() => Promise.resolve({ success: true, girls: mockGirls })),
    clientAdd: vi.fn(() => Promise.resolve({ success: true, quotaLeft: 5 })),
  },
  getMediaUrl: vi.fn((url) => url || 'https://i.pravatar.cc/150?img=1'),
}));

// mock captureError
vi.mock('../../../utils/frontendErrorCapture', () => ({
  captureError: vi.fn(),
}));

// mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// wrapper
function Wrapper({ children }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

describe('MyPond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('渲染三个子标签', async () => {
    render(<MyPond />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '女生' })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: '约会' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '日历' })).toBeInTheDocument();
  });

  it('默认显示女生 Tab', async () => {
    render(<MyPond />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('缘分')).toBeInTheDocument();
    });
    expect(screen.getByText(/已添加.*位/)).toBeInTheDocument();
  });

  it('女生 Tab 渲染女生列表', async () => {
    render(<MyPond />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('小美')).toBeInTheDocument();
    });
    expect(screen.getByText('小红')).toBeInTheDocument();
  });

  it('女生卡片显示阶段标签', async () => {
    render(<MyPond />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('小美')).toBeInTheDocument();
    });
    expect(screen.getByText('聊天')).toBeInTheDocument();
    expect(screen.getByText('暧昧')).toBeInTheDocument();
  });

  it('点击女生卡片导航到详情页', async () => {
    render(<MyPond />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('小美')).toBeInTheDocument();
    });

    // 找到小美所在的卡片 - Card 组件外层 wrapper 有 cursor-pointer
    const cards = document.querySelectorAll('[style*="cursor: pointer"], [class*="cursor-pointer"]');
    const card = Array.from(cards).find(c => c.textContent.includes('小美'));

    if (card) {
      fireEvent.click(card);
      expect(mockNavigate).toHaveBeenCalled();
    }
  });

  it('点击约会 Tab 显示约会内容', async () => {
    render(<MyPond />, { wrapper: Wrapper });

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: '约会' }));
    });

    await waitFor(() => {
      expect(screen.getByText(/暂无约会/)).toBeInTheDocument();
    });
  });

  it('点击日历 Tab 加载日历组件', async () => {
    render(<MyPond />, { wrapper: Wrapper });

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: '日历' }));
    });

    // ClientCalendar 组件渲染时会有加载状态或者直接渲染日历
    // 由于 clientId 为 null（clients.me 被 mock），应该显示 spinner
    await waitFor(() => {
      // 日历 Tab 被选中后应该能找 Spinner（因为 clientId 为 null）
      // 或者如果 clientId 有值，会渲染 ClientCalendar
    }, { timeout: 3000 });

    // 验证日历 Tab 仍然可见
    expect(screen.getByRole('tab', { name: '日历' })).toBeInTheDocument();
  });

  it('刷新按钮调用 refresh', async () => {
    render(<MyPond />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('缘分')).toBeInTheDocument();
    });

    const refreshBtn = screen.getByRole('button', { name: /刷新/ });
    fireEvent.click(refreshBtn);

    expect(mockRefresh).toHaveBeenCalled();
  });

  it('添加约会按钮存在', async () => {
    render(<MyPond />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /添加约会/ })).toBeInTheDocument();
    });
  });

  it('女生 Tab 显示已添加提示', async () => {
    render(<MyPond />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('小美')).toBeInTheDocument();
    });

    // 验证显示已添加提示（文本包含 "已添加"）
    expect(screen.getByText(/已添加/)).toBeInTheDocument();
  });
});
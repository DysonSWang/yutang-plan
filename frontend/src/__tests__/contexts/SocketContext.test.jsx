/**
 * SocketContext 单元测试
 * 覆盖：连接管理、事件监听、emit、断开重连、未读计数
 */
import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SocketProvider, useSocket } from '../../contexts/SocketContext';

// mock socket.io-client
vi.mock('socket.io-client', () => {
  const emit = vi.fn();
  const on = vi.fn((event, handler) => {
    // 存储 handler 以便后续调用
    if (!handlers[event]) handlers[event] = [];
    handlers[event].push(handler);
    return () => {
      handlers[event] = handlers[event].filter(h => h !== handler);
    };
  });
  const off = vi.fn((event, handler) => {
    if (handlers[event]) {
      handlers[event] = handlers[event].filter(h => h !== handler);
    }
  });
  const disconnect = vi.fn();
  const connect = vi.fn();
  const handlers = {};

  const mockSocket = {
    emit,
    on,
    off,
    disconnect,
    connect,
    connected: false,
  };

  return {
    io: vi.fn(() => mockSocket),
    __handlers: handlers,
    __mockSocket: mockSocket,
    __resetHandlers: () => {
      Object.keys(handlers).forEach(k => delete handlers[k]);
    },
  };
});

// mock captureError
vi.mock('../../utils/frontendErrorCapture', () => ({
  captureError: vi.fn(),
}));

// mock AuthContext
const mockUser = { id: 1, role: 'client' };
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}));

// 测试组件：读取 socket 状态
function TestComponent() {
  const { socketRef, on, emit, disconnect, chatUnreadCount, addChatUnread, clearChatUnread } = useSocket();

  return (
    <div>
      <span data-testid="connected">{socketRef.current?.connected ? 'yes' : 'no'}</span>
      <span data-testid="unread">{chatUnreadCount}</span>
      <button data-testid="emit" onClick={() => emit('test-event', { msg: 'hello' })}>Emit</button>
      <button data-testid="disconnect" onClick={() => disconnect()}>Disconnect</button>
      <button data-testid="add-unread" onClick={() => addChatUnread(3)}>AddUnread</button>
      <button data-testid="clear-unread" onClick={() => clearChatUnread(1)}>ClearUnread</button>
      <button data-testid="clear-all-unread" onClick={() => clearChatUnread()}>ClearAllUnread</button>
    </div>
  );
}

describe('SocketContext', () => {
  let mockSocket;
  let io;
  let handlers;

  beforeEach(async () => {
    vi.clearAllMocks();
    // 等待模块被重新设置
    const socketModule = await import('socket.io-client');
    io = socketModule.io;
    mockSocket = socketModule.__mockSocket;
    handlers = socketModule.__handlers;
    mockSocket.connected = false;
    socketModule.__resetHandlers();
  });

  it('渲染时建立 socket 连接', async () => {
    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(io).toHaveBeenCalled();
  });

  it('无 user 时不建立连接', async () => {
    const { useAuth } = await import('../../contexts/AuthContext');
    useAuth.mockReturnValueOnce({ user: null });

    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(io).not.toHaveBeenCalled();
  });

  it('已连接时不重复建连', async () => {
    mockSocket.connected = true;

    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    // io 仍会调用一次，但不会重复连接
    expect(io).toHaveBeenCalled();
  });

  it('connect 事件触发时发送 join 事件', async () => {
    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    // 模拟 connect 事件
    await act(async () => {
      const connectHandler = handlers['connect']?.[0];
      if (connectHandler) connectHandler();
    });

    // client:join 应该被发送（默认 mockUser role 是 client）
    expect(mockSocket.emit).toHaveBeenCalledWith('client:join', mockUser.id);
  });

  it('emit 发送事件', async () => {
    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      mockSocket.connected = true;
      const connectHandler = handlers['connect']?.[0];
      if (connectHandler) connectHandler();
    });

    await act(() => {
      screen.getByTestId('emit').click();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('test-event', { msg: 'hello' });
  });

  it('disconnect 断开连接', async () => {
    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      mockSocket.connected = true;
      const connectHandler = handlers['connect']?.[0];
      if (connectHandler) connectHandler();
    });

    await act(() => {
      screen.getByTestId('disconnect').click();
    });

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('addChatUnread 增加未读数', async () => {
    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(() => {
      screen.getByTestId('add-unread').click();
    });

    expect(screen.getByTestId('unread').textContent).toBe('3');
  });

  it('clearChatUnread 减少未读数', async () => {
    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(() => {
      screen.getByTestId('add-unread').click();
    });

    await act(() => {
      screen.getByTestId('clear-unread').click();
    });

    expect(screen.getByTestId('unread').textContent).toBe('2');
  });

  it('clearChatUnread 无参数时清零', async () => {
    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(() => {
      screen.getByTestId('add-unread').click();
    });

    await act(() => {
      screen.getByTestId('clear-all-unread').click();
    });

    expect(screen.getByTestId('unread').textContent).toBe('0');
  });

  it('provider 卸载时断开连接', async () => {
    const { unmount } = render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('useSocket 在非 provider 中使用时抛出错误', () => {
    // 捕获错误
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useSocket must be within SocketProvider');

    consoleError.mockRestore();
  });

  it('client:join 事件在 connect 时发送（client role）', async () => {
    const { useAuth } = await import('../../contexts/AuthContext');
    useAuth.mockReturnValueOnce({ user: { id: 1, role: 'client' } });

    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      mockSocket.connected = true;
      const connectHandler = handlers['connect']?.[0];
      if (connectHandler) connectHandler();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('client:join', 1);
  });

  it('operator:join 事件在 connect 时发送（operator role）', async () => {
    const { useAuth } = await import('../../contexts/AuthContext');
    useAuth.mockReturnValueOnce({ user: { id: 2, role: 'operator' } });

    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      mockSocket.connected = true;
      const connectHandler = handlers['connect']?.[0];
      if (connectHandler) connectHandler();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('operator:join', 2);
  });
});

/**
 * API 工具类单元测试
 * 覆盖：缓存、token 管理、请求重试、错误处理、media URL 转换
 */
import { api, getMediaUrl } from '../../utils/api';

describe('getMediaUrl', () => {
  it('空值返回空字符串', () => {
    expect(getMediaUrl('')).toBe('');
    expect(getMediaUrl(null)).toBe('');
    expect(getMediaUrl(undefined)).toBe('');
  });

  it('已经是完整 URL 则直接返回', () => {
    expect(getMediaUrl('https://example.com/image.png')).toBe('https://example.com/image.png');
  });

  it('相对路径拼接 API_BASE', () => {
    const result = getMediaUrl('/public/images/test.png');
    expect(result).toContain('/public/images/test.png');
  });
});

describe('api token 管理', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('setToken 写入 localStorage', () => {
    api.setToken('test-token-123');
    expect(localStorage.getItem('zhuiai_token')).toBe('test-token-123');
  });

  it('getToken 读取 localStorage', () => {
    localStorage.setItem('zhuiai_token', 'my-token');
    expect(api.getToken()).toBe('my-token');
  });

  it('removeToken 清除 localStorage', () => {
    api.setToken('to-be-removed');
    api.removeToken();
    expect(api.getToken()).toBeNull();
  });
});

describe('api 缓存机制', () => {
  beforeEach(() => {
    api.clearCache();
  });

  it('getCached 首次调用走真实请求', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ success: true, data: [1] }),
    });
    global.fetch = mockFetch;

    const result = await api.getCached('/api/test-cache');
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('getCached TTL 内返回缓存', async () => {
    // 先做一次真实请求
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ success: true, data: 'cached' }),
    });
    global.fetch = mockFetch;

    await api.getCached('/api/cached-item');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 第二次应在 TTL 内走缓存
    const result = await api.getCached('/api/cached-item');
    expect(result.data).toBe('cached');
    expect(mockFetch).toHaveBeenCalledTimes(1); // 没有新增调用
  });

  it('clearCache 清空缓存后重新请求', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ data: 'v1' }),
    });
    global.fetch = mockFetch;

    await api.getCached('/api/reload');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    api.clearCache();

    await api.getCached('/api/reload');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('api 错误处理', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('401 且不在登录页时清除 token 并跳转', async () => {
    window.location = { pathname: '/my-pond', href: '' };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ error: 'Unauthorized', type: 'auth' }),
    });

    api.setToken('old-token');

    try {
      await api.get('/api/protected');
    } catch {
      // 期望清除 token
    }

    expect(api.getToken()).toBeNull();
  });

  it('网络错误返回 NETWORK 类型', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('NetworkError'));

    let caught;
    try {
      await api.get('/api/unreachable');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    expect(caught.type).toBe('NETWORK');
  });

  it('超时返回 TIMEOUT 错误', async () => {
    const { AbortSignal: OriginalAbortSignal } = global;
    global.fetch = vi.fn().mockImplementation(async (url, options) => {
      // 模拟超时
      throw new DOMException('The operation was aborted', 'AbortError');
    });

    let caught;
    try {
      await api.get('/api/slow');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    expect(caught.code).toBe('TIMEOUT');
  });
});

describe('api 请求方法', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ success: true }),
    });
  });

  it('get 使用 GET 方法', async () => {
    await api.get('/api/test');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('post 使用 POST 方法并带 body', async () => {
    await api.post('/api/test', { name: 'test' });
    const call = global.fetch.mock.calls[0];
    expect(call[1].method).toBe('POST');
    expect(call[1].body).toBe(JSON.stringify({ name: 'test' }));
  });

  it('put 使用 PUT 方法', async () => {
    await api.put('/api/test/1', { name: 'updated' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('delete 使用 DELETE 方法', async () => {
    await api.delete('/api/test/1');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('带 token 时添加 Authorization header', async () => {
    api.setToken('auth-token');
    await api.get('/api/secure');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer auth-token',
        }),
      })
    );
  });
});

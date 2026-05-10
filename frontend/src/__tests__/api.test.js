import { describe, it, expect, vi } from 'vitest';

function mockResponse(data, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    headers: { get: (k) => k === 'content-type' ? 'application/json' : null },
    json: () => Promise.resolve(data)
  });
}

describe('getCachedWithVersion', () => {
  it('完整行为验证：首次请求 → 缓存命中 → 版本变化失效', async () => {
    const { api } = await import('../utils/api');

    let fetchCallCount = 0;
    const callLog = [];

    const fetchMock = vi.fn().mockImplementation(async (url, options) => {
      fetchCallCount++;
      callLog.push({ url, index: fetchCallCount });

      if (url.includes('content-version')) {
        return mockResponse({ success: true, version: 5 });
      }
      return mockResponse({ success: true, chapters: [{ id: 1 }] });
    });

    vi.stubGlobal('fetch', fetchMock);

    // ===== Phase 1: 首次请求 =====
    const result1 = await api.getCachedWithVersion(
      '/api/membership/learning/chapters',
      '/api/membership/learning/content-version',
      100 // 100ms TTL，方便在测试中过期
    );
    expect(result1).toEqual({ success: true, chapters: [{ id: 1 }] });
    expect(fetchCallCount).toBe(2); // data + version

    // ===== Phase 2: 缓存命中（TTL 未过期） =====
    const result2 = await api.getCachedWithVersion(
      '/api/membership/learning/chapters',
      '/api/membership/learning/content-version',
      100
    );
    expect(result2).toEqual({ success: true, chapters: [{ id: 1 }] });
    expect(fetchCallCount).toBe(2); // 无新增调用

    // ===== Phase 3: 等待 TTL 过期 + 版本变化 =====
    await new Promise(r => setTimeout(r, 150));

    // 更新 mock 返回新版本
    fetchMock.mockImplementation(async (url) => {
      fetchCallCount++;
      callLog.push({ url, index: fetchCallCount, phase3: true });

      if (url.includes('content-version')) {
        return mockResponse({ success: true, version: 6 }); // 版本从 5→6
      }
      return mockResponse({ success: true, chapters: [{ id: 2 }] }); // 新数据
    });

    const result3 = await api.getCachedWithVersion(
      '/api/membership/learning/chapters',
      '/api/membership/learning/content-version',
      100
    );

    // 版本变了 → 缓存失效 → 重新请求 → 拿到新数据
    expect(result3).toEqual({ success: true, chapters: [{ id: 2 }] });
    expect(fetchCallCount).toBe(5); // +3: version check + data refetch + save version

    console.log('All fetch calls:', callLog);
    console.log(`Total calls: ${fetchCallCount} (expected 4)`);
  });

  it('缓存过期但版本相同 → 续期', async () => {
    const { api } = await import('../utils/api');

    let fetchCallCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      fetchCallCount++;
      if (url.includes('content-version')) {
        return mockResponse({ success: true, version: 5 });
      }
      return mockResponse({ success: true, chapters: [{ id: 1 }] });
    });

    vi.stubGlobal('fetch', fetchMock);

    // 首次请求
    const result1 = await api.getCachedWithVersion(
      '/api/test/expire-renew',
      '/api/membership/learning/content-version',
      100
    );
    expect(result1).toEqual({ success: true, chapters: [{ id: 1 }] });
    expect(fetchCallCount).toBe(2);

    // 等待 TTL 过期
    await new Promise(r => setTimeout(r, 150));

    // 版本相同 → 续期
    const result2 = await api.getCachedWithVersion(
      '/api/test/expire-renew',
      '/api/membership/learning/content-version',
      100
    );
    expect(result2).toEqual({ success: true, chapters: [{ id: 1 }] });
    expect(fetchCallCount).toBe(3); // 只多了一次 version check

    // 续期后再次请求 → 缓存命中
    const result3 = await api.getCachedWithVersion(
      '/api/test/expire-renew',
      '/api/membership/learning/content-version',
      100
    );
    expect(result3).toEqual({ success: true, chapters: [{ id: 1 }] });
    expect(fetchCallCount).toBe(3); // 无新增调用
  });
});

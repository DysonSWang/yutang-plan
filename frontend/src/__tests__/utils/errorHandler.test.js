/**
 * errorHandler 工具单元测试
 * 覆盖：ErrorType 常量、parseErrorResponse、normalizeError、getErrorMessage
 */
import { ErrorType, parseErrorResponse, normalizeError, getErrorMessage } from '../../utils/errorHandler';

describe('ErrorType 常量', () => {
  it('包含所有错误类型', () => {
    expect(ErrorType.NETWORK).toBe('NETWORK');
    expect(ErrorType.TIMEOUT).toBe('TIMEOUT');
    expect(ErrorType.AUTH).toBe('AUTH');
    expect(ErrorType.PERMISSION).toBe('PERMISSION');
    expect(ErrorType.VALIDATION).toBe('VALIDATION');
    expect(ErrorType.SERVER).toBe('SERVER');
    expect(ErrorType.UNKNOWN).toBe('UNKNOWN');
  });
});

describe('parseErrorResponse', () => {
  it('401 返回 AUTH 类型', () => {
    const result = parseErrorResponse({ status: 401 }, { error: 'Unauthorized' });
    expect(result.type).toBe(ErrorType.AUTH);
    expect(result.message).toBe('Unauthorized');
  });

  it('403 返回 PERMISSION 类型', () => {
    const result = parseErrorResponse({ status: 403 }, { error: 'Forbidden' });
    expect(result.type).toBe(ErrorType.PERMISSION);
    expect(result.message).toBe('Forbidden');
  });

  it('400 返回 VALIDATION 类型', () => {
    const result = parseErrorResponse({ status: 400 }, { error: 'Bad Request' });
    expect(result.type).toBe(ErrorType.VALIDATION);
  });

  it('500 返回 SERVER 类型', () => {
    const result = parseErrorResponse({ status: 500 }, { error: 'Internal Error' });
    expect(result.type).toBe(ErrorType.SERVER);
  });

  it('处理字符串错误（兼容旧格式）', () => {
    const result = parseErrorResponse({ status: 401 }, { error: '旧密码错误' });
    expect(result.type).toBe(ErrorType.AUTH);
    expect(result.message).toBe('旧密码错误');
  });

  it('处理对象错误格式', () => {
    const result = parseErrorResponse(
      { status: 400 },
      { error: { code: 'VALIDATION_ERROR', message: '字段验证失败' } }
    );
    expect(result.type).toBe(ErrorType.VALIDATION);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.message).toBe('字段验证失败');
  });

  it('包含 requestId', () => {
    const result = parseErrorResponse(
      { status: 500 },
      { error: 'Server Error', requestId: 'req-123' }
    );
    expect(result.requestId).toBe('req-123');
  });

  it('未知状态码返回 UNKNOWN', () => {
    const result = parseErrorResponse({ status: 999 }, { error: 'Unknown' });
    expect(result.type).toBe(ErrorType.UNKNOWN);
  });

  it('无 error 字段时使用状态码消息', () => {
    const result = parseErrorResponse({ status: 404 }, {});
    expect(result.type).toBe(ErrorType.VALIDATION);
    expect(result.message).toBe('HTTP 404');
  });
});

describe('normalizeError', () => {
  it('TypeError + fetch → NETWORK', () => {
    const error = new TypeError('Failed to fetch');
    const result = normalizeError(error);
    expect(result.type).toBe(ErrorType.NETWORK);
    expect(result.code).toBe('NETWORK_ERROR');
  });

  it('AbortError → ABORTED', () => {
    const error = new DOMException('The operation was aborted', 'AbortError');
    const result = normalizeError(error);
    expect(result.type).toBe(ErrorType.UNKNOWN);
    expect(result.code).toBe('ABORTED');
    expect(result.message).toBe('请求已取消');
  });

  it('TimeoutError → TIMEOUT', () => {
    const error = new Error('Timeout exceeded');
    error.name = 'TimeoutError';
    const result = normalizeError(error);
    expect(result.type).toBe(ErrorType.TIMEOUT);
    expect(result.code).toBe('TIMEOUT');
  });

  it('包含 type 的 error 直接返回', () => {
    const error = {
      type: ErrorType.AUTH,
      code: 'TOKEN_EXPIRED',
      message: '登录过期',
    };
    const result = normalizeError(error);
    expect(result.type).toBe(ErrorType.AUTH);
    expect(result.message).toBe('登录过期');
  });

  it('普通 Error 返回 UNKNOWN', () => {
    const error = new Error('Something went wrong');
    const result = normalizeError(error);
    expect(result.type).toBe(ErrorType.UNKNOWN);
    expect(result.message).toBe('Something went wrong');
  });

  it('无 message 的 error 使用默认消息', () => {
    const error = { type: ErrorType.NETWORK };
    const result = normalizeError(error);
    expect(result.message).toBe('网络连接失败，请检查网络设置');
  });
});

describe('getErrorMessage', () => {
  it('返回 error.message', () => {
    expect(getErrorMessage({ message: '网络错误' })).toBe('网络错误');
  });

  it('无 message 时返回默认消息', () => {
    expect(getErrorMessage({})).toBe('发生了未知错误');
    expect(getErrorMessage(null)).toBe('发生了未知错误');
    expect(getErrorMessage(undefined)).toBe('发生了未知错误');
  });
});

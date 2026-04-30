/**
 * 统一错误处理工具
 * 规范化后端错误响应，提供友好的错误消息
 */

export const ErrorType = {
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  AUTH: 'AUTH',
  PERMISSION: 'PERMISSION',
  VALIDATION: 'VALIDATION',
  SERVER: 'SERVER',
  UNKNOWN: 'UNKNOWN',
};

const StatusToType = {
  400: ErrorType.VALIDATION,
  401: ErrorType.AUTH,
  403: ErrorType.PERMISSION,
  404: ErrorType.VALIDATION,
  422: ErrorType.VALIDATION,
  500: ErrorType.SERVER,
  502: ErrorType.SERVER,
  503: ErrorType.SERVER,
};

const FriendlyMessages = {
  [ErrorType.NETWORK]: '网络连接失败，请检查网络设置',
  [ErrorType.TIMEOUT]: '请求超时，请稍后重试',
  [ErrorType.AUTH]: '登录已过期，请重新登录',
  [ErrorType.PERMISSION]: '您没有权限执行此操作',
  [ErrorType.VALIDATION]: '请求参数有误',
  [ErrorType.SERVER]: '服务器开小差了，请稍后重试',
  [ErrorType.UNKNOWN]: '发生了未知错误',
};

export function parseErrorResponse(response, data) {
  if (data?.error) {
    const errDef = data.error;
    return {
      type: StatusToType[response.status] || ErrorType.UNKNOWN,
      code: errDef.code || 'UNKNOWN',
      message: errDef.message || '未知错误',
      requestId: data.requestId,
    };
  }

  return {
    type: StatusToType[response.status] || ErrorType.UNKNOWN,
    code: 'UNKNOWN',
    message: data?.error || `HTTP ${response.status}`,
  };
}

export function normalizeError(error) {
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return {
      type: ErrorType.NETWORK,
      code: 'NETWORK_ERROR',
      message: FriendlyMessages[ErrorType.NETWORK],
    };
  }

  if (error.name === 'AbortError') {
    return {
      type: ErrorType.UNKNOWN,
      code: 'ABORTED',
      message: '请求已取消',
    };
  }

  if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
    return {
      type: ErrorType.TIMEOUT,
      code: 'TIMEOUT',
      message: FriendlyMessages[ErrorType.TIMEOUT],
    };
  }

  if (error.type) {
    return {
      ...error,
      message: error.message || FriendlyMessages[error.type],
    };
  }

  return {
    type: ErrorType.UNKNOWN,
    code: 'UNKNOWN',
    message: error.message || FriendlyMessages[ErrorType.UNKNOWN],
  };
}

export function getErrorMessage(error) {
  return error?.message || FriendlyMessages[ErrorType.UNKNOWN];
}

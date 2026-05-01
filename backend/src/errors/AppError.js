/**
 * 自定义应用异常类
 * 支持错误码、HTTP状态码、用户消息、开发者消息、元数据
 */

class AppError extends Error {
  constructor(errorCodeOrMessage, overrides = {}) {
    if (typeof errorCodeOrMessage === 'object') {
      const errDef = errorCodeOrMessage;
      super(overrides.userMessage || errDef.message);
      this.code = errDef.code;
      this.status = overrides.status || errDef.status;
      this.userMessage = overrides.userMessage || errDef.message;
      this.devMessage = overrides.devMessage || null;
      this.metadata = overrides.metadata || null;
    } else {
      super(errorCodeOrMessage);
      this.code = overrides.code || 'S0801';
      this.status = overrides.status || 500;
      this.userMessage = overrides.userMessage || errorCodeOrMessage;
      this.devMessage = overrides.devMessage || null;
      this.metadata = overrides.metadata || null;
    }

    this.name = 'AppError';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.userMessage,
      ...(this.metadata && { metadata: this.metadata }),
    };
  }
}

module.exports = AppError;

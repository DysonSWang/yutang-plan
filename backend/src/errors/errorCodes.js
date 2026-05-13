/**
 * 错误码体系 (6位数字)
 * 格式: XXYYZZ
 *   XX = 模块分类 (01=认证, 02=客户, 03=女生, ...)
 *   YY = 错误类型 (01=参数错误, 02=权限错误, 03=资源不存在, ...)
 *   ZZ = 具体错误序号
 */

const ErrorCodes = {
  // ========== A01 认证模块 ==========
  AUTH_TOKEN_MISSING:       { code: 'A0101', status: 401, message: '未提供认证令牌' },
  AUTH_TOKEN_INVALID:        { code: 'A0102', status: 401, message: '认证令牌无效' },
  AUTH_TOKEN_EXPIRED:        { code: 'A0103', status: 401, message: '认证令牌已过期' },
  AUTH_CREDENTIALS_INVALID:  { code: 'A0104', status: 401, message: '用户名或密码错误' },
  AUTH_USER_NOT_FOUND:       { code: 'A0105', status: 401, message: '用户不存在' },
  AUTH_USER_EXISTS:          { code: 'A0106', status: 409, message: '用户名已存在' },
  AUTH_PASSWORD_TOO_SHORT:   { code: 'A0107', status: 400, message: '密码至少8位' },
  AUTH_PERMISSION_DENIED:    { code: 'A0108', status: 403, message: '无此操作权限' },
  AUTH_PASSWORD_MISMATCH:    { code: 'A0109', status: 400, message: '两次输入的新密码不一致' },
  AUTH_OLD_PASSWORD_WRONG:   { code: 'A0110', status: 400, message: '旧密码错误' },

  // ========== C02 客户模块 ==========
  CLIENT_NOT_FOUND:          { code: 'C0201', status: 404, message: '客户不存在' },
  CLIENT_QUOTA_EXCEEDED:     { code: 'C0202', status: 403, message: '女生额度已用完' },

  // ========== G03 女生模块 ==========
  GIRL_NOT_FOUND:            { code: 'G0301', status: 404, message: '女生不存在' },
  GIRL_ACCESS_DENIED:        { code: 'G0302', status: 403, message: '无权访问此女生数据' },
  GIRL_STAGE_INVALID:        { code: 'G0303', status: 400, message: '无效的关系阶段值' },
  GIRL_NAME_TOO_LONG:         { code: 'G0304', status: 400, message: '女生昵称不能超过20字' },
  GIRL_STAGE_CONFLICT:       { code: 'G0305', status: 400, message: '关系阶段不能倒退' },
  GIRL_WECHAT_DUPLICATE:      { code: 'G0306', status: 400, message: '该微信号已添加' },
  GIRL_QUOTA_EXCEEDED:        { code: 'G0307', status: 403, message: '女生添加失败，配额已用完' },

  // ========== H04 聊天模块 ==========
  CHAT_SESSION_NOT_FOUND:    { code: 'H0401', status: 404, message: '聊天会话不存在' },
  CHAT_MESSAGE_NOT_FOUND:    { code: 'H0402', status: 404, message: '消息不存在' },
  CHAT_BURN_FAILED:          { code: 'H0403', status: 500, message: '阅后即焚消息销毁失败' },
  CHAT_SESSION_EXPIRED:      { code: 'H0404', status: 410, message: '会话已过期' },

  // ========== D05 约会模块 ==========
  DATE_NOT_FOUND:            { code: 'D0501', status: 404, message: '约会记录不存在' },
  DATE_PLAN_GENERATE_FAILED: { code: 'D0502', status: 500, message: '约会方案生成失败' },
  DATE_MISSING_FIELDS:       { code: 'D0503', status: 400, message: '缺少必填字段' },
  DATE_TIME_CONFLICT:        { code: 'D0504', status: 400, message: '该时间段已有约会' },
  DATE_LOCATION_INVALID:    { code: 'D0505', status: 400, message: '约会地点不能为空' },
  DATE_NOT_EDITABLE:         { code: 'D0506', status: 403, message: '已完成的约会不能修改' },

  // ========== A06 AI 服务模块 ==========
  AI_SERVICE_UNAVAILABLE:    { code: 'A0601', status: 502, message: 'AI 服务暂时不可用' },
  AI_SERVICE_TIMEOUT:        { code: 'A0602', status: 502, message: 'AI 服务响应超时' },
  AI_INVALID_RESPONSE:       { code: 'A0603', status: 502, message: 'AI 返回格式错误' },

  // ========== U07 上传/OSS 模块 ==========
  UPLOAD_FILE_TOO_LARGE:     { code: 'U0701', status: 400, message: '文件大小超过限制' },
  UPLOAD_TYPE_NOT_ALLOWED:   { code: 'U0702', status: 400, message: '不支持的文件类型' },
  OSS_UPLOAD_FAILED:          { code: 'U0703', status: 500, message: '文件上传失败' },

  // ========== S08 通用/系统 ==========
  INTERNAL_ERROR:            { code: 'S0801', status: 500, message: '服务器内部错误' },
  DATABASE_ERROR:            { code: 'S0802', status: 500, message: '数据库操作失败' },
  VALIDATION_ERROR:          { code: 'S0803', status: 400, message: '参数校验失败' },
  RESOURCE_NOT_FOUND:        { code: 'S0804', status: 404, message: '请求的资源不存在' },
  VALIDATION_SPECIFIC:        { code: 'S0805', status: 400, message: '{field}不能为空' },
  NETWORK_ERROR:            { code: 'S0806', status: 0, message: '网络连接失败' },
  TIMEOUT_ERROR:            { code: 'S0807', status: 0, message: '请求超时，请重试' },

  // ========== M10 会员/积分模块 ==========
  MEMBERSHIP_POINTS_INSUFFICIENT: { code: 'M1001', status: 400, message: '积分余额不足' },

  // ========== T09 试用会员 ==========
  TRIAL_LIMIT_EXCEEDED:      { code: 'T0901', status: 403, message: '试用次数已用完' },
  TRIAL_EXPIRED:             { code: 'T0902', status: 403, message: '试用已到期，请升级会员' },
  TRIAL_ALREADY_ACTIVE:      { code: 'T0903', status: 400, message: '已有试用或有效会员' },
};

module.exports = { ErrorCodes };

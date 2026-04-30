/**
 * API 工具类
 */
import imageCompression from 'browser-image-compression';
import { parseErrorResponse, ErrorType } from './errorHandler';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

class Api {
  constructor() {
    this.baseUrl = API_BASE;
    this.errorHandler = null;
  }

  setErrorHandler(handler) {
    this.errorHandler = handler;
  }

  getToken() {
    return localStorage.getItem('zhuiai_token');
  }

  setToken(token) {
    localStorage.setItem('zhuiai_token', token);
  }

  removeToken() {
    localStorage.removeItem('zhuiai_token');
  }

  async request(method, path, data = null, timeoutMs = 15000) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    let response;
    let result;

    // 超时控制器
    const controller = new AbortController();
    options.signal = controller.signal;

    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      response = await fetch(`${this.baseUrl}${path}`, options);
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        result = await response.json();
      } else {
        result = {};
      }
    } catch (err) {
      clearTimeout(timeoutId);
      // 网络错误
      let errorMsg = '网络连接失败，请检查网络设置';
      if (err.name === 'AbortError') {
        errorMsg = '请求超时，请稍后重试';
      }
      const error = {
        type: ErrorType.NETWORK,
        code: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: errorMsg,
      };
      if (this.errorHandler) this.errorHandler(error);
      throw error;
    }

    if (!response.ok) {
      const error = parseErrorResponse(response, result);

      // 401 清除 token 并跳转登录
      if (error.type === ErrorType.AUTH) {
        this.removeToken();
        window.location.href = '/login';
      }

      if (this.errorHandler) {
        this.errorHandler(error);
      }

      throw Object.assign(new Error(error.message), error);
    }

    clearTimeout(timeoutId);
    return result;
  }

  get(path) { return this.request('GET', path); }
  post(path, data) { return this.request('POST', path, data); }
  put(path, data) { return this.request('PUT', path, data); }
  delete(path) { return this.request('DELETE', path); }
}

export const api = new Api();

// Auth
export const auth = {
  login: (username, password) => api.post('/api/auth/login', { username, password }),
  register: (data) => api.post('/api/auth/register', data),
  verify: () => api.get('/api/auth/verify'),
  me: () => api.get('/api/auth/me'),
  logout: () => { api.removeToken(); }
};

// 女生资源
export const girls = {
  list: (params) => api.get('/api/girls' + (params ? '?' + new URLSearchParams(params) : '')),
  get: (id) => api.get(`/api/girls/${id}`),
  create: (data) => api.post('/api/girls', data),
  clientAdd: (data) => api.post('/api/girls/client-add', data),
  update: (id, data) => api.put('/api/girls/' + id, data),
  delete: (id) => api.delete('/api/girls/' + id),
  // M007 S01: 关系阶段
  evaluateStage: (girlId) => api.post(`/api/girls/${girlId}/evaluate-stage`),
  setRelationshipStage: (girlId, data) => api.put(`/api/girls/${girlId}/relationship-stage`, data),
  getStageHistory: (girlId) => api.get(`/api/girls/${girlId}/stage-history`),
  // M007 S03: 反撇分析
  analyzeReversal: (girlId) => api.post(`/api/girls/${girlId}/analyze-reversal`),
  getReversalRisk: (girlId) => api.get(`/api/girls/${girlId}/reversal-risk`),
};

// 客户
export const clients = {
  list: (params) => api.get('/api/clients' + (params ? '?' + new URLSearchParams(params) : '')),
  get: (id) => api.get(`/api/clients/${id}`),
  me: () => api.get('/api/clients/me'),
  update: (id, data) => api.put(`/api/clients/${id}`, data),
  create: (data) => api.post('/api/clients', data),
  extractProfile: (text) => api.post('/api/clients/extract-profile', { text }),
  extractFromChat: (clientId, messageCount) => api.post(`/api/clients/${clientId}/extract-from-chat`, { messageCount }),
  // M007 S05: 入职完成
  onboardingComplete: (data) => api.post('/api/clients/onboarding-complete', data),
};

// 聊天
export const chat = {
  sessions: () => api.get('/api/chat/sessions'),
  mySessions: () => api.get('/api/chat/my-sessions'),
  // 客户端创建会话（自动分配操作员）
  createSession: () => api.post('/api/chat/my-session'),
  // 管理端为客户创建会话
  createSessionForClient: (clientId) => api.post('/api/chat/sessions', { clientId }),
  messages: (sessionId, params) => api.get(`/api/chat/sessions/${sessionId}/messages` + (params ? '?' + new URLSearchParams(params) : '')),
  send: (sessionId, content, type = 'text', mediaUrl, duration, isBurnAfterRead = false, burnAfterSeconds = null, isFlashImage = false) =>
    api.post('/api/chat/messages', { sessionId, content, type, mediaUrl, duration, isBurnAfterRead, burnAfterSeconds, isFlashImage }),
  burn: (id) => api.post(`/api/chat/messages/${id}/burn`),
  recall: (messageId) => api.post(`/api/chat/messages/${messageId}/recall`),
  read: (id) => api.post(`/api/chat/messages/${id}/read`),
  profile: {
    get: (clientId) => api.get(`/api/chat/profile/${clientId}`),
    suggest: (clientId) => api.post(`/api/chat/profile/${clientId}/suggest`, {}),
    update: (clientId, data) => api.request('PATCH', `/api/chat/profile/${clientId}`, data),
  }
};

// 上传
export const upload = {
  image: async (file, isBurnAfterRead = false, isFlashImage = false) => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/jpeg'
    };
    const compressed = await imageCompression(file, options);

    const token = api.getToken();
    const formData = new FormData();
    formData.append('file', compressed);
    if (isBurnAfterRead) formData.append('isBurnAfterRead', 'true');
    if (isFlashImage) formData.append('isFlashImage', 'true');
    const res = await fetch(`${api.baseUrl}/api/upload/image`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const json = await res.json();
    json.originalSize = file.size;
    json.compressedSize = compressed.size;
    return json;
  },
  video: async (file, isBurnAfterRead = false, isFlashImage = false) => {
    const token = api.getToken();
    const formData = new FormData();
    formData.append('file', file);
    if (isBurnAfterRead) formData.append('isBurnAfterRead', 'true');
    if (isFlashImage) formData.append('isFlashImage', 'true');
    const res = await fetch(`${api.baseUrl}/api/upload/compress-video`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    return res.json();
  },
  audio: async (file) => {
    const token = api.getToken();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${api.baseUrl}/api/upload/audio`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    return res.json();
  }
};

// 代聊记录
export const chatLogs = {
  byGirl: (girlId) => api.get(`/api/chat-logs/girl/${girlId}`),
  my: (params) => api.get('/api/chat-logs/client/me' + (params ? '?' + new URLSearchParams(params) : '')),
  create: (data) => api.post('/api/chat-logs', data),
  updateVisibility: (id, isVisible) => api.patch(`/api/chat-logs/${id}/visibility`, { isVisibleToClient: isVisible })
};

// 约会
export const dates = {
  list: (params) => api.get('/api/dates' + (params ? '?' + new URLSearchParams(params) : '')),
  create: (data) => api.post('/api/dates', data),
  get: (id) => api.get(`/api/dates/${id}`),
  update: (id, data) => api.put(`/api/dates/${id}`, data),
  delete: (id) => api.delete(`/api/dates/${id}`),
  generatePlan: (id) => api.post(`/api/dates/${id}/generate-plan`),
  evaluate: (id, data) => api.post(`/api/dates/${id}/evaluate`, data),
  getChecklistTemplate: () => api.get('/api/dates/checklist-template'),
  updateChecklist: (id, checklist) => api.put(`/api/dates/${id}/checklist`, { checklist }),
  discuss: (id, message) => api.post(`/api/dates/${id}/discuss`, { message }),
  pushToClient: (id) => api.post(`/api/dates/${id}/push-to-client`),
  getClientPending: () => api.get('/api/dates/client-pending'),
  submitClientFeedback: (id, feedback) => api.post(`/api/dates/${id}/client-feedback`, feedback),
  clientConfirm: (id) => api.post(`/api/dates/${id}/client-confirm`),
  // 个性化访谈
  generateInterview: (id) => api.post(`/api/dates/${id}/generate-interview`),
  pushInterview: (id) => api.post(`/api/dates/${id}/push-interview`),
  getClientInterviews: () => api.get('/api/dates/client-interviews'),
  submitInterview: (id, answers) => api.post(`/api/dates/${id}/submit-interview`, { answers }),
  generateReviewReport: (id) => api.post(`/api/dates/${id}/generate-review-report`),
};

// 付款
export const payments = {
  list: (params) => api.get('/api/payments' + (params ? '?' + new URLSearchParams(params) : '')),
  create: (data) => api.post('/api/payments', data)
};

// 进度
export const progress = {
  list: (params) => api.get('/api/progress' + (params ? '?' + new URLSearchParams(params) : '')),
  report: (clientId) => api.get(`/api/progress/report/${clientId}`),
  update: (data) => api.post('/api/progress', data)
};

// 通知
export const notifications = {
  list: (params) => api.get('/api/notifications' + (params ? '?' + new URLSearchParams(params) : '')),
  read: (id) => api.post(`/api/notifications/${id}/read`),
  readAll: () => api.post('/api/notifications/read-all')
};

// 周报（M007 S04）
export const weeklyReview = {
  get: (clientId) => api.get(`/api/clients/${clientId}/weekly-review`),
  history: (clientId, limit = 8) => api.get(`/api/clients/${clientId}/weekly-review/history?limit=${limit}`),
  generate: (clientId) => api.post(`/api/clients/${clientId}/weekly-review/generate`),
};

// AI军师
export const aiCoach = {
  situation: (data) => api.post('/api/ai-coach/situation', data),
  analyzeChat: (data) => api.post('/api/ai-coach/analyze-chat', data),
  replySuggestions: (data) => api.post('/api/ai-coach/reply-suggestions', data),
  optimizeReply: (data) => api.post('/api/ai-coach/optimize-reply', data),
moment: (data) => api.post('/api/ai-coach/moment', data),
  overview: () => api.get('/api/ai-coach/overview'),
  girlSummary: (girlId) => api.get(`/api/ai-coach/girl-summary/${girlId}`)
};

// 实战聊天（操盘手帮客户和女生聊）
export const chatPartner = {
  analyze: (data) => api.post('/api/chat-partner/analyze', data),
  optimizeMessage: (data) => api.post('/api/chat-partner/optimize-message', data),
  feedback: (data) => api.post('/api/chat-partner/feedback', data),
  history: (girlId) => api.get(`/api/chat-partner/history/${girlId}`),
  send: (data) => api.post('/api/chat-partner/send', data),
  pendingUpdates: (girlId) => api.get(`/api/chat-partner/pending-updates/${girlId}`),
  approveUpdates: (updateIds, approve) => api.post('/api/chat-partner/approve-updates', { updateIds, approve }),
  applyUpdate: (updateId) => api.post(`/api/chat-partner/apply-update/${updateId}`),
  // 女生档案待确认
  girlProfilePending: (girlId) => api.get(`/api/chat-partner/girl-profile/pending/${girlId}`),
  confirmGirlProfile: (data) => api.post('/api/chat-partner/girl-profile/confirm', data),
  rejectGirlProfile: (data) => api.post('/api/chat-partner/girl-profile/reject', data),
  // 客户聊天分析（操盘手↔客户沟通时的AI军师）
  analyzeClient: (data) => api.post('/api/chat-partner/client-analyze', data),
  optimizeClientMessage: (data) => api.post('/api/chat-partner/client-optimize', data),
  // 客户档案待确认
  clientProfilePending: (clientId) => api.get(`/api/chat-partner/client-profile/pending/${clientId}`),
  confirmClientProfile: (data) => api.post('/api/chat-partner/client-profile/confirm', data),
  rejectClientProfile: (data) => api.post('/api/chat-partner/client-profile/reject', data),
  // 朋友圈分析
  analyzeMoment: (data) => api.post('/api/chat-partner/analyze-moment', data),
  momentFeedback: (data) => api.post('/api/chat-partner/moment-feedback', data),
};

// 聊天截图
export const chatScreenshots = {
  byGirl: (girlId) => api.get(`/api/chat-screenshots/girl/${girlId}`),
  my: (params) => api.get('/api/chat-screenshots/client/me' + (params ? '?' + new URLSearchParams(params) : '')),
  upload: async (formData) => {
    const token = api.getToken();
    const res = await fetch(`${api.baseUrl}/api/chat-screenshots`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    return res.json();
  },
  updateNotes: (id, notes) => api.patch(`/api/chat-screenshots/${id}/notes`, { notes }),
  aiNotes: (id) => api.post(`/api/chat-screenshots/${id}/ai-notes`),
  delete: (id) => api.delete(`/api/chat-screenshots/${id}`),
  confirmFields: (girlId, selectedFields) => api.post('/api/chat-screenshots/confirm-fields', { girlId, selectedFields })
};

// Dashboard
export const dashboard = {
  stats: (clientId) => api.get('/api/dashboard/stats' + (clientId ? '?clientId=' + clientId : '')),
  brief: (clientId) => api.get('/api/dashboard/brief' + (clientId ? '?clientId=' + clientId : '')),
  todayTasks: (clientId) => api.get('/api/dashboard/today-tasks' + (clientId ? '?clientId=' + clientId : '')),
  weekTasks: (clientId) => api.get('/api/dashboard/week-tasks' + (clientId ? '?clientId=' + clientId : '')),
  alerts: (clientId) => api.get('/api/dashboard/alerts' + (clientId ? '?clientId=' + clientId : '')),
  analyzeAll: (clientId) => api.post('/api/dashboard/analyze-all' + (clientId ? '?clientId=' + clientId : '')),
  analyzeResult: (jobId) => api.get(`/api/dashboard/analyze-result/${jobId}`)
};

// 主动预警（M007 S02）
export const alerts = {
  list: (params) => api.get('/api/alerts' + (params ? '?' + new URLSearchParams(params) : '')),
  stats: (clientId) => api.get('/api/alerts/stats' + (clientId ? '?clientId=' + clientId : '')),
  evaluate: (clientId) => api.post('/api/alerts/evaluate' + (clientId ? '?clientId=' + clientId : '')),
  acknowledge: (id) => api.post(`/api/alerts/${id}/acknowledge`),
  dismiss: (id) => api.post(`/api/alerts/${id}/dismiss`),
  resolve: (id, reason) => api.post(`/api/alerts/${id}/resolve`, { reason }),
};

// 日历事件
export const events = {
  list: (params) => api.get('/api/events' + (params ? '?' + new URLSearchParams(params) : '')),
  get: (id) => api.get(`/api/events/${id}`),
  create: (data) => api.post('/api/events', data),
  update: (id, data) => api.put(`/api/events/${id}`, data),
  delete: (id) => api.delete(`/api/events/${id}`),
  updateStatus: (id, status) => api.patch(`/api/events/${id}/status`, { status }),
  batch: (data) => api.post('/api/events/batch', data),
};

// 会员/积分/邀请/学习版块
export const membership = {
  status: () => api.get('/api/membership/status'),
  purchase: (couponToUse = 0) => api.post('/api/membership/purchase', { couponToUse }),
  // 管理员
  adminList: () => api.get('/api/membership/admin/list'),
  adminSet: (userId, action, data) => api.post('/api/membership/admin/set', { userId, action, ...data }),
  // 积分
  points: () => api.get('/api/membership/points'),
  pointsRecharge: (userId, amount, note) => api.post('/api/membership/points/recharge', { userId, amount, note }),
  pointsDeduct: (userId, amount, note) => api.post('/api/membership/points/deduct', { userId, amount, note }),
  // 抵扣券
  coupons: () => api.get('/api/membership/coupons'),
  grantCoupon: (userId, value, note) => api.post('/api/membership/coupons/grant', { userId, value, note }),
  // 邀请
  createInviteCode: () => api.post('/api/membership/invitation/create'),
  myInvitationStats: () => api.get('/api/membership/invitation/my-stats'),
  // 学习
  chapters: () => api.get('/api/membership/learning/chapters'),
  learningProgress: () => api.get('/api/membership/learning/progress'),
  updateLearningProgress: (chapterId, status) => api.put(`/api/membership/learning/progress/${chapterId}`, { status }),
  // AI约会方案
  generateDatingPlan: (data) => api.post('/api/membership/dating-plan/generate', data),
  datingPlans: () => api.get('/api/membership/dating-plan'),
  getDatingPlan: (id) => api.get(`/api/membership/dating-plan/${id}`),
  // 截图识别档案
  uploadScreenshot: async (formData) => {
    const token = api.getToken();
    const res = await fetch(`${api.baseUrl}/api/membership/screenshot/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    return res.json();
  },
  screenshotProfiles: (status) => api.get('/api/membership/screenshot/profiles' + (status ? '?status=' + status : '')),
  confirmScreenshotProfile: (profileId, action, linkedUserId) =>
    api.post(`/api/membership/screenshot/profile/${profileId}/confirm`, { action, linkedUserId }),
};

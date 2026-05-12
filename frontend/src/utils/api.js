/**
 * API 工具类
 */
import imageCompression from 'browser-image-compression';
import { parseErrorResponse, ErrorType } from './errorHandler';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * 将 OSS 相对路径转为完整 URL
 * @param {string} path - 如 /public/images/xxx.png
 * @returns {string} 完整 URL
 */
export function getMediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

// API缓存配置
const CACHE_TTL = 5 * 60 * 1000; // 5分钟
const apiCache = new Map();

class Api {
  constructor() {
    this.baseUrl = API_BASE;
    this.errorHandler = null;
    this.maxRetries = 2;
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

  // 缓存GET请求
  getCached(path) {
    const cached = apiCache.get(path);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return Promise.resolve(cached.data);
    }
    return this.get(path).then(data => {
      apiCache.set(path, { data, timestamp: Date.now() });
      return data;
    });
  }

  // 清除缓存
  clearCache() {
    apiCache.clear();
  }

  async request(method, path, data = null, timeoutMs = 15000, retries = null) {
    return this._request(method, path, data, timeoutMs, retries, false);
  }

  // silent: 不触发全局 errorHandler（用于登录等有局部错误处理的场景）
  async silentRequest(method, path, data = null, timeoutMs = 15000, retries = null) {
    return this._request(method, path, data, timeoutMs, retries, true);
  }

  async _request(method, path, data = null, timeoutMs = 15000, retries = null, silent = false) {
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
    const retryCount = retries !== null ? retries : this.maxRetries;

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
      // 网络错误，检查是否重试
      if (retryCount > 0 && (err.name === 'AbortError' || err.name === 'TypeError')) {
        console.log(`[API] 请求失败，重试剩余次数: ${retryCount - 1}, path: ${path}`);
        return this._request(method, path, data, timeoutMs, retryCount - 1, silent);
      }
      let errorMsg = '网络连接失败，请检查网络设置';
      if (err.name === 'AbortError') {
        errorMsg = '请求超时，请稍后重试';
      }
      const error = {
        type: ErrorType.NETWORK,
        code: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: errorMsg,
      };
      if (!silent && this.errorHandler) this.errorHandler(error);
      throw error;
    }

    if (!response.ok) {
      const error = parseErrorResponse(response, result);

      // 401 清除 token 并跳转登录（跳过登录页本身，避免冲掉错误提示）
      if (error.type === ErrorType.AUTH && window.location.pathname !== '/login') {
        this.removeToken();
        window.location.href = '/login';
      }

      if (!silent && this.errorHandler) {
        this.errorHandler(error);
      }

      throw Object.assign(new Error(error.message), error);
    }

    clearTimeout(timeoutId);
    return result;
  }

  get(path) { return this.request('GET', path); }
  post(path, data, timeoutMs) { return this.request('POST', path, data, timeoutMs); }
  put(path, data, timeoutMs) { return this.request('PUT', path, data, timeoutMs); }
  delete(path) { return this.request('DELETE', path); }

  // 版本号缓存：首次请求正常缓存，再次请求时先检查版本号
  // 缓存命中（TTL 内）→ 直接返回；缓存过期 → 检查版本号，没变则续期，变了则重新请求
  async getCachedWithVersion(path, versionKey, ttlMs = 86400000) {
    const cached = apiCache.get(path);
    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return cached.data;
    }
    if (cached) {
      try {
        const verRes = await this.get(versionKey);
        if (verRes.success && verRes.version === cached.version) {
          apiCache.set(path, { ...cached, timestamp: Date.now() });
          return cached.data;
        }
      } catch { /* 版本检查失败，当作版本变了，继续重新请求 */ }
    }
    // 无缓存或版本变了，重新请求
    const data = await this.get(path);
    try {
      const verRes = await this.get(versionKey);
      apiCache.set(path, { data, timestamp: Date.now(), version: verRes.version });
    } catch {
      apiCache.set(path, { data, timestamp: Date.now(), version: 0 });
    }
    return data;
  }

  // 上传文件（跳过 JSON Content-Type）
  upload(path, formData, timeoutMs = 60000) {
    const token = this.getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    }).then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `请求失败 (${r.status})`);
      return data;
    });
  }
}

export const api = new Api();

// Auth
export const auth = {
  login: (username, password) => api.silentRequest('POST', '/api/auth/login', { username, password }),
  register: (data) => api.silentRequest('POST', '/api/auth/register', data),
  verify: () => api.get('/api/auth/verify'),
  me: () => api.get('/api/auth/me'),
  logout: () => { api.removeToken(); },
  changePassword: (oldPassword, newPassword, confirmPassword) => api.post('/api/auth/change-password', { oldPassword, newPassword, confirmPassword })
};

// 女生资源
export const girls = {
  list: (params) => api.getCached('/api/girls' + (params ? '?' + new URLSearchParams(params) : '')),
  get: (id) => api.get(`/api/girls/${id}`),
  create: (data) => api.post('/api/girls', data).then(r => { api.clearCache(); return r; }),
  clientAdd: (data) => api.post('/api/girls/client-add', data).then(r => { api.clearCache(); return r; }),
  update: (id, data) => api.put('/api/girls/' + id, data).then(r => { api.clearCache(); return r; }),
  updateAvatar: (id, avatar) => api.patch(`/api/girls/${id}/avatar`, { avatar }).then(r => { api.clearCache(); return r; }),
  delete: (id) => api.delete('/api/girls/' + id).then(r => { api.clearCache(); return r; }),
  // M007 S01: 关系阶段
  evaluateStage: (girlId) => api.post(`/api/girls/${girlId}/evaluate-stage`),
  setRelationshipStage: (girlId, data) => api.put(`/api/girls/${girlId}/relationship-stage`, data),
  getStageHistory: (girlId) => api.get(`/api/girls/${girlId}/stage-history`),
  // M007 S03: 反撇分析
  analyzeReversal: (girlId) => api.post(`/api/girls/${girlId}/analyze-reversal`),
  getReversalRisk: (girlId) => api.get(`/api/girls/${girlId}/reversal-risk`),
  // 客户端编辑女生档案
  clientUpdate: (id, data) => api.put(`/api/girls/${id}/client-update`, data).then(r => { api.clearCache(); return r; }),
  // AI 文字提取 (SSE 流式)
  extractText: async (id, text, { onProgress, onDone, onError } = {}) => {
    const token = api.getToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${API_BASE}/api/girls/${id}/extract-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ text }),
        signal: controller.signal
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '请求失败' }));
        throw new Error(err.error || '请求失败');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;
          const eventMatch = part.match(/^event:\s*(\w+)$/m);
          const dataMatch = part.match(/^data:\s*(.+)$/m);
          if (!dataMatch) continue;

          try {
            const payload = JSON.parse(dataMatch[1].trim());
            const eventType = eventMatch ? eventMatch[1] : '';

            if (eventType === 'progress' && onProgress) {
              onProgress(payload);
            } else if (eventType === 'done' && onDone) {
              onDone(payload);
            } else if (eventType === 'error' && onError) {
              onError(payload.error || 'AI分析失败');
            }
          } catch { /* ignore parse errors */ }
        }
      }
      // 处理剩余 buffer
      if (buffer.trim()) {
        const dataMatch = buffer.match(/^data:\s*(.+)$/m);
        if (dataMatch) {
          try {
            const payload = JSON.parse(dataMatch[1].trim());
            if (payload.success && onDone) onDone(payload);
            else if (payload.error && onError) onError(payload.error);
          } catch { /* ignore */ }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  },
  // 截图上传 + AI 提取
  extractScreenshot: async (id, file) => {
    const token = api.getToken();
    const formData = new FormData();
    formData.append('image', file);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${API_BASE}/api/girls/${id}/extract-screenshot`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '上传失败' }));
        throw new Error(err.error || '上传失败');
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  },
  // 统一快速记录：文字 + 多张图片，AI 提取档案字段
  extractNote: async (id, { text, images } = {}) => {
    const token = api.getToken();
    const formData = new FormData();
    if (text) formData.append('text', text);
    if (images && images.length > 0) {
      images.forEach(file => formData.append('images', file));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    try {
      const response = await fetch(`${API_BASE}/api/girls/${id}/extract-note`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '请求失败' }));
        throw new Error(err.error || '请求失败');
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  },
  // 获取女生关联数据
  getRelated: (id) => api.get(`/api/girls/${id}/related`),
  // 用户主页截图 AI 提取基础档案
  extractProfileScreenshot: async (file) => {
    const token = api.getToken();
    const formData = new FormData();
    formData.append('image', file);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`${API_BASE}/api/girls/extract-profile-screenshot`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '上传失败' }));
        throw new Error(err.error || '上传失败');
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  },
};

// 客户
export const clients = {
  list: (params) => api.get('/api/clients' + (params ? '?' + new URLSearchParams(params) : '')),
  get: (id) => api.get(`/api/clients/${id}`),
  me: () => api.getCachedWithVersion('/api/clients/me', '/api/clients/me/version'),
  update: (id, data) => api.put(`/api/clients/${id}`, data).then(r => { api.clearCache(); return r; }),
  create: (data) => api.post('/api/clients', data).then(r => { api.clearCache(); return r; }),
  extractProfile: (text) => api.post('/api/clients/extract-profile', { text }, 60000),
  extractFromScreenshot: async (file) => {
    const token = api.getToken();
    const formData = new FormData();
    formData.append('image', file);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);
    try {
      const res = await fetch(`${api.baseUrl}/api/clients/extract-from-screenshot`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`截图提取失败 (${res.status})`);
      return res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  },
  extractFromChat: (clientId, messageCount) => api.post(`/api/clients/${clientId}/extract-from-chat`, { messageCount }),
  // M007 S05: 入职完成
  onboardingComplete: (data) => api.post('/api/clients/onboarding-complete', data),
};

// 聊天
export const chat = {
  sessions: () => api.get('/api/chat/sessions'),
  mySessions: () => api.getCachedWithVersion('/api/chat/my-sessions', '/api/chat/my-sessions/version', 180000),
  // 客户端创建会话（自动分配操作员）
  createSession: () => api.post('/api/chat/my-session'),
  // 管理端为客户创建会话
  createSessionForClient: (clientId) => api.post('/api/chat/sessions', { clientId }),
  messages: (sessionId, params) => api.get(`/api/chat/sessions/${sessionId}/messages` + (params ? '?' + new URLSearchParams(params) : '')),
  send: (sessionId, content, type = 'text', mediaUrl, duration, isBurnAfterRead = false, burnAfterSeconds = null, burnTrigger = 'onView') =>
    api.post('/api/chat/messages', { sessionId, content, type, mediaUrl, duration, isBurnAfterRead, burnAfterSeconds, burnTrigger }).then(r => { api.clearCache(); return r; }),
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
  image: async (file, isBurnAfterRead = false, isFlashImage = false, onProgress = null) => {
    const options = {
      maxSizeMB: 0.3,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/jpeg',
      onProgress: onProgress ? (p) => onProgress({ stage: 'compressing', percent: Math.round(p * 100) }) : undefined
    };
    const compressed = await imageCompression(file, options);

    if (onProgress) onProgress({ stage: 'compressing', percent: 100 });

    const token = api.getToken();
    const formData = new FormData();
    formData.append('file', compressed);
    if (isBurnAfterRead) formData.append('isBurnAfterRead', 'true');
    if (isFlashImage) formData.append('isFlashImage', 'true');

    if (onProgress) onProgress({ stage: 'uploading', percent: 0 });

    const res = await fetch(`${api.baseUrl}/api/upload/image`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
      signal: AbortSignal.timeout(60000)
    });

    if (!res.ok) throw new Error(`上传图片失败 (${res.status})`);
    const json = await res.json();
    json.originalSize = file.size;
    json.compressedSize = compressed.size;
    if (onProgress) onProgress({ stage: 'done', percent: 100 });
    return json;
  },
  video: async (file, isBurnAfterRead = false, isFlashImage = false, onProgress = null) => {
    return new Promise((resolve, reject) => {
      const token = api.getToken();
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      if (isBurnAfterRead) formData.append('isBurnAfterRead', 'true');
      if (isFlashImage) formData.append('isFlashImage', 'true');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress({ stage: 'uploading', percent });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = JSON.parse(xhr.responseText);
            if (onProgress) onProgress({ stage: 'done', percent: 100 });
            resolve(json);
          } catch {
            reject(new Error('解析响应失败'));
          }
        } else {
          reject(new Error(`上传视频失败 (${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error('网络错误'));
      xhr.ontimeout = () => reject(new Error('上传超时'));

      xhr.open('POST', `${api.baseUrl}/api/upload/video`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.timeout = 120000; // 2分钟超时
      xhr.send(formData);
    });
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
    if (!res.ok) throw new Error(`上传音频失败 (${res.status})`);
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
  deletePlan: (id) => api.delete(`/api/dates/${id}/plan`),
  generatePlan: (id) => api.post(`/api/dates/${id}/generate-plan`, null, 120000),
  // SSE 流式生成方案，实时显示 AI 思考过程
  generatePlanStream: async (id, callbacks) => {
    const token = localStorage.getItem('zhuiai_token');
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';
    const { onStatus, onReasoning, onContent, onDone, onError } = callbacks;

    try {
      const response = await fetch(`${baseUrl}/api/dates/${id}/generate-plan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        let msg = `请求失败 (${response.status})`;
        try { const j = JSON.parse(err); msg = j.error || msg; } catch {}
        onError?.(msg);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          if (!jsonStr.startsWith('{')) continue;

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.status) onStatus?.(parsed.status);
            if (parsed.reasoning) onReasoning?.(parsed.reasoning);
            if (parsed.content) onContent?.(parsed.content);
            if (parsed.done) onDone?.(parsed.plan, parsed.date);
            if (parsed.error) onError?.(parsed.error);
          } catch { /* skip parse errors */ }
        }
      }
    } catch (err) {
      onError?.(err.message || '网络异常，请稍后重试');
    }
  },
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
  girlSummary: (girlId) => api.get(`/api/ai-coach/girl-summary/${girlId}`),
  // 图片分析（聊天记录/朋友圈截图）
  analyzeImage: async (file, message = '', sessionId = null) => {
    const token = api.getToken();
    const formData = new FormData();
    formData.append('image', file);
    if (message) formData.append('message', message);
    if (sessionId) formData.append('sessionId', sessionId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch(`${api.baseUrl}/api/ai-coach/analyze-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
        signal: controller.signal
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '图片分析失败' }));
        throw new Error(err.error || '图片分析失败');
      }

      return res.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('图片分析超时，请重试');
      }
      if (err.stack) {
        err.message = `图片分析失败: ${err.message}`;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  },
  // 聊天记录分析
  analyzeChatHistory: async (messages, girlId = null) => {
    const token = api.getToken();
    const res = await fetch(`${api.baseUrl}/api/ai-coach/analyze-chat-history`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messages, girlId })
    });
    if (!res.ok) throw new Error('聊天分析失败');
    return res.json();
  },
  // 删除实战消息
  deleteCombatMessage: async (girlId, messageId) => {
    const token = api.getToken();
    const res = await fetch(`${api.baseUrl}/api/ai-coach/combat-message/${girlId}/${messageId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('删除失败');
    return res.json();
  }
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
    if (!res.ok) throw new Error(`上传截图失败 (${res.status})`);
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
  status: () => api.getCachedWithVersion('/api/membership/status', '/api/membership/status/version'),
  purchase: (type, pointsToUse = 0) => api.post('/api/membership/purchase', { type, pointsToUse }).then(r => { api.clearCache(); return r; }),
  // 试用
  activateTrial: () => api.post('/api/membership/trial/activate'),
  trialConfig: () => api.get('/api/membership/trial/config'),
  updateTrialConfig: (data) => api.put('/api/membership/trial/config', data),
  // 管理员
  adminList: () => api.get('/api/membership/admin/list'),
  adminSet: (userId, action, data) => api.post('/api/membership/admin/set', { userId, action, ...data }),
  adminTrial: (userId) => api.post('/api/membership/admin/trial', { userId }),
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
  chapters: () => api.getCachedWithVersion('/api/membership/learning/chapters', '/api/membership/learning/content-version'),
  getChapter: (chapterId) => api.get(`/api/membership/learning/${chapterId}`),
  learningProgress: () => api.getCachedWithVersion('/api/membership/learning/progress', '/api/membership/learning/content-version'),
  updateLearningProgress: (chapterId, status) => api.put(`/api/membership/learning/progress/${chapterId}`, { status }),
  // 个性化学习
  getPersonalizedChapter: (chapterId) => api.get(`/api/membership/learning/${chapterId}?version=personalized`),
  personalizedStatus: () => api.getCachedWithVersion('/api/membership/learning/personalized-status', '/api/membership/learning/content-version'),
  profileCompleteness: () => api.get('/api/membership/profile-completeness'),
  generateAll: () => api.post('/api/membership/learning/generate-all'),
  generateStatus: (batchId) => api.get(`/api/membership/learning/generate-status/${batchId}`),
  regenerate: () => api.post('/api/membership/learning/regenerate'),
  regenerateChapter: (chapterId) => api.post(`/api/membership/learning/regenerate/${chapterId}`),
  // 管理员 - 学习版块
  adminListChapters: () => api.get('/api/membership/admin/learning/chapters'),
  adminGetChapter: (chapterId) => api.get(`/api/membership/admin/learning/chapters/${chapterId}`),
  adminCreateChapter: (data) => api.post('/api/membership/admin/learning/chapters', data),
  adminUpdateChapter: (chapterId, data) => api.put(`/api/membership/admin/learning/chapters/${chapterId}`, data),
  adminDeleteChapter: (chapterId) => api.delete(`/api/membership/admin/learning/chapters/${chapterId}`),
  adminPublishChapter: (chapterId, status) => api.put(`/api/membership/admin/learning/chapters/${chapterId}/publish`, { status }),
  adminReorderChapters: (orderedIds) => api.put('/api/membership/admin/learning/chapters/reorder', { orderedIds }),
  // 管理员 - 内容版本管理
  adminScanContent: (data) => {
    if (data instanceof FormData) {
      return api.upload('/api/membership/admin/learning/scan', data, 60000);
    }
    return api.post('/api/membership/admin/learning/scan', data, 60000);
  },
  adminGetDraftBatch: (batchId) => api.get(`/api/membership/admin/learning/drafts/${batchId}`),
  adminGetChapterDiff: (batchId, chapterId) => api.get(`/api/membership/admin/learning/drafts/${batchId}/${chapterId}/diff`),
  adminConfirmDrafts: (batchId, chapterIds, confirmed) => api.post(`/api/membership/admin/learning/drafts/${batchId}/confirm`, { chapterIds, confirmed }),
  adminGetBatchImpact: (batchId) => api.post(`/api/membership/admin/learning/batches/${batchId}/impact`),
  adminPublishBatch: (batchId, autoRegenerate = false) => api.post(`/api/membership/admin/learning/batches/${batchId}/publish`, { autoRegeneratePersonalized: autoRegenerate }, 120000),
  adminListContentVersions: () => api.get('/api/membership/admin/learning/versions'),
  adminGetContentVersion: (id) => api.get(`/api/membership/admin/learning/versions/${id}`),
  // 用户端 - 确认内容更新通知
  acknowledgeUpdate: (chapterId) => api.post('/api/membership/learning/acknowledge-update', { chapterId }),
  // 管理员 - 个性化管理
  adminListPersonalizationUsers: () => api.get('/api/membership/admin/personalization/users'),
  adminTogglePersonalization: (userId, enabled) => api.post('/api/membership/admin/personalization/toggle', { userId, enabled }),
  adminGetUserPersonalizedChapters: (userId) => api.get(`/api/membership/admin/personalization/users/${userId}/chapters`),
  // AI约会方案
  generateDatingPlan: (data) => api.post('/api/membership/dating-plan/generate', data, 120000),
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
    if (!res.ok) throw new Error(`上传截图失败 (${res.status})`);
    return res.json();
  },
  screenshotProfiles: (status) => api.get('/api/membership/screenshot/profiles' + (status ? '?status=' + status : '')),
  confirmScreenshotProfile: (profileId, action, linkedUserId) =>
    api.post(`/api/membership/screenshot/profile/${profileId}/confirm`, { action, linkedUserId }),
  // 活跃度追踪
  activity: {
    dashboard: () => api.get('/api/admin/activity/dashboard'),
    clients: (level) => api.get('/api/admin/activity/clients' + (level ? '?level=' + level : '')),
    clientDetail: (id, days = 30) => api.get(`/api/admin/activity/clients/${id}?days=${days}`),
    dormantUsers: () => api.get('/api/admin/activity/dormant-users'),
    trend: (days = 30) => api.get('/api/admin/activity/trend?days=' + days),
    growth: (days = 90) => api.get('/api/admin/activity/growth?days=' + days),
  },
};

// 综合报表
export const reports = {
  overview: (range = 'day') => api.get('/api/reports/overview?range=' + range),
};

// AI军师 - 聊天记录分析
export const analyzeChatHistory = (messages, girlId) => api.analyzeChatHistory(messages, girlId);
// AI军师 - 删除实战消息
export const deleteCombatMessage = (girlId, messageId) => api.deleteCombatMessage(girlId, messageId);

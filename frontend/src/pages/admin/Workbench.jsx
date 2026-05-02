import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Flex, Heading, Text, Card, CardBody, CardHeader, Button, Select, Textarea, SimpleGrid, Badge, VStack, HStack, Divider, Spinner, useToast, Tabs, TabList, TabPanels, Tab, TabPanel, Icon, Input, Checkbox, Collapse, Alert, AlertIcon, Image, FormControl, FormLabel, Text as CText } from '@chakra-ui/react';
import { clients, girls, chat, chatPartner, aiCoach, events as eventsApi } from '../../utils/api';
import { captureError } from '../../utils/frontendErrorCapture';
import { useSocket } from '../../contexts/SocketContext';
import { FiSend, FiMessageSquare, FiTarget, FiZap, FiAlertCircle, FiCheck, FiCopy, FiUser, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { HeartIcon } from '../../components/Icons';
import SelectionToCalendar from '../../components/SelectionToCalendar';

export default function AdminWorkbench() {
  const [clientList, setClientList] = useState([]);
  const [girlsList, setGirlsList] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedGirl, setSelectedGirl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [situation, setSituation] = useState('');
  const [deepMode, setDeepMode] = useState(false);
  const [optimized, setOptimized] = useState(null); // deprecated - kept for backward compat
  const [sendingContent, setSendingContent] = useState('');
  const toast = useToast();

  // 实战聊天状态
  const [chatHistory, setChatHistory] = useState([]);
  const [girlMessage, setGirlMessage] = useState('');
  const [myMessage, setMyMessage] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [optimizations, setOptimizations] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [battleMode, setBattleMode] = useState('analyze');
  const [chatMode, setChatMode] = useState('suggest'); // 'suggest' | 'optimize'
  const messagesEndRef = useRef(null);
  const analysisRef = useRef(null);
  const momentRef = useRef(null);

  // 实战聊天模式：和客户聊天 / 和女生聊天
  const [workbenchChatMode, setWorkbenchChatMode] = useState('girl');
  const [clientSession, setClientSession] = useState(null);
  const [clientMessages, setClientMessages] = useState([]);
  const [clientInput, setClientInput] = useState('');
  const [sendingClientMsg, setSendingClientMsg] = useState(false);

  // 客户聊天 AI 能力
  const [clientChatMode, setClientChatMode] = useState('suggest'); // 'suggest' | 'optimize'
  const [clientChatHistory, setClientChatHistory] = useState([]); // 多轮对话
  const [clientMsg, setClientMsg] = useState(''); // 粘贴的客户消息
  const [clientMyMsg, setClientMyMsg] = useState(''); // 操盘手想发的话
  const [clientAiAnalysis, setClientAiAnalysis] = useState('');
  const [clientAiSummary, setClientAiSummary] = useState('');
  const [clientAiSuggestions, setClientAiSuggestions] = useState([]);
  const [clientOptimizations, setClientOptimizations] = useState([]);
  const [clientAnalyzing, setClientAnalyzing] = useState(false);
  const [clientOptimizing, setClientOptimizing] = useState(false);

  // Socket.io
  const { on } = useSocket();

  // 异步反馈状态
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [currentGirlState, setCurrentGirlState] = useState(null); // 用于 diff
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const pollingRef = useRef(null);

  // 档案提取待确认状态（女生聊天）
  const [profilePendingId, setProfilePendingId] = useState(null);
  const [profilePendingFields, setProfilePendingFields] = useState({}); // { fieldKey: { label, value } }
  const [selectedProfileFields, setSelectedProfileFields] = useState({}); // 用户勾选的字段
  const [showProfileFields, setShowProfileFields] = useState(false); // 展开档案更新面板

  // 档案提取待确认状态（客户聊天）
  const [clientProfilePendingId, setClientProfilePendingId] = useState(null);
  const [clientProfilePendingFields, setClientProfilePendingFields] = useState({});
  const [selectedClientProfileFields, setSelectedClientProfileFields] = useState({});

  // 朋友圈模式状态
  const [momentText, setMomentText] = useState('');
  const [momentImage, setMomentImage] = useState(null); // File object
  const [momentImagePreview, setMomentImagePreview] = useState('');
  const [momentAnalysis, setMomentAnalysis] = useState('');
  const [commentSuggestions, setCommentSuggestions] = useState([]);
  const [dmSuggestions, setDmSuggestions] = useState([]);
  const [momentLoading, setMomentLoading] = useState(false);

  // 主动教练状态
  const [activeCoachText, setActiveCoachText] = useState('');
  const [activeCoachLoading, setActiveCoachLoading] = useState(false);
  const [activeCoachCached, setActiveCoachCached] = useState(false);   // 缓存命中标记
  const [activeCoachChangeReason, setActiveCoachChangeReason] = useState(null); // 变化原因标签
  const [coachCollapsed, setCoachCollapsed] = useState(false);

  // AI教练行动建议
  const [coachRecommendations, setCoachRecommendations] = useState([]); // [{ id, action, girlId, girlName, added }]
  const [addingRecommendation, setAddingRecommendation] = useState(null); // 正在添加的 recommendation
  const activeCoachRef = useRef(null);

  // 主动教练 hash 缓存（替代 5 分钟 TTL）
  // { [key]: { content, girlDataHash, userDataHash, timestamp } }
  const coachCacheRef = useRef({});

  // ========== 主动教练 ==========
  // 计算女生侧 dataHash（前端用，与后端 computeGirlDataHash 对应）
  const computeGirlDataHash = (girl) => {
    if (!girl) return '';
    const signals = (girl.signals?.length || 0);
    const pendingActions = (girl.pendingActions?.length || 0);
    const raw = [
      girl.tensionScore ?? 5.0,
      girl.intimacyLevel ?? 1,
      girl.stage || '',
      signals,
      pendingActions
    ].join('|');
    // 简单 hash（不需要 crypto，MD5 在前端太重）
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  };

  // 计算用户侧 dataHash（前端用，与后端 computeUserDataHash 对应）
  const computeUserDataHash = (user) => {
    if (!user) return '';
    const signals = (user.signals?.length || 0);
    const pendingActions = (user.pendingActions?.length || 0);
    const raw = [
      user.currentStage || '',
      user.stageProgress ?? 0,
      user.trustLevel ?? 1,
      user.interactionHeat ?? 5.0,
      user.serviceStage || '',
      user.emotionalStable ?? 5,
      user.antiFrustrationLevel ?? 5,
      user.coachCooperation || '',
      user.clientType || '',
      signals,
      pendingActions
    ].join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  };

  const fetchActiveCoach = useCallback(async (forceRefresh = false) => {
    // 取消之前的请求并创建新的 AbortController
    if (activeCoachAbortRef.current) {
      activeCoachAbortRef.current.abort();
    }
    activeCoachAbortRef.current = new AbortController();

    const token = localStorage.getItem('zhuiai_token');
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';
    // 缓存 key 要区分三级：全局概览 / 客户池分析 / 女生专项
    const cacheKey = selectedGirl?.id ? `girl:${selectedGirl.id}` : selectedClient?.id ? `client:${selectedClient.id}` : 'overview';

    // 计算当前 hash
    const currentGirlHash = selectedGirl ? computeGirlDataHash(selectedGirl) : '';
    const currentUserHash = selectedClient ? computeUserDataHash(selectedClient) : '';

    // Hash 比对缓存：hash 匹配则用缓存内容，不调 AI
    if (!forceRefresh) {
      const cached = coachCacheRef.current[cacheKey];
      if (cached &&
          cached.girlDataHash === currentGirlHash &&
          cached.userDataHash === currentUserHash) {
        setActiveCoachCached(true);
        setActiveCoachChangeReason(null);
        setActiveCoachText(cached.content);
        if (activeCoachRef.current) activeCoachRef.current.textContent = stripMarkdown(cached.content);
        console.log('[coach] cache hit, reason: hash match');
        return;
      }
    }

    // 构建 URL（带 hash 参数）
    // 三级逻辑：无女生但无客户 → /overview 全局分析
    //          无女生但有客户 → /client-pool/:clientId 客户池分析
    //          有女生 → /girl-summary/:girlId 女生专项分析
    let url;
    if (selectedGirl?.id) {
      url = `${apiUrl}/api/ai-coach/girl-summary/${selectedGirl.id}`;
      if (currentGirlHash || currentUserHash) {
        url += `?cachedGirlHash=${encodeURIComponent(currentGirlHash)}&cachedUserHash=${encodeURIComponent(currentUserHash)}`;
      }
    } else if (selectedClient?.id) {
      url = `${apiUrl}/api/ai-coach/client-pool/${selectedClient.id}`;
      if (currentUserHash) {
        url += `?cachedClientHash=${encodeURIComponent(currentUserHash)}`;
      }
    } else {
      // 无客户 → 全局概览
      url = `${apiUrl}/api/ai-coach/overview`;
      if (currentUserHash) {
        url += `?cachedUserHash=${encodeURIComponent(currentUserHash)}`;
      }
    }

    // 保存旧文本用于错误时恢复
    const prevText = activeCoachText;

    setActiveCoachLoading(true);
    setActiveCoachCached(false);
    setActiveCoachChangeReason(null);
    setActiveCoachText('');
    if (activeCoachRef.current) activeCoachRef.current.textContent = '';

    // 15秒超时
    const timeoutId = setTimeout(() => {
      activeCoachAbortRef.current?.abort();
    }, 15000);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
        signal: activeCoachAbortRef.current?.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        // 恢复旧文本
        setActiveCoachText(prevText);
        if (activeCoachRef.current) activeCoachRef.current.textContent = prevText;
        setActiveCoachLoading(false);
        return;
      }

      if (!res.body) {
        setActiveCoachText(prevText);
        if (activeCoachRef.current) activeCoachRef.current.textContent = prevText;
        setActiveCoachLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      let metaReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.substring(6);
            if (!jsonStr.startsWith('{')) continue;
            try {
              const parsed = JSON.parse(jsonStr);

              // 处理 meta 帧（第一帧：cached / changeReason）
              if (!metaReceived && parsed.cached !== undefined) {
                metaReceived = true;
                setActiveCoachCached(parsed.cached === true);
                if (parsed.changeReason) {
                  setActiveCoachChangeReason(parsed.changeReason);
                  console.log(`[coach] cache miss, reason: ${parsed.changeReason}`);
                } else {
                  console.log('[coach] cache hit from backend');
                }
                continue; // 不渲染 meta 帧内容
              }

              if (parsed.content) {
                text += parsed.content;
                if (activeCoachRef.current) {
                  activeCoachRef.current.textContent = stripMarkdown(text);
                }
              }
            } catch { /* ignore */ }
          }
        }
      }

      // 写入缓存（存 content + 当前 hash）
      coachCacheRef.current[cacheKey] = {
        content: text,
        girlDataHash: currentGirlHash,
        userDataHash: currentUserHash,
        timestamp: Date.now()
      };
      setActiveCoachText(text);
    } catch (err) {
      // abort 或网络错误：恢复旧文本
      if (err.name !== 'AbortError') {
        captureError(err, { context: 'coach_sse' });
        setActiveCoachText(prevText);
        if (activeCoachRef.current) activeCoachRef.current.textContent = prevText;
      }
    } finally {
      setActiveCoachLoading(false);
    }
  }, [selectedGirl?.id, selectedClient?.id]);

  // 切换女生时自动触发主动教练
  useEffect(() => {
    fetchActiveCoach();
  }, [fetchActiveCoach, selectedGirl?.id, selectedClient?.id]);

  // 轮询待审核更新
  const fetchPendingUpdates = useCallback(async () => {
    if (!selectedGirl?.id) return;
    try {
      const res = await chatPartner.pendingUpdates(selectedGirl.id);
      if (res.success) {
        setPendingUpdates(res.updates || []);
        setCurrentGirlState(res.currentState);
      }
    } catch {
      // ignore polling errors silently
    }
  }, [selectedGirl?.id]);

  // 加载/创建客户会话（和客户聊天模式）
  const loadClientSession = useCallback(async () => {
    if (!selectedClient) return;
    try {
      const res = await chat.createSession(selectedClient.id);
      if (res.success) {
        setClientSession(res.session);
      }
    } catch {
      captureError(new Error('请求错误'), { context: 'workbench_api' });
    }
  }, [selectedClient]);

  const loadClientMessages = useCallback(async () => {
    if (!clientSession) return;
    try {
      const res = await chat.messages(clientSession.id);
      if (res.success) setClientMessages(res.messages || []);
    } catch {
      captureError(new Error('请求错误'), { context: 'workbench_api' });
    }
  }, [clientSession]);

  // 加载客户列表（不自动选中第一个，保留空白状态让用户主动选择）
  const loadClients = useCallback(async () => {
    try {
      const res = await clients.list();
      if (res.success) {
        setClientList(res.clients);
        // 不自动选中第一个 — 空状态是合理的入口点
        // setSelectedClient 和 setSelectedGirl 都保持 null
        // 主动教练在空客户时会调用 /overview 全局分析
      }
    } catch {
      captureError(new Error('请求错误'), { context: 'workbench_api' });
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, aiSuggestions]);

  useEffect(() => {
    if (selectedGirl?.id) {
      fetchPendingUpdates();
      pollingRef.current = setInterval(fetchPendingUpdates, 5000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedGirl?.id, fetchPendingUpdates]);

  // 当切换到"和客户聊天"模式时，加载会话
  useEffect(() => {
    if (workbenchChatMode === 'client' && selectedClient) {
      loadClientSession();
    }
  }, [workbenchChatMode, selectedClient?.id, selectedClient, loadClientSession]);

  // 会话加载后获取消息
  useEffect(() => {
    if (clientSession) {
      loadClientMessages();
    }
  }, [clientSession?.id, clientSession, loadClientMessages]);

  // Socket.io 监听实时消息（和客户聊天模式）
  useEffect(() => {
    if (workbenchChatMode !== 'client' || !clientSession) return;

    const handler = (message) => {
      if (message.senderRole === 'operator') return;
      if (message.sessionId === clientSession.id) {
        setClientMessages(prev => [...prev, message]);
      }
    };
    on('message:new', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbenchChatMode, clientSession?.id, on]);

  // 切换实战聊天模式时重置状态
  const switchWorkbenchChatMode = (mode) => {
    setWorkbenchChatMode(mode);
    if (mode === 'client' || mode === 'moment') {
      // 清理女生聊天状态
      setChatHistory([]);
      setAiAnalysis('');
      setAiSuggestions([]);
      setOptimizations([]);
      setSendingContent('');
      setGirlMessage('');
      setMyMessage('');
      setBattleMode('analyze');
      setPendingUpdates([]);
    } else {
      // 清理客户聊天状态
      setClientMessages([]);
      setClientSession(null);
      setClientInput('');
      setClientChatHistory([]);
      setClientAiAnalysis('');
      setClientAiSummary('');
      setClientAiSuggestions([]);
      setClientOptimizations([]);
      setClientMsg('');
      setClientMyMsg('');
    }
  };

  const selectClient = async (client) => {
    setSelectedClient(client);
    setSelectedGirl(null);
    setGirlsList([]); // 清空女生列表，切换客户时重新加载
    setResponse(null);
    try {
      const res = await girls.list({ clientId: client.id });
      if (res.success) setGirlsList(res.girls);
    } catch {
      captureError(new Error('请求错误'), { context: 'workbench_api' });
    }
  };

  const selectGirl = async (girl) => {
    setSelectedGirl(girl);
    setResponse(null);
    setChatHistory([]);
    setAiAnalysis('');
    setAiSuggestions([]);
    setOptimizations([]);
    setSendingContent('');
    setOptimized(null);
    setBattleMode('analyze');
    setMyMessage('');
    setGirlMessage('');
  };

  // ========== 情况咨询 ==========
  // deepMode=true → 非流式，走 coach-engine 工具链（add_signal/update_tension/record_learning）
  // deepMode=false → 流式，快思考
  const handleSituation = async () => {
    if (!situation.trim()) return;
    setLoading(true);
    setResponse(null);
    setAiAnalysis('');

    const token = localStorage.getItem('zhuiai_token');
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';

    try {
      // 深度模式（useTools）走非流式，触发 coach-engine 工具调用
      // 快速模式走流式，无工具调用
      const doStream = !deepMode;

      const res = await fetch(`${apiUrl}/api/ai-coach/situation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          situation,
          girlId: selectedGirl?.id,
          stream: doStream
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      if (doStream) {
        // 流式模式（SSE）
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let analysis = '';

        if (analysisRef.current) analysisRef.current.innerHTML = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.substring(6);
              if (!jsonStr.startsWith('{')) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.content) {
                  analysis += parsed.content;
                  if (analysisRef.current) {
                    analysisRef.current.textContent = stripMarkdown(analysis);
                  }
                }
                if (parsed.error) toast({ title: '分析失败', status: 'error' });
              } catch { /* ignore non-JSON chunk */ void 0; }
            }
          }
        }

        setAiAnalysis(analysis);
        setResponse({ coachName: 'AI统一教练', analysis });
        processRecommendations(analysis);
      } else {
        // 非流式模式（JSON，支持工具调用）
        const data = await res.json();
        if (data.success) {
          setAiAnalysis(data.analysis || '');
          if (analysisRef.current) {
            analysisRef.current.textContent = stripMarkdown(data.analysis || '');
          }
          setResponse({ coachName: data.coachName || 'AI统一教练', analysis: data.analysis });
          processRecommendations(data.analysis || '');
        } else {
          throw new Error(data.error || '分析失败');
        }
      }
    } catch {
      toast({ title: '分析失败', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // ========== AI教练行动建议提取 ==========
  const extractRecommendations = useCallback((text, selGirl, gList) => {
    if (!text) return [];
    const recs = [];
    const allGirls = gList || [];
    const girlNames = allGirls.map(g => g.name).filter(Boolean);
    if (selGirl?.name && !girlNames.includes(selGirl.name)) {
      girlNames.push(selGirl.name);
    }
    const patterns = [
      new RegExp(`(给${selGirl?.name || 'X'}[^，。！？]{0,30})`, 'g'),
      new RegExp(`(${selGirl?.name || 'X'}[该]?[^，。！？]{0,10}(?:联系|发消息|约|跟进)\\s*[^，。！？]{0,20})`, 'g'),
    ];
    if (selGirl?.id && selGirl?.name) {
      for (const p of patterns) {
        let match;
        while ((match = p.exec(text)) !== null) {
          const action = match[1]?.trim();
          if (action && action.length > 2 && action.length < 100) {
            recs.push({ id: `g:${selGirl.id}:${recs.length}`, action, girlId: selGirl.id, girlName: selGirl.name, added: false });
          }
        }
      }
    }
    for (const name of girlNames) {
      if (name === selGirl?.name) continue;
      const p = new RegExp(`(给${name}[^，。！？]{0,30})`, 'g');
      let match;
      while ((match = p.exec(text)) !== null) {
        const action = match[1]?.trim();
        if (action && action.length > 3 && action.length < 100) {
          const girl = allGirls.find(g => g.name === name);
          recs.push({ id: `p:${name}:${recs.length}`, action, girlId: girl?.id || null, girlName: name, added: false });
        }
      }
    }
    const seen = new Set();
    return recs.filter(r => {
      const k = r.action.replace(/\s+/g, '');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 5);
  }, []);

  const handleAddRecommendation = async (rec, clientId) => {
    if (!clientId) { toast({ title: '请先选择客户', status: 'warning', duration: 2000 }); return; }
    setAddingRecommendation(rec.id);
    try {
      const now = new Date(); now.setHours(now.getHours() + 2, 0, 0, 0);
      const res = await eventsApi.create({
        clientId, girlId: rec.girlId || null,
        title: rec.action.length > 60 ? rec.action.slice(0, 60) : rec.action,
        content: rec.action, eventTime: now, type: 'action', source: 'ai_coach',
        aiContext: rec.action, status: 'pending'
      });
      if (res.success) {
        setCoachRecommendations(prev => prev.map(r => r.id === rec.id ? { ...r, added: true } : r));
        toast({ title: '已添加到日历', status: 'success', duration: 2000 });
      } else {
        toast({ title: res.error || '添加失败', status: 'error', duration: 2000 });
      }
    } catch (e) { captureError(e); toast({ title: '添加失败', status: 'error', duration: 2000 }); }
    finally { setAddingRecommendation(null); }
  };

  const processRecommendations = useCallback((text) => {
    setCoachRecommendations(extractRecommendations(text, selectedGirl, girlsList));
  }, [extractRecommendations, selectedGirl, girlsList]);

  // ========== 实战聊天 ==========
  const handleGirlMessage = async () => {
    if (!girlMessage.trim()) return;
    if (!selectedGirl) {
      toast({ title: '请先选择女生', status: 'warning' });
      return;
    }

    setIsAnalyzing(true);

    const newHistory = [...chatHistory, { role: 'girl', content: girlMessage }];
    setChatHistory(newHistory);
    setGirlMessage('');

    try {
      const res = await chatPartner.analyze({
        girlId: selectedGirl.id,
        message: girlMessage,
        history: chatHistory.map(m => ({ role: m.role, content: m.content }))
      });

      if (res.success) {
        setAiAnalysis(res.analysis || '');
        setAiSuggestions(res.suggestions || []);
        // 档案提取结果
        if (res.profilePendingId) {
          const fields = res.pendingFields || {};
          setProfilePendingId(res.profilePendingId);
          setProfilePendingFields(fields);
          // 默认全选
          setSelectedProfileFields(Object.fromEntries(
            Object.entries(fields).map(([k, v]) => [k, v.value])
          ));
          if (Object.keys(fields).length > 0) {
            setShowProfileFields(true);
          }
        }
        setBattleMode('manual');
      }
    } catch {
      toast({ title: 'AI分析失败', status: 'error' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 话术优化 - 操盘手粘贴自己想发的话，AI 给出优化版本
  const handleOptimizeMessage = async () => {
    if (!myMessage.trim()) return;
    if (!selectedGirl) {
      toast({ title: '请先选择女生', status: 'warning' });
      return;
    }

    setIsOptimizing(true);
    setOptimizations([]);
    setBattleMode('manual');

    try {
      const res = await chatPartner.optimizeMessage({
        girlId: selectedGirl.id,
        myMessage: myMessage,
        history: chatHistory.map(m => ({ role: m.role, content: m.content }))
      });

      if (res.success) {
        setOptimizations(res.optimizations || []);
      }
    } catch {
      toast({ title: '话术优化失败', status: 'error' });
    } finally {
      setIsOptimizing(false);
    }
  };

  // 采纳建议 → 异步反馈分析（不阻塞，立即显示）
  const handleSelectSuggestion = async (suggestion) => {
    const replyText = suggestion.text || suggestion.reply || suggestion;
    const style = suggestion.style || suggestion.optimizationType || '建议';
    const intention = suggestion.intention || suggestion.point || '';

    setSendingContent(replyText);
    setOptimized(null);
    setBattleMode('manual');
    setOptimizations([]);
    setAiSuggestions([]);

    // 立即把这条消息加入聊天历史
    setChatHistory(prev => [...prev, { role: 'user', content: replyText, adopted: true }]);
    setAiAnalysis('');
    // 清除档案状态（采纳后由后端处理确认）
    const pid = profilePendingId;
    const pfields = selectedProfileFields;
    setProfilePendingId(null);
    setProfilePendingFields({});
    setSelectedProfileFields({});
    setShowProfileFields(false);

    if (selectedGirl && selectedClient) {
      try {
        const girlMsg = chatHistory.filter(m => m.role === 'girl').pop()?.content || '';
        const res = await chatPartner.feedback({
          girlId: selectedGirl.id,
          clientId: selectedClient.id,
          receiverName: selectedGirl.name,
          chosenReply: replyText,
          originalGirlMessage: girlMsg,
          style,
          intention,
          profilePendingId: pid,
          selectedProfileFields: Object.keys(pfields).length > 0 ? pfields : null
        });

        // 档案确认结果提示
        if (res.profileConfirm?.success && res.profileConfirm.updatedFields?.length > 0) {
          toast({
            title: `档案已更新：${res.profileConfirm.updatedFields.length} 个字段`,
            status: 'success',
            duration: 3000
          });
        }

        // 立即轮询一次，尝试获取刚生成的待审核更新
        setTimeout(() => fetchPendingUpdates(), 500);
      } catch {
        console.warn('反馈记录失败');
      }
    }
  };

  const handleClearChat = () => {
    setChatHistory([]);
    setAiAnalysis('');
    setAiSuggestions([]);
    setOptimizations([]);
    setSendingContent('');
    setGirlMessage('');
    setMyMessage('');
    setBattleMode('analyze');
  };

  // 采纳单条待审核更新
  const handleApproveUpdate = async (updateId) => {
    try {
      await chatPartner.applyUpdate(updateId);
      setPendingUpdates(prev => prev.filter(u => u.id !== updateId));
      // 刷新女生状态
      if (selectedGirl?.id) {
        const res = await girls.get(selectedGirl.id);
        if (res.success && res.girl) {
          setSelectedGirl(res.girl);
        }
      }
      toast({ title: '已采纳更新', status: 'success', duration: 1500 });
    } catch {
      toast({ title: '采纳失败', status: 'error' });
    }
  };

  // 忽略单条待审核更新
  const handleRejectUpdate = async (updateId) => {
    try {
      await chatPartner.approveUpdates([updateId], false);
      setPendingUpdates(prev => prev.filter(u => u.id !== updateId));
      toast({ title: '已忽略', status: 'info', duration: 1500 });
    } catch {
      toast({ title: '操作失败', status: 'error' });
    }
  };

  // 全部采纳
  const handleApproveAll = async () => {
    const ids = pendingUpdates.map(u => u.id);
    try {
      await chatPartner.approveUpdates(ids, true);
      setPendingUpdates([]);
      setShowUpdatePanel(false);
      if (selectedGirl?.id) {
        const res = await girls.get(selectedGirl.id);
        if (res.success && res.girl) {
          setSelectedGirl(res.girl);
        }
      }
      toast({ title: `已采纳 ${ids.length} 条更新`, status: 'success', duration: 2000 });
    } catch {
      toast({ title: '批量采纳失败', status: 'error' });
    }
  };

  // 全部忽略
  const handleRejectAll = async () => {
    const ids = pendingUpdates.map(u => u.id);
    try {
      await chatPartner.approveUpdates(ids, false);
      setPendingUpdates([]);
      setShowUpdatePanel(false);
      toast({ title: `已忽略 ${ids.length} 条更新`, status: 'info', duration: 1500 });
    } catch {
      toast({ title: '批量忽略失败', status: 'error' });
    }
  };

// 朋友圈模式 - 选择图片
  const handleMomentImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMomentImage(file);
      setMomentImagePreview(URL.createObjectURL(file));
    }
  };

  // 朋友圈模式 - 分析（使用AI教练流式输出）
  const handleAnalyzeMoment = async () => {
    if (!selectedGirl) {
      toast({ title: '请先选择女生', status: 'warning' });
      return;
    }
    if (!momentText.trim() && !momentImage) {
      toast({ title: '请输入朋友圈文字或上传图片', status: 'warning' });
      return;
    }

    setMomentLoading(true);
    setMomentAnalysis('');
    setCommentSuggestions([]);
    setDmSuggestions([]);

    if (momentRef.current) momentRef.current.textContent = '';

    const token = localStorage.getItem('zhuiai_token');
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';

    try {
      const payload = {
        girlId: selectedGirl.id,
        momentText: momentText.trim() || undefined,
        stream: true
      };

      // 如果有图片，转成 base64
      if (momentImage) {
        const reader = new FileReader();
        const base64 = await new Promise((resolve) => {
          reader.onload = (ev) => resolve(ev.target.result);
          reader.readAsDataURL(momentImage);
        });
        payload.momentImage = base64;
      }

      const res = await fetch(`${apiUrl}/api/ai-coach/moment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // 流式模式（SSE）
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let analysis = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.substring(6);
            if (!jsonStr.startsWith('{')) continue;
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.content) {
                analysis += parsed.content;
                if (momentRef.current) {
                  momentRef.current.textContent = stripMarkdown(analysis);
                }
              }
              if (parsed.error) toast({ title: '分析失败', status: 'error' });
            } catch { /* ignore non-JSON chunk */ void 0; }
          }
        }
      }

      setMomentAnalysis(analysis);
    } catch (err) {
      toast({ title: err.message || '分析失败', status: 'error' });
    } finally {
      setMomentLoading(false);
    }
  };

  // 朋友圈模式 - 采纳建议
  const handleMomentSuggestion = async (suggestion, replyType) => {
    if (!selectedGirl) return;
    const replyText = suggestion.text || suggestion.reply || suggestion;
    const style = suggestion.style || '';
    const intention = suggestion.intention || '';

    try {
      await chatPartner.momentFeedback({
        girlId: selectedGirl.id,
        chosenReply: replyText,
        replyType,
        momentText: momentText || null,
        style,
        intention
      });
      toast({ title: `已记录${replyType === 'comment' ? '评论' : '私聊'}建议`, status: 'success', duration: 2000 });
    } catch {
      toast({ title: '记录失败', status: 'error' });
    }
  };

  // 朋友圈模式 - 清除
  const handleClearMoment = () => {
    setMomentText('');
    setMomentImage(null);
    setMomentImagePreview('');
    setMomentAnalysis('');
    setCommentSuggestions([]);
    setDmSuggestions([]);
    if (momentRef.current) momentRef.current.textContent = '';
  };

  // 发送消息给客户
  const handleSendToClient = async () => {
    if (!clientInput.trim() || !clientSession) return;
    setSendingClientMsg(true);
    try {
      const res = await chat.send(clientSession.id, clientInput.trim());
      if (res.success) {
        setClientMessages(prev => [...prev, res.message]);
        setClientChatHistory(prev => [...prev, { role: 'operator', content: clientInput.trim() }]);
        setClientInput('');
      }
    } catch {
      toast({ title: '发送失败', status: 'error' });
    } finally {
      setSendingClientMsg(false);
    }
  };

  // 客户聊天 - 分析客户消息 → 回复建议
  const handleClientAnalyze = async () => {
    if (!clientMsg.trim() || !selectedClient) {
      toast({ title: '请先粘贴客户消息', status: 'warning' });
      return;
    }
    setClientAnalyzing(true);
    const newHistory = [...clientChatHistory, { role: 'client', content: clientMsg }];
    setClientChatHistory(newHistory);
    setClientMsg('');

    try {
      const res = await chatPartner.analyzeClient({
        clientId: selectedClient.id,
        message: clientMsg,
        history: newHistory.map(m => ({ role: m.role, content: m.content }))
      });
      if (res.success) {
        setClientAiAnalysis(res.analysis || '');
        setClientAiSummary(res.summary || '');
        setClientAiSuggestions(res.suggestions || []);
        // 档案提取结果
        if (res.profilePendingId) {
          const fields = res.pendingFields || {};
          setClientProfilePendingId(res.profilePendingId);
          setClientProfilePendingFields(fields);
          setSelectedClientProfileFields(Object.fromEntries(
            Object.entries(fields).map(([k, v]) => [k, v.value])
          ));
        }
      }
    } catch {
      toast({ title: 'AI分析失败', status: 'error' });
    } finally {
      setClientAnalyzing(false);
    }
  };

  // 客户聊天 - 话术优化
  const handleClientOptimize = async () => {
    if (!clientMyMsg.trim() || !selectedClient) {
      toast({ title: '请先输入想发的话', status: 'warning' });
      return;
    }
    setClientOptimizing(true);
    try {
      const res = await chatPartner.optimizeClientMessage({
        clientId: selectedClient.id,
        myMessage: clientMyMsg,
        history: clientChatHistory.map(m => ({ role: m.role, content: m.content }))
      });
      if (res.success) {
        setClientOptimizations(res.optimizations || []);
      }
    } catch {
      toast({ title: '话术优化失败', status: 'error' });
    } finally {
      setClientOptimizing(false);
    }
  };

  // 采纳建议 → 填入发送框 + 确认档案更新
  const handleClientSelectSuggestion = async (suggestion) => {
    const text = suggestion.text || suggestion.reply || suggestion;
    setClientInput(text);
    setClientAiSuggestions([]);
    setClientAiAnalysis('');
    setClientAiSummary('');

    // 自动确认档案更新
    const pid = clientProfilePendingId;
    const pfields = selectedClientProfileFields;
    setClientProfilePendingId(null);
    setClientProfilePendingFields({});
    setSelectedClientProfileFields({});

    if (pid && selectedClient && Object.keys(pfields).length > 0) {
      try {
        const res = await chatPartner.confirmClientProfile({
          clientId: selectedClient.id,
          pendingId: pid,
          selectedFields: pfields
        });
        if (res.success && res.updatedFields?.length > 0) {
          toast({ title: `客户档案已更新：${res.updatedFields.length} 个字段`, status: 'success', duration: 3000 });
        }
      } catch (e) {
        console.warn('客户档案确认失败:', e);
      }
    }
  };

  // 采纳优化 → 填入发送框
  const handleClientSelectOptimization = (opt) => {
    const text = opt.text || opt.reply || opt;
    setClientInput(text);
    setClientOptimizations([]);
  };

  // 切换客户聊天模式时重置状态
  const switchClientChatMode = (mode) => {
    setClientChatMode(mode);
    if (mode === 'suggest') {
      setClientOptimizations([]);
      setClientMyMsg('');
    } else {
      setClientAiSuggestions([]);
      setClientAiAnalysis('');
      setClientAiSummary('');
      setClientMsg('');
    }
  };

  const handleClearClientChat = () => {
    setClientChatHistory([]);
    setClientAiAnalysis('');
    setClientAiSummary('');
    setClientAiSuggestions([]);
    setClientOptimizations([]);
    setClientInput('');
    setClientMsg('');
    setClientMyMsg('');
  };
  // 去掉 markdown 符号（* # ` 等），纯文本展示
  const stripMarkdown = (text) => {
    if (!text) return '';
    return text
      .replace(/#{1,6}\s?/g, '')           // 去掉 # 标题
      .replace(/\*\*(.+?)\*\*/g, '$1')    // 去掉 **bold**
      .replace(/\*(.+?)\*/g, '$1')        // 去掉 *italic*
      .replace(/`(.+?)`/g, '$1')          // 去掉 `code`
      .replace(/^[-*+]\s+/gm, '')          // 去掉列表前缀
      .replace(/^\d+\.\s+/gm, '')          // 去掉数字列表
      .replace(/^>\s?/gm, '')              // 去掉引用符号
      .replace(/\n{3,}/g, '\n\n');         // 压缩多余空行
  };

  // 关系热度 emoji
  const getTensionEmoji = (score) => {
    if (score >= 8) return '🔥';
    if (score >= 6) return '💗';
    if (score >= 4) return '💬';
    if (score >= 2) return '❄️';
    return '🧊';
  };

  return (
    <Box>
      <Heading color="white" mb={6}>军师工具</Heading>

      <Flex gap={4} h="calc(100vh - 130px)">
        {/* 左侧：客户和女生选择 */}
        <Box w="280px">
          <Card bg="gray.800" h="100%">
            <CardHeader pb={2}>
              <Text color="gray.400" fontSize="sm">选择客户</Text>
            </CardHeader>
            <CardBody pt={0}>
              <Select
                value={selectedClient?.id || ''}
                placeholder="请选择客户"
                onChange={e => {
                  const c = clientList.find(c => c.id === e.target.value);
                  if (c) selectClient(c);
                }}
                bg="gray.700"
                mb={4}
              >
                {clientList.map(c => (
                  <option key={c.id} value={c.id}>{c.nickname || c.username}</option>
                ))}
              </Select>

              <Divider borderColor="gray.700" my={4} />

              <Text color="gray.400" fontSize="sm" mb={2}>女生资源 ({girlsList.length})</Text>
              <VStack spacing={2} align="stretch">
                {girlsList.map(girl => (
                  <Box
                    key={girl.id}
                    p={3}
                    bg={selectedGirl?.id === girl.id ? 'teal.600' : 'gray.700'}
                    borderRadius="md"
                    cursor="pointer"
                    onClick={() => selectGirl(girl)}
                  >
                    <Text color="white" fontSize="sm" fontWeight="bold">{girl.name}</Text>
                    <HStack spacing={2} mt={1}>
                      <Badge fontSize="xs">{girl.stage}</Badge>
                      <HStack spacing={1}>
                        <Icon as={HeartIcon} color="red.400" boxSize={3} />
                        <Text color="gray.400" fontSize="xs">{girl.intimacyLevel}</Text>
                      </HStack>
                    </HStack>
                  </Box>
                ))}
                {girlsList.length === 0 && (
                  <Text color="gray.500" fontSize="sm">暂无女生</Text>
                )}
              </VStack>
            </CardBody>
          </Card>
        </Box>

        {/* 中间：工具区域 */}
        <Box flex={1}>
          <Tabs variant="soft-rounded" colorScheme="teal">
            <TabList>
              <Tab>情况咨询</Tab>
              <Tab>实战聊天</Tab>
            </TabList>

            <TabPanels>
              {/* 情况咨询 */}
              <TabPanel p={0} pt={4}>
                <Card bg="gray.800" h="calc(100vh - 280px)">
                  <CardBody>
                    <HStack mb={4} justify="space-between">
                      <Text color="teal.400" fontSize="sm" fontWeight="bold">
                        AI统一教练
                      </Text>

                      <HStack
                        bg={deepMode ? 'purple.900' : 'gray.700'}
                        px={3}
                        py={2}
                        borderRadius="md"
                        cursor="pointer"
                        onClick={() => setDeepMode(!deepMode)}
                        border={deepMode ? '1px solid' : 'none'}
                        borderColor="purple.500"
                      >
                        <Icon as={FiZap} color={deepMode ? 'purple.300' : 'gray.400'} boxSize={4} />
                        <Box>
                          <Text color={deepMode ? 'purple.300' : 'gray.300'} fontSize="xs" fontWeight="bold">
                            {deepMode ? '深度分析' : '快速分析'}
                          </Text>
                          <Text color="gray.500" fontSize="xs">
                            {deepMode ? '含工具调用，可记录信号' : '流式输出，快'}
                          </Text>
                        </Box>
                      </HStack>
                    </HStack>

                    <Textarea
                      value={situation}
                      onChange={e => setSituation(e.target.value)}
                      placeholder={deepMode ? '描述当前情况，深度分析会调用工具记录信号、调整热度...' : '描述当前情况...'}
                      bg="gray.700"
                      border="none"
                      color="white"
                      rows={4}
                      mb={4}
                    />

                    <HStack mb={2}>
                      <Button colorScheme={deepMode ? 'purple' : 'teal'} onClick={handleSituation} isLoading={loading}>
                        {deepMode ? '深度分析' : '快速分析'}
                      </Button>
                      {loading && <Spinner size="sm" ml={2} />}
                      {deepMode && (
                        <Badge colorScheme="purple" fontSize="xs">
                          教练可调用：查档案/记信号/调热度/搜经验
                        </Badge>
                      )}
                    </HStack>

                    {(loading || response || aiAnalysis) && (
                      <Box mt={4} p={4} bg="gray.700" borderRadius="md">
                        <HStack mb={2}>
                          <Text color="teal.400" fontSize="sm">
                            {(response || {}).coachName || 'AI统一教练'}的建议
                          </Text>
                          {deepMode && <Badge colorScheme="purple" fontSize="xs">工具已启用</Badge>}
                        </HStack>
                        <Box
                          ref={analysisRef}
                          color="gray.300"
                          fontSize="sm"
                          style={{ whiteSpace: 'pre-wrap' }}
                        />
                      </Box>
                    )}
                  </CardBody>
                </Card>
              </TabPanel>

              {/* 实战聊天 */}
              <TabPanel p={0} pt={4}>
                <Card bg="gray.800" h="calc(100vh - 280px)">
                  <CardBody display="flex" flexDirection="column" gap={3}>
                    {/* 顶部：模式切换 */}
                    <HStack mb={1} bg="gray.700" p={1} borderRadius="md" w="fit-content">
                      <Box
                        px={4}
                        py={2}
                        borderRadius="md"
                        cursor="pointer"
                        bg={workbenchChatMode === 'girl' ? 'teal.600' : 'transparent'}
                        onClick={() => switchWorkbenchChatMode('girl')}
                      >
                        <HStack spacing={2}>
                          <Icon as={HeartIcon} color="pink.400" boxSize={4} />
                          <Text color="white" fontSize="sm" fontWeight="bold">
                            和女生聊天
                          </Text>
                        </HStack>
                      </Box>
                      <Box
                        px={4}
                        py={2}
                        borderRadius="md"
                        cursor="pointer"
                        bg={workbenchChatMode === 'client' ? 'teal.600' : 'transparent'}
                        onClick={() => switchWorkbenchChatMode('client')}
                      >
                        <HStack spacing={2}>
                          <Icon as={FiUser} color="teal.300" boxSize={4} />
                          <Text color="white" fontSize="sm" fontWeight="bold">
                            和客户聊天
                          </Text>
                        </HStack>
                      </Box>
                      <Box
                        px={4}
                        py={2}
                        borderRadius="md"
                        cursor="pointer"
                        bg={workbenchChatMode === 'moment' ? 'purple.600' : 'transparent'}
                        onClick={() => switchWorkbenchChatMode('moment')}
                      >
                        <HStack spacing={2}>
                          <Icon as={FiMessageSquare} color="purple.300" boxSize={4} />
                          <Text color="white" fontSize="sm" fontWeight="bold">
                            朋友圈互动
                          </Text>
                        </HStack>
                      </Box>
                    </HStack>

                    {/* 朋友圈互动模式 */}
                    {workbenchChatMode === 'moment' && !selectedGirl && (
                      <Flex flex={1} align="center" justify="center">
                        <Text color="gray.500">先在左侧选择一个女生开始分析朋友圈</Text>
                      </Flex>
                    )}

                    {workbenchChatMode === 'moment' && selectedGirl && (
                      <Box>
                        {/* 输入区：朋友圈文字 */}
                        <HStack mb={2}>
                          <Icon as={FiMessageSquare} color="purple.400" />
                          <Text color="gray.400" fontSize="sm">
                            粘贴朋友圈文字，或上传截图（可选）
                          </Text>
                        </HStack>
                        <Textarea
                          value={momentText}
                          onChange={e => setMomentText(e.target.value)}
                          placeholder="粘贴朋友圈文字内容..."
                          bg="gray.700"
                          color="white"
                          rows={3}
                          mb={2}
                          _placeholder={{ color: 'gray.400' }}
                        />

                        {/* 图片上传 */}
                        <HStack mb={3}>
                          <FormControl>
                            <FormLabel color="gray.400" fontSize="sm" mb={0}>上传朋友圈截图</FormLabel>
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={handleMomentImageSelect}
                              bg="gray.700"
                              color="white"
                              size="sm"
                              pt={1}
                              _placeholder={{ color: 'gray.400' }}
                            />
                          </FormControl>
                          {momentImagePreview && (
                            <Image
                              src={momentImagePreview}
                              alt="朋友圈截图"
                              maxH="80px"
                              borderRadius="md"
                              objectFit="cover"
                            />
                          )}
                        </HStack>

                        {/* 分析按钮 */}
                        <HStack mb={3}>
                          <Button
                            colorScheme="purple"
                            onClick={handleAnalyzeMoment}
                            isLoading={momentLoading}
                            isDisabled={!momentText.trim() && !momentImage}
                          >
                            {momentImage ? 'AI 分析朋友圈' : '分析文字'}
                          </Button>
                          <Button
                            variant="ghost"
                            color="gray.400"
                            size="sm"
                            onClick={handleClearMoment}
                          >
                            清除
                          </Button>
                        </HStack>

                        {/* AI 朋友圈分析结果（流式文本） */}
                        <Box mb={3} p={3} bg="purple.900" borderRadius="md" borderLeft="3px solid" borderColor="purple.400">
                          <HStack mb={2} justify="space-between">
                            <Text color="purple.200" fontSize="sm" fontWeight="bold">AI 朋友圈分析</Text>
                            {momentAnalysis && (
                              <Button
                                size="xs"
                                variant="ghost"
                                color="purple.300"
                                leftIcon={<Icon as={FiCopy} boxSize={3} />}
                                onClick={() => {
                                  navigator.clipboard.writeText(momentAnalysis);
                                  toast({ description: '已复制到剪贴板', duration: 1500, isClosable: false, position: 'top' });
                                }}
                              >
                                复制
                              </Button>
                            )}
                          </HStack>
                          <Box
                            ref={momentRef}
                            color="gray.300"
                            fontSize="sm"
                            style={{ whiteSpace: 'pre-wrap' }}
                            minH="60px"
                          />
                          {momentLoading && (
                            <HStack mt={2} spacing={2}>
                              <Spinner size="xs" color="purple.300" />
                              <Text color="purple.400" fontSize="xs">AI 分析中...</Text>
                            </HStack>
                          )}
                        </Box>
                      </Box>
                    )}

                    {/* 和客户聊天模式 */}
                    {workbenchChatMode === 'client' && !selectedClient && (
                      <Flex flex={1} align="center" justify="center">
                        <Text color="gray.500">先在左侧选择一个客户</Text>
                      </Flex>
                    )}

                    {workbenchChatMode === 'client' && selectedClient && (
                      <>
                        {/* 顶部：AI模式切换 tabs */}
                        <HStack mb={1} bg="gray.700" p={1} borderRadius="md" w="fit-content">
                          <Box
                            px={4}
                            py={2}
                            borderRadius="md"
                            cursor="pointer"
                            bg={clientChatMode === 'suggest' ? 'teal.600' : 'transparent'}
                            onClick={() => switchClientChatMode('suggest')}
                          >
                            <Text color="white" fontSize="sm" fontWeight="bold">回复建议</Text>
                          </Box>
                          <Box
                            px={4}
                            py={2}
                            borderRadius="md"
                            cursor="pointer"
                            bg={clientChatMode === 'optimize' ? 'orange.600' : 'transparent'}
                            onClick={() => switchClientChatMode('optimize')}
                          >
                            <Text color="white" fontSize="sm" fontWeight="bold">话术优化</Text>
                          </Box>
                        </HStack>

                        {/* 回复建议模式 */}
                        {clientChatMode === 'suggest' && (
                          <Box>
                            <HStack mb={2}>
                              <Icon as={FiMessageSquare} color="blue.400" />
                              <Text color="gray.400" fontSize="sm">
                                粘贴客户的消息，AI 分析意图并给出回复建议
                              </Text>
                            </HStack>
                            <HStack>
                              <Input
                                flex={1}
                                value={clientMsg}
                                onChange={e => setClientMsg(e.target.value)}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleClientAnalyze();
                                  }
                                }}
                                placeholder="粘贴客户的消息..."
                                bg="gray.700"
                                border="none"
                                color="white"
                                _placeholder={{ color: 'gray.400' }}
                              />
                              <Button
                                colorScheme="blue"
                                onClick={handleClientAnalyze}
                                isLoading={clientAnalyzing}
                                isDisabled={!clientMsg.trim()}
                              >
                                分析
                              </Button>
                            </HStack>
                          </Box>
                        )}

                        {/* 话术优化模式 */}
                        {clientChatMode === 'optimize' && (
                          <Box>
                            <HStack mb={2}>
                              <Icon as={FiZap} color="orange.400" />
                              <Text color="gray.400" fontSize="sm">
                                粘贴你想发的话，AI 帮你优化得更专业、更有温度
                              </Text>
                            </HStack>
                            <HStack>
                              <Input
                                flex={1}
                                value={clientMyMsg}
                                onChange={e => setClientMyMsg(e.target.value)}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleClientOptimize();
                                  }
                                }}
                                placeholder="粘贴你想发给客户的话..."
                                bg="gray.700"
                                border="none"
                                color="white"
                                _placeholder={{ color: 'gray.400' }}
                              />
                              <Button
                                colorScheme="orange"
                                onClick={handleClientOptimize}
                                isLoading={clientOptimizing}
                                isDisabled={!clientMyMsg.trim()}
                              >
                                优化
                              </Button>
                            </HStack>
                          </Box>
                        )}

                        {/* 聊天历史 + AI 分析结果 */}
                        <Box flex={1} overflowY="auto">
                          <VStack spacing={3} align="stretch">
                            {/* 多轮对话历史（和女生的类似风格） */}
                            {clientChatHistory.length === 0 && !clientAiAnalysis && (
                              <Text color="gray.500" textAlign="center" fontSize="sm" py={4}>
                                暂无对话记录，粘贴客户消息开始分析
                              </Text>
                            )}

                            {clientChatHistory.map((msg, index) => (
                              <Box
                                key={index}
                                alignSelf={msg.role === 'operator' ? 'flex-end' : 'flex-start'}
                                maxW="80%"
                                p={3}
                                borderRadius="lg"
                                bg={msg.role === 'operator' ? 'teal.700' : 'gray.700'}
                              >
                                <HStack mb={1} spacing={1}>
                                  <Icon
                                    as={msg.role === 'operator' ? FiSend : FiMessageSquare}
                                    boxSize={3}
                                    color={msg.role === 'operator' ? 'teal.300' : 'gray.400'}
                                  />
                                  <Text fontSize="xs" color="gray.300">
                                    {msg.role === 'operator' ? '操盘手' : (selectedClient?.nickname || '客户')}
                                  </Text>
                                </HStack>
                                <Text color="white" fontSize="sm" whiteSpace="pre-wrap">{msg.content}</Text>
                              </Box>
                            ))}

                            {/* AI 分析结果 */}
                            {clientAiAnalysis && (
                              <Box p={3} bg="purple.900" borderRadius="lg" borderLeft="3px solid" borderColor="purple.400">
                                <HStack mb={2}>
                                  <Icon as={FiTarget} color="purple.400" boxSize={4} />
                                  <Text color="purple.300" fontSize="sm" fontWeight="bold">AI 分析</Text>
                                </HStack>
                                <Text color="gray.200" fontSize="sm" style={{ whiteSpace: 'pre-wrap' }}>{stripMarkdown(clientAiAnalysis)}</Text>
                              </Box>
                            )}

                            {/* AI教练行动建议 */}
                            {coachRecommendations.length > 0 && (
                              <Box p={3} bg="orange.900" borderRadius="lg" borderLeft="3px solid" borderColor="orange.400">
                                <HStack mb={3}>
                                  <Icon as={FiZap} color="orange.400" boxSize={4} />
                                  <Text color="orange.300" fontSize="sm" fontWeight="bold">AI 推荐行动</Text>
                                  <Badge colorScheme="orange" fontSize="xs">{coachRecommendations.filter(r => !r.added).length} 待添加</Badge>
                                </HStack>
                                <VStack spacing={2} align="stretch">
                                  {coachRecommendations.map((rec) => (
                                    <HStack
                                      key={rec.id}
                                      bg="gray.700"
                                      p={2}
                                      borderRadius="md"
                                      justify="space-between"
                                      opacity={rec.added ? 0.5 : 1}
                                    >
                                      <VStack align="start" spacing={0} flex={1}>
                                        <Text color="gray.200" fontSize="sm">{rec.action}</Text>
                                        {rec.girlName && (
                                          <Text color="gray.400" fontSize="xs">
                                            关联: {rec.girlName}
                                          </Text>
                                        )}
                                      </VStack>
                                      <Button
                                        size="sm"
                                        colorScheme={rec.added ? 'gray' : 'orange'}
                                        variant={rec.added ? 'ghost' : 'solid'}
                                        leftIcon={rec.added ? <Icon as={FiCheck} /> : <Icon as={FiZap} />}
                                        onClick={() => handleAddRecommendation(rec, selectedClient?.id)}
                                        isLoading={addingRecommendation === rec.id}
                                      >
                                        {rec.added ? '已添加' : '添加到日历'}
                                      </Button>
                                    </HStack>
                                  ))}
                                </VStack>
                              </Box>
                            )}

                            {/* AI 总结 */}
                            {clientAiSummary && (
                              <Box p={3} bg="gray.700" borderRadius="md" borderLeft="2px solid" borderColor="teal.500">
                                <HStack mb={1}>
                                  <Icon as={FiTarget} color="teal.400" boxSize={3} />
                                  <Text color="teal.300" fontSize="xs" fontWeight="bold">本轮总结</Text>
                                </HStack>
                                <Text color="gray.300" fontSize="sm">{clientAiSummary}</Text>
                              </Box>
                            )}

                            {/* 档案更新预览 */}
                            {Object.keys(clientProfilePendingFields).length > 0 && (
                              <Box p={3} bg="cyan.900" borderRadius="lg" borderLeft="3px solid" borderColor="cyan.400">
                                <HStack mb={2}>
                                  <Icon as={FiUser} color="cyan.400" boxSize={4} />
                                  <Text color="cyan.300" fontSize="sm" fontWeight="bold">客户档案更新</Text>
                                  <Badge colorScheme="cyan" fontSize="xs">{Object.keys(clientProfilePendingFields).length} 个字段</Badge>
                                </HStack>
                                <Alert status="info" borderRadius="md" mb={2} bg="cyan.800" fontSize="xs">
                                  <AlertIcon />
                                  采纳回复建议时将自动更新已勾选字段
                                </Alert>
                                <SimpleGrid columns={2} spacing={2}>
                                  {Object.entries(clientProfilePendingFields).map(([key, { label, value }]) => (
                                    <HStack key={key} bg="gray.700" p={2} borderRadius="md">
                                      <Checkbox
                                        size="sm"
                                        isChecked={!!selectedClientProfileFields[key]}
                                        onChange={(e) => {
                                          setSelectedClientProfileFields(prev => ({
                                            ...prev,
                                            [key]: e.target.checked ? value : false
                                          }));
                                        }}
                                        colorScheme="cyan"
                                      />
                                      <Box flex={1}>
                                        <Text color="gray.400" fontSize="xs">{label}</Text>
                                        <Text color="cyan.200" fontSize="sm" wordBreak="break-all">{value}</Text>
                                      </Box>
                                    </HStack>
                                  ))}
                                </SimpleGrid>
                              </Box>
                            )}

                            {/* 回复建议 */}
                            {clientAiSuggestions.length > 0 && (
                              <Box p={3} bg="blue.900" borderRadius="lg" borderLeft="3px solid" borderColor="blue.400">
                                <HStack mb={2}>
                                  <Icon as={FiMessageSquare} color="blue.400" boxSize={4} />
                                  <Text color="blue.300" fontSize="sm" fontWeight="bold">回复建议（点击采纳或复制）</Text>
                                </HStack>
                                <VStack spacing={2} align="stretch">
                                  {clientAiSuggestions.map((s, i) => (
                                    <Box
                                      key={i}
                                      p={3}
                                      bg="gray.700"
                                      borderRadius="md"
                                      cursor="pointer"
                                      _hover={{ bg: 'teal.700', transform: 'translateX(4px)' }}
                                      transition="all 0.15s"
                                      onClick={() => handleClientSelectSuggestion(s)}
                                    >
                                      <HStack justify="space-between" mb={1}>
                                        <Badge colorScheme="blue" fontSize="xs">{s.style || '建议'}</Badge>
                                        <HStack spacing={1}>
                                          <Text color="gray.400" fontSize="xs">{s.intention || ''}</Text>
                                          <Icon
                                            as={FiCopy}
                                            color="gray.500"
                                            boxSize={3}
                                            cursor="pointer"
                                            _hover={{ color: 'teal.400' }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigator.clipboard.writeText(s.text || s.reply || s);
                                              toast({ description: '已复制到剪贴板', duration: 1500, isClosable: false, position: 'top' });
                                            }}
                                            title="一键复制到剪贴板"
                                          />
                                        </HStack>
                                      </HStack>
                                      <Text color="white" fontSize="sm">{s.text || s.reply || s}</Text>
                                    </Box>
                                  ))}
                                </VStack>
                              </Box>
                            )}

                            {/* 话术优化结果 */}
                            {clientOptimizations.length > 0 && (
                              <Box p={3} bg="orange.900" borderRadius="lg" borderLeft="3px solid" borderColor="orange.400">
                                <HStack mb={2}>
                                  <Icon as={FiZap} color="orange.400" boxSize={4} />
                                  <Text color="orange.300" fontSize="sm" fontWeight="bold">话术优化（点击采纳或复制）</Text>
                                </HStack>
                                <VStack spacing={2} align="stretch">
                                  {clientOptimizations.map((opt, i) => (
                                    <Box
                                      key={i}
                                      p={3}
                                      bg="gray.700"
                                      borderRadius="md"
                                      cursor="pointer"
                                      _hover={{ bg: 'teal.700', transform: 'translateX(4px)' }}
                                      transition="all 0.15s"
                                      onClick={() => handleClientSelectOptimization(opt)}
                                    >
                                      <HStack justify="space-between" mb={1}>
                                        <Badge colorScheme="orange" fontSize="xs">{opt.style || '优化版'}</Badge>
                                        <HStack spacing={1}>
                                          <Text color="gray.400" fontSize="xs">{opt.point || ''}</Text>
                                          <Icon
                                            as={FiCopy}
                                            color="gray.500"
                                            boxSize={3}
                                            cursor="pointer"
                                            _hover={{ color: 'teal.400' }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigator.clipboard.writeText(opt.text || opt.reply || opt);
                                              toast({ description: '已复制到剪贴板', duration: 1500, isClosable: false, position: 'top' });
                                            }}
                                            title="一键复制到剪贴板"
                                          />
                                        </HStack>
                                      </HStack>
                                      <Text color="white" fontSize="sm">{opt.text || opt.reply || opt}</Text>
                                    </Box>
                                  ))}
                                </VStack>
                              </Box>
                            )}

                            {clientAnalyzing && (
                              <Box p={3} bg="gray.700" borderRadius="lg" alignSelf="flex-start">
                                <HStack spacing={2}>
                                  <Spinner size="sm" color="teal.400" />
                                  <Text color="gray.400" fontSize="sm">AI分析中...</Text>
                                </HStack>
                              </Box>
                            )}

                            {clientOptimizing && (
                              <Box p={3} bg="gray.700" borderRadius="lg" alignSelf="flex-start">
                                <HStack spacing={2}>
                                  <Spinner size="sm" color="orange.400" />
                                  <Text color="gray.400" fontSize="sm">话术优化中...</Text>
                                </HStack>
                              </Box>
                            )}

                            <div ref={messagesEndRef} />
                          </VStack>
                        </Box>

                        {/* 底部：发送/编辑区 */}
                        <Box>
                          <HStack mb={1}>
                            <Text color="gray.500" fontSize="xs">
                              {clientChatMode === 'suggest' ? '采纳建议后可直接发送，或复制到其他平台' : '采纳优化后可直接发送，或复制到其他平台'}
                            </Text>
                          </HStack>
                          <HStack>
                            <Input
                              flex={1}
                              value={clientInput}
                              onChange={e => setClientInput(e.target.value)}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSendToClient();
                                }
                              }}
                              placeholder="编辑回复内容，或点击上方建议采纳..."
                              bg="gray.700"
                              border="none"
                              color="white"
                              _placeholder={{ color: 'gray.400' }}
                            />
                            <Button
                              colorScheme="teal"
                              onClick={handleSendToClient}
                              isLoading={sendingClientMsg}
                              isDisabled={!clientInput.trim()}
                              leftIcon={<Icon as={FiSend} />}
                            >
                              发送
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleClearClientChat}
                              color="gray.400"
                              isDisabled={clientChatHistory.length === 0}
                            >
                              清除
                            </Button>
                          </HStack>
                        </Box>
                      </>
                    )}

                    {/* 和女生聊天模式 */}
                    {workbenchChatMode === 'girl' && !selectedGirl && (
                      <Flex flex={1} align="center" justify="center">
                        <Text color="gray.500">先在左侧选择一个女生开始实战聊天</Text>
                      </Flex>
                    )}

                    {workbenchChatMode === 'girl' && selectedGirl && (
                      <>
                        {/* 顶部：模式切换 + 输入区 */}
                        {battleMode === 'analyze' && (
                          <Box>
                            {/* 模式切换 tabs */}
                            <HStack mb={3} bg="gray.700" p={1} borderRadius="md" w="fit-content">
                              <Box
                                px={4}
                                py={2}
                                borderRadius="md"
                                cursor="pointer"
                                bg={chatMode === 'suggest' ? 'teal.600' : 'transparent'}
                                onClick={() => {
                                  setChatMode('suggest');
                                  setOptimizations([]);
                                  setGirlMessage('');
                                }}
                              >
                                <Text color="white" fontSize="sm" fontWeight="bold">
                                  回复建议
                                </Text>
                              </Box>
                              <Box
                                px={4}
                                py={2}
                                borderRadius="md"
                                cursor="pointer"
                                bg={chatMode === 'optimize' ? 'orange.600' : 'transparent'}
                                onClick={() => {
                                  setChatMode('optimize');
                                  setAiSuggestions([]);
                                  setAiAnalysis('');
                                  setMyMessage('');
                                }}
                              >
                                <Text color="white" fontSize="sm" fontWeight="bold">
                                  话术优化
                                </Text>
                              </Box>
                            </HStack>

                            {/* 回复建议模式 */}
                            {chatMode === 'suggest' && (
                              <Box>
                                <HStack mb={2}>
                                  <Icon as={FiMessageSquare} color="blue.400" />
                                  <Text color="gray.400" fontSize="sm">
                                    粘贴{selectedGirl.name}的消息，AI 分析意图并给出回复建议
                                  </Text>
                                </HStack>
                                <HStack>
                                  <Input
                                    flex={1}
                                    value={girlMessage}
                                    onChange={e => setGirlMessage(e.target.value)}
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleGirlMessage();
                                      }
                                    }}
                                    placeholder={`粘贴${selectedGirl.name}的消息...`}
                                    bg="gray.700"
                                    border="none"
                                    color="white"
                                    _placeholder={{ color: 'gray.400' }}
                                  />
                                  <Button
                                    colorScheme="blue"
                                    onClick={handleGirlMessage}
                                    isLoading={isAnalyzing}
                                    isDisabled={!girlMessage.trim()}
                                  >
                                    分析
                                  </Button>
                                </HStack>
                              </Box>
                            )}

                            {/* 话术优化模式 */}
                            {chatMode === 'optimize' && (
                              <Box>
                                <HStack mb={2}>
                                  <Icon as={FiZap} color="orange.400" />
                                  <Text color="gray.400" fontSize="sm">
                                    粘贴你想发的话，AI 帮你优化得更自然、更有温度
                                  </Text>
                                </HStack>
                                <HStack>
                                  <Input
                                    flex={1}
                                    value={myMessage}
                                    onChange={e => setMyMessage(e.target.value)}
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleOptimizeMessage();
                                      }
                                    }}
                                    placeholder="粘贴你想发给她的话..."
                                    bg="gray.700"
                                    border="none"
                                    color="white"
                                    _placeholder={{ color: 'gray.400' }}
                                  />
                                  <Button
                                    colorScheme="orange"
                                    onClick={handleOptimizeMessage}
                                    isLoading={isOptimizing}
                                    isDisabled={!myMessage.trim()}
                                  >
                                    优化
                                  </Button>
                                </HStack>
                              </Box>
                            )}
                          </Box>
                        )}

                        {/* 待审核更新通知 */}
                        {pendingUpdates.length > 0 && (
                          <Box
                            bg="purple.900"
                            borderRadius="md"
                            p={3}
                            cursor="pointer"
                            onClick={() => setShowUpdatePanel(v => !v)}
                            borderLeft="3px solid"
                            borderColor="purple.400"
                          >
                            <HStack justify="space-between">
                              <HStack spacing={2}>
                                <Icon as={FiAlertCircle} color="purple.300" boxSize={4} />
                                <Text color="purple.200" fontSize="sm" fontWeight="bold">
                                  女生状态有更新（{pendingUpdates.length}）
                                </Text>
                              </HStack>
                              <HStack spacing={2}>
                                <Badge colorScheme="purple" fontSize="xs">{pendingUpdates.length} 条待审核</Badge>
                                <Text color="gray.400" fontSize="xs">{showUpdatePanel ? '▲ 收起' : '▼ 查看'}</Text>
                              </HStack>
                            </HStack>

                            {/* Diff 面板 */}
                            {showUpdatePanel && (
                              <Box mt={3}>
                                <HStack mb={2} spacing={2}>
                                  <Button size="xs" colorScheme="green" leftIcon={<Icon as={FiCheck} boxSize={3} />} onClick={(e) => { e.stopPropagation(); handleApproveAll(); }}>
                                    全部采纳
                                  </Button>
                                  <Button size="xs" colorScheme="red" variant="outline" onClick={(e) => { e.stopPropagation(); handleRejectAll(); }}>
                                    全部忽略
                                  </Button>
                                </HStack>

                                <VStack spacing={2} align="stretch">
                                  {pendingUpdates.map(update => {
                                    const current = currentGirlState || {};
                                    const fieldChanges = update.analysis?.fieldChanges;
                                    const newTension = Math.max(0, Math.min(10, (current.tensionScore || 5) + (fieldChanges?.tensionScore?.delta || 0)));
                                    const tensionDelta = fieldChanges?.tensionScore?.delta || 0;

                                    return (
                                      <Box key={update.id} p={3} bg="gray.700" borderRadius="md">
                                        <HStack justify="space-between" mb={2}>
                                          <HStack spacing={2}>
                                            <Badge colorScheme="purple" fontSize="xs">{update.style}</Badge>
                                            <Text color="gray.400" fontSize="xs">
                                              {new Date(update.createdAt).toLocaleTimeString()}
                                            </Text>
                                          </HStack>
                                          <HStack spacing={1}>
                                            <Button
                                              size="xs"
                                              colorScheme="green"
                                              leftIcon={<Icon as={FiCheck} boxSize={3} />}
                                              onClick={(e) => { e.stopPropagation(); handleApproveUpdate(update.id); }}
                                            >
                                              采纳
                                            </Button>
                                            <Button
                                              size="xs"
                                              colorScheme="gray"
                                              variant="outline"
                                              onClick={(e) => { e.stopPropagation(); handleRejectUpdate(update.id); }}
                                            >
                                              忽略
                                            </Button>
                                          </HStack>
                                        </HStack>

                                        {/* 采纳的内容 */}
                                        <Text color="gray.300" fontSize="xs" mb={2}>
                                          采纳：「{update.replyText.slice(0, 30)}{update.replyText.length > 30 ? '...' : ''}」
                                        </Text>

                                        {/* 热度变化 diff */}
                                        {tensionDelta !== 0 && (
                                          <HStack spacing={2} mb={1}>
                                            <Text color="gray.400" fontSize="xs" w="60px">热度</Text>
                                            <Text color="gray.300" fontSize="xs">
                                              {current.tensionScore || 5} {getTensionEmoji(current.tensionScore || 5)}
                                            </Text>
                                            <Text color="gray.500" fontSize="xs">→</Text>
                                            <Text color="green.300" fontSize="xs" fontWeight="bold">
                                              {newTension} {getTensionEmoji(newTension)}
                                            </Text>
                                            <Badge colorScheme="green" fontSize="xs">
                                              {tensionDelta > 0 ? '+' : ''}{tensionDelta}
                                            </Badge>
                                          </HStack>
                                        )}

                                        {/* 信号 diff */}
                                        {update.analysis?.newSignals?.map((signal, si) => (
                                          <HStack key={si} spacing={2}>
                                            <Text color="gray.400" fontSize="xs" w="60px">信号</Text>
                                            <Badge
                                              colorScheme={signal.type === 'positive' ? 'green' : signal.type === 'negative' ? 'red' : 'gray'}
                                              fontSize="xs"
                                            >
                                              +{signal.type === 'positive' ? '正向' : signal.type === 'negative' ? '负向' : '中性'}
                                            </Badge>
                                            <Text color="gray.300" fontSize="xs">{signal.event}</Text>
                                          </HStack>
                                        ))}
                                      </Box>
                                    );
                                  })}
                                </VStack>
                              </Box>
                            )}
                          </Box>
                        )}

                        {/* 聊天历史 + 分析结果 */}
                        <Box flex={1} overflowY="auto">
                          <VStack spacing={3} align="stretch">
                            {chatHistory.length === 0 && (
                              <Text color="gray.500" textAlign="center" fontSize="sm" py={4}>
                                暂无对话记录
                              </Text>
                            )}

                            {chatHistory.map((msg, index) => (
                              <Box
                                key={index}
                                alignSelf={msg.role === 'user' ? 'flex-end' : 'flex-start'}
                                maxW="80%"
                                p={3}
                                borderRadius="lg"
                                bg={msg.role === 'user' ? 'teal.600' : 'gray.700'}
                              >
                                <HStack mb={1} spacing={1}>
                                  <Icon
                                    as={msg.role === 'user' ? FiSend : FiMessageSquare}
                                    boxSize={3}
                                    color={msg.role === 'user' ? 'teal.300' : 'gray.400'}
                                  />
                                  <Text fontSize="xs" color="gray.300">
                                    {msg.role === 'user'
                                      ? (msg.adopted ? '我(AI建议)' : '我')
                                      : selectedGirl.name}
                                  </Text>
                                </HStack>
                                <Text color="white" fontSize="sm" whiteSpace="pre-wrap">{msg.content}</Text>
                              </Box>
                            ))}

                            {aiAnalysis && (
                              <Box p={3} bg="purple.900" borderRadius="lg" borderLeft="3px solid" borderColor="purple.400">
                                <HStack mb={2}>
                                  <Icon as={FiTarget} color="purple.400" boxSize={4} />
                                  <Text color="purple.300" fontSize="sm" fontWeight="bold">AI分析</Text>
                                </HStack>
                                <Text color="gray.200" fontSize="sm" style={{ whiteSpace: 'pre-wrap' }}>{stripMarkdown(aiAnalysis)}</Text>
                              </Box>
                            )}

                            {/* 档案更新预览 */}
                            {Object.keys(profilePendingFields).length > 0 && (
                              <Box p={3} bg="cyan.900" borderRadius="lg" borderLeft="3px solid" borderColor="cyan.400">
                                <HStack justify="space-between" mb={2}>
                                  <HStack>
                                    <Icon as={FiUser} color="cyan.400" boxSize={4} />
                                    <Text color="cyan.300" fontSize="sm" fontWeight="bold">档案更新（AI 从对话中识别）</Text>
                                    <Badge colorScheme="cyan" fontSize="xs">{Object.keys(profilePendingFields).length} 个字段</Badge>
                                  </HStack>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    color="gray.400"
                                    onClick={() => setShowProfileFields(v => !v)}
                                  >
                                    {showProfileFields ? '收起' : '展开'}
                                  </Button>
                                </HStack>

                                <Collapse in={showProfileFields}>
                                  <Alert status="info" borderRadius="md" mb={2} bg="cyan.800" fontSize="xs">
                                    <AlertIcon />
                                    采纳回复建议时将自动更新已勾选字段。如需修改，稍后可在底部「待审核档案」面板处理。
                                  </Alert>
                                  <SimpleGrid columns={2} spacing={2}>
                                    {Object.entries(profilePendingFields).map(([key, { label, value }]) => (
                                      <HStack key={key} bg="gray.700" p={2} borderRadius="md">
                                        <Checkbox
                                          size="sm"
                                          isChecked={!!selectedProfileFields[key]}
                                          onChange={(e) => {
                                            setSelectedProfileFields(prev => ({
                                              ...prev,
                                              [key]: e.target.checked ? value : false
                                            }));
                                          }}
                                          colorScheme="cyan"
                                        />
                                        <Box flex={1}>
                                          <Text color="gray.400" fontSize="xs">{label}</Text>
                                          <Text color="cyan.200" fontSize="sm" wordBreak="break-all">{value}</Text>
                                        </Box>
                                      </HStack>
                                    ))}
                                  </SimpleGrid>
                                </Collapse>
                              </Box>
                            )}

                            {aiSuggestions.length > 0 && (
                              <Box p={3} bg="blue.900" borderRadius="lg" borderLeft="3px solid" borderColor="blue.400">
                                <HStack mb={2}>
                                  <Icon as={FiMessageSquare} color="blue.400" boxSize={4} />
                                  <Text color="blue.300" fontSize="sm" fontWeight="bold">回复建议（点击采纳）</Text>
                                </HStack>
                                <VStack spacing={2} align="stretch">
                                  {aiSuggestions.map((s, i) => (
                                    <Box
                                      key={i}
                                      p={3}
                                      bg="gray.700"
                                      borderRadius="md"
                                      cursor="pointer"
                                      _hover={{ bg: 'teal.700', transform: 'translateX(4px)' }}
                                      transition="all 0.15s"
                                      onClick={() => handleSelectSuggestion(s)}
                                    >
                                      <HStack justify="space-between" mb={1}>
                                        <Badge colorScheme="blue" fontSize="xs">{s.style || '建议'}</Badge>
                                        <HStack spacing={1}>
                                          <Text color="gray.400" fontSize="xs">{s.intention || ''}</Text>
                                          <Icon
                                            as={FiCopy}
                                            color="gray.500"
                                            boxSize={3}
                                            cursor="pointer"
                                            _hover={{ color: 'teal.400' }}
                                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(s.text || s.reply || s); toast({ description: '已复制到剪贴板', duration: 1500, isClosable: false, position: 'top' }); }}
                                            title="一键复制"
                                          />
                                        </HStack>
                                      </HStack>
                                      <Text color="white" fontSize="sm">{s.text || s.reply || s}</Text>
                                    </Box>
                                  ))}
                                </VStack>
                              </Box>
                            )}

                            {/* 话术优化结果 */}
                            {optimizations.length > 0 && (
                              <Box p={3} bg="orange.900" borderRadius="lg" borderLeft="3px solid" borderColor="orange.400">
                                <HStack mb={2}>
                                  <Icon as={FiZap} color="orange.400" boxSize={4} />
                                  <Text color="orange.300" fontSize="sm" fontWeight="bold">话术优化（点击采纳）</Text>
                                </HStack>
                                <VStack spacing={2} align="stretch">
                                  {optimizations.map((opt, i) => (
                                    <Box
                                      key={i}
                                      p={3}
                                      bg="gray.700"
                                      borderRadius="md"
                                      cursor="pointer"
                                      _hover={{ bg: 'teal.700', transform: 'translateX(4px)' }}
                                      transition="all 0.15s"
                                      onClick={() => handleSelectSuggestion(opt)}
                                    >
                                      <HStack justify="space-between" mb={1}>
                                        <Badge colorScheme="orange" fontSize="xs">{opt.style || '优化版'}</Badge>
                                        <HStack spacing={1}>
                                          <Text color="gray.400" fontSize="xs">{opt.point || ''}</Text>
                                          <Icon
                                            as={FiCopy}
                                            color="gray.500"
                                            boxSize={3}
                                            cursor="pointer"
                                            _hover={{ color: 'teal.400' }}
                                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(opt.text || opt.reply || opt); toast({ description: '已复制到剪贴板', duration: 1500, isClosable: false, position: 'top' }); }}
                                            title="一键复制"
                                          />
                                        </HStack>
                                      </HStack>
                                      <Text color="white" fontSize="sm">{opt.text || opt.reply || opt}</Text>
                                    </Box>
                                  ))}
                                </VStack>
                              </Box>
                            )}

                            {isOptimizing && (
                              <Box p={3} bg="gray.700" borderRadius="lg" alignSelf="flex-start">
                                <HStack spacing={2}>
                                  <Spinner size="sm" color="orange.400" />
                                  <Text color="gray.400" fontSize="sm">话术优化中...</Text>
                                </HStack>
                              </Box>
                            )}

                            {isAnalyzing && (
                              <Box p={3} bg="gray.700" borderRadius="lg" alignSelf="flex-start">
                                <HStack spacing={2}>
                                  <Spinner size="sm" color="teal.400" />
                                  <Text color="gray.400" fontSize="sm">AI分析中...</Text>
                                </HStack>
                              </Box>
                            )}

                            <div ref={messagesEndRef} />
                          </VStack>
                        </Box>

                        {/* 底部：回复编辑区 */}
                        <Box>
                          <Textarea
                            value={sendingContent}
                            onChange={e => setSendingContent(e.target.value)}
                            placeholder="输入回复内容，或点击上方建议采纳..."
                            bg="gray.700"
                            border="none"
                            color="white"
                            rows={2}
                            mb={2}
                            _placeholder={{ color: 'gray.400' }}
                          />

                          <HStack>
                            <Button
                              colorScheme="teal"
                              onClick={handleSend}
                              isDisabled={!sendingContent.trim()}
                              leftIcon={<Icon as={FiSend} />}
                            >
                              发送
                            </Button>
                            <Box flex={1} />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleClearChat}
                              color="gray.400"
                              isDisabled={chatHistory.length === 0 && !girlMessage.trim()}
                            >
                              清除
                            </Button>
                            {battleMode === 'manual' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setBattleMode('analyze');
                                  setAiSuggestions([]);
                                  setAiAnalysis('');
                                  setOptimizations([]);
                                  setSendingContent('');
                                  setOptimized(null);
                                  setGirlMessage('');
                                  setMyMessage('');
                                }}
                                color="teal.400"
                              >
                                继续分析
                              </Button>
                            )}
                          </HStack>

                          {optimized && (
                            <Box mt={2} p={2} bg="gray.700" borderRadius="md">
                              <Text color="teal.400" fontSize="xs">优化说明：{optimized.reason}</Text>
                            </Box>
                          )}
                        </Box>
                      </>
                    )}
                  </CardBody>
                </Card>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Box>

        {/* 右侧：选中对象详情 */}
        <Box w="300px">
          <Card bg="gray.800" h="100%">
            <CardHeader pb={1}>
              <HStack justify="space-between" flexWrap="wrap" gap={1}>
                <HStack spacing={2}>
                  <Text color="teal.400" fontSize="sm" fontWeight="bold">AI 主动教练</Text>
                  {/* 缓存命中/变化标签 */}
                  {activeCoachLoading ? null : activeCoachCached ? (
                    <Badge colorScheme="green" fontSize="xs">缓存命中</Badge>
                  ) : activeCoachChangeReason ? (
                    <Badge colorScheme="orange" fontSize="xs">{activeCoachChangeReason}</Badge>
                  ) : null}
                </HStack>
                <Button
                  size="xs"
                  variant="ghost"
                  color="gray.400"
                  onClick={() => fetchActiveCoach(true)}
                  isLoading={activeCoachLoading}
                  isDisabled={activeCoachLoading}
                >
                  刷新
                </Button>
              </HStack>
            </CardHeader>
            <CardBody pt={1}>
              {/* 主动教练区域 */}
              <Box
                mb={4}
                p={3}
                bg={activeCoachCached ? 'green.900' : 'purple.900'}
                borderRadius="md"
                borderLeft="3px solid"
                borderColor="purple.400"
                minH="80px"
              >
                {activeCoachLoading && !activeCoachText ? (
                  <HStack spacing={2} mt={1}>
                    <Spinner size="xs" color="purple.300" />
                    <Text color="purple.400" fontSize="xs">AI 教练分析中...</Text>
                  </HStack>
                ) : activeCoachText ? (
                  <>
                    <HStack justify="space-between" mb={2}>
                      <Text color="purple.300" fontSize="xs" fontWeight="bold">建议内容</Text>
                      <Button
                        size="xs"
                        variant="ghost"
                        color="gray.400"
                        onClick={() => setCoachCollapsed(v => !v)}
                        rightIcon={coachCollapsed ? <FiChevronDown /> : <FiChevronUp />}
                        fontSize="xs"
                      >
                        {coachCollapsed ? '展开' : '收起'}
                      </Button>
                    </HStack>
                    <Box
                      color="gray.200"
                      fontSize="sm"
                      lineHeight="1.7"
                      overflowY={coachCollapsed ? 'hidden' : 'auto'}
                      maxH={coachCollapsed ? '120px' : 'none'}
                      style={{ whiteSpace: 'pre-wrap' }}
                    >
                      <span ref={activeCoachRef} />
                    </Box>
                  </>
                ) : (
                  <Text color="gray.500" fontSize="xs">选中女生或保持空白，AI教练自动给出建议</Text>
                )}
              </Box>
            </CardBody>
            <Divider borderColor="gray.700" />
            <CardHeader pb={2}>
              <Text color="gray.400" fontSize="sm">
                {workbenchChatMode === 'client' ? '选中客户' : '选中女生'}
              </Text>
            </CardHeader>
            <CardBody pt={0}>
              {/* 客户模式 */}
              {workbenchChatMode === 'client' && selectedClient ? (
                <VStack spacing={3} align="stretch">
                  <Box p={3} bg="gray.700" borderRadius="md">
                    <HStack mb={2}>
                      <Icon as={FiUser} color="teal.300" boxSize={5} />
                      <Text color="white" fontWeight="bold" fontSize="lg">{selectedClient.nickname || selectedClient.username}</Text>
                    </HStack>
                    <HStack spacing={2}>
                      <Badge colorScheme="teal">{selectedClient.serviceStage || '建池'}</Badge>
                      <Text color="gray.400" fontSize="xs">{girlsList.length} 个女生</Text>
                    </HStack>
                  </Box>

                  <SimpleGrid columns={2} gap={2}>
                    <Box p={2} bg="gray.700" borderRadius="md">
                      <Text color="gray.400" fontSize="xs">年龄</Text>
                      <Text color="white">{selectedClient.age || '-'}</Text>
                    </Box>
                    <Box p={2} bg="gray.700" borderRadius="md">
                      <Text color="gray.400" fontSize="xs">职业</Text>
                      <Text color="white">{selectedClient.occupation || '-'}</Text>
                    </Box>
                  </SimpleGrid>

                  <Box p={3} bg="gray.700" borderRadius="md">
                    <Text color="gray.400" fontSize="xs">所在地</Text>
                    <Text color="white" fontSize="sm">{selectedClient.residence || '-'}</Text>
                  </Box>

                  <Box p={3} bg="gray.700" borderRadius="md">
                    <Text color="gray.400" fontSize="xs">沟通风格</Text>
                    <Text color="white" fontSize="sm">{selectedClient.communicationStyle || '-'}</Text>
                  </Box>

                  <Box p={3} bg="gray.700" borderRadius="md">
                    <Text color="gray.400" fontSize="xs">当前会话</Text>
                    <Text color="gray.300" fontSize="sm">{clientMessages.length} 条消息</Text>
                  </Box>

                  {selectedClient.notes && (
                    <Box p={3} bg="gray.700" borderRadius="md">
                      <Text color="gray.400" fontSize="xs">备注</Text>
                      <Text color="gray.300" fontSize="sm">{selectedClient.notes}</Text>
                    </Box>
                  )}
                </VStack>
              ) : workbenchChatMode === 'client' ? (
                <Text color="gray.500" fontSize="sm">选择客户查看详情</Text>
              ) : null}

              {/* 女生模式 */}
              {workbenchChatMode === 'girl' && selectedGirl ? (
                <VStack spacing={3} align="stretch">
                  <Box p={3} bg="gray.700" borderRadius="md">
                    <Text color="white" fontWeight="bold" fontSize="lg">{selectedGirl.name}</Text>
                    <HStack mt={2} spacing={2}>
                      <Badge>{selectedGirl.stage}</Badge>
                      <HStack spacing={1}>
                        <Icon as={HeartIcon} color="red.400" boxSize={4} />
                        <Text color="gray.400">{selectedGirl.intimacyLevel}</Text>
                      </HStack>
                    </HStack>
                  </Box>

                  <SimpleGrid columns={2} gap={2}>
                    <Box p={2} bg="gray.700" borderRadius="md">
                      <Text color="gray.400" fontSize="xs">年龄</Text>
                      <Text color="white">{selectedGirl.age || '-'}</Text>
                    </Box>
                    <Box p={2} bg="gray.700" borderRadius="md">
                      <Text color="gray.400" fontSize="xs">职业</Text>
                      <Text color="white">{selectedGirl.occupation || '-'}</Text>
                    </Box>
                  </SimpleGrid>

                  <Box p={3} bg="gray.700" borderRadius="md">
                    <Text color="gray.400" fontSize="xs">关系热度</Text>
                    <HStack mt={1}>
                      <Text color="white" fontWeight="bold">
                        {selectedGirl.tensionScore || 5}/10
                      </Text>
                      <Text color="orange.400">{getTensionEmoji(selectedGirl.tensionScore || 5)}</Text>
                    </HStack>
                  </Box>

                  {selectedGirl.notes && (
                    <Box p={3} bg="gray.700" borderRadius="md">
                      <Text color="gray.400" fontSize="xs">备注</Text>
                      <Text color="gray.300" fontSize="sm">{selectedGirl.notes}</Text>
                    </Box>
                  )}
                </VStack>
              ) : workbenchChatMode === 'girl' && !selectedGirl ? (
                <Text color="gray.500" fontSize="sm">选择女生查看详情</Text>
              ) : null}
            </CardBody>
          </Card>
        </Box>
      </Flex>

      {/* 选中文本添加到日历 */}
      <SelectionToCalendar clientId={selectedClient?.id} girlList={girlsList} />
    </Box>
  );
}

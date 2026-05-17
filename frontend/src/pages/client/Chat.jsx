import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, VStack, HStack, Stack, Input, Button, Text, Flex, IconButton, Image, Badge, useToast, Center, Spinner, Icon, Switch, FormControl, FormLabel, Tooltip, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, useDisclosure } from '@chakra-ui/react';
import { WarningIcon, CloseIcon } from '@chakra-ui/icons';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api, chat, upload, getMediaUrl as resolveMediaUrl } from '../../utils/api';
import { captureError } from '../../utils/frontendErrorCapture';
import { useSocket } from '../../contexts/SocketContext';
import { useRouteActivated } from '../../hooks/useRouteLifecycle';
import FlashImageViewer from '../../components/FlashImageViewer';
import EmojiPanel from '../../components/EmojiPanel';
import AudioPlayer from '../../components/AudioPlayer';
import { CameraIcon, MicIcon, FireIcon, SpeakerIcon } from '../../components/Icons';

export default function ClientChat() {
  const { on } = useSocket();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // 视频上传进度
  const [previewFile, setPreviewFile] = useState(null);
  const [recordTime, setRecordTime] = useState(0);
  const [burnMode, setBurnMode] = useState(false);
  const [burnSeconds, setBurnSeconds] = useState(5);
  const [burnTrigger, setBurnTrigger] = useState('onView');    // 'immediately' | 'onView'
  const [burnDurationType, setBurnDurationType] = useState('fixed'); // 'fixed' | 'adaptive'
  const { isOpen: isBurnOpen, onOpen: onBurnOpen, onClose: onBurnClose } = useDisclosure();
  const scrollRef = useRef();
  const shouldAutoScrollRef = useRef(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false); // 用户是否上滑离开了底部
  const autoFollowRef = useRef(true);
  const screenWasFilledRef = useRef(false);
  const scrollHeightSnapshotRef = useRef(0);
  const fileInputRef = useRef();
  const inputRef = useRef();
  const mediaRecorderRef = useRef();
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef();
  const burnTimersRef = useRef({});
  const [countdowns, setCountdowns] = useState({});
  const [flashViewer, setFlashViewer] = useState({ isOpen: false, imageUrl: '', messageId: null, senderRole: '', isBurnAfterRead: false, mediaType: 'image' });
  const openFlashViewer = useCallback((params) => {
    setFlashViewer({ isOpen: true, ...params });
  }, []);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [messageStatus, setMessageStatus] = useState({}); // messageId -> 'sending' | 'sent' | 'failed'
  // 长按菜单
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, msg: null });
  const contextMenuRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const [longPressMsgId, setLongPressMsgId] = useState(null);
  // 语音录制（微信式按住说话）
  const [voiceState, setVoiceState] = useState('idle'); // idle | recording | preview
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);
  const [slideCancel, setSlideCancel] = useState(false);
  const startYRef = useRef(0);
  const messagesEndRef = useRef(null);
  const toast = useToast();
  const API_BASE = api.baseUrl;

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    measureElement: (el) => Math.max(el.getBoundingClientRect().height, 60),
    overscan: 5,
  });

  const forceScrollToBottom = useCallback(() => {
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
  }, [messages.length, virtualizer]);

  const getMediaUrl = (msg) => {
    // 统一通过媒体端点获取，确保后端处理 Range 请求和权限验证
    const token = api.getToken();
    const url = `${API_BASE}/api/chat/media/${msg.id}?token=${token}`;
    console.log('[DEBUG] getMediaUrl:', { msgId: msg.id, url, API_BASE });
    return url;
  };

  const handleEmojiSelect = useCallback((emoji) => {
    const el = inputRef.current;
    if (!el) {
      setInput(prev => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? input.length;
    const newValue = input.slice(0, start) + emoji + input.slice(end);
    setInput(newValue);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }, [input]);

  const loadSession = async () => {
    setLoading(true);
    try {
      const res = await chat.mySessions();
      if (res.success && res.sessions.length > 0) {
        setSession(res.sessions[0]);
        await loadMessages(res.sessions[0].id);
      } else {
        setSession(null);
        setMessages([]);
      }
    } catch (e) {
      captureError(e);
    } finally {
      setLoading(false);
    }
  };

  const handleBurnMessage = useCallback(async (msg) => {
    if (msg.burnedAt || msg.senderRole === 'client') return;
    try {
      const res = await chat.burn(msg.id);
      if (res.success) {
        setMessages(prev => prev.map(m => {
          if (m.id !== msg.id) return m;
          if (m.isFlashImage) {
            return { ...m, flashBurnedByMe: true };
          }
          return { ...m, content: '[消息已销毁]', mediaUrl: null, burnedAt: new Date() };
        }));
        if (burnTimersRef.current[msg.id]) {
          clearTimeout(burnTimersRef.current[msg.id]);
          delete burnTimersRef.current[msg.id];
        }
        setCountdowns(prev => {
          const next = { ...prev };
          delete next[msg.id];
          return next;
        });
      } else {
        // API 返回失败，兜底本地标记
        setMessages(prev => prev.map(m => {
          if (m.id !== msg.id) return m;
          if (m.isFlashImage) {
            return { ...m, flashBurnedByMe: true };
          }
          return { ...m, content: '[消息已销毁]', mediaUrl: null, burnedAt: new Date() };
        }));
        if (burnTimersRef.current[msg.id]) {
          clearTimeout(burnTimersRef.current[msg.id]);
          delete burnTimersRef.current[msg.id];
        }
        setCountdowns(prev => {
          const next = { ...prev };
          delete next[msg.id];
          return next;
        });
      }
    } catch (e) {
      captureError(e);
      // API 调用异常，兜底本地标记
      setMessages(prev => prev.map(m => {
        if (m.id !== msg.id) return m;
        if (m.isFlashImage) {
          return { ...m, flashBurnedByMe: true };
        }
        return { ...m, content: '[消息已销毁]', mediaUrl: null, burnedAt: new Date() };
      }));
      if (burnTimersRef.current[msg.id]) {
        clearTimeout(burnTimersRef.current[msg.id]);
        delete burnTimersRef.current[msg.id];
      }
      setCountdowns(prev => {
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
    }
  }, []);

  const startBurnTimer = useCallback((msg) => {
    console.log('[DEBUG] startBurnTimer called', { id: msg.id, burnAfterSeconds: msg.burnAfterSeconds, burnedAt: msg.burnedAt, createdAt: msg.createdAt });
    if (!msg.burnAfterSeconds || msg.burnedAt) return;
    if (burnTimersRef.current[msg.id]) return;

    const elapsed = (Date.now() - new Date(msg.createdAt).getTime()) / 1000;
    let remaining = Math.ceil(msg.burnAfterSeconds - elapsed);

    if (remaining <= 0) {
      handleBurnMessage(msg);
      return;
    }

    setCountdowns(prev => ({ ...prev, [msg.id]: remaining }));

    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        delete burnTimersRef.current[msg.id];
        setCountdowns(prev => {
          const next = { ...prev };
          delete next[msg.id];
          return next;
        });
        handleBurnMessage(msg);
      } else {
        setCountdowns(prev => ({ ...prev, [msg.id]: remaining }));
        burnTimersRef.current[msg.id] = setTimeout(tick, 1000);
      }
    };

    burnTimersRef.current[msg.id] = setTimeout(tick, 1000);
  }, [handleBurnMessage]);

  const loadMessages = async (sessionId, isLoadMore = false) => {
    try {
      if (isLoadMore) {
        setLoadingMore(true);
      }
      const oldestMsg = messages.length > 0 ? messages[0].createdAt : null;
      const res = await chat.messages(sessionId, { before: oldestMsg, limit: 20 });
      if (res.success) {
        if (isLoadMore) {
          setMessages(prev => [...res.messages, ...prev]);
          setHasMore(res.messages.length === 50);
        } else {
          setMessages(res.messages);
          setHasMore(res.messages.length === 50);
        }
        // 注意：onView 模式的倒计时在点击查看后才开始，不在这里启动
      }
    } catch (e) {
      captureError(e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  // 进入聊天页面时清除聊天未读数（支持 keep-alive 多次激活）
  useRouteActivated('/chat', () => {
    window.dispatchEvent(new CustomEvent('chat-enter'));
  });

  useEffect(() => {
    const handler = (message) => {
      if (message.senderRole === 'client') return;
      if (session && message.sessionId === session.id) {
        setMessages(prev => [...prev, message]);
        console.log('[DEBUG] Socket收到消息', { isBurnAfterRead: message.isBurnAfterRead, burnAfterSeconds: message.burnAfterSeconds, burnTrigger: message.burnTrigger, id: message.id });
        if (message.isBurnAfterRead && message.burnAfterSeconds && !message.burnedAt) {
          startBurnTimer(message);
        }
      }
    };
    const unsub1 = on('message:new', handler);

    const burnHandler = ({ sessionId, messageId, messageIds }) => {
      if (session && sessionId === session.id) {
        const ids = messageIds || (messageId ? [messageId] : []);
        setMessages(prev => prev.map(m => {
          if (!ids.includes(m.id)) return m;
          if (m.isFlashImage) {
            return { ...m, flashBurnedByMe: true };
          }
          return { ...m, content: '[消息已销毁]', mediaUrl: null, burnedAt: new Date() };
        }));
        if (flashViewer.messageId && ids.includes(flashViewer.messageId)) {
          setFlashViewer(v => ({ ...v, isOpen: false }));
        }
      }
    };
    const unsub2 = on('message:burned', burnHandler);

    const recallHandler = ({ sessionId, messageId }) => {
      if (session && sessionId === session.id) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: '[消息已撤回]', mediaUrl: null, recalledAt: new Date() } : m));
      }
    };
    const unsub3 = on('message:recalled', recallHandler);

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [session, flashViewer.messageId, on, startBurnTimer]);

  useEffect(() => {
    if (shouldAutoScrollRef.current && autoFollowRef.current) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [messages, virtualizer]);

  useEffect(() => {
    const timers = burnTimersRef.current;
    return () => {
      Object.values(timers).forEach(t => clearTimeout(t));
    };
  }, []);

  const sendMediaMessage = async (url, type, duration, isBurnAfterRead = false, overrideBurnSeconds = null) => {
    if (!session || sending) return;
    setSending(true);
    const tempId = `temp-media-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      sessionId: session.id,
      senderRole: 'client',
      type,
      mediaUrl: url,
      duration,
      createdAt: new Date().toISOString(),
      status: 'sending',
      isBurnAfterRead,
      burnAfterSeconds: isBurnAfterRead ? (overrideBurnSeconds ?? (burnDurationType === 'adaptive' ? 5 : burnSeconds)) : null,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setMessageStatus(prev => ({ ...prev, [tempId]: 'sending' }));

    try {
      const effectiveBurn = overrideBurnSeconds != null ? overrideBurnSeconds : (burnDurationType === 'adaptive' ? 5 : burnSeconds);
      const res = await chat.send(session.id, null, type, url, duration, isBurnAfterRead, isBurnAfterRead ? effectiveBurn : null, burnTrigger);
      if (res.success) {
        setMessages(prev => prev.map(m => m.id === tempId ? res.message : m));
        setMessageStatus(prev => ({ ...prev, [tempId]: 'sent' }));
      }
    } catch (e) {
      captureError(e);
      setMessageStatus(prev => ({ ...prev, [tempId]: 'failed' }));
      toast({ title: '发送失败，点击重试', status: 'error', duration: 4000 });
    } finally {
      setSending(false);
      setPreviewFile(null);
    }
  };

  // 获取视频/音频实际时长
  const getMediaDuration = (file, type) => {
    return new Promise((resolve) => {
      const el = document.createElement(type === 'video' ? 'video' : 'audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(el.src);
        resolve(el.duration);
      };
      el.onerror = () => resolve(0);
      el.src = URL.createObjectURL(file);
    });
  };

  // 生成视频缩略图
  const generateThumbnail = (file, callback) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadeddata = () => {
      video.currentTime = 0.1;
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
      URL.revokeObjectURL(url);
      callback(thumbnail);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      callback(null);
    };
  };

  // 图片/视频直接发送（类微信体验）
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    e.target.value = '';

    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const videoFiles = files.filter(f => f.type.startsWith('video/'));

    // 图片：直接上传发送
    if (imageFiles.length > 0) {
      await sendImagesDirectly(imageFiles);
    }

    // 视频：直接上传发送
    for (const file of videoFiles) {
      await sendVideoDirectly(file);
    }
  };

  const sendImagesDirectly = async (files) => {
    if (!session || sending) return;
    setSending(true);
    const isBurn = burnMode;

    try {
      for (const file of files) {
        const tempId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const previewUrl = URL.createObjectURL(file);

        // 添加临时消息（显示预览和进度）
        const tempMsg = {
          id: tempId,
          tempId,
          type: 'image',
          senderRole: 'client',
          senderId: session?.clientId,
          content: '',
          mediaUrl: previewUrl,
          isUploading: true,
          uploadProgress: 0,
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, tempMsg]);

        const res = await upload.image(file, isBurn, false, (info) => {
          setMessages(prev => prev.map(m =>
            m.tempId === tempId ? { ...m, uploadProgress: info.percent } : m
          ));
        });

        if (res.url) {
          const effectiveSeconds = burnDurationType === 'adaptive' ? 5 : burnSeconds;
          const sendRes = await chat.send(session.id, null, 'image', res.url, null, isBurn, effectiveSeconds);
          if (sendRes.success) {
            URL.revokeObjectURL(previewUrl);
            setMessages(prev => prev.map(m => m.tempId === tempId ? sendRes.message : m));
          }
        } else {
          URL.revokeObjectURL(previewUrl);
          setMessages(prev => prev.filter(m => m.tempId !== tempId));
        }
      }
    } catch (e) {
      captureError(e);
    } finally {
      setSending(false);
    }
  };

  // 视频直接发送（类微信体验）
  const sendVideoDirectly = async (file) => {
    if (!session || sending) return;
    setSending(true);
    const isBurn = burnMode;
    const tempId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const previewUrl = URL.createObjectURL(file);

    try {
      // 生成缩略图
      let thumbnail = null;
      const thumbnailData = await new Promise((resolve) => {
        generateThumbnail(file, (t) => resolve(t));
      });
      thumbnail = thumbnailData;

      // 获取视频时长
      const duration = await getMediaDuration(file, 'video');

      // 添加临时消息（显示缩略图和进度）
      const tempMsg = {
        id: tempId,
        tempId,
        type: 'video',
        senderRole: 'client',
        senderId: session?.clientId,
        content: '',
        mediaUrl: thumbnail || previewUrl,
        mediaPreview: previewUrl,
        duration: Math.ceil(duration),
        isUploading: true,
        uploadProgress: 0,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, tempMsg]);

      const effectiveSeconds = burnDurationType === 'adaptive' ? Math.max(3, Math.ceil(duration)) : burnSeconds;
      const res = await upload.video(file, isBurn, false, (info) => {
        setMessages(prev => prev.map(m => m.tempId === tempId ? { ...m, uploadProgress: info.percent } : m));
      });
      if (res.url) {
        const sendRes = await chat.send(session.id, null, 'video', res.url, Math.ceil(duration), isBurn, effectiveSeconds);
        if (sendRes.success) {
          URL.revokeObjectURL(previewUrl);
          setMessages(prev => prev.map(m => m.tempId === tempId ? sendRes.message : m));
        }
      }
    } catch (e) {
      captureError(e);
      URL.revokeObjectURL(previewUrl);
      setMessages(prev => prev.filter(m => m.tempId !== tempId));
    } finally {
      setSending(false);
    }
  };

  // 视频确认发送
  const confirmSendVideo = async () => {
    if (!previewFile || previewFile.type !== 'video') return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const isBurn = burnMode;
      const videoDuration = await getMediaDuration(previewFile.file, 'video');
      const effectiveSeconds = burnDurationType === 'adaptive'
        ? Math.max(3, Math.ceil(videoDuration))
        : burnSeconds;
      const res = await upload.video(previewFile.file, isBurn, false, (info) => {
        setUploadProgress(info.percent);
      });
      if (res.url) {
        await sendMediaMessage(res.url, 'video', videoDuration, isBurn, effectiveSeconds);
      }
    } catch (e) {
      captureError(e);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const cancelPreview = () => {
    if (previewFile?.preview) URL.revokeObjectURL(previewFile.preview);
    setPreviewFile(null);
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    // 重置滚动追随状态（新消息 → 新的一轮）
    autoFollowRef.current = true;
    screenWasFilledRef.current = false;
    setUserScrolledUp(false);
    const scrollContainer = scrollRef.current;
    scrollHeightSnapshotRef.current = scrollContainer ? scrollContainer.scrollHeight : 0;

    if (!session) {
      // 没有会话时，先创建会话
      try {
        const createRes = await chat.createSession();
        if (createRes.success && createRes.session) {
          setSession(createRes.session);
          await sendMessageAfterSession(createRes.session.id, input);
        } else {
          toast({ title: '创建会话失败，请稍后重试', status: 'error', duration: 4000, duration: 3000 });
        }
      } catch (e) {
        captureError(e);
        toast({ title: '发送失败', status: 'error', duration: 4000, duration: 2000 });
      }
      return;
    }
    await sendMessageAfterSession(session.id, input);
  };

  const sendMessageAfterSession = async (sessionId, content) => {
    setSending(true);
    // 生成临时 ID 追踪消息状态
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      sessionId,
      senderRole: 'client',
      content,
      type: 'text',
      createdAt: new Date().toISOString(),
      status: 'sending'
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setMessageStatus(prev => ({ ...prev, [tempId]: 'sending' }));

    try {
      const isBurn = burnMode;
      const effectiveSeconds = burnDurationType === 'adaptive' ? 5 : burnSeconds;
      const res = await chat.send(sessionId, content, 'text', null, null, isBurn, isBurn ? effectiveSeconds : null, burnTrigger);
      if (res.success) {
        // 用真实消息替换临时消息
        setMessages(prev => prev.map(m => m.id === tempId ? res.message : m));
        setMessageStatus(prev => ({ ...prev, [tempId]: 'sent' }));
        setInput('');
        console.log('[DEBUG] 发送阅后即焚消息', { isBurn, isBurnAfterRead: res.message.isBurnAfterRead, burnAfterSeconds: res.message.burnAfterSeconds, id: res.message.id });
      }
    } catch (e) {
      captureError(e);
      // 标记消息为失败
      setMessageStatus(prev => ({ ...prev, [tempId]: 'failed' }));
      toast({ title: '发送失败，点击消息重试', status: 'error', duration: 4000 });
    } finally {
      setSending(false);
    }
  };

  const handleRecallMessage = async (msg) => {
    if (msg.recalledAt || msg.senderRole !== 'client') return;
    try {
      const res = await chat.recall(msg.id);
      if (res.success) {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: '[消息已撤回]', mediaUrl: null, recalledAt: new Date() } : m));
      }
    } catch (e) {
      captureError(e);
    }
  };

  // 重试发送失败的消息
  const handleRetryMessage = async (msg) => {
    if (messageStatus[msg.id] !== 'failed') return;
    setMessageStatus(prev => ({ ...prev, [msg.id]: 'sending' }));
    try {
      const res = await chat.send(msg.sessionId, msg.content, msg.type || 'text', msg.midjourneyPrompt);
      if (res.success) {
        setMessages(prev => prev.map(m => m.id === msg.id ? res.message : m));
        setMessageStatus(prev => ({ ...prev, [msg.id]: 'sent' }));
      } else {
        setMessageStatus(prev => ({ ...prev, [msg.id]: 'failed' }));
      }
    } catch (e) {
      setMessageStatus(prev => ({ ...prev, [msg.id]: 'failed' }));
    }
  };

  // ─── 长按菜单 ───
  const handlePointerDown = useCallback((e, msg) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setLongPressMsgId(msg.id);
    longPressTimerRef.current = setTimeout(() => {
      const x = Math.min(e.clientX || rect.left + rect.width / 2, window.innerWidth - 180);
      const y = Math.max(e.clientY || rect.top, 60);
      setContextMenu({ visible: true, x, y, msg });
      setLongPressMsgId(null);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setLongPressMsgId(null);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, msg: null });
  }, []);

  const handleCopyMessage = useCallback((msg) => {
    if (msg.content && navigator.clipboard) {
      navigator.clipboard.writeText(msg.content).catch(() => {});
    }
    closeContextMenu();
  }, [closeContextMenu]);

  const handleRecallFromMenu = useCallback((msg) => {
    handleRecallMessage(msg);
    closeContextMenu();
  }, [closeContextMenu]);

  // ─── 语音录制（微信式按住说话）───
  const voiceStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const actualType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: actualType });
        if (audioChunksRef.current.length === 0 || blob.size < 100) {
          setVoiceState('idle');
          return;
        }
        setPreviewFile({
          file: blob,
          preview: URL.createObjectURL(blob),
          type: 'audio',
          duration: recordTimeRef.current || 0,
        });
        setVoiceState('preview');
      };
      recorder.start(100);
      setVoiceState('recording');
      setRecordTime(0);
      recordTimerRef.current = setInterval(() => {
        setRecordTime(prev => {
          if (prev >= 59) {
            voiceStopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (e) {
      captureError(e, { context: '无法访问麦克风' });
      setVoiceState('idle');
    }
  };

  const recordTimeRef = useRef(0);

  useEffect(() => {
    recordTimeRef.current = recordTime;
  }, [recordTime]);

  // 录音完成后自动发送（≥1秒）
  useEffect(() => {
    if (voiceState === 'preview' && previewFile && previewFile.type === 'audio' && !uploading) {
      const dur = previewFile.duration || 0;
      if (dur < 1) {
        cancelPreview();
        setVoiceState('idle');
        toast({ title: '录音太短', status: 'warning', duration: 1500 });
        return;
      }
      voiceSendPreview();
    }
  }, [voiceState, previewFile]);

  const voiceStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      clearInterval(recordTimerRef.current);
    }
  };

  const voiceCancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(recordTimerRef.current);
    setVoiceState('idle');
    setRecordTime(0);
  };

  const voiceSendPreview = async () => {
    if (!previewFile || previewFile.type !== 'audio') return;
    setUploading(true);
    try {
      const isBurn = burnMode;
      const audioDuration = await getMediaDuration(previewFile.file, 'audio');
      const effectiveSeconds = burnDurationType === 'adaptive'
        ? Math.max(3, Math.ceil(audioDuration))
        : burnSeconds;
      const res = await upload.audio(previewFile.file);
      if (res.url) {
        await sendMediaMessage(res.url, 'audio', audioDuration, isBurn, effectiveSeconds);
      }
    } catch (e) {
      captureError(e);
    } finally {
      setUploading(false);
      cancelPreview();
      setVoiceState('idle');
      setShowVoiceOverlay(false);
    }
  };

  // 阅后即焚蒙层点击查看
  const handleViewBurnMessage = useCallback((msg) => {
    // 启动倒计时（onView 模式点击后开始计时）
    startBurnTimer(msg);
    if (msg.type === 'text') {
      handleBurnMessage(msg);
    } else {
      openFlashViewer({
        imageUrl: getMediaUrl(msg),
        messageId: msg.id,
        senderRole: msg.senderRole,
        isBurnAfterRead: true,
        burnAfterSeconds: msg.burnAfterSeconds,
        mediaType: msg.type || 'image'
      });
    }
  }, [openFlashViewer, handleBurnMessage, getMediaUrl, startBurnTimer]);

  const renderMessageContent = (msg) => {
    const destroyedColor = msg.senderRole === 'client' ? 'rgba(30,20,0,0.55)' : 'rgba(255,255,255,0.5)';
    if (msg.recalledAt) return <Text color={destroyedColor} fontStyle="italic">{msg.content}</Text>;
    if (msg.burnedAt) return <Text color={destroyedColor} fontStyle="italic">{msg.content}</Text>;
    if (msg.isFlashImage && msg.flashBurnedByMe) return <Text color={destroyedColor} fontStyle="italic">闪图已销毁</Text>;
    if (msg.type === 'image') {
      const isBurnMask = msg.isBurnAfterRead && msg.burnTrigger === 'onView' && msg.senderRole !== 'client' && !msg.burnedAt;
      const imageUrl = getMediaUrl(msg);
      return (
        <Box
          maxW="250px"
          cursor="pointer"
          position="relative"
          onClick={() => {
            if (msg.isBurnAfterRead && msg.senderRole !== 'client' && !msg.burnedAt) {
              openFlashViewer({
                imageUrl,
                messageId: msg.id,
                senderRole: msg.senderRole,
                isBurnAfterRead: true,
                burnAfterSeconds: msg.burnAfterSeconds,
                mediaType: 'image'
              });
            } else {
              openFlashViewer({
                imageUrl,
                messageId: msg.id,
                senderRole: msg.senderRole,
                isBurnAfterRead: false,
                mediaType: 'image'
              });
            }
          }}
        >
          {isBurnMask && (
            <Box
              position="absolute"
              inset={0}
              bg="rgba(255, 140, 0, 0.25)"
              borderRadius="md"
              display="flex"
              alignItems="center"
              justifyContent="center"
              zIndex={1}
            >
              <HStack spacing={1}>
                <Icon as={FireIcon} boxSize={4} color="orange.300" />
                <Text fontSize="sm" color="orange.300">阅后即焚</Text>
              </HStack>
            </Box>
          )}
          {/* 上传进度覆盖层 */}
          {msg.isUploading && (
            <Box
              position="absolute"
              inset={0}
              bg="blackAlpha.700"
              borderRadius="md"
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              zIndex={2}
            >
              <Spinner size="lg" color="orange.400" thickness="3px" mb={2} />
              <Text color="white" fontSize="sm">{msg.uploadProgress || 0}%</Text>
              <Box w="80%" h="4px" bg="warm.600" borderRadius="full" mt={2} overflow="hidden">
                <Box h="full" bg="orange.500" w={`${msg.uploadProgress || 0}%`} transition="width 0.2s" borderRadius="full" />
              </Box>
            </Box>
          )}
          <Image
            src={resolveMediaUrl(imageUrl)}
            alt="图片消息"
            borderRadius="md"
            maxH="200px"
            objectFit="cover"
            loading="lazy"
            filter={isBurnMask ? 'blur(4px)' : 'none'}
            opacity={msg.isUploading ? 0.3 : 1}
          />
        </Box>
      );
    }
    if (msg.type === 'video') {
      const isBurnMask = msg.isBurnAfterRead && msg.burnTrigger === 'onView' && msg.senderRole !== 'client' && !msg.burnedAt;
      const videoUrl = getMediaUrl(msg);
      return (
        <Box
          maxW="250px"
          cursor="pointer"
          position="relative"
          onClick={() => {
            if (msg.isBurnAfterRead && msg.senderRole !== 'client' && !msg.burnedAt) {
              openFlashViewer({ imageUrl: videoUrl, messageId: msg.id, senderRole: msg.senderRole, isBurnAfterRead: true, burnAfterSeconds: msg.burnAfterSeconds, mediaType: 'video' });
            } else {
              openFlashViewer({ imageUrl: videoUrl, messageId: msg.id, senderRole: msg.senderRole, isBurnAfterRead: false, mediaType: 'video' });
            }
          }}
        >
          {isBurnMask && (
            <Box
              position="absolute"
              inset={0}
              bg="rgba(255, 140, 0, 0.25)"
              borderRadius="md"
              display="flex"
              alignItems="center"
              justifyContent="center"
              zIndex={1}
            >
              <HStack spacing={1}>
                <Icon as={FireIcon} boxSize={5} color="orange.300" />
                <Text fontSize="sm" color="orange.300">阅后即焚</Text>
              </HStack>
            </Box>
          )}
         {/* 上传进度覆盖层 */}
          {msg.isUploading && (
            <Box
              position="absolute"
              inset={0}
              bg="blackAlpha.700"
              borderRadius="md"
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              zIndex={2}
              pointerEvents="none"
            >
              <Spinner size="lg" color="orange.400" thickness="3px" mb={2} />
              <Text color="white" fontSize="sm">{msg.uploadProgress || 0}%</Text>
              <Box w="80%" h="4px" bg="warm.600" borderRadius="full" mt={2} overflow="hidden">
                <Box h="full" bg="orange.500" w={`${msg.uploadProgress || 0}%`} transition="width 0.2s" borderRadius="full" />
              </Box>
            </Box>
          )}
          <video
            src={videoUrl}
            controls={!msg.isBurnAfterRead || msg.burnedAt}
            playsInline
            muted={false}
            style={{ borderRadius: '8px', maxHeight: '200px', width: '100%', filter: isBurnMask ? 'blur(4px)' : 'none' }}
          />
        </Box>
      );
    }
    if (msg.type === 'audio') {
      const isBurnMask = msg.isBurnAfterRead && msg.burnTrigger === 'onView' && msg.senderRole !== 'client' && !msg.burnedAt;
      return (
        <HStack
          bg={isBurnMask ? 'rgba(255,140,0,0.15)' : (msg.isBurnAfterRead && !msg.burnedAt ? 'rgba(255,140,0,0.1)' : 'blackAlpha.300')}
          px={3} py={2} borderRadius="md" spacing={2}
          cursor={isBurnMask ? 'pointer' : 'pointer'}
          position="relative"
          onClick={(e) => {
            if (e.target.tagName === 'AUDIO') return;
            if (isBurnMask) {
              openFlashViewer({ imageUrl: getMediaUrl(msg), messageId: msg.id, senderRole: msg.senderRole, isBurnAfterRead: true, burnAfterSeconds: msg.burnAfterSeconds, mediaType: 'audio' });
            }
          }}
        >
          {isBurnMask && (
            <Box
              position="absolute"
              inset={0}
              bg="rgba(255, 140, 0, 0.15)"
              borderRadius="md"
              display="flex"
              alignItems="center"
              justifyContent="center"
              zIndex={1}
            >
              <HStack spacing={1}>
                <Icon as={FireIcon} boxSize={4} color="orange.300" />
                <Text fontSize="sm" color="orange.300">阅后即焚</Text>
              </HStack>
            </Box>
          )}
          <Icon as={SpeakerIcon} boxSize={5} flexShrink={0} />
          <Box flex={1} minW={0} maxW="200px">
            <AudioPlayer src={getMediaUrl(msg)} duration={msg.duration} />
          </Box>
          {msg.duration && <Text fontSize="xs" color="gray.300" flexShrink={0}>{msg.duration}"</Text>}
        </HStack>
      );
    }
    if (msg.type === 'text') {
      const isBurnMask = msg.isBurnAfterRead && msg.burnTrigger === 'onView' && msg.senderRole !== 'client' && !msg.burnedAt;
      if (isBurnMask) {
        return (
          <Box position="relative" cursor="pointer" onClick={() => handleViewBurnMessage(msg)}>
            <Box
              position="absolute"
              inset={0}
              bg="rgba(255, 140, 0, 0.15)"
              borderRadius="md"
              display="flex"
              alignItems="center"
              justifyContent="center"
              zIndex={1}
            >
              <HStack spacing={1}>
                <Icon as={FireIcon} boxSize={4} color="orange.300" />
                <Text fontSize="sm" color="orange.300">阅后即焚</Text>
              </HStack>
            </Box>
            <Text color="gray.500" fontStyle="italic">[消息已加密]</Text>
          </Box>
        );
      }
    }
    return <Text>{msg.content}</Text>;
  };

  if (loading) {
    return (
      <Center h="calc(100vh - 150px)">
        <Spinner size="lg" color="gold.500" />
      </Center>
    );
  }

  return (
    <Flex h="calc(100vh - 120px)" direction="column" gap={4}>
      {/* 聊天区域 */}
      <Box flex={1} bg="rgba(255,255,255,0.02)" border="1px solid rgba(255,255,255,0.06)" borderRadius="xl" display="flex" flexDirection="column" overflow="hidden" position="relative">
        {/* 聊天头部 - 固定 */}
        <Box p={4} borderBottom="1px solid rgba(255,255,255,0.06)" flexShrink={0}>
          <HStack spacing={3}>
            <Box w="40px" h="40px" borderRadius="full" bg="gold.500" display="flex" alignItems="center" justifyContent="center" overflow="hidden">
              <Image src={`${import.meta.env.BASE_URL}logo.png`} alt="Mo哥" w="28px" h="28px" objectFit="contain" />
            </Box>
            <Box>
              <Text color="white" fontWeight="bold">Mo哥</Text>
              <Text color="rgba(245,240,232,0.4)" fontSize="xs">一起追ai</Text>
            </Box>
          </HStack>
        </Box>

        {/* 消息列表 - 可滚动 */}
        <Box
          ref={scrollRef}
          flex={1}
          p={4}
          overflowY="auto"
          position="relative"
          onScroll={() => {
            if (!scrollRef.current) return;
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const near = scrollHeight - scrollTop - clientHeight < 80;
            shouldAutoScrollRef.current = near;

            // 首次填满屏幕时，停止自动追随（每轮流式只触发一次）
            // 用流式开始时的快照对比，避免历史加载误触发
            if (!screenWasFilledRef.current && autoFollowRef.current
                && scrollHeightSnapshotRef.current > 0
                && scrollHeight - scrollHeightSnapshotRef.current > clientHeight) {
              autoFollowRef.current = false;
              screenWasFilledRef.current = true;
              setUserScrolledUp(true);
            }

            // 用户手动滚到底部 → 恢复追随
            if (near && !autoFollowRef.current) {
              autoFollowRef.current = true;
              setUserScrolledUp(false);
            }

            // 滚动到顶部时加载更多
            if (scrollTop < 100 && hasMore && !loadingMore && session) {
              loadMessages(session.id, true);
            }
          }}
        >
          {messages.length === 0 ? (
            <Center h="100%" px={4}>
              <VStack spacing={6}>
                <Text fontSize="lg" color="rgba(245,240,232,0.6)" fontWeight="medium">
                  你好，我是Mo哥
                </Text>
                <Text fontSize="sm" color="rgba(245,240,232,0.35)" textAlign="center" maxW="280px">
                  不知道聊什么？试试下面这些话题
                </Text>
                <VStack spacing={2} w="full" maxW="280px">
                  {['我想开始一段新的感情', '最近遇到了感情困扰', '想提升自己的恋爱情商'].map(topic => (
                    <Button
                      key={topic}
                      size="sm"
                      variant="outline"
                      borderColor="rgba(255,200,100,0.3)"
                      color="rgba(255,200,100,0.8)"
                      _hover={{ bg: 'rgba(255,200,100,0.1)', borderColor: 'rgba(255,200,100,0.5)' }}
                      onClick={() => setInput(topic)}
                      w="full"
                    >
                      {topic}
                    </Button>
                  ))}
                </VStack>
              </VStack>
            </Center>
          ) : (
            <Box position="relative" height={virtualizer.getTotalSize()} w="100%">
              {virtualizer.getVirtualItems().map(virtualRow => {
                const msg = messages[virtualRow.index];
                const prevMsg = virtualRow.index > 0 ? messages[virtualRow.index - 1] : null;
                const timeGap = prevMsg ? (new Date(msg.createdAt) - new Date(prevMsg.createdAt)) / 1000 / 60 : Infinity;
                const showTime = timeGap > 5;
                const isClient = msg.senderRole === 'client';
                return (
                  <Flex
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    w="100%"
                    direction="column"
                    align={isClient ? 'flex-end' : 'flex-start'}
                    position="absolute"
                    top={0}
                    transform={`translateY(${virtualRow.start}px)`}
                    pb={2}
                  >
                    {showTime && (
                      <Text color="rgba(245,240,232,0.45)" fontSize="xs" textAlign="center" w="100%" my={2}>
                        {new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </Text>
                    )}
                    <HStack spacing={2} maxW="85%" w="fit-content">
                      <Box
                        maxW="100%"
                        p={3}
                        className="bubble-glow"
                        bg={msg.isBurnAfterRead && !msg.burnedAt
                          ? 'linear-gradient(135deg, rgba(255,140,0,0.25), rgba(255,80,0,0.15))'
                          : isClient
                            ? 'linear-gradient(135deg, rgba(226,176,68,0.90), rgba(201,127,89,0.85))'
                            : 'rgba(255,255,255,0.10)'}
                        border={msg.isBurnAfterRead && !msg.burnedAt ? '1px solid rgba(255,140,0,0.35)' : (isClient ? 'none' : '1px solid rgba(226,176,68,0.18)')}
                        borderRadius={isClient ? '18px 4px 18px 18px' : '4px 18px 18px 18px'}
                        boxShadow={isClient ? '0 4px 16px rgba(226,176,68,0.20)' : '0 2px 8px rgba(0,0,0,0.15)'}
                        color={isClient ? 'rgba(30,20,0,0.9)' : 'rgba(255,255,255,0.92)'}
                        onPointerDown={(e) => handlePointerDown(e, msg)}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        transform={longPressMsgId === msg.id ? 'scale(0.97)' : 'none'}
                        transition="transform 0.15s"
                        userSelect="none"
                        cursor="pointer"
                      >
                        {renderMessageContent(msg)}
                        {msg.isBurnAfterRead && !msg.burnedAt && (
                          <HStack mt={2} spacing={1} justify="flex-end">
                            <Icon as={FireIcon} boxSize={3} color="orange.300" />
                            <Text fontSize="sm" fontWeight="bold" color="orange.300">
                              {countdowns[msg.id] != null ? (countdowns[msg.id] > 0 ? `${countdowns[msg.id]}s` : '已销毁') : (msg.burnAfterSeconds ? `${msg.burnAfterSeconds}s` : '手动')}
                            </Text>
                          </HStack>
                        )}
                      </Box>
                      {/* 发送状态指示器 */}
                      {isClient && messageStatus[msg.id] === 'sending' && (
                        <Spinner size="sm" color="orange.300" flexShrink={0} />
                      )}
                      {isClient && messageStatus[msg.id] === 'failed' && (
                        <Tooltip label="点击重试" placement="top">
                          <IconButton
                            icon={<Icon as={WarningIcon} boxSize={4} />}
                            size="sm"
                            variant="ghost"
                            color="red.400"
                            onClick={() => handleRetryMessage(msg)}
                            aria-label="重试发送"
                            flexShrink={0}
                          />
                        </Tooltip>
                      )}
                    </HStack>
                  </Flex>
                );
              })}
            </Box>
          )}

          {/* 跳到底部浮动按钮 */}
          {userScrolledUp && (
            <IconButton
              aria-label="滚动到底部"
              icon={<Text fontSize="lg">↓</Text>}
              position="absolute"
              bottom="20px"
              left="50%"
              transform="translateX(-50%)"
              zIndex={10}
              borderRadius="full"
              bg="gold.500"
              color="white"
              size="sm"
              boxShadow="lg"
              _hover={{ bg: "gold.600" }}
              onClick={() => {
                forceScrollToBottom();
                autoFollowRef.current = true;
                setUserScrolledUp(false);
              }}
            />
          )}

        </Box>

        {/* 全屏语音浮层 */}
        {showVoiceOverlay && (
          <Box
            position="absolute"
            inset={0}
            bg="rgba(17,17,16,0.97)"
            zIndex={50}
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            borderRadius="xl"
          >
            {/* 关闭按钮 */}
            <IconButton
              icon={<Icon as={CloseIcon} boxSize={4} />}
              position="absolute"
              top={4}
              right={4}
              variant="ghost"
              color="rgba(245,240,232,0.5)"
              onClick={() => { voiceCancelRecording(); setShowVoiceOverlay(false); }}
              aria-label="关闭"
              size="sm"
            />

            {/* 录音状态区域 */}
            {voiceState === 'recording' ? (
              <>
                {/* 脉动麦克风 */}
                <Box position="relative" mb={6}>
                  {[0, 1, 2].map(i => (
                    <Box
                      key={i}
                      position="absolute"
                      inset={`${-14 * (i + 1)}px`}
                      borderRadius="full"
                      border={slideCancel ? '2px solid rgba(239,68,68,0.3)' : '2px solid rgba(226,176,68,0.3)'}
                      animation={`voicePulse 1.5s ${i * 0.3}s infinite`}
                      transition="border-color 0.2s"
                    />
                  ))}
                  <Box
                    w="80px" h="80px"
                    borderRadius="full"
                    bg={slideCancel ? 'rgba(239,68,68,0.15)' : 'rgba(226,176,68,0.15)'}
                    border={slideCancel ? '3px solid rgba(239,68,68,0.5)' : '3px solid rgba(226,176,68,0.5)'}
                    display="flex" alignItems="center" justifyContent="center"
                    transition="all 0.2s"
                  >
                    <Icon as={MicIcon} boxSize={8} color={slideCancel ? 'red.400' : 'gold.400'} />
                  </Box>
                </Box>
                <Text color={slideCancel ? 'red.400' : 'gold.400'} fontSize="2xl" fontWeight="bold" mb={2} fontFamily="mono">
                  {slideCancel ? '松开取消' : `${recordTime}"`}
                </Text>
                <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={1}>
                  {slideCancel ? '上滑取消发送' : '松开发送 · 上滑取消'}
                </Text>
                {recordTime >= 50 && !slideCancel && (
                  <Text color="orange.400" fontSize="xs" mt={1}>还剩 {60 - recordTime} 秒</Text>
                )}
              </>
            ) : (
              /* 空闲状态：按住说话按钮 */
              <>
                <Box
                  w="100px"
                  h="100px"
                  borderRadius="full"
                  bg="rgba(226,176,68,0.12)"
                  border="3px solid rgba(226,176,68,0.3)"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  mb={6}
                  cursor="pointer"
                  userSelect="none"
                  touchAction="none"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.target.setPointerCapture(e.pointerId);
                    startYRef.current = e.clientY;
                    setSlideCancel(false);
                    if (navigator.vibrate) navigator.vibrate(10);
                    voiceStartRecording();
                  }}
                  onPointerMove={(e) => {
                    if (voiceState !== 'recording') return;
                    const dy = startYRef.current - e.clientY;
                    setSlideCancel(dy > 80);
                  }}
                  onPointerUp={() => {
                    if (voiceState !== 'recording') return;
                    if (slideCancel) {
                      voiceCancelRecording();
                    } else {
                      voiceStopRecording();
                    }
                    setSlideCancel(false);
                  }}
                  _active={{ bg: 'rgba(226,176,68,0.25)', transform: 'scale(0.95)' }}
                  transition="all 0.15s"
                >
                  <Icon as={MicIcon} boxSize={10} color="gold.400" />
                </Box>
                <Text color="rgba(245,240,232,0.6)" fontSize="sm">按住说话</Text>
              </>
            )}

            {/* 脉动动画 keyframes */}
            <style>{`
              @keyframes voicePulse {
                0% { transform: scale(1); opacity: 0.6; }
                100% { transform: scale(1.6); opacity: 0; }
              }
            `}</style>
          </Box>
        )}

        {/* 输入区域 */}
        <Box p={4} borderTop="1px solid rgba(255,255,255,0.06)" bg="rgba(255,255,255,0.02)" position="relative">

          {/* 语音自动发送中 */}
          {voiceState === 'preview' && uploading && (
            <HStack mb={3} p={3} bg="rgba(226,176,68,0.1)" borderRadius="xl" border="1px solid rgba(226,176,68,0.2)" justify="center" spacing={2}>
              <Spinner size="sm" color="gold.400" />
              <Text color="gold.400" fontSize="sm">发送语音中...</Text>
            </HStack>
          )}

          {/* 工具栏 */}
            <Stack direction={{ base: 'column', md: 'row' }} spacing={{ base: 2, md: 2 }} w="full">
              <HStack spacing={2} justify={{ base: 'space-around', md: 'start' }}>
                <IconButton
                  icon={<Icon as={CameraIcon} boxSize={4} />}
                  variant="ghost"
                  size="sm"
                  color="rgba(245,240,232,0.4)"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="发送图片/视频"
                  isDisabled={sending || voiceState === 'preview'}
                  title="发送图片"
                />
                <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileSelect} />
                {/* 语音录音 */}
                <IconButton
                  icon={<Icon as={MicIcon} boxSize={4} />}
                  variant="ghost"
                  size="sm"
                  color="rgba(245,240,232,0.4)"
                  onClick={() => setShowVoiceOverlay(true)}
                  aria-label="语音输入"
                  isDisabled={sending || uploading}
                />
                {/* 阅后即焚 */}
                <Button
                  size="sm"
                  variant={burnMode ? 'solid' : 'ghost'}
                  colorScheme="orange"
                  bg={burnMode ? 'orange.600' : 'transparent'}
                  color={burnMode ? 'white' : 'rgba(245,240,232,0.4)'}
                  border={burnMode ? '2px solid orange.300' : '2px solid transparent'}
                  _hover={{ bg: burnMode ? 'orange.500' : 'whiteAlpha.100' }}
                  isDisabled={voiceState === 'preview'}
                  onClick={onBurnOpen}
                >
                  <Icon as={FireIcon} boxSize={4} color={burnMode ? 'white' : 'orange.400'} mr={1} />
                  {burnMode ? (burnTrigger === 'immediately' ? '即时' : '阅后') : '阅后即焚'}
                </Button>
                <EmojiPanel onSelect={handleEmojiSelect} isDisabled={sending || voiceState === 'preview'} variant="client" />
              </HStack>
              {/* 输入框 + 发送 */}
              <HStack flex={1} spacing={1}>
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="输入消息..."
                  flex={1} minW="0"
                  bg="warm.800"
                  border="1px solid rgba(255,255,255,0.08)"
                  borderRadius="xl"
                  color="white"
                  _placeholder={{ color: 'rgba(245,240,232,0.4)' }}
                  _focus={{ borderColor: 'gold.500', boxShadow: '0 0 0 3px rgba(226,176,68,0.12)' }}
                />
                <Button colorScheme="gold" onClick={sendMessage} isLoading={sending} isDisabled={!input.trim()} size="sm">发送</Button>
              </HStack>
            </Stack>
        </Box>
      </Box>
      <FlashImageViewer
        isOpen={flashViewer.isOpen}
        onClose={() => setFlashViewer(v => ({ ...v, isOpen: false }))}
        imageUrl={flashViewer.imageUrl}
        messageId={flashViewer.messageId}
        isBurnAfterRead={flashViewer.isBurnAfterRead || false}
        burnAfterSeconds={flashViewer.burnAfterSeconds}
        mediaType={flashViewer.mediaType || 'image'}
      />

      {/* 长按上下文菜单 */}
      {contextMenu.visible && (
        <>
          <Box position="fixed" inset={0} zIndex={200} onClick={closeContextMenu} />
          <Box
            ref={contextMenuRef}
            position="fixed"
            left={`${contextMenu.x}px`}
            top={`${contextMenu.y}px`}
            zIndex={201}
            bg="warm.800"
            border="1px solid rgba(255,255,255,0.12)"
            borderRadius="xl"
            overflow="hidden"
            boxShadow="0 8px 32px rgba(0,0,0,0.5)"
            minW="140px"
            py={1}
          >
            {contextMenu.msg?.type === 'text' && contextMenu.msg?.content && (
              <Flex
                px={4} py={3}
                align="center" gap={3}
                cursor="pointer"
                _hover={{ bg: 'rgba(255,255,255,0.06)' }}
                onClick={() => handleCopyMessage(contextMenu.msg)}
              >
                <Text fontSize="sm" color="rgba(245,240,232,0.9)">复制</Text>
              </Flex>
            )}
            {contextMenu.msg?.senderRole === 'client' && !contextMenu.msg?.recalledAt && !contextMenu.msg?.burnedAt && (
              <Flex
                px={4} py={3}
                align="center" gap={3}
                cursor="pointer"
                _hover={{ bg: 'rgba(255,255,255,0.06)' }}
                onClick={() => handleRecallFromMenu(contextMenu.msg)}
              >
                <Text fontSize="sm" color="red.400">撤回</Text>
              </Flex>
            )}
          </Box>
        </>
      )}

      {/* 阅后即焚设置弹窗 */}
      <Modal isOpen={isBurnOpen} onClose={onBurnClose} isCentered motionPreset="slideInBottom" size="md">
        <ModalOverlay />
        <ModalContent bg="warm.800" color="white" borderRadius="xl" mx={4}>
          <ModalHeader fontSize="md" pb={2}>阅后即焚设置</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FormControl display="flex" alignItems="center" justifyContent="space-between" mb={4}>
              <FormLabel htmlFor="burn-mode-switch" mb="0" color={burnMode ? 'orange.300' : 'gray.300'} fontWeight="bold">
                {burnMode ? '🔥 已开启' : '○ 未开启'}
              </FormLabel>
              <Switch
                id="burn-mode-switch"
                size="lg"
                colorScheme="orange"
                isChecked={burnMode}
                onChange={(e) => {
                  const isOn = e.target.checked;
                  setBurnMode(isOn);
                  if (!isOn) { setBurnTrigger('onView'); setBurnDurationType('fixed'); setBurnSeconds(5); }
                }}
              />
            </FormControl>
            {burnMode && (
              <>
                <Box mb={4}>
                  <Text fontSize="xs" color="gray.400" fontWeight="bold" mb={2}>触发时机</Text>
                  <Stack spacing={2}>
                    <Button size="sm" variant={burnTrigger === 'immediately' ? 'solid' : 'outline'} colorScheme="orange" onClick={() => setBurnTrigger('immediately')} w="full">即时（发出后立即计时）</Button>
                    <Button size="sm" variant={burnTrigger === 'onView' ? 'solid' : 'outline'} colorScheme="orange" onClick={() => setBurnTrigger('onView')} w="full">阅后（点击后计时）</Button>
                  </Stack>
                </Box>
                <Box mb={4}>
                  <Text fontSize="xs" color="gray.400" fontWeight="bold" mb={2}>时长</Text>
                  <Stack spacing={2}>
                    <Button size="sm" variant={burnDurationType === 'fixed' ? 'solid' : 'outline'} colorScheme="orange" onClick={() => setBurnDurationType('fixed')} w="full">固定秒数</Button>
                    <Button size="sm" variant={burnDurationType === 'adaptive' ? 'solid' : 'outline'} colorScheme="orange" onClick={() => setBurnDurationType('adaptive')} w="full">自适应（文字/图片5秒，视频/音频按实际时长）</Button>
                  </Stack>
                </Box>
                {burnDurationType === 'fixed' && (
                  <Box mb={4}>
                    <Text fontSize="xs" color="gray.400" fontWeight="bold" mb={2}>选择秒数</Text>
                    <HStack spacing={2} justify="center" flexWrap="wrap">
                      {[3, 5, 10, 15, 30, 60].map(s => (
                        <Button key={s} size="md" variant={burnSeconds === s ? 'solid' : 'outline'} colorScheme="orange" onClick={() => setBurnSeconds(s)} minW="50px">{s}s</Button>
                      ))}
                    </HStack>
                  </Box>
                )}
              </>
            )}
            <Button colorScheme="orange" w="full" size="lg" borderRadius="xl" mt={2} onClick={onBurnClose}>
              确认
            </Button>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Flex>
  );
}

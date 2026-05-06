import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Flex, VStack, Stack, Input, Button, Text, Heading, IconButton, Image, Spinner, useDisclosure, Menu, MenuButton, MenuList, MenuItem, MenuDivider, Badge, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, Select, List, ListItem, Switch, FormControl, FormLabel } from '@chakra-ui/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api, chat, upload, clients } from '../../utils/api';
import { captureError } from '../../utils/frontendErrorCapture';
import { useSocket } from '../../contexts/SocketContext';
import ProfileSuggestModal from './ProfileSuggestModal';
import FlashImageViewer from '../../components/FlashImageViewer';
import EmojiPanel from '../../components/EmojiPanel';

export default function AdminChat() {
  const location = useLocation();
  const navigate = useNavigate();
  const { on, addChatUnread, clearChatUnread } = useSocket();
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // 视频上传进度 0-100
  const [previewFile, setPreviewFile] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [burnMode, setBurnMode] = useState(false);
  const [burnSeconds, setBurnSeconds] = useState(5);
  const [burnTrigger, setBurnTrigger] = useState('onView');    // 'immediately' | 'onView'
  const [burnDurationType, setBurnDurationType] = useState('fixed'); // 'fixed' | 'adaptive'
  const burnTimersRef = useRef({});
  const [countdowns, setCountdowns] = useState({});
  const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();
  const { isOpen: isNewChatOpen, onOpen: onNewChatOpen, onClose: onNewChatClose } = useDisclosure();
  const [flashViewer, setFlashViewer] = useState({ isOpen: false, imageUrl: '', messageId: null, senderRole: '', isBurnAfterRead: false, mediaType: 'image' });
  const openFlashViewer = useCallback((params) => {
    setFlashViewer({ isOpen: true, ...params });
  }, []);
  const [allClients, setAllClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showChat, setShowChat] = useState(false); // 移动端：是否显示聊天区域
  const scrollRef = useRef();
  const shouldAutoScrollRef = useRef(true);
  const fileInputRef = useRef();
  const inputRef = useRef();
  const mediaRecorderRef = useRef();
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

  const getMediaUrl = (msg) => {
    if (msg.mediaUrl?.startsWith('/encrypted/')) {
      const token = api.getToken();
      return `${API_BASE}/api/chat/media/${msg.id}?token=${token}`;
    }
    if (msg.mediaUrl?.startsWith('http')) return msg.mediaUrl;
    return `${API_BASE}${msg.mediaUrl}`;
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

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    measureElement: (el) => Math.max(el.getBoundingClientRect().height, 60),
    overscan: 5,
  });

  const loadSessions = useCallback(async () => {
    try {
      const res = await chat.sessions();
      if (res.success) {
        setSessions(res.sessions);
        if (res.sessions.length > 0 && !currentSession) {
          setCurrentSession(res.sessions[0]);
        }
      }
    } catch (e) {
      captureError(e);
    }
  }, [currentSession]);

  const loadAllClients = async () => {
    try {
      const res = await clients.list();
      if (res.success) {
        // 只显示 client 角色的用户
        const clientUsers = res.clients.filter(c => !c.role || c.role === 'client');
        setAllClients(clientUsers);
      }
    } catch (e) {
      captureError(e);
    }
  };

  const handleStartNewChat = async () => {
    if (!selectedClientId) return;
    try {
      const res = await chat.createSessionForClient(selectedClientId);
      if (res.success) {
        onNewChatClose();
        setSelectedClientId('');
        await loadSessions();
        // 选中新创建的会话
        const newSession = res.session || res;
        if (newSession?.id) {
          setCurrentSession(newSession);
        }
      }
    } catch (e) {
      captureError(e);
    }
  };

  const handleStartNewChatWithClient = async (clientId) => {
    try {
      const res = await chat.createSessionForClient(clientId);
      if (res.success) {
        await loadSessions();
        const newSession = res.session || res;
        if (newSession?.id) {
          setCurrentSession(newSession);
        }
      }
    } catch (e) {
      captureError(e);
    }
  };

  const handleBurnMessage = useCallback(async (msg) => {
    if (msg.burnedAt) return; // 已被销毁则跳过
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

  // 阅后即焚蒙层点击查看
  const startBurnTimer = useCallback((msg) => {
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

  const loadMessages = useCallback(async (sessionId) => {
    try {
      const res = await chat.messages(sessionId);
      if (res.success) {
        setMessages(res.messages);
        // 注意：onView 模式的倒计时在点击查看后才开始，不在这里启动
      }
    } catch (e) {
      captureError(e);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 从客户列表跳转过来时自动发起聊天
  useEffect(() => {
    const clientId = location.state?.clientId;
    if (!clientId || sessions.length === 0) return;
    const existing = sessions.find(s => s.clientId === clientId);
    if (existing) {
      setCurrentSession(existing);
      navigate('.', { replace: true, state: {} });
    } else {
      handleStartNewChatWithClient(clientId);
      navigate('.', { replace: true, state: {} });
    }
  }, [location.state?.clientId, sessions]);

  useEffect(() => {
    if (!currentSession) return;
    loadMessages(currentSession.id);
  }, [currentSession, loadMessages]);

  // 移动端：选择会话后自动切换到聊天视图
  useEffect(() => {
    if (currentSession) {
      // 在移动端，如果窗口宽度 < 1024px，则自动切换到聊天视图
      if (window.innerWidth < 1024) {
        setShowChat(true);
      }
    }
  }, [currentSession]);

  useEffect(() => {
    const handler = (message) => {
      if (message.senderRole === 'operator' || message.senderRole === 'admin') return;
      if (currentSession && message.sessionId === currentSession.id) {
        // 当前会话，直接添加消息
        setMessages(prev => [...prev, message]);
        // 阅后即焚自动倒计时（仅阅后模式，即时模式由服务端处理）
        if (message.isBurnAfterRead && !message.burnedAt && message.burnAfterSeconds && message.burnTrigger === 'onView') {
          startBurnTimer(message);
        }
        // 清空当前会话未读
        setSessions(prev => prev.map(s =>
          s.id === message.sessionId ? { ...s, unreadCount: 0 } : s
        ));
      } else {
        // 非当前会话，增加未读数
        addChatUnread(1);
        setSessions(prev => prev.map(s => {
          if (s.id === message.sessionId) {
            return {
              ...s,
              lastMessage: message.content || '[媒体消息]',
              lastMessageAt: new Date(),
              unreadCount: (s.unreadCount || 0) + 1
            };
          }
          return s;
        }));
      }
    };
    const unsub1 = on('message:new', handler);

    const burnHandler = ({ sessionId, messageId, messageIds }) => {
      if (currentSession && sessionId === currentSession.id) {
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
      if (currentSession && sessionId === currentSession.id) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: '[消息已撤回]', mediaUrl: null, recalledAt: new Date() } : m));
      }
    };
    const unsub3 = on('message:recalled', recallHandler);

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [currentSession, on, addChatUnread, startBurnTimer]);

  // 清理阅后即焚定时器
  useEffect(() => {
    const timers = burnTimersRef.current;
    return () => {
      Object.values(timers).forEach(t => clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [messages, virtualizer]);

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

  const sendMediaMessage = async (url, type, duration, overrideBurnSeconds = null) => {
    if (!currentSession || sending) return;
    setSending(true);
    try {
      const effectiveBurn = overrideBurnSeconds != null ? overrideBurnSeconds : (burnDurationType === 'adaptive' ? 5 : burnSeconds);
      const res = await chat.send(currentSession.id, null, type, url, duration, burnMode, burnMode ? effectiveBurn : null, burnTrigger);
      if (res.success) {
        setMessages(prev => [...prev, res.message]);
        setSessions(prev => prev.map(s => {
          if (s.id === currentSession.id) {
            return { ...s, lastMessage: `[${type === 'image' ? '图片' : type === 'video' ? '视频' : '语音'}]`, lastMessageAt: new Date() };
          }
          return s;
        }));
      }
    } catch (e) {
      captureError(e);
    } finally {
      setSending(false);
      setPreviewFile(null);
    }
  };

  // 图片直接发送（不预览），视频仍需确认
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    e.target.value = '';

    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const videoFiles = files.filter(f => f.type.startsWith('video/'));

    if (videoFiles.length > 0) {
      const file = videoFiles[0];
      setPreviewFile({ file, preview: URL.createObjectURL(file), type: 'video' });
    }

    if (imageFiles.length > 0) {
      await sendImagesDirectly(imageFiles);
    }
  };

  const sendImagesDirectly = async (files) => {
    if (!currentSession || sending) return;
    setSending(true);
    try {
      for (const file of files) {
        const res = await upload.image(file, burnMode);
        if (res.url) {
          const effectiveSeconds = burnDurationType === 'adaptive' ? 5 : burnSeconds;
          await sendMediaMessage(res.url, 'image', null, effectiveSeconds);
        }
      }
    } catch (e) {
      captureError(e);
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
      const videoDuration = await getMediaDuration(previewFile.file, 'video');
      const effectiveSeconds = burnDurationType === 'adaptive'
        ? Math.max(3, Math.ceil(videoDuration))
        : burnSeconds;
      const res = await upload.video(previewFile.file, burnMode, false, (info) => {
        setUploadProgress(info.percent);
      });
      if (res.url) {
        await sendMediaMessage(res.url, 'video', videoDuration, effectiveSeconds);
      }
    } catch (e) {
      captureError(e);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const startRecording = async () => {
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
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const actualType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: actualType });
        setPreviewFile({
          file: blob,
          preview: URL.createObjectURL(blob),
          type: 'audio',
          duration: recordTime
        });
        setRecordTime(0);
      };
      recorder.start();
      setRecording(true);
      setRecordTime(0);
      recordTimerRef.current = setInterval(() => {
        setRecordTime(prev => prev + 1);
      }, 1000);
    } catch (e) {
      captureError(e, { context: '无法访问麦克风' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      clearInterval(recordTimerRef.current);
    }
  };

  const confirmSendAudio = async () => {
    if (!previewFile || previewFile.type !== 'audio') return;
    setUploading(true);
    try {
      const res = await upload.audio(previewFile.file);
      if (res.url) {
        const audioDuration = await getMediaDuration(previewFile.file, 'audio');
        const effectiveSeconds = burnDurationType === 'adaptive'
          ? Math.max(3, Math.ceil(audioDuration))
          : burnSeconds;
        await sendMediaMessage(res.url, 'audio', audioDuration, effectiveSeconds);
      } else {
        captureError(new Error('上传失败: ' + JSON.stringify(res)), { context: 'upload_fail' });
      }
    } catch (e) {
      captureError(e);
    } finally {
      setUploading(false);
    }
  };

  const cancelPreview = () => {
    if (previewFile?.preview) URL.revokeObjectURL(previewFile.preview);
    setPreviewFile(null);
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentSession || sending) return;
    setSending(true);
    try {
      const effectiveSeconds = burnDurationType === 'adaptive' ? 5 : burnSeconds;
      const res = await chat.send(currentSession.id, input, 'text', null, null, burnMode, burnMode ? effectiveSeconds : null, burnTrigger);
      if (res.success) {
        setMessages(prev => [...prev, res.message]);
        setInput('');
        // 注意：onView 模式的倒计时在客户端点击查看后才开始，不在这里启动
        // 即时模式由后端定时器处理
        setSessions(prev => prev.map(s => {
          if (s.id === currentSession.id) {
            return { ...s, lastMessage: input.substring(0, 50), lastMessageAt: new Date() };
          }
          return s;
        }));
      }
    } catch (e) {
      captureError(e);
    } finally {
      setSending(false);
    }
  };

  const handleRecallMessage = async (msg) => {
    if (msg.recalledAt || msg.senderRole !== 'operator' && msg.senderRole !== 'admin') return;
    try {
      const res = await chat.recall(msg.id);
      if (res.success) {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: '[消息已撤回]', mediaUrl: null, recalledAt: new Date() } : m));
      }
    } catch (e) {
      captureError(e);
    }
  };

  const renderMessageContent = (msg) => {
    const destroyedColor = msg.senderRole === 'operator' ? 'rgba(245,240,232,0.4)' : 'rgba(255,255,255,0.4)';
    if (msg.recalledAt) {
      return <Text color={destroyedColor} fontStyle="italic">{msg.content}</Text>;
    }
    if (msg.burnedAt) {
      return <Text color={destroyedColor} fontStyle="italic">{msg.content}</Text>;
    }
    if (msg.isFlashImage && msg.flashBurnedByMe) {
      return <Text color={destroyedColor} fontStyle="italic">闪图已销毁</Text>;
    }

    // 阅后模式且是客户发的消息：显示橙色蒙层（操盘手/管理员视角）
    const isBurnMask = msg.isBurnAfterRead && msg.burnTrigger === 'onView' && msg.senderRole !== 'operator' && msg.senderRole !== 'admin' && !msg.burnedAt;

    if (msg.type === 'image') {
      const imageUrl = getMediaUrl(msg);
      return (
        <Box
          maxW="250px"
          cursor="pointer"
          position="relative"
          onClick={() => {
            if (isBurnMask) {
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
                <Text fontSize="lg">🔥</Text>
                <Text fontSize="sm" color="orange.300">阅后即焚</Text>
              </HStack>
            </Box>
          )}
          <Image
            src={imageUrl}
            alt="图片消息"
            borderRadius="md"
            maxH="200px"
            objectFit="cover"
            filter={isBurnMask ? 'blur(4px)' : 'none'}
          />
        </Box>
      );
    }
    if (msg.type === 'video') {
      const videoUrl = getMediaUrl(msg);
      return (
        <Box maxW="250px" cursor="pointer" position="relative" onClick={() => {
          if (isBurnMask) {
            openFlashViewer({ imageUrl: videoUrl, messageId: msg.id, senderRole: msg.senderRole, isBurnAfterRead: true, burnAfterSeconds: msg.burnAfterSeconds, mediaType: 'video' });
          } else {
            openFlashViewer({ imageUrl: videoUrl, messageId: msg.id, senderRole: msg.senderRole, isBurnAfterRead: false, mediaType: 'video' });
          }
        }}>
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
                <Text fontSize="lg">🔥</Text>
                <Text fontSize="sm" color="orange.300">阅后即焚</Text>
              </HStack>
            </Box>
          )}
          <video
            src={videoUrl}
            controls={!isBurnMask}
            style={{ borderRadius: '8px', maxHeight: '200px', width: '100%', filter: isBurnMask ? 'blur(4px)' : 'none' }}
          />
        </Box>
      );
    }
    if (msg.type === 'audio') {
      return (
        <HStack
          bg={isBurnMask ? 'rgba(255,140,0,0.15)' : (msg.isBurnAfterRead ? 'rgba(255,140,0,0.1)' : 'blackAlpha.300')}
          px={3} py={2} borderRadius="md" spacing={2}
          cursor={isBurnMask ? 'pointer' : 'default'}
          position="relative"
          onClick={() => {
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
                <Text fontSize="lg">🔥</Text>
                <Text fontSize="sm" color="orange.300">阅后即焚</Text>
              </HStack>
            </Box>
          )}
          <Text fontSize="lg" flexShrink={0}>🔊</Text>
          <Box flex={1} minW={0} maxW="200px">
            <audio src={`${API_BASE}${msg.mediaUrl}`} style={{ width: '100%', height: '24px' }} controls={!isBurnMask || msg.burnedAt} />
          </Box>
          {msg.duration && (
            <Text fontSize="xs" color="rgba(245,240,232,0.5)" flexShrink={0}>{msg.duration}"</Text>
          )}
        </HStack>
      );
    }
    if (msg.type === 'text') {
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
                <Text fontSize="lg">🔥</Text>
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

  return (
    <Box>
      <Heading color="white" mb={4} fontSize={{ base: 'lg', md: 'xl', lg: '2xl' }}>聊天中心</Heading>

      {/* 移动端：显示会话列表和聊天区域的切换按钮 */}
      <Flex display={{ base: 'flex', lg: 'none' }} mb={2}>
        <Button
          size="sm"
          variant={showChat ? 'outline' : 'solid'}
          colorScheme="gold"
          onClick={() => setShowChat(false)}
          mr={2}
        >
          {showChat ? '返回列表' : '会话列表'}
        </Button>
        {currentSession && (
          <Text color="rgba(245,240,232,0.4)" fontSize="sm" alignSelf="center">
            正在与 {currentSession.client?.nickname || '客户'} 聊天
          </Text>
        )}
      </Flex>

      <Flex
        h={{ base: 'calc(100vh - 180px)', lg: 'calc(100vh - 150px)' }}
        gap={{ base: 0, lg: 4 }}
        direction={{ base: showChat ? 'column' : 'row', lg: 'row' }}
      >
        {/* 客户列表 - 移动端全宽或隐藏，桌面端固定280px */}
        <Box
          w={{ base: showChat ? '0' : '100%', lg: '280px' }}
          flex={{ base: showChat ? '0' : '1', lg: 'none' }}
          bg="warm.800"
          borderRadius="md"
          p={4}
          display={{ base: showChat ? 'none' : 'block', lg: 'block' }}
          position={{ base: 'absolute', lg: 'relative' }}
          left={0}
          top={0}
          h={{ base: '100%', lg: 'auto' }}
          zIndex={10}
        >
          <Flex justify="space-between" align="center" mb={4}>
            <Text color="rgba(245,240,232,0.4)" fontSize="sm">客户会话</Text>
            <Button
              size="xs"
              colorScheme="gold"
              onClick={() => {
                loadAllClients();
                onNewChatOpen();
              }}
            >
              + 发起
            </Button>
          </Flex>
          <VStack spacing={2} align="stretch" maxH={{ base: 'calc(100vh - 280px)', lg: 'calc(100vh - 200px)' }} overflowY="auto">
            {sessions.map(session => (
              <Box
                key={session.id}
                p={3}
                bg={currentSession?.id === session.id ? 'warm.600' : 'warm.700'}
                borderRadius="md"
                cursor="pointer"
                onClick={() => {
                  setCurrentSession(session);
                  setShowChat(true);
                  // 清空当前会话未读数
                  if (session.unreadCount > 0) {
                    clearChatUnread(session.unreadCount);
                    setSessions(prev => prev.map(s =>
                      s.id === session.id ? { ...s, unreadCount: 0 } : s
                    ));
                  }
                }}
                position="relative"
              >
                {/* 未读小红点 */}
                {session.unreadCount > 0 && (
                  <Box
                    position="absolute"
                    top="8px"
                    right="8px"
                    w="10px"
                    h="10px"
                    borderRadius="full"
                    bg="red.500"
                    boxShadow="0 0 6px rgba(255,0,0,0.5)"
                  />
                )}
                <Text color="white" fontWeight="bold" fontSize="sm">
                  {session.client?.nickname || '客户'}
                </Text>
                <Text color="rgba(245,240,232,0.4)" fontSize="xs" noOfLines={1}>
                  {session.lastMessage || '暂无消息'}
                </Text>
                {session.unreadCount > 0 && (
                  <Text color="orange.400" fontSize="xs" mt={1}>
                    {session.unreadCount}条未读
                  </Text>
                )}
              </Box>
            ))}
            {sessions.length === 0 && (
              <Text color="rgba(245,240,232,0.6)" fontSize="sm">暂无会话</Text>
            )}
          </VStack>
        </Box>

        {/* 聊天区域 */}
        <Box
          flex={1}
          bg="warm.800"
          borderRadius="md"
          display="flex"
          flexDirection="column"
          w={{ base: showChat ? '100%' : '0', lg: 'auto' }}
          overflow="hidden"
        >
          {currentSession ? (
            <>
              <Box p={3} borderBottom="1px" borderColor="rgba(255,255,255,0.06)">
                <HStack justify="space-between">
                  <Box>
                    <Text color="white" fontWeight="bold" fontSize="sm">
                      {currentSession.client?.nickname || '客户'}
                    </Text>
                    <Text color="rgba(245,240,232,0.6)" fontSize="xs">
                      服务阶段: {currentSession.client?.serviceStage || '-'}
                    </Text>
                  </Box>
                  <HStack spacing={2}>
                    {/* 移动端返回按钮 */}
                    <IconButton
                      icon={<Text>←</Text>}
                      variant="ghost"
                      color="rgba(245,240,232,0.4)"
                      onClick={() => setShowChat(false)}
                      aria-label="返回列表"
                      size="sm"
                      display={{ base: 'flex', lg: 'none' }}
                    />
                    <IconButton
                      icon={<Text>📋</Text>}
                      variant="ghost"
                      color="rgba(245,240,232,0.4)"
                      onClick={onModalOpen}
                      aria-label="完善客户信息"
                      title="完善客户信息"
                      size="sm"
                    />
                  </HStack>
                </HStack>
              </Box>

              <Box
                ref={scrollRef}
                flex={1}
                p={3}
                overflowY="auto"
                onScroll={() => {
                  if (!scrollRef.current) return;
                  const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
                  shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 120;
                }}
              >
                <Box position="relative" height={virtualizer.getTotalSize()} w="100%">
                  {virtualizer.getVirtualItems().map(virtualRow => {
                    const msg = messages[virtualRow.index];
                    const prevMsg = virtualRow.index > 0 ? messages[virtualRow.index - 1] : null;
                    const timeGap = prevMsg ? (new Date(msg.createdAt) - new Date(prevMsg.createdAt)) / 1000 / 60 : Infinity;
                    const showTime = timeGap > 5;
                    const isOperator = msg.senderRole === 'operator' || msg.senderRole === 'admin';
                    return (
                      <Flex
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        w="100%"
                        direction="column"
                        align={isOperator ? 'flex-end' : 'flex-start'}
                        position="absolute"
                        top={0}
                        transform={`translateY(${virtualRow.start}px)`}
                        pb={2}
                      >
                        {showTime && (
                          <Text color="rgba(245,240,232,0.6)" fontSize="xs" textAlign="center" w="100%" my={2}>
                            {new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </Text>
                        )}
                        <HStack spacing={2} maxW="85%">
                          {!isOperator && (
                            <Box
                              w="36px"
                              h="36px"
                              borderRadius="full"
                              bg="linear-gradient(135deg, rgba(128,224,208,0.3), rgba(64,180,160,0.2))"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              flexShrink={0}
                              border="2px solid rgba(128,224,208,0.15)"
                            >
                              <Text fontSize="sm">👤</Text>
                            </Box>
                          )}
                          <Box
                            w="75%"
                            p={3}
                            bg={msg.isBurnAfterRead && !msg.burnedAt
                              ? 'linear-gradient(135deg, rgba(255,140,0,0.3), rgba(255,80,0,0.15))'
                              : isOperator ? 'warm.600' : 'rgba(255,255,255,0.06)'}
                            border={msg.isBurnAfterRead && !msg.burnedAt ? '1px solid rgba(255,140,0,0.4)' : 'none'}
                            borderRadius={isOperator ? '18px 6px 18px 18px' : '6px 18px 18px 18px'}
                            color="white"
                            position="relative"
                            role="group"
                            _hover={{ '.recall-btn': { opacity: 1 } }}
                          >
                            {renderMessageContent(msg)}
                            {msg.isBurnAfterRead && !msg.burnedAt && (
                              <HStack mt={2} spacing={1} justify="flex-end">
                                <Text fontSize="xs" color="orange.300">🔥</Text>
                                <Text fontSize="sm" fontWeight="bold" color="orange.300">
                                  {countdowns[msg.id] != null ? (countdowns[msg.id] > 0 ? `${countdowns[msg.id]}s` : '已销毁') : (msg.burnAfterSeconds ? `${msg.burnAfterSeconds}s` : '手动')}
                                </Text>
                              </HStack>
                            )}
                            {!msg.recalledAt && !msg.burnedAt && isOperator && (
                              <IconButton
                                className="recall-btn"
                                icon={<Text fontSize="xs">↩</Text>}
                                size="xs"
                                variant="ghost"
                                color="rgba(245,240,232,0.4)"
                                opacity={0}
                                position="absolute"
                                top={1}
                                right={1}
                                onClick={() => handleRecallMessage(msg)}
                                aria-label="撤回"
                                title="撤回"
                                minW="20px"
                                h="20px"
                              />
                            )}
                          </Box>
                          {isOperator && (
                            <Box
                              w="36px"
                              h="36px"
                              borderRadius="full"
                              bg="linear-gradient(135deg, rgba(255,200,100,0.3), rgba(255,170,60,0.2))"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              flexShrink={0}
                              border="2px solid rgba(255,200,100,0.15)"
                            >
                              <Text fontSize="sm">🤖</Text>
                            </Box>
                          )}
                        </HStack>
                      </Flex>
                    );
                  })}
                </Box>
              </Box>

              <Box p={4} borderTop="1px" borderColor="rgba(255,255,255,0.06)">
                {/* 媒体预览（仅视频/语音需要确认） */}
                {previewFile && (
                  <Box mb={2} p={2} bg="warm.700" borderRadius="md">
                    {previewFile.type === 'video' && uploadProgress !== null && uploading && (
                      <Box mb={2}>
                        <HStack justify="space-between" mb={1}>
                          <Text color="white" fontSize="sm">上传进度</Text>
                          <Text color="orange.300" fontSize="sm">{uploadProgress}%</Text>
                        </HStack>
                        <Box h="4px" bg="warm.600" borderRadius="full" overflow="hidden">
                          <Box h="full" bg="orange.500" w={`${uploadProgress}%`} transition="width 0.2s" borderRadius="full" />
                        </Box>
                      </Box>
                    )}
                    <HStack>
                      {previewFile.type === 'video' && (
                        <video src={previewFile.preview} style={{ maxHeight: '80px', borderRadius: '4px', opacity: uploading ? 0.5 : 1 }} />
                      )}
                      {previewFile.type === 'audio' && (
                        <HStack>
                          <Text color="white" fontSize="sm">🎤 语音 {recordTime || previewFile.duration || 0}"</Text>
                          <audio src={previewFile.preview} style={{ height: '28px' }} controls />
                        </HStack>
                      )}
                      {burnMode && <Text color="orange.300" fontSize="sm">🔥 {burnTrigger === 'onView' ? '阅后' : '即时'}{burnDurationType === 'adaptive' ? '(自适应)' : `${burnSeconds}s`}</Text>}
                      <IconButton
                        icon={<Text>✕</Text>}
                        size="sm"
                        variant="ghost"
                        color="rgba(245,240,232,0.4)"
                        onClick={cancelPreview}
                        aria-label="取消"
                        isDisabled={uploading}
                      />
                      <Button
                        size="sm"
                        colorScheme="gold"
                        isLoading={uploading}
                        loadingText={previewFile.type === 'video' ? '上传中...' : '发送中'}
                        onClick={previewFile.type === 'audio' ? confirmSendAudio : confirmSendVideo}
                        isDisabled={uploading}
                      >
                        {!(uploading) ? '发送' : ''}
                      </Button>
                    </HStack>
                  </Box>
                )}

                <Stack direction={{ base: 'column', md: 'row' }} spacing={{ base: 2, md: 0 }} w="full">
                  {/* 工具栏按钮 — 移动端独占一行 */}
                  <HStack spacing={1} justify={{ base: 'space-around', md: 'start' }}>
                    <IconButton
                      icon={<Text>📷</Text>}
                      variant="ghost"
                      size="sm"
                      color="rgba(245,240,232,0.4)"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="发送图片/视频"
                      isDisabled={sending || !!previewFile}
                    />
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      style={{ display: 'none' }}
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                    />
                    <IconButton
                      icon={<Text>🎤</Text>}
                      variant="ghost"
                      size="sm"
                      color={recording ? 'red.400' : 'rgba(245,240,232,0.4)'}
                      onClick={recording ? stopRecording : startRecording}
                      aria-label="录制语音"
                      isDisabled={sending || !!previewFile}
                    />
                    <Menu placement="top">
                      <MenuButton
                        as={IconButton}
                        icon={<Text>🔥 {burnMode ? (burnTrigger === 'immediately' ? '即时' : '阅后') : '阅后即焚'}</Text>}
                        variant={burnMode ? 'solid' : 'ghost'}
                        size="sm"
                        colorScheme="orange"
                        bg={burnMode ? 'orange.600' : 'transparent'}
                        color={burnMode ? 'white' : 'rgba(245,240,232,0.4)'}
                        border={burnMode ? '2px solid orange.300' : '2px solid transparent'}
                        _hover={{ bg: burnMode ? 'orange.500' : 'whiteAlpha.100' }}
                        aria-label="阅后即焚模式"
                        isDisabled={sending || !!previewFile}
                      />
                      <MenuList bg="warm.700" borderColor="rgba(255,255,255,0.06)" minW="280px" p={4}>
                        {/* 开关 */}
                        <FormControl display="flex" alignItems="center" justifyContent="space-between" mb={4}>
                          <FormLabel htmlFor="burn-mode-switch" mb="0" color={burnMode ? 'orange.300' : 'gray.300'} fontWeight="bold">
                            {burnMode ? '🔥 阅后即焚已开启' : '○ 阅后即焚未开启'}
                          </FormLabel>
                          <Switch
                            id="burn-mode-switch"
                            size="lg"
                            colorScheme="orange"
                            isChecked={burnMode}
                            onChange={(e) => {
                              const isOn = e.target.checked;
                              setBurnMode(isOn);
                              if (!isOn) {
                                setBurnTrigger('onView');
                                setBurnDurationType('fixed');
                                setBurnSeconds(5);
                              }
                            }}
                          />
                        </FormControl>

                        {burnMode && (
                          <>
                            <MenuDivider borderColor="rgba(255,255,255,0.06)" />
                            {/* 触发时机 */}
                            <Box mb={3}>
                              <Text fontSize="xs" color="gray.400" fontWeight="bold" mb={2}>触发时机</Text>
                              <Stack spacing={2}>
                                <Button
                                  size="sm"
                                  variant={burnTrigger === 'immediately' ? 'solid' : 'outline'}
                                  colorScheme="orange"
                                  onClick={() => setBurnTrigger('immediately')}
                                  w="full"
                                >
                                  即时（发出后立即计时）
                                </Button>
                                <Button
                                  size="sm"
                                  variant={burnTrigger === 'onView' ? 'solid' : 'outline'}
                                  colorScheme="orange"
                                  onClick={() => setBurnTrigger('onView')}
                                  w="full"
                                >
                                  阅后（点击后计时）
                                </Button>
                              </Stack>
                            </Box>

                            <MenuDivider borderColor="rgba(255,255,255,0.06)" />
                            {/* 时长类型 */}
                            <Box mb={3}>
                              <Text fontSize="xs" color="gray.400" fontWeight="bold" mb={2}>时长</Text>
                              <Stack spacing={2}>
                                <Button
                                  size="sm"
                                  variant={burnDurationType === 'fixed' ? 'solid' : 'outline'}
                                  colorScheme="orange"
                                  onClick={() => setBurnDurationType('fixed')}
                                  w="full"
                                >
                                  固定秒数
                                </Button>
                                <Button
                                  size="sm"
                                  variant={burnDurationType === 'adaptive' ? 'solid' : 'outline'}
                                  colorScheme="orange"
                                  onClick={() => setBurnDurationType('adaptive')}
                                  w="full"
                                >
                                  自适应（文字/图片5秒，视频/音频按实际时长）
                                </Button>
                              </Stack>
                            </Box>

                            {burnDurationType === 'fixed' && (
                              <>
                                <MenuDivider borderColor="rgba(255,255,255,0.06)" />
                                <Text fontSize="xs" color="gray.400" fontWeight="bold" mb={2}>选择秒数</Text>
                                <HStack spacing={2} justify="center">
                                  {[3, 5, 10, 15, 30, 60].map(s => (
                                    <Button
                                      key={s}
                                      size="md"
                                      variant={burnSeconds === s ? 'solid' : 'outline'}
                                      colorScheme="orange"
                                      onClick={() => setBurnSeconds(s)}
                                      minW="50px"
                                    >
                                      {s}s
                                    </Button>
                                  ))}
                                </HStack>
                              </>
                            )}
                          </>
                        )}
                      </MenuList>
                    </Menu>
                    <EmojiPanel onSelect={handleEmojiSelect} isDisabled={sending || !!previewFile} variant="admin" />
                  </HStack>
                  {/* 输入框 + 发送 — 移动端独占第二行 */}
                  <HStack flex={1} spacing={1}>
                    <Input
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendMessage()}
                      placeholder="输入回复..."
                      flex={1}
                      minW="0"
                      bg="warm.700"
                      border="none"
                      color="white"
                      _placeholder={{ color: 'rgba(245,240,232,0.4)' }}
                    />
                    <Button colorScheme="gold" onClick={sendMessage} isLoading={sending} size="sm">发送</Button>
                  </HStack>
                </Stack>
              </Box>
            </>
          ) : (
            <Flex flex={1} align="center" justify="center">
              <Text color="rgba(245,240,232,0.6)">选择客户开始聊天</Text>
            </Flex>
          )}
        </Box>
      </Flex>

      {/* 发起新聊天 Modal */}
      <Modal isOpen={isNewChatOpen} onClose={onNewChatClose} size="md">
        <ModalOverlay />
        <ModalContent bg="warm.800" color="white">
          <ModalHeader>发起新聊天</ModalHeader>
          <ModalCloseButton />
          <ModalBody maxH="400px" overflow="hidden" display="flex" flexDirection="column">
            <Input
              placeholder="搜索客户..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              mb={3}
              bg="warm.700"
              border="rgba(255,255,255,0.06)"
            />
            <Box flex={1} overflowY="auto" maxH="300px">
              <List spacing={1}>
                {allClients
                  .filter(c => {
                    const keyword = clientSearch.toLowerCase();
                    const name = (c.nickname || c.username || '客户').toLowerCase();
                    const phone = (c.phone || '').toLowerCase();
                    return name.includes(keyword) || phone.includes(keyword);
                  })
                  .map(client => (
                    <ListItem
                      key={client.id}
                      p={2}
                      borderRadius="md"
                      cursor="pointer"
                      bg={selectedClientId === client.id ? 'warm.600' : 'warm.700'}
                      _hover={{ bg: selectedClientId === client.id ? 'warm.600' : 'warm.600' }}
                      onClick={() => {
                        setSelectedClientId(client.id);
                        setClientSearch('');
                        onNewChatClose();
                        handleStartNewChatWithClient(client.id);
                      }}
                    >
                      <Text fontWeight="bold" fontSize="sm">
                        {client.nickname || client.username || '客户'}
                      </Text>
                      {client.phone && (
                        <Text fontSize="xs" color="rgba(245,240,232,0.4)">{client.phone}</Text>
                      )}
                    </ListItem>
                  ))}
                {allClients.filter(c => {
                  const keyword = clientSearch.toLowerCase();
                  const name = (c.nickname || c.username || '客户').toLowerCase();
                  const phone = (c.phone || '').toLowerCase();
                  return name.includes(keyword) || phone.includes(keyword);
                }).length === 0 && (
                  <Text color="rgba(245,240,232,0.6)" textAlign="center" py={4}>
                    未找到匹配的客户
                  </Text>
                )}
              </List>
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => {
              setSelectedClientId('');
              setClientSearch('');
              onNewChatClose();
            }}>
              取消
            </Button>
            <Button
              colorScheme="gold"
              onClick={handleStartNewChat}
              isDisabled={!selectedClientId}
            >
              开始聊天
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ProfileSuggestModal
        clientId={currentSession?.clientId}
        clientName={currentSession?.client?.nickname || '客户'}
        isOpen={isModalOpen}
        onClose={onModalClose}
      />
      <FlashImageViewer
        isOpen={flashViewer.isOpen}
        onClose={() => setFlashViewer(v => ({ ...v, isOpen: false }))}
        imageUrl={flashViewer.imageUrl}
        messageId={flashViewer.messageId}
        isBurnAfterRead={flashViewer.isBurnAfterRead || false}
        burnAfterSeconds={flashViewer.burnAfterSeconds}
        mediaType={flashViewer.mediaType || 'image'}
      />
    </Box>
  );
}

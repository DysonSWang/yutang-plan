import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Flex, VStack, HStack, Input, Button, Text, Heading, IconButton, Image, Spinner, useDisclosure, Menu, MenuButton, MenuList, MenuItem, Badge, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, Select, List, ListItem } from '@chakra-ui/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { chat, upload, clients } from '../../utils/api';
import { useSocket } from '../../contexts/SocketContext';
import ProfileSuggestModal from './ProfileSuggestModal';
import FlashImageViewer from '../../components/FlashImageViewer';

export default function AdminChat() {
  const { on, addChatUnread, clearChatUnread } = useSocket();
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [burnMode, setBurnMode] = useState(false);
  const [burnSeconds, setBurnSeconds] = useState(5);
  const [flashMode, setFlashMode] = useState(false); // 闪图模式
  const burnTimersRef = useRef({});
  const [countdowns, setCountdowns] = useState({});
  const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();
  const { isOpen: isNewChatOpen, onOpen: onNewChatOpen, onClose: onNewChatClose } = useDisclosure();
  const [flashViewer, setFlashViewer] = useState({ isOpen: false, imageUrl: '', messageId: null, senderRole: '' });
  const [allClients, setAllClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showChat, setShowChat] = useState(false); // 移动端：是否显示聊天区域
  const scrollRef = useRef();
  const shouldAutoScrollRef = useRef(true);
  const fileInputRef = useRef();
  const mediaRecorderRef = useRef();
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

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
      console.error(e);
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
      console.error(e);
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
      console.error(e);
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
      console.error(e);
    }
  };

  const handleBurnMessage = useCallback(async (msg) => {
    if (msg.burnedAt || msg.senderRole === 'operator' || msg.senderRole === 'admin') return;
    try {
      const res = await chat.burn(msg.id);
      if (res.success) {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: '[消息已销毁]', mediaUrl: null, burnedAt: new Date() } : m));
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
      console.error(e);
    }
  }, []);

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

  const loadMessages = useCallback(async (sessionId) => {
    try {
      const res = await chat.messages(sessionId);
      if (res.success) {
        setMessages(res.messages);
        res.messages.forEach(msg => {
          if (msg.isBurnAfterRead && !msg.burnedAt && msg.burnAfterSeconds) {
            startBurnTimer(msg);
          }
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, [startBurnTimer]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

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
        // 阅后即焚自动倒计时
        if (message.isBurnAfterRead && !message.burnedAt && message.burnAfterSeconds) {
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
    on('message:new', handler);

    const burnHandler = ({ sessionId, messageId }) => {
      if (currentSession && sessionId === currentSession.id) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: '[消息已销毁]', mediaUrl: null, burnedAt: new Date() } : m));
      }
    };
    on('message:burned', burnHandler);

    const recallHandler = ({ sessionId, messageId }) => {
      if (currentSession && sessionId === currentSession.id) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: '[消息已撤回]', mediaUrl: null, recalledAt: new Date() } : m));
      }
    };
    on('message:recalled', recallHandler);
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

  const sendMediaMessage = async (url, type, duration) => {
    if (!currentSession || sending) return;
    setSending(true);
    try {
      const res = await chat.send(currentSession.id, null, type, url, duration, burnMode, burnSeconds, flashMode);
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
      console.error(e);
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
        const res = await upload.image(file, burnMode, flashMode);
        if (res.url) {
          await sendMediaMessage(res.url, 'image', null);
        }
      }
      setBurnMode(false);
      setFlashMode(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  // 视频确认发送
  const confirmSendVideo = async () => {
    if (!previewFile || previewFile.type !== 'video') return;
    setUploading(true);
    try {
      const res = await upload.video(previewFile.file, burnMode, flashMode);
      if (res.url) {
        await sendMediaMessage(res.url, 'video', null);
        setBurnMode(false);
        setFlashMode(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
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
      console.error('无法访问麦克风', e);
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
        await sendMediaMessage(res.url, 'audio', previewFile.duration || recordTime);
      } else {
        console.error('上传失败', res);
      }
    } catch (e) {
      console.error(e);
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
      const res = await chat.send(currentSession.id, input, 'text', null, null, burnMode, burnSeconds);
      if (res.success) {
        setMessages(prev => [...prev, res.message]);
        setInput('');
        setBurnMode(false);
        if (res.message.isBurnAfterRead && res.message.burnAfterSeconds) {
          startBurnTimer(res.message);
        }
        setSessions(prev => prev.map(s => {
          if (s.id === currentSession.id) {
            return { ...s, lastMessage: input.substring(0, 50), lastMessageAt: new Date() };
          }
          return s;
        }));
      }
    } catch (e) {
      console.error(e);
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
      console.error(e);
    }
  };

  const renderMessageContent = (msg) => {
    if (msg.recalledAt) {
      return <Text color="gray.500" fontStyle="italic">{msg.content}</Text>;
    }
    if (msg.burnedAt) {
      return <Text color="gray.500" fontStyle="italic">{msg.content}</Text>;
    }
    if (msg.type === 'image') {
      const isClickable = msg.isBurnAfterRead && msg.senderRole !== 'operator' && msg.senderRole !== 'admin' && !msg.burnedAt;
      const imageViewerUrl = msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${API_BASE}${msg.mediaUrl}`;
      return (
        <Box
          maxW="250px"
          cursor={isClickable || msg.isFlashImage ? 'pointer' : 'default'}
          opacity={msg.isBurnAfterRead ? 0.85 : 1}
          position="relative"
          onClick={() => {
            if (msg.isFlashImage && !msg.burnedAt) {
              // 闪图：打开满屏查看器（带倒计时）
              setFlashViewer({ isOpen: true, imageUrl: imageViewerUrl, messageId: msg.id, senderRole: msg.senderRole, isFlashMode: true });
            } else if (msg.isBurnAfterRead && msg.senderRole !== 'operator' && msg.senderRole !== 'admin') {
              handleBurnMessage(msg);
            } else {
              // 普通图片：打开满屏查看器（无倒计时）
              setFlashViewer({ isOpen: true, imageUrl: imageViewerUrl, messageId: msg.id, senderRole: msg.senderRole, isFlashMode: false });
            }
          }}
        >
          <Image
            src={`${API_BASE}${msg.mediaUrl}`}
            alt="图片消息"
            borderRadius="md"
            maxH="200px"
            objectFit="cover"
          />
          {msg.isFlashImage && !msg.burnedAt && (
            <Text
              position="absolute"
              top={1}
              right={1}
              fontSize="xs"
              color="yellow.300"
              bg="blackAlpha.600"
              px={1}
              borderRadius="sm"
            >
              ⚡
            </Text>
          )}
        </Box>
      );
    }
    if (msg.type === 'video') {
      return (
        <Box maxW="250px" cursor={msg.isBurnAfterRead ? 'pointer' : 'default'} onClick={() => msg.isBurnAfterRead && msg.senderRole !== 'operator' && msg.senderRole !== 'admin' && handleBurnMessage(msg)}>
          <video
            src={`${API_BASE}${msg.mediaUrl}`}
            controls={!msg.isBurnAfterRead}
            style={{ borderRadius: '8px', maxHeight: '200px', width: '100%' }}
          />
        </Box>
      );
    }
    if (msg.type === 'audio') {
      return (
        <HStack bg={msg.isBurnAfterRead && !msg.burnedAt ? 'rgba(255,140,0,0.2)' : 'blackAlpha.300'} px={3} py={2} borderRadius="md" spacing={2} cursor={msg.isBurnAfterRead && msg.senderRole !== 'operator' && msg.senderRole !== 'admin' ? 'pointer' : 'default'} onClick={() => msg.isBurnAfterRead && msg.senderRole !== 'operator' && msg.senderRole !== 'admin' && handleBurnMessage(msg)}>
          <Text fontSize="lg">🔊</Text>
          <audio src={`${API_BASE}${msg.mediaUrl}`} style={{ height: '28px' }} controls={!msg.isBurnAfterRead || msg.burnedAt} />
          {msg.duration && (
            <Text fontSize="xs" color="gray.300">{msg.duration}"</Text>
          )}
        </HStack>
      );
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
          colorScheme="teal"
          onClick={() => setShowChat(false)}
          mr={2}
        >
          {showChat ? '返回列表' : '会话列表'}
        </Button>
        {currentSession && (
          <Text color="gray.400" fontSize="sm" alignSelf="center">
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
          bg="gray.800"
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
            <Text color="gray.400" fontSize="sm">客户会话</Text>
            <Button
              size="xs"
              colorScheme="teal"
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
                bg={currentSession?.id === session.id ? 'teal.600' : 'gray.700'}
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
                <Text color="gray.400" fontSize="xs" noOfLines={1}>
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
              <Text color="gray.500" fontSize="sm">暂无会话</Text>
            )}
          </VStack>
        </Box>

        {/* 聊天区域 */}
        <Box
          flex={1}
          bg="gray.800"
          borderRadius="md"
          display="flex"
          flexDirection="column"
          w={{ base: showChat ? '100%' : '0', lg: 'auto' }}
          overflow="hidden"
        >
          {currentSession ? (
            <>
              <Box p={3} borderBottom="1px" borderColor="gray.700">
                <HStack justify="space-between">
                  <Box>
                    <Text color="white" fontWeight="bold" fontSize="sm">
                      {currentSession.client?.nickname || '客户'}
                    </Text>
                    <Text color="gray.500" fontSize="xs">
                      服务阶段: {currentSession.client?.serviceStage || '-'}
                    </Text>
                  </Box>
                  <HStack spacing={2}>
                    {/* 移动端返回按钮 */}
                    <IconButton
                      icon={<Text>←</Text>}
                      variant="ghost"
                      color="gray.400"
                      onClick={() => setShowChat(false)}
                      aria-label="返回列表"
                      size="sm"
                      display={{ base: 'flex', lg: 'none' }}
                    />
                    <IconButton
                      icon={<Text>📋</Text>}
                      variant="ghost"
                      color="gray.400"
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
                        pb={3}
                      >
                        {showTime && (
                          <Text color="gray.500" fontSize="xs" textAlign="center" w="100%" my={2}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        )}
                        <HStack spacing={2} maxW="85%">
                          {!isOperator && (
                            <Box
                              w="28px"
                              h="28px"
                              borderRadius="full"
                              bg="gray.600"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              flexShrink={0}
                            >
                              <Text fontSize="xs">👤</Text>
                            </Box>
                          )}
                          <Box
                            w="75%"
                            p={3}
                            borderRadius="lg"
                            bg={msg.isBurnAfterRead && !msg.burnedAt
                              ? 'linear-gradient(135deg, rgba(255,140,0,0.3), rgba(255,80,0,0.15))'
                              : isOperator ? 'teal.600' : 'gray.700'}
                            border={msg.isBurnAfterRead && !msg.burnedAt ? '1px solid rgba(255,140,0,0.4)' : 'none'}
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
                                  {countdowns[msg.id] != null ? `${countdowns[msg.id]}s` : (msg.burnAfterSeconds ? `${msg.burnAfterSeconds}s` : '手动')}
                                </Text>
                              </HStack>
                            )}
                            <Text fontSize="xs" color="gray.300" mt={1}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                            {!msg.recalledAt && !msg.burnedAt && isOperator && (
                              <IconButton
                                className="recall-btn"
                                icon={<Text fontSize="xs">↩</Text>}
                                size="xs"
                                variant="ghost"
                                color="gray.400"
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
                              w="28px"
                              h="28px"
                              borderRadius="full"
                              bg="teal.600"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              flexShrink={0}
                            >
                              <Text fontSize="xs">🤖</Text>
                            </Box>
                          )}
                        </HStack>
                      </Flex>
                    );
                  })}
                </Box>
              </Box>

              <Box p={4} borderTop="1px" borderColor="gray.700">
                {/* 媒体预览（仅视频/语音需要确认） */}
                {previewFile && (
                  <Box mb={2} p={2} bg="gray.700" borderRadius="md">
                    <HStack>
                      {previewFile.type === 'video' && (
                        <video src={previewFile.preview} style={{ maxHeight: '80px', borderRadius: '4px' }} />
                      )}
                      {previewFile.type === 'audio' && (
                        <HStack>
                          <Text color="white" fontSize="sm">🎤 语音 {recordTime || previewFile.duration || 0}"</Text>
                          <audio src={previewFile.preview} style={{ height: '28px' }} controls />
                        </HStack>
                      )}
                      {burnMode && <Text color="orange.300" fontSize="sm">🔥 {burnSeconds}s</Text>}
                      {flashMode && <Text color="yellow.300" fontSize="sm">⚡ 5s</Text>}
                      <IconButton
                        icon={<Text>✕</Text>}
                        size="sm"
                        variant="ghost"
                        color="gray.400"
                        onClick={cancelPreview}
                        aria-label="取消"
                      />
                      <Button
                        size="sm"
                        colorScheme="teal"
                        isLoading={uploading}
                        loadingText={uploading && previewFile.type === 'video' ? '压缩中...' : '发送中'}
                        onClick={previewFile.type === 'audio' ? confirmSendAudio : confirmSendVideo}
                      >
                        {!(uploading && previewFile.type === 'video') ? '发送' : ''}
                      </Button>
                    </HStack>
                  </Box>
                )}

                <HStack>
                  <IconButton
                    icon={<Text>📷</Text>}
                    variant="ghost"
                    color="gray.400"
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
                    color={recording ? 'red.400' : 'gray.400'}
                    onClick={recording ? stopRecording : startRecording}
                    aria-label="录制语音"
                    isDisabled={sending || !!previewFile}
                  />
                  <Menu placement="top">
                    <MenuButton
                      as={IconButton}
                      icon={<Text>🔥{burnMode ? `${burnSeconds}s` : ''}</Text>}
                      variant="ghost"
                      color={burnMode ? 'orange.400' : 'gray.500'}
                      aria-label="阅后即焚模式"
                      isDisabled={sending || !!previewFile || flashMode}
                      title={burnMode ? `阅后即焚：${burnSeconds}s后自动销毁` : '阅后即焚：关'}
                    />
                    <MenuList bg="gray.700" borderColor="gray.600">
                      <MenuItem bg="gray.700" _hover={{ bg: 'gray.600' }} onClick={() => { setBurnMode(false); setBurnSeconds(5); }}>
                        <HStack><Text color="gray.400">关闭</Text></HStack>
                      </MenuItem>
                      {[3, 5, 10, 15, 30, 60].map(s => (
                        <MenuItem key={s} bg="gray.700" _hover={{ bg: 'gray.600' }} onClick={() => { setBurnMode(true); setBurnSeconds(s); }}>
                          <HStack>
                            <Text color="orange.300">🔥</Text>
                            <Text color="white">{s}秒</Text>
                            {s === 5 && <Badge colorScheme="orange" size="sm">默认</Badge>}
                          </HStack>
                        </MenuItem>
                      ))}
                    </MenuList>
                  </Menu>
                  <IconButton
                    icon={<Text>⚡{flashMode ? '闪图' : ''}</Text>}
                    variant="ghost"
                    color={flashMode ? 'yellow.400' : 'gray.500'}
                    aria-label="闪图模式"
                    isDisabled={sending || !!previewFile || burnMode}
                    title={flashMode ? '闪图：查阅后5秒自动销毁' : '闪图模式'}
                    onClick={() => { setFlashMode(f => !f); setBurnMode(false); }}
                    size="sm"
                  />
                  <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && sendMessage()}
                    placeholder="输入回复..."
                    bg="gray.700"
                    border="none"
                    color="white"
                    _placeholder={{ color: 'gray.400' }}
                  />
                  <Button colorScheme="teal" onClick={sendMessage} isLoading={sending}>发送</Button>
                </HStack>
              </Box>
            </>
          ) : (
            <Flex flex={1} align="center" justify="center">
              <Text color="gray.500">选择客户开始聊天</Text>
            </Flex>
          )}
        </Box>
      </Flex>

      {/* 发起新聊天 Modal */}
      <Modal isOpen={isNewChatOpen} onClose={onNewChatClose} size="md">
        <ModalOverlay />
        <ModalContent bg="gray.800" color="white">
          <ModalHeader>发起新聊天</ModalHeader>
          <ModalCloseButton />
          <ModalBody maxH="400px" overflow="hidden" display="flex" flexDirection="column">
            <Input
              placeholder="搜索客户..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              mb={3}
              bg="gray.700"
              border="gray.600"
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
                      bg={selectedClientId === client.id ? 'teal.600' : 'gray.700'}
                      _hover={{ bg: selectedClientId === client.id ? 'teal.600' : 'gray.600' }}
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
                        <Text fontSize="xs" color="gray.400">{client.phone}</Text>
                      )}
                    </ListItem>
                  ))}
                {allClients.filter(c => {
                  const keyword = clientSearch.toLowerCase();
                  const name = (c.nickname || c.username || '客户').toLowerCase();
                  const phone = (c.phone || '').toLowerCase();
                  return name.includes(keyword) || phone.includes(keyword);
                }).length === 0 && (
                  <Text color="gray.500" textAlign="center" py={4}>
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
              colorScheme="teal"
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
        senderRole={flashViewer.senderRole}
        isFlashMode={flashViewer.isFlashMode || false}
      />
    </Box>
  );
}

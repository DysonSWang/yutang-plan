import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, VStack, HStack, Input, Button, Text, Flex, IconButton, Image, Badge, useToast, Center, Spinner } from '@chakra-ui/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api, chat, upload } from '../../utils/api';
import { useSocket } from '../../contexts/SocketContext';
import FlashImageViewer from '../../components/FlashImageViewer';
import EmojiPanel from '../../components/EmojiPanel';

export default function ClientChat() {
  const { on } = useSocket();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [burnMode, setBurnMode] = useState(false);
  const [burnSeconds, setBurnSeconds] = useState(5);
  const [flashMode, setFlashMode] = useState(false);
  const scrollRef = useRef();
  const shouldAutoScrollRef = useRef(true);
  const fileInputRef = useRef();
  const inputRef = useRef();
  const mediaRecorderRef = useRef();
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef();
  const burnTimersRef = useRef({});
  const [countdowns, setCountdowns] = useState({});
  const [flashViewer, setFlashViewer] = useState({ isOpen: false, imageUrl: '', messageId: null, senderRole: '', isFlashMode: false, mediaType: 'image' });
  const [forceShow, setForceShow] = useState(0);
  const openFlashViewer = useCallback((params) => {
    setForceShow(f => f + 1);
    setFlashViewer({ isOpen: true, ...params });
  }, []);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    measureElement: (el) => Math.max(el.getBoundingClientRect().height, 60),
    overscan: 5,
  });

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
      console.error(e);
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

  const loadMessages = async (sessionId) => {
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
  };

  useEffect(() => {
    loadSession();
  }, []);

  // 进入聊天页面时清除聊天未读数
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chat-enter'));
  }, []);

  useEffect(() => {
    const handler = (message) => {
      if (message.senderRole === 'client') return;
      if (session && message.sessionId === session.id) {
        setMessages(prev => [...prev, message]);
        if (message.isBurnAfterRead && message.burnAfterSeconds && !message.burnedAt) {
          startBurnTimer(message);
        }
      }
    };
    const unsub1 = on('message:new', handler);

    const burnHandler = ({ sessionId, messageId }) => {
      if (session && sessionId === session.id) {
        setMessages(prev => prev.map(m => {
          if (m.id !== messageId) return m;
          if (m.isFlashImage) {
            return { ...m, flashBurnedByMe: true };
          }
          return { ...m, content: '[消息已销毁]', mediaUrl: null, burnedAt: new Date() };
        }));
        if (flashViewer.messageId === messageId) {
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
    if (shouldAutoScrollRef.current) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [messages, virtualizer]);

  useEffect(() => {
    const timers = burnTimersRef.current;
    return () => {
      Object.values(timers).forEach(t => clearTimeout(t));
    };
  }, []);

  const sendMediaMessage = async (url, type, duration, isBurnAfterRead = false, isFlashImage = false) => {
    if (!session || sending) return;
    setSending(true);
    try {
      const res = await chat.send(session.id, null, type, url, duration, isBurnAfterRead, isBurnAfterRead ? burnSeconds : null, isFlashImage);
      if (res.success) {
        setMessages(prev => [...prev, res.message]);
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
      if (flashMode) {
        // 闪图模式：视频直接上传发送，不预览
        setSending(true);
        try {
          const res = await upload.video(file, burnMode, flashMode);
          if (res.url) {
            await sendMediaMessage(res.url, 'video', null, false, true);
            setFlashMode(false);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setSending(false);
        }
      } else {
        setPreviewFile({ file, preview: URL.createObjectURL(file), type: 'video' });
      }
    }

    // 图片：直接上传发送
    if (imageFiles.length > 0) {
      await sendImagesDirectly(imageFiles);
    }
  };

  const sendImagesDirectly = async (files) => {
    if (!session || sending) return;
    setSending(true);
    const isBurn = burnMode;
    const isFlash = flashMode;
    try {
      for (const file of files) {
        const res = await upload.image(file, isBurn, isFlash);
        if (res.url) {
          await sendMediaMessage(res.url, 'image', null, isBurn, isFlash);
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
      const isBurn = burnMode;
      const isFlash = flashMode;
      const res = await upload.video(previewFile.file, isBurn, isFlash);
      if (res.url) {
        await sendMediaMessage(res.url, 'video', null, isBurn, isFlash);
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
    if (!input.trim() || sending) return;
    if (!session) {
      // 没有会话时，先创建会话
      try {
        const createRes = await chat.createSession();
        if (createRes.success && createRes.session) {
          setSession(createRes.session);
          await sendMessageAfterSession(createRes.session.id, input);
        } else {
          toast({ title: '创建会话失败，请稍后重试', status: 'error', duration: 3000 });
        }
      } catch (e) {
        console.error(e);
        toast({ title: '发送失败', status: 'error', duration: 2000 });
      }
      return;
    }
    await sendMessageAfterSession(session.id, input);
  };

  const sendMessageAfterSession = async (sessionId, content) => {
    setSending(true);
    try {
      const isBurn = burnMode;
      const res = await chat.send(sessionId, content, 'text', null, null, isBurn, isBurn ? burnSeconds : null);
      if (res.success) {
        setMessages(prev => [...prev, res.message]);
        setInput('');
        if (isBurn) setBurnMode(false);
        if (res.message.isBurnAfterRead && res.message.burnAfterSeconds) {
          startBurnTimer(res.message);
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: '发送失败', status: 'error', duration: 2000 });
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
      console.error(e);
    }
  };

  const renderMessageContent = (msg) => {
    if (msg.recalledAt) return <Text color="gray.500" fontStyle="italic">{msg.content}</Text>;
    if (msg.burnedAt) return <Text color="gray.500" fontStyle="italic">{msg.content}</Text>;
    if (msg.isFlashImage && msg.flashBurnedByMe) return <Text color="gray.500" fontStyle="italic">⚡ 闪图已销毁</Text>;
    if (msg.type === 'image') {
      const isClickable = msg.isBurnAfterRead && msg.senderRole !== 'client' && !msg.burnedAt;
      const imageUrl = getMediaUrl(msg);
      return (
        <Box
          maxW="250px"
          cursor={isClickable || msg.isFlashImage ? 'pointer' : 'default'}
          opacity={msg.isBurnAfterRead ? 0.85 : 1}
          position="relative"
          onClick={() => {
            if (msg.isFlashImage && !msg.burnedAt && !msg.flashBurnedByMe) {
              // 闪图：打开满屏查看器（带倒计时）
              openFlashViewer({ imageUrl, messageId: msg.id, senderRole: msg.senderRole, isFlashMode: true });
            } else if (msg.isBurnAfterRead && msg.senderRole !== 'client') {
              handleBurnMessage(msg);
            } else {
              // 普通图片：打开满屏查看器（无倒计时）
              openFlashViewer({ imageUrl, messageId: msg.id, senderRole: msg.senderRole, isFlashMode: false });
            }
          }}
        >
          {msg.isFlashImage && !msg.burnedAt && !msg.flashBurnedByMe ? (
            <Box
              w="120px"
              h="90px"
              bg="gray.800"
              borderRadius="md"
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              border="1px dashed"
              borderColor="yellow.500"
            >
              <Text fontSize="xl">⚡</Text>
              <Text fontSize="xs" color="yellow.300" mt={1}>闪图</Text>
            </Box>
          ) : (
            <Image src={getMediaUrl(msg)} alt="图片消息" borderRadius="md" maxH="200px" objectFit="cover" loading="lazy" />
          )}
        </Box>
      );
    }
    if (msg.type === 'video') {
      const videoUrl = getMediaUrl(msg);
      if (msg.isFlashImage && !msg.burnedAt && !msg.flashBurnedByMe) {
        return (
          <Box
            w="120px"
            h="90px"
            bg="rgba(255,255,255,0.05)"
            borderRadius="md"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            border="1px dashed"
            borderColor="yellow.500"
            cursor="pointer"
            onClick={() => openFlashViewer({ imageUrl: videoUrl, messageId: msg.id, senderRole: msg.senderRole, isFlashMode: true, mediaType: 'video' })}
          >
            <Text fontSize="xl">⚡</Text>
            <Text fontSize="xs" color="yellow.300" mt={1}>闪图</Text>
          </Box>
        );
      }
      return (
        <Box maxW="250px" cursor={msg.isBurnAfterRead ? 'pointer' : 'default'} onClick={() => msg.isBurnAfterRead && msg.senderRole !== 'client' && handleBurnMessage(msg)}>
          <video src={getMediaUrl(msg)} controls={!msg.isBurnAfterRead} style={{ borderRadius: '8px', maxHeight: '200px', width: '100%' }} />
        </Box>
      );
    }
    if (msg.type === 'audio') {
      return (
        <HStack bg={msg.isBurnAfterRead && !msg.burnedAt ? 'rgba(255,140,0,0.15)' : 'blackAlpha.300'} px={3} py={2} borderRadius="md" spacing={2} cursor={msg.isBurnAfterRead && msg.senderRole !== 'client' ? 'pointer' : 'default'} onClick={() => msg.isBurnAfterRead && msg.senderRole !== 'client' && handleBurnMessage(msg)}>
          <Text fontSize="lg">🔊</Text>
          <audio src={getMediaUrl(msg)} style={{ height: '28px' }} controls={!msg.isBurnAfterRead || msg.burnedAt} />
          {msg.duration && <Text fontSize="xs" color="gray.300">{msg.duration}"</Text>}
        </HStack>
      );
    }
    return <Text>{msg.content}</Text>;
  };

  if (loading) {
    return (
      <Center h="calc(100vh - 150px)">
        <Spinner size="lg" color="brand.500" />
      </Center>
    );
  }

  return (
    <Flex h="calc(100vh - 120px)" direction="column" gap={4}>
      {/* 聊天区域 */}
      <Box flex={1} bg="rgba(255,255,255,0.02)" border="1px solid rgba(255,255,255,0.06)" borderRadius="xl" display="flex" flexDirection="column" overflow="hidden">
        {/* 聊天头部 */}
        <Box p={4} borderBottom="1px solid rgba(255,255,255,0.06)">
          <HStack spacing={3}>
            <Box w="40px" h="40px" borderRadius="full" bg="brand.500" display="flex" alignItems="center" justifyContent="center">
              <Text fontSize="lg">💕</Text>
            </Box>
            <Box>
              <Text color="white" fontWeight="bold">Mo哥</Text>
              <Text color="abyss.400" fontSize="xs">专属人工顾问</Text>
            </Box>
          </HStack>
        </Box>

        {/* 消息列表 */}
        <Box
          ref={scrollRef}
          flex={1}
          p={4}
          overflowY="auto"
          onScroll={() => {
            if (!scrollRef.current) return;
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 120;
          }}
        >
          {messages.length === 0 ? (
            <Center h="100%">
              <VStack spacing={3}>
                <Text fontSize="4xl">💬</Text>
                <Text color="abyss.400">开始和Mo哥聊聊吧</Text>
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
                    pb={3}
                  >
                    {showTime && (
                      <Text color="abyss.500" fontSize="xs" textAlign="center" w="100%" my={2}>
                        {new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </Text>
                    )}
                    <HStack spacing={2} maxW="85%">
                      {!isClient && (
                        <Box
                          w="28px"
                          h="28px"
                          borderRadius="full"
                          bg="abyss.600"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          flexShrink={0}
                        >
                          <Text fontSize="xs">🤖</Text>
                        </Box>
                      )}
                      <Box
                        w="75%"
                        p={3}
                        borderRadius="lg"
                        bg={msg.isBurnAfterRead && !msg.burnedAt
                          ? 'linear-gradient(135deg, rgba(255,140,0,0.25), rgba(255,80,0,0.15))'
                          : isClient ? 'brand.500' : 'rgba(255,255,255,0.08)'}
                        border={msg.isBurnAfterRead && !msg.burnedAt ? '1px solid rgba(255,140,0,0.35)' : 'none'}
                        color="white"
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
                        {!msg.recalledAt && !msg.burnedAt && isClient && (
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
                            minW="20px"
                            h="20px"
                          />
                        )}
                      </Box>
                      {isClient && (
                        <Box
                          w="28px"
                          h="28px"
                          borderRadius="full"
                          bg="brand.500"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          flexShrink={0}
                        >
                          <Text fontSize="xs">👤</Text>
                        </Box>
                      )}
                    </HStack>
                  </Flex>
                );
              })}
            </Box>
          )}
        </Box>

        {/* 输入区域 */}
        <Box p={4} borderTop="1px solid rgba(255,255,255,0.06)">
          {/* 媒体预览（仅视频/语音需要确认） */}
          {previewFile && (
            <Box mb={2} p={2} bg="rgba(255,255,255,0.05)" borderRadius="md">
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
                  colorScheme="brand"
                  isLoading={uploading}
                  loadingText={uploading && previewFile.type === 'video' ? '压缩中...' : '发送中'}
                  onClick={previewFile.type === 'audio' ? confirmSendAudio : confirmSendVideo}
                >
                  {!(uploading && previewFile.type === 'video') ? '发送' : ''}
                </Button>
              </HStack>
            </Box>
          )}

          <HStack spacing={{ base: 1, md: 2 }}>
            <IconButton
              icon={<Text>📷</Text>}
              variant="ghost"
              size="sm"
              color="abyss.400"
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
              icon={<Text>{recording ? '⏹' : '🎤'}</Text>}
              variant="ghost"
              size="sm"
              color={recording ? 'red.400' : 'abyss.400'}
              onClick={recording ? stopRecording : startRecording}
              aria-label="录制语音"
              isDisabled={sending || !!previewFile}
            />
            <Box position="relative">
              <Button
                size="sm"
                variant="ghost"
                color={burnMode ? 'orange.400' : 'abyss.400'}
                onClick={() => setBurnMode(!burnMode)}
                isDisabled={!!previewFile || flashMode}
              >
                🔥{burnMode ? `${burnSeconds}s` : ''}
              </Button>
              {burnMode && (
                <Box
                  position="absolute"
                  bottom="100%"
                  left="50%"
                  transform="translateX(-50%)"
                  mb={2}
                  bg="abyss.800"
                  p={2}
                  borderRadius="md"
                  border="1px solid rgba(255,255,255,0.1)"
                  whiteSpace="nowrap"
                >
                  <HStack spacing={1}>
                    {[3, 5, 10, 15].map(s => (
                      <Button
                        key={s}
                        size="xs"
                        variant={burnSeconds === s ? 'solid' : 'ghost'}
                        colorScheme="orange"
                        onClick={() => setBurnSeconds(s)}
                      >
                        {s}s
                      </Button>
                    ))}
                  </HStack>
                </Box>
              )}
            </Box>
            <IconButton
              icon={<Text>⚡{flashMode ? '闪图' : ''}</Text>}
              variant="ghost"
              color={flashMode ? 'yellow.400' : 'abyss.400'}
              aria-label="闪图模式"
              isDisabled={sending || !!previewFile || burnMode}
              title={flashMode ? '闪图：查阅后5秒自动销毁' : '闪图模式'}
              onClick={() => {
                const newMode = !flashMode;
                setFlashMode(newMode);
                setBurnMode(false);
                if (newMode) fileInputRef.current?.click();
              }}
              size="sm"
            />
            <EmojiPanel onSelect={handleEmojiSelect} isDisabled={sending || !!previewFile} variant="client" />
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && sendMessage()}
              placeholder="输入消息..."
              flex={1}
              minW="0"
              bg="rgba(255,255,255,0.05)"
              border="1px solid rgba(255,255,255,0.1)"
              color="white"
              _placeholder={{ color: 'abyss.500' }}
              _focus={{ borderColor: 'brand.500' }}
            />
            <Button colorScheme="brand" onClick={sendMessage} isLoading={sending} isDisabled={!input.trim()} size="sm">
              发送
            </Button>
          </HStack>
        </Box>
      </Box>
      <FlashImageViewer
        forceShow={forceShow}
        isOpen={flashViewer.isOpen}
        onClose={() => setFlashViewer(v => ({ ...v, isOpen: false }))}
        imageUrl={flashViewer.imageUrl}
        messageId={flashViewer.messageId}
        isFlashMode={flashViewer.isFlashMode || false}
        mediaType={flashViewer.mediaType || 'image'}
      />
    </Flex>
  );
}

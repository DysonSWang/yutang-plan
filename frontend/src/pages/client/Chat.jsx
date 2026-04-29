import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, VStack, HStack, Input, Button, Text, Flex, IconButton, Image, Badge, useToast, Center, Spinner } from '@chakra-ui/react';
import { chat, upload } from '../../utils/api';
import { useSocket } from '../../contexts/SocketContext';
import FlashImageViewer from '../../components/FlashImageViewer';

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
  const messagesEndRef = useRef();
  const fileInputRef = useRef();
  const mediaRecorderRef = useRef();
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef();
  const burnTimersRef = useRef({});
  const [countdowns, setCountdowns] = useState({});
  const [flashViewer, setFlashViewer] = useState({ isOpen: false, imageUrl: '', messageId: null, senderRole: '' });
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

  const getMediaUrl = (msg) => {
    if (msg.mediaUrl?.startsWith('/encrypted/')) {
      return `${API_BASE}/api/chat/media/${msg.id}`;
    }
    return `${API_BASE}${msg.mediaUrl}`;
  };

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
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: '[消息已销毁]', mediaUrl: null, burnedAt: new Date() } : m));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const startBurnTimer = useCallback((msg) => {
    if (!msg.burnAfterSeconds || msg.burnedAt || msg.senderRole === 'client') return;
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
          if (msg.isBurnAfterRead && !msg.burnedAt && msg.burnAfterSeconds && msg.senderRole !== 'client') {
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
    on('message:new', handler);

    const burnHandler = ({ sessionId, messageId }) => {
      if (session && sessionId === session.id) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: '[消息已销毁]', mediaUrl: null, burnedAt: new Date() } : m));
        if (flashViewer.messageId === messageId) {
          setFlashViewer(v => ({ ...v, isOpen: false }));
        }
      }
    };
    on('message:burned', burnHandler);

    const recallHandler = ({ sessionId, messageId }) => {
      if (session && sessionId === session.id) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: '[消息已撤回]', mediaUrl: null, recalledAt: new Date() } : m));
      }
    };
    on('message:recalled', recallHandler);
  }, [session, flashViewer.messageId, on, startBurnTimer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const preview = URL.createObjectURL(file);
    setPreviewFile({ file, preview, type: isVideo ? 'video' : 'image' });
    e.target.value = '';
  };

  const confirmSendMedia = async () => {
    if (!previewFile) return;
    setUploading(true);
    try {
      const isBurn = burnMode;
      const isFlash = flashMode;
      const res = previewFile.type === 'video'
        ? await upload.video(previewFile.file, isBurn, isFlash)
        : await upload.image(previewFile.file, isBurn, isFlash);
      if (res.url) {
        await sendMediaMessage(res.url, previewFile.type, null, isBurn, isFlash);
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
      const res = await chat.send(sessionId, content);
      if (res.success) {
        setMessages(prev => [...prev, res.message]);
        setInput('');
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
    if (msg.type === 'image') {
      const isClickable = msg.isBurnAfterRead && msg.senderRole !== 'client' && !msg.burnedAt;
      return (
        <Box
          maxW="250px"
          cursor={isClickable || msg.isFlashImage ? 'pointer' : 'default'}
          opacity={msg.isBurnAfterRead ? 0.85 : 1}
          position="relative"
          onClick={() => {
            if (msg.isFlashImage && !msg.burnedAt) {
              setFlashViewer({ isOpen: true, imageUrl: getMediaUrl(msg), messageId: msg.id, senderRole: msg.senderRole });
            } else if (msg.isBurnAfterRead && msg.senderRole !== 'client') {
              handleBurnMessage(msg);
            } else {
              window.open(getMediaUrl(msg), '_blank');
            }
          }}
        >
          <Image src={getMediaUrl(msg)} alt="图片消息" borderRadius="md" maxH="200px" objectFit="cover" />
          {msg.isFlashImage && !msg.burnedAt && (
            <Text position="absolute" top={1} right={1} fontSize="xs" color="yellow.300" bg="blackAlpha.600" px={1} borderRadius="sm">⚡</Text>
          )}
        </Box>
      );
    }
    if (msg.type === 'video') {
      return (
        <Box maxW="250px" cursor={msg.isBurnAfterRead ? 'pointer' : 'default'} onClick={() => msg.isBurnAfterRead && msg.senderRole !== 'client' && handleBurnMessage(msg)}>
          <video src={getMediaUrl(msg)} controls={!msg.isBurnAfterRead} style={{ borderRadius: '8px', maxHeight: '200px', width: '100%' }} />
        </Box>
      );
    }
    if (msg.type === 'audio') {
      return (
        <HStack bg="blackAlpha.300" px={3} py={2} borderRadius="md" spacing={2} cursor={msg.isBurnAfterRead && msg.senderRole !== 'client' ? 'pointer' : 'default'} onClick={() => msg.isBurnAfterRead && msg.senderRole !== 'client' && handleBurnMessage(msg)}>
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
        <Box flex={1} p={4} overflowY="auto">
          {messages.length === 0 ? (
            <Center h="100%">
              <VStack spacing={3}>
                <Text fontSize="4xl">💬</Text>
                <Text color="abyss.400">开始和Mo哥聊聊吧</Text>
              </VStack>
            </Center>
          ) : (
            <VStack spacing={4} align="stretch">
              {messages.map(msg => (
                <Flex key={msg.id} justify={msg.senderRole === 'client' ? 'flex-end' : 'flex-start'}>
                  <Box
                    maxW="70%"
                    p={3}
                    borderRadius="lg"
                    bg={msg.senderRole === 'client' ? 'brand.500' : 'rgba(255,255,255,0.08)'}
                    color="white"
                    position="relative"
                    role="group"
                    _hover={{ '.recall-btn': { opacity: 1 } }}
                  >
                    {renderMessageContent(msg)}
                    {msg.isBurnAfterRead && !msg.burnedAt && (
                      <Text fontSize="xs" display="inline" ml={1} color="orange.300">
                        🔥{countdowns[msg.id] != null ? `${countdowns[msg.id]}s` : (msg.burnAfterSeconds ? `${msg.burnAfterSeconds}s` : '手动')}
                      </Text>
                    )}
                    <Text fontSize="xs" color="gray.300" mt={1}>
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </Text>
                    {!msg.recalledAt && !msg.burnedAt && msg.senderRole === 'client' && (
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
                </Flex>
              ))}
              <div ref={messagesEndRef} />
            </VStack>
          )}
        </Box>

        {/* 输入区域 */}
        <Box p={4} borderTop="1px solid rgba(255,255,255,0.06)">
          {/* 媒体预览 */}
          {previewFile && (
            <Box mb={2} p={2} bg="rgba(255,255,255,0.05)" borderRadius="md">
              <HStack>
                {previewFile.type === 'image' && (
                  <Image src={previewFile.preview} alt="预览" maxH="80px" borderRadius="md" />
                )}
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
                  onClick={previewFile.type === 'audio' ? confirmSendAudio : confirmSendMedia}
                >
                  {!(uploading && previewFile.type === 'video') ? '发送' : ''}
                </Button>
              </HStack>
            </Box>
          )}

          <HStack spacing={2}>
            <IconButton
              icon={<Text>📷</Text>}
              variant="ghost"
              color="abyss.400"
              onClick={() => fileInputRef.current?.click()}
              aria-label="发送图片/视频"
              isDisabled={sending || !!previewFile}
            />
            <input
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              ref={fileInputRef}
              onChange={handleFileSelect}
            />
            <IconButton
              icon={<Text>{recording ? '⏹' : '🎤'}</Text>}
              variant="ghost"
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
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && sendMessage()}
              placeholder="输入消息..."
              bg="rgba(255,255,255,0.05)"
              border="1px solid rgba(255,255,255,0.1)"
              color="white"
              _placeholder={{ color: 'abyss.500' }}
              _focus={{ borderColor: 'brand.500' }}
            />
            <Button colorScheme="brand" onClick={sendMessage} isLoading={sending} isDisabled={!input.trim()}>
              发送
            </Button>
          </HStack>
        </Box>
      </Box>
      <FlashImageViewer
        isOpen={flashViewer.isOpen}
        onClose={() => setFlashViewer(v => ({ ...v, isOpen: false }))}
        imageUrl={flashViewer.imageUrl}
        messageId={flashViewer.messageId}
        senderRole={flashViewer.senderRole}
      />
    </Flex>
  );
}

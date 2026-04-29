import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, VStack, HStack, Input, Button, Text, Flex, IconButton, Image } from '@chakra-ui/react';
import { chat, upload } from '../../utils/api';
import { useSocket } from '../../contexts/SocketContext';
import FlashImageViewer from '../../components/FlashImageViewer';

export default function ClientChat() {
  const { on } = useSocket();
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const messagesEndRef = useRef();
  const fileInputRef = useRef();
  const mediaRecorderRef = useRef();
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef();
  const burnTimersRef = useRef({}); // msgId -> { timer, remaining }
  const [countdowns, setCountdowns] = useState({}); // msgId -> remaining seconds
  const [flashViewer, setFlashViewer] = useState({ isOpen: false, imageUrl: '', messageId: null, senderRole: '' });
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';
  // 加密内容(/encrypted/)走解密接口，普通内容直接访问
  const getMediaUrl = (msg) => {
    if (msg.mediaUrl?.startsWith('/encrypted/')) {
      return `${API_BASE}/api/chat/media/${msg.id}`;
    }
    return `${API_BASE}${msg.mediaUrl}`;
  };

  const loadSessions = async () => {
    try {
      const res = await chat.mySessions();
      if (res.success && res.sessions.length > 0) {
        setCurrentSession(res.sessions[0]);
        setSessions(res.sessions);
      }
    } catch (e) {
      console.error(e);
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

  // 启动阅后即焚倒计时
  const startBurnTimer = useCallback((msg) => {
    if (!msg.burnAfterSeconds || msg.burnedAt || msg.senderRole === 'client') return;
    if (burnTimersRef.current[msg.id]) return; // 已有计时器，不重复

    // 计算已过时间，剩余秒数
    const elapsed = (Date.now() - new Date(msg.createdAt).getTime()) / 1000;
    let remaining = Math.ceil(msg.burnAfterSeconds - elapsed);

    if (remaining <= 0) {
      // 已超时，立即销毁
      handleBurnMessage(msg);
      return;
    }

    // 更新倒计时显示
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
        // 启动未销毁的阅后即焚消息倒计时
        res.messages.forEach(msg => {
          if (msg.isBurnAfterRead && !msg.burnedAt && msg.burnAfterSeconds && msg.senderRole !== 'client') {
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
  }, []);

  useEffect(() => {
    if (!currentSession) return;
    loadMessages(currentSession.id);
  }, [currentSession, loadMessages]);

  useEffect(() => {
    const handler = (message) => {
      if (message.senderRole === 'client') return;
      if (currentSession && message.sessionId === currentSession.id) {
        setMessages(prev => [...prev, message]);
        // 新的阅后即焚消息立即启动倒计时
        if (message.isBurnAfterRead && message.burnAfterSeconds && !message.burnedAt) {
          startBurnTimer(message);
        }
      }
    };
    on('message:new', handler);

    const burnHandler = ({ sessionId, messageId }) => {
      if (currentSession && sessionId === currentSession.id) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: '[消息已销毁]', mediaUrl: null, burnedAt: new Date() } : m));
        // 如果正在查看该闪图，关闭查看器
        if (flashViewer.messageId === messageId) {
          setFlashViewer(v => ({ ...v, isOpen: false }));
        }
      }
    };
    on('message:burned', burnHandler);

    const recallHandler = ({ sessionId, messageId }) => {
      if (currentSession && sessionId === currentSession.id) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: '[消息已撤回]', mediaUrl: null, recalledAt: new Date() } : m));
      }
    };
    on('message:recalled', recallHandler);
  }, [currentSession, flashViewer.messageId, on, startBurnTimer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const timers = burnTimersRef.current;
    return () => {
      // 组件卸载时清除所有倒计时
      Object.values(timers).forEach(t => clearTimeout(t));
    };
  }, []);

  const sendMediaMessage = async (url, type, duration, isBurnAfterRead = false, isFlashImage = false) => {
    if (!currentSession || sending) return;
    setSending(true);
    try {
      const res = await chat.send(currentSession.id, null, type, url, duration, isBurnAfterRead, null, isFlashImage);
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
      const res = previewFile.type === 'video'
        ? await upload.video(previewFile.file)
        : await upload.image(previewFile.file);
      if (res.url) {
        await sendMediaMessage(res.url, previewFile.type, null, false, false);
      } else {
        console.error('上传失败', res);
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
      const res = await chat.send(currentSession.id, input);
      if (res.success) {
        setMessages(prev => [...prev, res.message]);
        setInput('');
      }
    } catch (e) {
      console.error(e);
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
    if (msg.recalledAt) {
      return <Text color="gray.500" fontStyle="italic">{msg.content}</Text>;
    }
    if (msg.burnedAt) {
      return <Text color="gray.500" fontStyle="italic">{msg.content}</Text>;
    }
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
          <Image
            src={getMediaUrl(msg)}
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
        <Box maxW="250px" cursor={msg.isBurnAfterRead ? 'pointer' : 'default'} onClick={() => msg.isBurnAfterRead && msg.senderRole !== 'client' && handleBurnMessage(msg)}>
          <video
            src={getMediaUrl(msg)}
            controls={!msg.isBurnAfterRead}
            style={{ borderRadius: '8px', maxHeight: '200px', width: '100%' }}
          />
        </Box>
      );
    }
    if (msg.type === 'audio') {
      return (
        <HStack bg="blackAlpha.300" px={3} py={2} borderRadius="md" spacing={2} cursor={msg.isBurnAfterRead && msg.senderRole !== 'client' ? 'pointer' : 'default'} onClick={() => msg.isBurnAfterRead && msg.senderRole !== 'client' && handleBurnMessage(msg)}>
          <Text fontSize="lg">🔊</Text>
          <audio src={getMediaUrl(msg)} style={{ height: '28px' }} controls={!msg.isBurnAfterRead || msg.burnedAt} />
          {msg.duration && (
            <Text fontSize="xs" color="gray.300">{msg.duration}"</Text>
          )}
        </HStack>
      );
    }
    return <Text>{msg.content}</Text>;
  };

  return (
    <Flex h="calc(100vh - 100px)" gap={4}>
      {/* 会话列表 */}
      <Box w="250px" bg="gray.800" borderRadius="md" p={4}>
        <Text color="gray.400" fontSize="sm" mb={4}>专属顾问</Text>
        <VStack spacing={2} align="stretch">
          {sessions.map(session => (
            <Box
              key={session.id}
              p={3}
              bg={currentSession?.id === session.id ? 'teal.600' : 'gray.700'}
              borderRadius="md"
              cursor="pointer"
              onClick={() => setCurrentSession(session)}
            >
              <Text color="white" fontSize="sm">{session.client?.nickname || '顾问'}</Text>
              <Text color="gray.400" fontSize="xs" noOfLines={1}>{session.lastMessage || '暂无消息'}</Text>
            </Box>
          ))}
          {sessions.length === 0 && (
            <Text color="gray.500" fontSize="sm">暂无会话</Text>
          )}
        </VStack>
      </Box>

      {/* 聊天区域 */}
      <Box flex={1} bg="gray.800" borderRadius="md" display="flex" flexDirection="column">
        {/* 聊天头部 */}
        <Box p={4} borderBottom="1px" borderColor="gray.700">
          <Text color="white" fontWeight="bold">
            {currentSession?.client?.nickname || '专属顾问'}
          </Text>
          <Text color="gray.500" fontSize="xs">人工专属服务</Text>
        </Box>

        {/* 消息列表 */}
        <Box flex={1} p={4} overflowY="auto">
          <VStack spacing={4} align="stretch">
            {messages.map(msg => (
              <Flex key={msg.id} justify={msg.senderRole === 'client' ? 'flex-end' : 'flex-start'}>
                <Box
                  maxW="70%"
                  p={3}
                  borderRadius="lg"
                  bg={msg.senderRole === 'client' ? 'teal.600' : 'gray.700'}
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
                      title="撤回"
                      minW="20px"
                      h="20px"
                    />
                  )}
                </Box>
              </Flex>
            ))}
            <div ref={messagesEndRef} />
          </VStack>
        </Box>

        {/* 输入区域 */}
        <Box p={4} borderTop="1px" borderColor="gray.700">
          {/* 媒体预览 */}
          {previewFile && (
            <Box mb={2} p={2} bg="gray.700" borderRadius="md">
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
                  colorScheme="teal"
                  isLoading={uploading}
                  loadingText={uploading && previewFile.type === 'video' ? '压缩中...' : '发送中'}
                  onClick={previewFile.type === 'audio' ? confirmSendAudio : confirmSendMedia}
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
              style={{ display: 'none' }}
              ref={fileInputRef}
              onChange={handleFileSelect}
            />
            <IconButton
              icon={<Text>{recording ? '⏹' : '🎤'}</Text>}
              variant="ghost"
              color={recording ? 'red.400' : 'gray.400'}
              onClick={recording ? stopRecording : startRecording}
              aria-label="录制语音"
              isDisabled={sending || !!previewFile}
            />
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && sendMessage()}
              placeholder="输入消息..."
              bg="gray.700"
              border="none"
              color="white"
              _placeholder={{ color: 'gray.400' }}
            />
            <Button colorScheme="teal" onClick={sendMessage} isLoading={sending}>发送</Button>
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

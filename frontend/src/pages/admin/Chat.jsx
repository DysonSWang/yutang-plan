import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Flex, VStack, HStack, Input, Button, Text, Heading, IconButton, Image, Spinner, useDisclosure, Menu, MenuButton, MenuList, MenuItem, Badge } from '@chakra-ui/react';
import { chat, upload } from '../../utils/api';
import { useSocket } from '../../contexts/SocketContext';
import ProfileSuggestModal from './ProfileSuggestModal';
import FlashImageViewer from '../../components/FlashImageViewer';

export default function AdminChat() {
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
  const [burnMode, setBurnMode] = useState(false);
  const [burnSeconds, setBurnSeconds] = useState(5);
  const [flashMode, setFlashMode] = useState(false); // 闪图模式
  const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();
  const [flashViewer, setFlashViewer] = useState({ isOpen: false, imageUrl: '', messageId: null, senderRole: '' });
  const messagesEndRef = useRef();
  const fileInputRef = useRef();
  const mediaRecorderRef = useRef();
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

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

  const loadMessages = useCallback(async (sessionId) => {
    try {
      const res = await chat.messages(sessionId);
      if (res.success) {
        setMessages(res.messages);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!currentSession) return;
    loadMessages(currentSession.id);
  }, [currentSession, loadMessages]);

  useEffect(() => {
    const handler = (message) => {
      if (message.senderRole === 'operator') return;
      if (currentSession && message.sessionId === currentSession.id) {
        setMessages(prev => [...prev, message]);
      }
      setSessions(prev => prev.map(s => {
        if (s.id === message.sessionId) {
          return { ...s, lastMessage: message.content || '[媒体消息]', lastMessageAt: new Date() };
        }
        return s;
      }));
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
  }, [currentSession, on]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        await sendMediaMessage(res.url, previewFile.type, null);
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
      const res = await chat.send(currentSession.id, input, 'text', null, null, burnMode, burnSeconds);
      if (res.success) {
        setMessages(prev => [...prev, res.message]);
        setInput('');
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

  const handleBurnMessage = async (msg) => {
    if (msg.burnedAt || msg.senderRole === 'operator') return;
    try {
      const res = await chat.burn(msg.id);
      if (res.success) {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: '[消息已销毁]', mediaUrl: null, burnedAt: new Date() } : m));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRecallMessage = async (msg) => {
    if (msg.recalledAt || msg.senderRole !== 'operator') return;
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
      const isClickable = msg.isBurnAfterRead && msg.senderRole !== 'operator' && !msg.burnedAt;
      return (
        <Box
          maxW="250px"
          cursor={isClickable || msg.isFlashImage ? 'pointer' : 'default'}
          opacity={msg.isBurnAfterRead ? 0.85 : 1}
          position="relative"
          onClick={() => {
            if (msg.isFlashImage && !msg.burnedAt) {
              // 闪图：打开满屏查看器
              setFlashViewer({ isOpen: true, imageUrl: msg.mediaUrl, messageId: msg.id, senderRole: msg.senderRole });
            } else if (msg.isBurnAfterRead && msg.senderRole !== 'operator') {
              handleBurnMessage(msg);
            } else {
              window.open(`${API_BASE}${msg.mediaUrl}`, '_blank');
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
        <Box maxW="250px" cursor={msg.isBurnAfterRead ? 'pointer' : 'default'} onClick={() => msg.isBurnAfterRead && msg.senderRole !== 'operator' && handleBurnMessage(msg)}>
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
        <HStack bg="blackAlpha.300" px={3} py={2} borderRadius="md" spacing={2} cursor={msg.isBurnAfterRead && msg.senderRole !== 'operator' ? 'pointer' : 'default'} onClick={() => msg.isBurnAfterRead && msg.senderRole !== 'operator' && handleBurnMessage(msg)}>
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
      <Heading color="white" mb={6}>聊天中心</Heading>

      <Flex h="calc(100vh - 150px)" gap={4}>
        {/* 客户列表 */}
        <Box w="280px" bg="gray.800" borderRadius="md" p={4}>
          <Text color="gray.400" fontSize="sm" mb={4}>客户会话</Text>
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
        <Box flex={1} bg="gray.800" borderRadius="md" display="flex" flexDirection="column">
          {currentSession ? (
            <>
              <Box p={4} borderBottom="1px" borderColor="gray.700">
                <HStack justify="space-between">
                  <Box>
                    <Text color="white" fontWeight="bold">
                      {currentSession.client?.nickname || '客户'}
                    </Text>
                    <Text color="gray.500" fontSize="xs">
                      服务阶段: {currentSession.client?.serviceStage || '-'}
                    </Text>
                  </Box>
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
              </Box>

              <Box flex={1} p={4} overflowY="auto">
                <VStack spacing={4} align="stretch">
                  {messages.map(msg => (
                    <Flex key={msg.id} justify={msg.senderRole === 'operator' ? 'flex-end' : 'flex-start'} _group={{}}>
                      <Box
                        maxW="70%"
                        p={3}
                        borderRadius="lg"
                        bg={msg.senderRole === 'operator' ? 'teal.600' : 'gray.700'}
                        color="white"
                        position="relative"
                        role="group"
                        _hover={{ '.recall-btn': { opacity: 1 } }}
                      >
                        {renderMessageContent(msg)}
                        {msg.isBurnAfterRead && !msg.burnedAt && (
                          <Text fontSize="xs" display="inline" ml={1} color="orange.300">
                            🔥{msg.burnAfterSeconds ? `${msg.burnAfterSeconds}s` : '手动'}
                          </Text>
                        )}
                      <Text fontSize="xs" color="gray.300" mt={1}>
                          {new Date(msg.createdAt).toLocaleTimeString()}
                        </Text>
                        {!msg.recalledAt && !msg.burnedAt && msg.senderRole === 'operator' && (
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
      />
    </Box>
  );
}

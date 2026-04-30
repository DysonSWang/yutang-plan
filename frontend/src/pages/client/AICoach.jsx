import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, VStack, HStack, Input, Button, Text, Card, CardBody, CardHeader,
  Heading, Select, Textarea, Spinner, Flex, Badge, Icon, Tooltip, useToast,
  Avatar, Wrap, WrapItem, useDisclosure, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalFooter, Tabs, TabList, TabPanels, Tab, TabPanel
} from '@chakra-ui/react';
import { useAuth } from '../../contexts/AuthContext';
import { girls as girlsApi } from '../../utils/api';
import { FireIcon, SnowIcon, SparklesIcon, BrainIcon } from '../../components/Icons';

const STAGE_COLORS = {
  '陌生': 'gray',
  '搭讪': 'blue',
  '聊天': 'cyan',
  '暧昧': 'orange',
  '约会': 'green',
  '长期': 'teal'
};

function getHeatLevel(score) {
  if (score >= 7) return 'hot';
  if (score >= 5) return 'warm';
  return 'cold';
}

// 消息气泡组件
function MessageBubble({ message, onCopy, onRegenerate, onHelpful, isStreaming, copiedId, helpfulId }) {
  const isUser = message.role === 'user';

  return (
    <Flex justify={isUser ? 'flex-end' : 'flex-start'} mb={4}>
      {!isUser && (
        <Avatar
          size="sm"
          name="AI教练"
          bg="teal.500"
          color="white"
          mr={2}
          icon={<Icon as={SparklesIcon} />}
        />
      )}
      <Box
        maxW="75%"
        bg={isUser ? 'teal.600' : 'gray.700'}
        color={isUser ? 'white' : 'gray.100'}
        px={4}
        py={3}
        borderRadius="2xl"
        borderBottomRightRadius={isUser ? 'sm' : '2xl'}
        borderBottomLeftRadius={isUser ? '2xl' : 'sm'}
        position="relative"
      >
        {isUser ? (
          <Text whiteSpace="pre-wrap">{message.content}</Text>
        ) : (
          <Text whiteSpace="pre-wrap" sx={{
            '& h1, & h2, & h3': { color: 'white', mt: 3, mb: 1 },
            '& p': { mb: 2 },
            '& ul, & ol': { pl: 4, mb: 2 },
            '& li': { mb: 1 }
          }}>
            {message.content}
          </Text>
        )}

        {/* 助手消息底部操作栏 */}
        {!isUser && !isStreaming && (
          <Flex mt={2} pt={2} borderTop="1px solid" borderColor="whiteAlpha.200" gap={3}>
            <Tooltip label="复制" placement="top">
              <Button
                size="xs"
                variant="ghost"
                color="gray.400"
                onClick={() => onCopy(message.content, message.id)}
                _hover={{ color: 'teal.400' }}
              >
                {copiedId === message.id ? '已复制' : '复制'}
              </Button>
            </Tooltip>
            <Tooltip label="重新生成" placement="top">
              <Button
                size="xs"
                variant="ghost"
                color="gray.400"
                onClick={() => onRegenerate(message.content)}
                _hover={{ color: 'teal.400' }}
              >
                重新生成
              </Button>
            </Tooltip>
            <Tooltip label="有帮助" placement="top">
              <Button
                size="xs"
                variant="ghost"
                color="gray.400"
                onClick={() => onHelpful(message.id, true)}
                _hover={{ color: 'green.400' }}
              >
                👍
              </Button>
            </Tooltip>
            <Tooltip label="没帮助" placement="top">
              <Button
                size="xs"
                variant="ghost"
                color="gray.400"
                onClick={() => onHelpful(message.id, false)}
                _hover={{ color: 'red.400' }}
              >
                👎
              </Button>
            </Tooltip>
            {helpfulId === message.id && (
              <Text fontSize="xs" color="gray.500" align="center">感谢反馈</Text>
            )}
          </Flex>
        )}

        {/* 思考中动画 */}
        {isStreaming && message.role === 'assistant' && !message.content && (
          <HStack spacing={1} mt={2}>
            <Spinner size="xs" color="teal.400" />
            <Text fontSize="xs" color="gray.400">AI思考中...</Text>
          </HStack>
        )}
      </Box>
      {isUser && (
        <Avatar
          size="sm"
          name="用户"
          bg="gray.500"
          color="white"
          ml={2}
        />
      )}
    </Flex>
  );
}

export default function AICoach() {
  const { user } = useAuth();
  const [girls, setGirls] = useState([]);
  const [selectedGirlId, setSelectedGirlId] = useState('');
  const [selectedGirl, setSelectedGirl] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [deepMode, setDeepMode] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [helpfulId, setHelpfulId] = useState(null);
  const [error, setError] = useState('');
  // 回复建议状态
  const [replyInput, setReplyInput] = useState('');
  const [replySuggestions, setReplySuggestions] = useState(null);
  const [replyLoading, setReplyLoading] = useState(false);
  // 话术优化状态
  const [optimizeInput, setOptimizeInput] = useState('');
  const [optimizeGoal, setOptimizeGoal] = useState('');
  const [optimizedReplies, setOptimizedReplies] = useState(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const streamingContentRef = useRef('');
  const isStreamingRef = useRef(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const toast = useToast();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';

  useEffect(() => {
    loadGirls();
    loadHistory();
  }, []);

  useEffect(() => {
    if (selectedGirlId) {
      const girl = girls.find(g => g.id === selectedGirlId);
      setSelectedGirl(girl || null);
    } else {
      setSelectedGirl(null);
    }
  }, [selectedGirlId, girls]);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 自动调整 textarea 高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [input]);

  const loadGirls = async () => {
    try {
      const res = await girlsApi.list();
      if (res.success) {
        setGirls(res.girls);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadHistory = async () => {
    const token = localStorage.getItem('zhuiai_token');
    setLoadingHistory(true);
    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/history?girlId=${selectedGirlId || ''}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sessions && data.sessions.length > 0) {
          // 获取最新会话的消息
          const latestSession = data.sessions[0];
          if (latestSession.messages && latestSession.messages.length > 0) {
            setMessages(latestSession.messages.map(m => ({
              id: m.id,
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
              createdAt: m.createdAt
            })));
          }
        }
      }
    } catch (e) {
      console.error('[AICoach] load history failed:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCopy = async (content, messageId) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegenerate = async (content) => {
    // 找到最后一条用户消息，重新发送
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      // 移除最后一条助手消息
      setMessages(prev => prev.slice(0, -1));
      // 重新发送
      await handleSubmitInternal(lastUserMsg.content);
    }
  };

  const handleHelpful = async (messageId, isHelpful) => {
    setHelpfulId(messageId);
    try {
      const token = localStorage.getItem('zhuiai_token');
      await fetch(`${apiUrl}/api/ai-coach/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: isHelpful ? 'helpful' : 'not_helpful',
          routedType: 'situation'
        })
      });
      toast({
        title: '感谢反馈',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (e) {
      console.error('[Feedback] 提交失败:', e);
    }
  };

  const handleNewConversation = async () => {
    try {
      const token = localStorage.getItem('zhuiai_token');
      await fetch(`${apiUrl}/api/ai-coach/new-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ girlId: selectedGirlId || undefined })
      });
      setMessages([]);
      toast({
        title: '已开启新对话',
        status: 'info',
        duration: 2000,
        isClosable: true,
      });
    } catch (e) {
      console.error('[AICoach] new-session failed:', e);
    }
  };

  const handleSubmitInternal = async (questionText) => {
    if (!questionText.trim() || loading) return;

    const token = localStorage.getItem('zhuiai_token');
    const userMessage = questionText.trim();

    // 添加用户消息
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: tempId,
        role: 'user',
        content: userMessage,
        createdAt: new Date().toISOString()
      }
    ]);

    setLoading(true);
    setError('');
    streamingContentRef.current = '';
    isStreamingRef.current = true;

    // 添加一条空的助手消息
    const assistantId = `asst-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString()
      }
    ]);

    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/situation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          situation: userMessage,
          stream: !deepMode,
          girlId: selectedGirlId || undefined
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // 深度模式（非流式）
      if (deepMode) {
        const data = await res.json();
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: data.content || data.analysis || '' } : m)
        );
      } else {
        // 流式模式
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastUpdate = 0;

        const flushUpdate = (content) => {
          const now = Date.now();
          if (now - lastUpdate >= 60 || !isStreamingRef.current) {
            lastUpdate = now;
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content } : m)
            );
            if (isStreamingRef.current) setTimeout(scrollToBottom, 10);
          } else {
            streamingContentRef.current = content;
          }
        };

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
                  streamingContentRef.current += parsed.content;
                  flushUpdate(streamingContentRef.current);
                }
              } catch { /* ignore parse errors */ }
            }
          }
        }

        // 处理尾部残留
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer.trim());
            if (parsed.content) {
              streamingContentRef.current += parsed.content;
            }
          } catch { /* ignore */ }
        }

        isStreamingRef.current = false;
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: streamingContentRef.current } : m)
        );
      }
    } catch (e) {
      console.error(e);
      setError(e.message || '网络错误，请重试');
      // 移除失败的消息
      setMessages(prev => prev.filter(m => m.id !== tempId && m.id !== assistantId));
    } finally {
      setLoading(false);
      isStreamingRef.current = false;
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    await handleSubmitInternal(input);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 获取回复建议
  const handleGetReplySuggestions = async () => {
    if (!replyInput.trim()) return;
    setReplyLoading(true);
    setReplySuggestions(null);

    const token = localStorage.getItem('zhuiai_token');
    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/reply-suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          girlId: selectedGirlId || undefined,
          lastMessage: replyInput
        })
      });
      const data = await res.json();
      if (data.success) {
        setReplySuggestions(data.suggestions);
      } else {
        toast({ title: data.error || '获取失败', status: 'error', duration: 3000 });
      }
    } catch (e) {
      toast({ title: '网络错误', status: 'error', duration: 3000 });
    } finally {
      setReplyLoading(false);
    }
  };

  // 话术优化
  const handleOptimizeReply = async () => {
    if (!optimizeInput.trim()) return;
    setOptimizeLoading(true);
    setOptimizedReplies(null);

    const token = localStorage.getItem('zhuiai_token');
    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/optimize-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          originalReply: optimizeInput,
          girlId: selectedGirlId || undefined,
          goal: optimizeGoal || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setOptimizedReplies(data.optimizations);
      } else {
        toast({ title: data.error || '优化失败', status: 'error', duration: 3000 });
      }
    } catch (e) {
      toast({ title: '网络错误', status: 'error', duration: 3000 });
    } finally {
      setOptimizeLoading(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: '已复制', status: 'success', duration: 1500 });
    } catch (e) {
      toast({ title: '复制失败', status: 'error', duration: 1500 });
    }
  };

  const QUICK_QUESTIONS = [
    '怎么判断她对我有没有意思？',
    '聊天不知道怎么开场怎么办？',
    '约她出来玩她总是说忙怎么办？',
    '怎么避免成为舔狗？'
  ];

  if (loadingHistory) {
    return (
      <Box p={8} textAlign="center">
        <Spinner size="xl" color="teal.400" />
        <Text color="gray.400" mt={4}>加载聊天历史...</Text>
      </Box>
    );
  }

  // 通用Header组件：女生选择 + 模式切换
  const CoachHeader = () => (
    <Card bg="gray.800" mb={4}>
      <CardBody py={3}>
        <Flex gap={4} wrap="wrap" align="center" justify="space-between">
          <Flex gap={4} wrap="wrap" align="center" flex={1}>
            <Select
              value={selectedGirlId}
              onChange={e => setSelectedGirlId(e.target.value)}
              bg="gray.700"
              border="none"
              color="white"
              flex={1}
              minW="180px"
              placeholder="关联女生"
              size="sm"
            >
              {girls.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name} - {g.stage || '未知'}
                </option>
              ))}
            </Select>

            {/* 深度/快速模式切换 */}
            <Tooltip label={deepMode ? '深度分析：调用工具链，全面分析' : '快速分析：流式输出，快'}>
              <HStack
                bg={deepMode ? 'purple.900' : 'gray.700'}
                px={3}
                py={2}
                borderRadius="md"
                cursor="pointer"
                onClick={() => setDeepMode(!deepMode)}
                border={deepMode ? '1px solid' : 'none'}
                borderColor="purple.500"
                spacing={2}
              >
                <Icon
                  as={SparklesIcon}
                  color={deepMode ? 'purple.300' : 'gray.400'}
                  boxSize={4}
                />
                <Box>
                  <Text color={deepMode ? 'purple.300' : 'gray.300'} fontSize="xs" fontWeight="bold">
                    {deepMode ? '深度' : '快速'}
                  </Text>
                </Box>
              </HStack>
            </Tooltip>
          </Flex>

          {/* 选中女生信息 */}
          {selectedGirl && (
            <HStack
              bg="gray.700"
              px={3}
              py={1}
              borderRadius="md"
              spacing={3}
            >
              <HStack spacing={2}>
                <Text color="white" fontWeight="bold" fontSize="sm">{selectedGirl.name}</Text>
                <Badge colorScheme={STAGE_COLORS[selectedGirl.stage] || 'gray'} fontSize="xs">
                  {selectedGirl.stage || '未知'}
                </Badge>
              </HStack>
              <HStack spacing={1}>
                <Text color="gray.400" fontSize="xs">热度</Text>
                <Text color={selectedGirl.tensionScore >= 5 ? 'orange.400' : 'blue.400'} fontSize="xs" fontWeight="bold">
                  {selectedGirl.tensionScore?.toFixed(1) || '5.0'}
                </Text>
              </HStack>
              <Icon
                as={selectedGirl.tensionScore >= 5 ? FireIcon : SnowIcon}
                color={selectedGirl.tensionScore >= 5 ? 'orange.400' : 'blue.400'}
                boxSize={4}
              />
            </HStack>
          )}
        </Flex>
      </CardBody>
    </Card>
  );

  // Tab 1: AI教练（多轮对话）
  const AICoachPanel = () => (
    <>
      <CoachHeader />
      <Card bg="gray.800" mb={4} minH="400px">
        <CardBody>
          {messages.length === 0 ? (
            <VStack spacing={4} py={8}>
              <Text color="gray.400" textAlign="center">
                描述你的情况，AI 教练为你分析
              </Text>
              <Wrap spacing={2} justify="center">
                {QUICK_QUESTIONS.map((q, i) => (
                  <WrapItem key={i}>
                    <Button
                      size="sm"
                      variant="outline"
                      colorScheme="teal"
                      onClick={() => handleSubmitInternal(q)}
                      isDisabled={loading}
                    >
                      {q}
                    </Button>
                  </WrapItem>
                ))}
              </Wrap>
            </VStack>
          ) : (
            <VStack spacing={0} align="stretch">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onCopy={handleCopy}
                  onRegenerate={handleRegenerate}
                  onHelpful={handleHelpful}
                  isStreaming={loading && message.id === messages[messages.length - 1]?.id && !message.content}
                  copiedId={copiedId}
                  helpfulId={helpfulId}
                />
              ))}
              {loading && messages[messages.length - 1]?.role === 'user' && (
                <Flex justify="flex-start" mb={4}>
                  <HStack bg="gray.700" px={4} py={3} borderRadius="2xl" spacing={2}>
                    {[0, 150, 300].map((delay) => (
                      <Box
                        key={delay}
                        w="8px"
                        h="8px"
                        bg="teal.400"
                        borderRadius="full"
                        animation={`bounce 1.4s infinite ease-in-out ${delay}ms`}
                        sx={{
                          '@keyframes bounce': {
                            '0%, 80%, 100%': { transform: 'scale(0)' },
                            '40%': { transform: 'scale(1)' }
                          }
                        }}
                      />
                    ))}
                    <Text color="gray.400" fontSize="sm">思考中...</Text>
                  </HStack>
                </Flex>
              )}
              <div ref={messagesEndRef} style={{ height: 1 }} />
            </VStack>
          )}
          {error && (
            <Box mt={4} p={3} bg="red.900" borderRadius="md">
              <Text color="red.200">{error}</Text>
            </Box>
          )}
        </CardBody>
      </Card>
      <Card bg="gray.800">
        <CardBody>
          <Flex gap={2}>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={deepMode ? '描述当前情况，深度分析会调用工具...' : '描述你的情况...'}
              bg="gray.700"
              border="none"
              color="white"
              rows={1}
              _placeholder={{ color: 'gray.400' }}
              disabled={loading}
            />
            <Button
              type="button"
              colorScheme="teal"
              isLoading={loading}
              disabled={!input.trim()}
              onClick={handleSubmit}
              px={6}
            >
              发送
            </Button>
            <Button
              variant="ghost"
              colorScheme="gray"
              onClick={handleNewConversation}
              size="sm"
            >
              新对话
            </Button>
          </Flex>
        </CardBody>
      </Card>
    </>
  );

  // Tab 2: 回复建议
  const ReplySuggestionsPanel = () => (
    <>
      <CoachHeader />
      <Card bg="gray.800">
        <CardBody>
          <VStack spacing={4} align="stretch">
            <Box>
              <Text color="gray.300" fontSize="sm" mb={2}>女生最后一条消息</Text>
              <Textarea
                value={replyInput}
                onChange={e => setReplyInput(e.target.value)}
                placeholder="粘贴女生最近的消息..."
                bg="gray.700"
                border="none"
                color="white"
                rows={3}
                _placeholder={{ color: 'gray.400' }}
              />
            </Box>
            <Button
              colorScheme="teal"
              onClick={handleGetReplySuggestions}
              isLoading={replyLoading}
              isDisabled={!replyInput.trim()}
              leftIcon={<Icon as={BrainIcon} />}
            >
              获取回复建议
            </Button>

            {replySuggestions && (
              <VStack spacing={3} align="stretch" mt={2}>
                <Flex justify="space-between" align="center">
                  <Text color="gray.400" fontSize="sm">
                    生成 {replySuggestions.options?.length || 0} 个回复方案
                  </Text>
                  {replySuggestions.relationshipStageLabel && (
                    <Badge colorScheme="teal">{replySuggestions.relationshipStageLabel}</Badge>
                  )}
                </Flex>
                {(replySuggestions.options || []).map((opt, idx) => (
                  <Box key={idx} bg="gray.700" p={4} borderRadius="md">
                    <Flex justify="space-between" align="center" mb={2}>
                      <Badge colorScheme={
                        opt.type === '稳妥型' ? 'blue' :
                        opt.type === '进攻型' ? 'red' :
                        opt.type === '调侃型' ? 'orange' : 'gray'
                      }>
                        {opt.type}
                      </Badge>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="teal"
                        onClick={() => copyToClipboard(opt.reply)}
                      >
                        复制
                      </Button>
                    </Flex>
                    <Text color="white" mb={2}>{opt.reply}</Text>
                    <Text color="gray.500" fontSize="xs" mb={1}>{opt.intention}</Text>
                    {opt.riskNote && opt.riskNote !== '无' && (
                      <Text color="orange.400" fontSize="xs">⚠️ {opt.riskNote}</Text>
                    )}
                  </Box>
                ))}
              </VStack>
            )}
          </VStack>
        </CardBody>
      </Card>
    </>
  );

  // Tab 3: 话术优化
  const OptimizeReplyPanel = () => (
    <>
      <CoachHeader />
      <Card bg="gray.800">
        <CardBody>
          <VStack spacing={4} align="stretch">
            <Box>
              <Text color="gray.300" fontSize="sm" mb={2}>你想说的话</Text>
              <Textarea
                value={optimizeInput}
                onChange={e => setOptimizeInput(e.target.value)}
                placeholder="输入你想发送的原始消息..."
                bg="gray.700"
                border="none"
                color="white"
                rows={3}
                _placeholder={{ color: 'gray.400' }}
              />
            </Box>
            <Input
              value={optimizeGoal}
              onChange={e => setOptimizeGoal(e.target.value)}
              placeholder="优化方向（可选）：更幽默 / 更暧昧 / 更自然"
              bg="gray.700"
              border="none"
              color="white"
              _placeholder={{ color: 'gray.400' }}
            />
            <Button
              colorScheme="teal"
              onClick={handleOptimizeReply}
              isLoading={optimizeLoading}
              isDisabled={!optimizeInput.trim()}
              leftIcon={<Icon as={SparklesIcon} />}
            >
              优化话术
            </Button>

            {optimizedReplies && (
              <VStack spacing={3} align="stretch" mt={2}>
                <Text color="gray.400" fontSize="sm">
                  原始：<Text as="span" color="gray.300">{optimizeInput}</Text>
                </Text>
                {(optimizedReplies || []).map((opt, idx) => (
                  <Box key={idx} bg="gray.700" p={4} borderRadius="md">
                    <Flex justify="space-between" align="center" mb={2}>
                      <Badge colorScheme="teal">{opt.style}</Badge>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="teal"
                        onClick={() => copyToClipboard(opt.text)}
                      >
                        复制
                      </Button>
                    </Flex>
                    <Text color="white" mb={2}>{opt.text}</Text>
                    <Text color="gray.500" fontSize="xs" mb={1}>{opt.point}</Text>
                    {opt.riskLevel && opt.riskLevel !== '低' && (
                      <Badge colorScheme={opt.riskLevel === '高' ? 'red' : 'orange'}>
                        风险: {opt.riskLevel}
                      </Badge>
                    )}
                  </Box>
                ))}
              </VStack>
            )}
          </VStack>
        </CardBody>
      </Card>
    </>
  );

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4}>
        <Heading color="white" size="lg">AI教练</Heading>
      </Flex>

      <Tabs variant="soft-rounded" colorScheme="teal">
        <TabList bg="gray.800" borderRadius="lg" p={1}>
          <Tab color="gray.400" _selected={{ color: 'white', bg: 'teal.600' }} fontSize="sm">
            🤖 AI教练
          </Tab>
          <Tab color="gray.400" _selected={{ color: 'white', bg: 'teal.600' }} fontSize="sm">
            💡 回复建议
          </Tab>
          <Tab color="gray.400" _selected={{ color: 'white', bg: 'teal.600' }} fontSize="sm">
            ✨ 话术优化
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel px={0} pt={4}>
            <AICoachPanel />
          </TabPanel>
          <TabPanel px={0} pt={4}>
            <ReplySuggestionsPanel />
          </TabPanel>
          <TabPanel px={0} pt={4}>
            <OptimizeReplyPanel />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}

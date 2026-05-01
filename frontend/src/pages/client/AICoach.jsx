import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import {
  Box, VStack, HStack, Input, Button, Text, Card, CardBody, CardHeader,
  Heading, Select, Textarea, Spinner, Flex, Badge, Icon, Tooltip, useToast,
  Avatar, Wrap, WrapItem, useDisclosure, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalFooter, Tabs, TabList, TabPanels, Tab, TabPanel
} from '@chakra-ui/react';
import { useAuth } from '../../contexts/AuthContext';
import { girls as girlsApi } from '../../utils/api';
import { FireIcon, SnowIcon, SparklesIcon, BrainIcon } from '../../components/Icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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


// 独立的输入区域组件 - 使用完全独立的本地状态
const InputArea = memo(({ onSubmit, loading, deepMode, onNewConversation }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        // 先保存输入值，再提交，避免状态更新导致 textarea 闪烁
        const textToSubmit = input;
        setInput(''); // 立即清空状态，textarea 会自然重置高度
        onSubmit(textToSubmit);
      }
    }
  }, [input, onSubmit]);

  const handleChange = useCallback((e) => {
    setInput(e.target.value);
    // 动态调整高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, []);

  const handleSubmitClick = useCallback(() => {
    if (input.trim()) {
      const textToSubmit = input;
      setInput(''); // 立即清空状态，textarea 会自然重置高度
      onSubmit(textToSubmit);
    }
  }, [input, onSubmit]);

  return (
    <Box bg="gray.800" borderRadius="md" p={3} flexShrink={0}>
      <Flex gap={2} align="center">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={deepMode ? '描述当前情况，深度分析会调用工具...' : '描述你的情况...'}
          disabled={loading}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          style={{
            backgroundColor: '#2d3748',
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            width: '100%',
            height: '40px',
            minHeight: '40px',
            maxHeight: '120px',
            padding: '8px 12px',
            resize: 'none',
            overflowY: 'hidden',
            outline: 'none',
            fontSize: '14px',
            fontFamily: 'inherit',
            lineHeight: '1.4',
            boxSizing: 'border-box'
          }}
        />
        <Button
          type="button"
          colorScheme="teal"
          isLoading={loading}
          disabled={!input.trim()}
          onClick={handleSubmitClick}
          px={4}
        >
          发送
        </Button>
        <Button
          variant="ghost"
          colorScheme="gray"
          size="sm"
          onClick={onNewConversation}
        >
          新对话
        </Button>
      </Flex>
    </Box>
  );
});

// ====== 会话选择栏（模块级组件） ======
const SessionBar = memo(({
  sessions, activeSessionId, selectedGirlId, loading,
  onSelectSession, onNewSession
}) => {
  const displaySessions = useMemo(() => {
    if (!selectedGirlId) return (sessions || []).filter(s => !s.girlId);
    return (sessions || []).filter(s => s.girlId === selectedGirlId);
  }, [sessions, selectedGirlId]);

  const activeSession = useMemo(() =>
    displaySessions.find(s => s.id === activeSessionId),
    [displaySessions, activeSessionId]
  );

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <Flex align="center" gap={2} mb={1} flexShrink={0} bg="gray.800" px={3} py={1.5} borderRadius="md" border="1px solid" borderColor="whiteAlpha.100">
      <Text color="gray.500" fontSize="xs" flexShrink={0}>会话</Text>
      <Select
        value={activeSessionId || ''}
        onChange={e => {
          const val = e.target.value;
          if (val === '') {
            // 切换到"新会话"状态（无活跃会话），仅在当前有选中会话时才执行
            if (activeSessionId) onNewSession();
          } else {
            onSelectSession(val);
          }
        }}
        bg="gray.700" border="none" color="white" size="xs"
        flex={1} maxW="240px"
        borderRadius="md"
        isDisabled={loading}
      >
        <option value="">🆕 新会话</option>
        {displaySessions.map(s => (
          <option key={s.id} value={s.id}>{formatTime(s.createdAt)} · {(s.messages || []).length}条 · {s.active !== false ? '活跃' : '已归档'}</option>
        ))}
      </Select>
      {activeSession && (
        <Badge colorScheme="teal" variant="subtle" fontSize="xs" flexShrink={0}>
          {(activeSession.messages || []).length}条
        </Badge>
      )}
      <Button
        size="xs" variant="ghost" colorScheme="teal"
        onClick={onNewSession} isLoading={loading}
        isDisabled={!activeSessionId}
        flexShrink={0}
      >
        + 新建
      </Button>
    </Flex>
  );
});

// ====== 回复建议面板（自包含模块级组件） ======
const ReplySuggestionsPanel = memo(({ apiUrl, selectedGirlId, toast }) => {
  const [replyInput, setReplyInput] = useState('');
  const [replyStyle, setReplyStyle] = useState('');
  const [replyStyleCustom, setReplyStyleCustom] = useState('');
  const [replySuggestions, setReplySuggestions] = useState(null);
  const [replyLoading, setReplyLoading] = useState(false);
  const textareaRef = useRef(null);

  const handleTextareaChange = useCallback((e) => {
    setReplyInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  }, []);

  const handleGetReplySuggestions = useCallback(async () => {
    if (!replyInput.trim()) return;
    setReplyLoading(true);
    setReplySuggestions(null);
    const token = localStorage.getItem('zhuiai_token');
    const style = replyStyleCustom || replyStyle;
    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/reply-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ girlId: selectedGirlId || undefined, lastMessage: replyInput, style: style || undefined })
      });
      const data = await res.json();
      if (data.success) setReplySuggestions(data.suggestions);
      else toast({ title: data.error || '获取失败', status: 'error', duration: 3000 });
    } catch (e) {
      toast({ title: '网络错误', status: 'error', duration: 3000 });
    } finally {
      setReplyLoading(false);
    }
  }, [replyInput, replyStyle, replyStyleCustom, apiUrl, selectedGirlId, toast]);

  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: '已复制', status: 'success', duration: 1500 });
    } catch (e) {
      toast({ title: '复制失败', status: 'error', duration: 1500 });
    }
  }, [toast]);

  return (
    <>
      <Card bg="gray.800">
        <CardBody>
          <VStack spacing={4} align="stretch">
            <Box>
              <Text color="gray.300" fontSize="sm" mb={2}>女生最后一条消息</Text>
              <textarea
                ref={textareaRef}
                value={replyInput}
                onChange={handleTextareaChange}
                placeholder="粘贴女生最近的消息..."
                disabled={replyLoading}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                style={{
                  backgroundColor: '#374151', border: 'none', borderRadius: '6px', color: 'white',
                  width: '100%', height: '72px', minHeight: '72px', maxHeight: '100px',
                  padding: '8px 12px', resize: 'none', overflowY: 'hidden', outline: 'none',
                  fontSize: '14px', fontFamily: 'inherit', lineHeight: '1.4', boxSizing: 'border-box'
                }}
              />
            </Box>
            <HStack spacing={3}>
              <Box flex={1}>
                <Text color="gray.300" fontSize="sm" mb={2}>回复风格（可选）</Text>
                <Select value={replyStyle} onChange={e => { setReplyStyle(e.target.value); setReplyStyleCustom(''); }} bg="gray.700" border="none" color="white" placeholder="不选则返回多种风格">
                  <option value="稳妥型">稳妥型</option>
                  <option value="推进型">推进型</option>
                  <option value="调侃型">调侃型</option>
                </Select>
              </Box>
              <Box flex={1}>
                <Text color="gray.300" fontSize="sm" mb={2}>或自定义风格</Text>
                <Input value={replyStyleCustom} onChange={e => { setReplyStyleCustom(e.target.value); setReplyStyle(''); }} placeholder="如：更幽默、更直接" bg="gray.700" border="none" color="white" />
              </Box>
            </HStack>
            <Button colorScheme="teal" onClick={handleGetReplySuggestions} isLoading={replyLoading} isDisabled={!replyInput.trim()} leftIcon={<Icon as={BrainIcon} />}>
              获取回复建议
            </Button>
            {replySuggestions && (
              <VStack spacing={3} align="stretch" mt={2}>
                <Flex justify="space-between" align="center">
                  <Text color="gray.400" fontSize="sm">生成 {replySuggestions.options?.length || 0} 个回复方案</Text>
                  {replySuggestions.relationshipStageLabel && <Badge colorScheme="teal">{replySuggestions.relationshipStageLabel}</Badge>}
                </Flex>
                {(replySuggestions.options || []).map((opt, idx) => (
                  <Box key={idx} bg="gray.700" p={4} borderRadius="md">
                    <Flex justify="space-between" align="center" mb={2}>
                      <Badge colorScheme={opt.type === '稳妥型' ? 'blue' : opt.type === '推进型' ? 'red' : opt.type === '调侃型' ? 'orange' : 'gray'}>{opt.type}</Badge>
                      <Button size="xs" variant="ghost" colorScheme="teal" onClick={() => copyToClipboard(opt.reply)}>复制</Button>
                    </Flex>
                    <Text color="white" mb={2}>{opt.reply}</Text>
                    {opt.intention && <Text color="gray.500" fontSize="xs" mb={1}>目的：{opt.intention}</Text>}
                    {opt.stageAdvice && <Text color="gray.400" fontSize="xs" mb={1}>📍 {opt.stageAdvice}</Text>}
                    {opt.riskNote && opt.riskNote !== '无' && <Text color="orange.400" fontSize="xs">⚠️ {opt.riskNote}</Text>}
                  </Box>
                ))}
              </VStack>
            )}
          </VStack>
        </CardBody>
      </Card>
    </>
  );
});

// ====== 话术优化面板（自包含模块级组件） ======
const OptimizeReplyPanel = memo(({ apiUrl, selectedGirlId, toast }) => {
  const [optimizeInput, setOptimizeInput] = useState('');
  const [optimizeGoal, setOptimizeGoal] = useState('');
  const [optimizeGoalCustom, setOptimizeGoalCustom] = useState('');
  const [optimizedReplies, setOptimizedReplies] = useState(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const textareaRef = useRef(null);

  const handleTextareaChange = useCallback((e) => {
    setOptimizeInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  }, []);

  const handleOptimizeReply = useCallback(async () => {
    if (!optimizeInput.trim()) return;
    setOptimizeLoading(true);
    setOptimizedReplies(null);
    const token = localStorage.getItem('zhuiai_token');
    const goal = optimizeGoalCustom || optimizeGoal;
    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/optimize-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ originalReply: optimizeInput, girlId: selectedGirlId || undefined, goal: goal || undefined })
      });
      const data = await res.json();
      if (data.success) setOptimizedReplies(data.optimizations);
      else toast({ title: data.error || '优化失败', status: 'error', duration: 3000 });
    } catch (e) {
      toast({ title: '网络错误', status: 'error', duration: 3000 });
    } finally {
      setOptimizeLoading(false);
    }
  }, [optimizeInput, optimizeGoal, optimizeGoalCustom, apiUrl, selectedGirlId, toast]);

  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: '已复制', status: 'success', duration: 1500 });
    } catch (e) {
      toast({ title: '复制失败', status: 'error', duration: 1500 });
    }
  }, [toast]);

  return (
    <>
      <Card bg="gray.800">
        <CardBody>
          <VStack spacing={4} align="stretch">
            <Box>
              <Text color="gray.300" fontSize="sm" mb={2}>你想说的话</Text>
              <textarea
                ref={textareaRef}
                value={optimizeInput}
                onChange={handleTextareaChange}
                placeholder="输入你想发送的原始消息..."
                disabled={optimizeLoading}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                style={{
                  backgroundColor: '#374151', border: 'none', borderRadius: '6px', color: 'white',
                  width: '100%', height: '72px', minHeight: '72px', maxHeight: '100px',
                  padding: '8px 12px', resize: 'none', overflowY: 'hidden', outline: 'none',
                  fontSize: '14px', fontFamily: 'inherit', lineHeight: '1.4', boxSizing: 'border-box'
                }}
              />
            </Box>
            <HStack spacing={3}>
              <Box flex={1}>
                <Text color="gray.300" fontSize="sm" mb={2}>优化方向（可选）</Text>
                <Select value={optimizeGoal} onChange={e => { setOptimizeGoal(e.target.value); setOptimizeGoalCustom(''); }} bg="gray.700" border="none" color="white" placeholder="不选则自动优化">
                  <option value="更幽默">更幽默</option>
                  <option value="更暧昧">更暧昧</option>
                  <option value="更自然">更自然</option>
                  <option value="更真诚">更真诚</option>
                </Select>
              </Box>
              <Box flex={1}>
                <Text color="gray.300" fontSize="sm" mb={2}>或自定义方向</Text>
                <Input value={optimizeGoalCustom} onChange={e => { setOptimizeGoalCustom(e.target.value); setOptimizeGoal(''); }} placeholder="如：更俏皮、更温柔" bg="gray.700" border="none" color="white" />
              </Box>
            </HStack>
            <Button colorScheme="teal" onClick={handleOptimizeReply} isLoading={optimizeLoading} isDisabled={!optimizeInput.trim()} leftIcon={<Icon as={SparklesIcon} />}>
              优化话术
            </Button>
            {optimizedReplies && (
              <VStack spacing={3} align="stretch" mt={2}>
                <Text color="gray.400" fontSize="sm">原始：<Text as="span" color="gray.300">{optimizeInput}</Text></Text>
                {(optimizedReplies || []).map((opt, idx) => (
                  <Box key={idx} bg="gray.700" p={4} borderRadius="md">
                    <Flex justify="space-between" align="center" mb={2}>
                      <Badge colorScheme="teal">{opt.style}</Badge>
                      <Button size="xs" variant="ghost" colorScheme="teal" onClick={() => copyToClipboard(opt.text)}>复制</Button>
                    </Flex>
                    <Text color="white" mb={2}>{opt.text}</Text>
                    <Text color="gray.500" fontSize="xs" mb={1}>{opt.point}</Text>
                    {opt.stageAdvice && <Text color="gray.400" fontSize="xs" mb={1}>📍 {opt.stageAdvice}</Text>}
                    {opt.riskLevel && opt.riskLevel !== '低' && <Badge colorScheme={opt.riskLevel === '高' ? 'red' : 'orange'}>风险: {opt.riskLevel}</Badge>}
                  </Box>
                ))}
              </VStack>
            )}
          </VStack>
        </CardBody>
      </Card>
    </>
  );
});

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
          <Box
            className="ai-coach-markdown"
            sx={{
              '& h1, & h2, & h3': { color: 'white', fontWeight: 'bold', mt: 3, mb: 1, fontSize: 'md' },
              '& p': { mb: 2 },
              '& ul, & ol': { pl: 4, mb: 2 },
              '& li': { mb: 1 },
              '& strong': { color: 'teal.200' },
              '& code': { bg: 'whiteAlpha.200', px: 1, py: 0.5, borderRadius: 'sm', fontSize: '0.9em' },
              '& blockquote': { borderLeft: '3px solid', borderColor: 'whiteAlpha.400', pl: 3, py: 1, color: 'gray.300' },
              '& hr': { borderColor: 'whiteAlpha.300', my: 2 }
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </Box>
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
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [helpfulId, setHelpfulId] = useState(null);
  const [error, setError] = useState('');
  const streamingContentRef = useRef('');
  const isStreamingRef = useRef(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const savedScrollPositionRef = useRef(0);
  const toast = useToast();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';

  // 使用 useCallback 稳定 deepMode 切换函数
  const handleDeepModeToggle = useCallback(() => {
    setDeepMode(d => !d);
  }, []);

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

  // 监听 deepMode 变化 - 保存和恢复滚动位置
  useEffect(() => {
    // 使用 document.getElementById 获取滚动容器（比 ref 更可靠）
    const container = document.getElementById('chat-scroll-container');
    if (!container) return;

    // 保存当前滚动位置
    const savedScrollTop = container.scrollTop;
    const savedScrollHeight = container.scrollHeight;

    // 在状态更新后恢复滚动位置
    requestAnimationFrame(() => {
      const currentContainer = document.getElementById('chat-scroll-container');
      if (currentContainer) {
        // 恢复滚动到之前的位置（或底部）
        currentContainer.scrollTop = savedScrollTop || savedScrollHeight;
      }
    });
  }, [deepMode]);

  // 监听消息变化，自动滚动到底部
  // 这是一个备份机制，确保在消息更新后滚动
  useEffect(() => {
    // 消息变化时，等待 DOM 更新完成后滚动
    const timer = setTimeout(() => {
      const container = document.getElementById('chat-scroll-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [messages.length]);

  // 滚动到底部 - 使用 document.getElementById 确保获取正确的容器
  const scrollToBottom = useCallback(() => {
    // 使用 requestAnimationFrame 确保在下一帧执行，此时 DOM 应该已更新
    const doScroll = () => {
      const container = document.getElementById('chat-scroll-container');
      if (container) {
        // 设置 scrollTop 到最大值
        container.scrollTop = container.scrollHeight;
      }
    };
    requestAnimationFrame(doScroll);
    // 双重保障：等待一帧后再执行一次
    requestAnimationFrame(() => {
      requestAnimationFrame(doScroll);
    });
  }, []);

  // 自动调整 textarea 高度 - 暂时禁用以排查问题
  // useEffect(() => {
  //   if (textareaRef.current) {
  //     textareaRef.current.style.height = 'auto';
  //     textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
  //   }
  // }, [input]);

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

  const loadHistory = async (girlIdOverride) => {
    const girlId = girlIdOverride !== undefined ? girlIdOverride : selectedGirlId;
    const token = localStorage.getItem('zhuiai_token');
    setLoadingHistory(true);
    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/history?girlId=${girlId || ''}&activeOnly=false`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const allSessions = data.sessions || [];
        setSessions(allSessions);
        if (allSessions.length > 0) {
          const latestId = allSessions[0].id;
          setActiveSessionId(latestId);
          const latestMessages = (allSessions[0].messages || []).map(m => ({
            id: m.id,
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
            createdAt: m.createdAt
          }));
          setMessages(latestMessages);
        } else {
          setActiveSessionId(null);
          setMessages([]);
        }
      }
    } catch (e) {
      console.error('[AICoach] load history failed:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleGirlChange = (girlId) => {
    setSelectedGirlId(girlId);
    loadHistory(girlId);
  };

  const handleSelectSession = useCallback((sessionId) => {
    if (!sessionId) return;
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    setSessionLoading(true);
    setActiveSessionId(sessionId);
    const msgs = (session.messages || []).map(m => ({
      id: m.id,
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
      createdAt: m.createdAt
    }));
    setMessages(msgs);
    setError('');
    setTimeout(() => {
      const container = document.getElementById('chat-scroll-container');
      if (container) container.scrollTop = container.scrollHeight;
      setSessionLoading(false);
    }, 100);
  }, [sessions]);

  const handleCopy = useCallback(async (content, messageId) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleRegenerate = useCallback(async (content) => {
    // 找到最后一条用户消息
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    const token = localStorage.getItem('zhuiai_token');
    const userMessage = lastUserMsg.content;

    // 移除最后一条助手消息（不是用户消息）
    setMessages(prev => prev.slice(0, -1));

    // 添加新的助手消息占位
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

    // 延迟滚动到底部，等待 DOM 更新完成
    setTimeout(() => {
      const container = document.getElementById('chat-scroll-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 50);

    setLoading(true);
    setError('');
    streamingContentRef.current = '';
    isStreamingRef.current = true;

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

      if (deepMode) {
        const data = await res.json();
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: data.content || data.analysis || '' } : m)
        );
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastUpdate = 0;
        let rafId = null;
        const SENTENCE_ENDINGS = /[。！？\n]/;

        const flushUpdate = (content) => {
          const now = Date.now();
          const shouldFlush = now - lastUpdate >= 150 || SENTENCE_ENDINGS.test(content.slice(-1));
          if (shouldFlush) {
            lastUpdate = now;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
              rafId = null;
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content } : m)
              );
              if (isStreamingRef.current) scrollToBottom();
            });
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
              } catch { /* ignore */ }
            }
          }
        }

        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer.trim());
            if (parsed.content) streamingContentRef.current += parsed.content;
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
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    } finally {
      setLoading(false);
      isStreamingRef.current = false;
      // 响应完成后滚动到底部
      setTimeout(() => {
        const container = document.getElementById('chat-scroll-container');
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }, 50);
    }
  }, [messages, apiUrl, deepMode]);

  const handleHelpful = useCallback(async (messageId, isHelpful) => {
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
  }, [apiUrl, toast]);

  const handleNewConversation = async () => {
    try {
      const token = localStorage.getItem('zhuiai_token');
      const res = await fetch(`${apiUrl}/api/ai-coach/new-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ girlId: selectedGirlId || undefined })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '新建会话失败');
      }
      // 先刷新会话列表（旧会话标记为已归档）
      await loadHistory();
      // 清空聊天区域和会话选中状态，进入欢迎界面
      // 新会话在用户发送下一条消息时由服务端自动创建（getOrCreateSession）
      setMessages([]);
      setActiveSessionId(null);
      setError('');
      toast({
        title: '已开启新对话',
        status: 'info',
        duration: 2000,
        isClosable: true,
      });
    } catch (e) {
      console.error('[AICoach] new-session failed:', e);
      toast({
        title: '新建会话失败',
        description: e.message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
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

    // 立即滚动到底部（用户消息添加后）
    scrollToBottom();

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

    // 助手消息添加后也滚动到底部
    scrollToBottom();

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
        let rafId = null;

        // 按段落/句子缓冲：遇到句号、问号、感叹号或换行时才更新UI
        const SENTENCE_ENDINGS = /[。！？\n]/;

        const flushUpdate = (content) => {
          const now = Date.now();
          const shouldFlush = now - lastUpdate >= 150 ||  // 150ms间隔（减少闪烁）
            SENTENCE_ENDINGS.test(content.slice(-1));  // 遇到句子结束符

          if (shouldFlush) {
            lastUpdate = now;
            // 取消之前的 requestAnimationFrame
            if (rafId) cancelAnimationFrame(rafId);
            // 使用 requestAnimationFrame 批量更新，减少重渲染
            rafId = requestAnimationFrame(() => {
              rafId = null;
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content } : m)
              );
              if (isStreamingRef.current) scrollToBottom();
            });
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
        // 流式结束后滚动到底部
        scrollToBottom();
      }
    } catch (e) {
      console.error(e);
      setError(e.message || '网络错误，请重试');
      // 移除失败的消息
      setMessages(prev => prev.filter(m => m.id !== tempId && m.id !== assistantId));
    } finally {
      setLoading(false);
      isStreamingRef.current = false;
      // 确保最终滚动到底部
      scrollToBottom();
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    await handleSubmitInternal(input);
    setInput('');
    // 不再手动重置高度，让 textarea 自然重置
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
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

  // Tab 1: AI教练（多轮对话）
  // 注意：不使用 memo，因为需要确保 ref 和状态更新正确同步
  const AICoachPanel = () => (
    <>
      {/* 会话选择栏 */}
      <SessionBar
        sessions={sessions}
        activeSessionId={activeSessionId}
        selectedGirlId={selectedGirlId}
        loading={sessionLoading}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewConversation}
      />
      {/* 固定高度的消息容器，flex布局 */}
      <Box flex="1" minH="0" display="flex" flexDirection="column" bg="gray.800" borderRadius="md" mb={2} overflow="hidden">
        {/* 消息列表区域 - 可滚动 */}
        <Box id="chat-scroll-container" flex="1" overflowY="auto" p={4} ref={scrollContainerRef}>
          {messages.length === 0 ? (
            <VStack spacing={4} py={8} justify="center" minH="200px">
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
            <>
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
            </>
          )}
          {error && (
            <Box mt={4} p={3} bg="red.900" borderRadius="md">
              <Text color="red.200">{error}</Text>
            </Box>
          )}
        </Box>
      </Box>
      {/* 固定底部输入区域 - 使用独立组件避免重渲染导致失焦 */}
      <InputArea
        onSubmit={handleSubmitInternal}
        loading={loading}
        deepMode={deepMode}
        onNewConversation={handleNewConversation}
      />
    </>
  );

  return (
    <Box display="flex" flexDirection="column" h={{ base: 'calc(100vh - 96px)', lg: 'calc(100vh - 48px)' }} overflow="hidden">
      <Flex justify="space-between" align="center" mb={3} flexShrink={0} gap={3} wrap="wrap">
        <Heading color="white" size="md" whiteSpace="nowrap">AI教练</Heading>
        <HStack spacing={2} flexShrink={0}>
          <Select
            value={selectedGirlId}
            onChange={e => handleGirlChange(e.target.value)}
            bg="gray.700" border="none" color="white" size="sm" maxW="180px" borderRadius="md"
            placeholder="关联女生"
          >
            {(girls || []).map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
          <Tooltip label={deepMode ? '深度分析：调用工具链，全面分析' : '快速分析：流式输出，快'}>
            <button type="button" onClick={handleDeepModeToggle}
              style={{
                background: deepMode ? '#553c9a' : '#374151',
                border: deepMode ? '1px solid #805ad5' : '1px solid transparent',
                borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
                color: deepMode ? '#d6bcfa' : '#a0aec0', whiteSpace: 'nowrap'
              }}>
              <span style={{ fontSize: '14px' }}><SparklesIcon /></span>
              <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{deepMode ? '深度' : '快速'}</span>
            </button>
          </Tooltip>
          {selectedGirl && (
            <HStack bg="gray.700" px={2} py={1} borderRadius="md" spacing={2} flexShrink={0}>
              <Badge colorScheme={STAGE_COLORS[selectedGirl.stage] || 'gray'} fontSize="xs">
                {selectedGirl.stage || '未知'}
              </Badge>
              <Text fontSize="xs" color={selectedGirl.tensionScore >= 5 ? 'orange.400' : 'blue.400'} fontWeight="bold">
                {selectedGirl.tensionScore?.toFixed(1) || '5.0'}
              </Text>
            </HStack>
          )}
        </HStack>
      </Flex>

      <Tabs variant="soft-rounded" colorScheme="teal" display="flex" flexDirection="column" flex="1" minH="0" overflow="hidden">
        <TabList bg="gray.800" borderRadius="lg" p={1} flexShrink={0}>
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

        <TabPanels display="flex" flex="1" minH="0">
          <TabPanel px={0} py={2} display="flex" flexDirection="column" flex="1" minH="0" overflow="hidden">
            <AICoachPanel />
          </TabPanel>
          <TabPanel px={0} pt={4}>
            <ReplySuggestionsPanel apiUrl={apiUrl} selectedGirlId={selectedGirlId} toast={toast} />
          </TabPanel>
          <TabPanel px={0} pt={4}>
            <OptimizeReplyPanel apiUrl={apiUrl} selectedGirlId={selectedGirlId} toast={toast} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}

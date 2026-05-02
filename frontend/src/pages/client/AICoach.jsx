import { useState, useRef, useEffect, useLayoutEffect, useCallback, memo, useMemo } from 'react';
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

/**
 * 修正 AI 产出的不规范 Markdown 格式
 * DeepSeek 经常输出缺少空格的 markdown 语法，这里统一规范化
 */
function fixMarkdown(text) {
  if (!text || typeof text !== 'string') return text;
  let fixed = text;

  // ---- 第一步：修复行首格式（#####text → ##### text 等）----
  // 标题：###text → ### text（保留原有 # 数量）
  fixed = fixed.replace(/^(#{1,4})([^\s#\n])/gm, '$1 $2');

  // 引用：>text → > text
  fixed = fixed.replace(/^(>{1,2})([^\s>\n])/gm, '$1 $2');

  // 无序列表：-text → - text（但不匹配分隔线 ---）
  fixed = fixed.replace(/^-(?=[^\s-])([^\s\n])/gm, '- $1');

  // 有序列表：1.text → 1. text
  fixed = fixed.replace(/^(\d+\.)([^\s\n])/gm, '$1 $2');

  // ---- 第二步：修复行内 Markdown（非行首的 >/###/--- 需要加换行）----
  // 行内 > 引用：text>回复 → text\n\n> 回复（DeepSeek 常见问题）
  // 排除 ->、=> 等箭头符号，只匹配 > 后跟中文/字母（真正的引用内容）
  fixed = fixed.replace(/([^\n>\-=>])(>)([一-鿿㐀-䶿a-zA-Z])/gm, '$1\n\n$2 $3');

  // 行内 ###：text###heading → text\n\n### heading
  fixed = fixed.replace(/([^\n#])(#{1,3})([^\s#\n])/gm, '$1\n\n$2 $3');

  // 行内 ---（分隔线）：text---text → text\n\n---\n\ntext
  // 但 --- 后跟 ## 或 ** 时只加换行不加额外空行（避免破坏标题/粗体格式）
  fixed = fixed.replace(/(---)(#{1,3})([^\s#\n])/g, '$1\n\n$2 $3');
  fixed = fixed.replace(/(---)(\*\*[^*]+\*\*)/g, '$1\n\n$2');
  fixed = fixed.replace(/([^\n-])(---)([^\n#*\-])/g, '$1\n\n$2\n\n$3');
  fixed = fixed.replace(/([^\n-])(---)$/gm, '$1\n\n$2');

  // 清理多余空行（最多保留两个连续换行）
  fixed = fixed.replace(/\n{3,}/g, '\n\n');

  // ---- 第三步：修复粗体格式 ----
  // **粗体** 两侧多余空格：** text ** → **text**
  fixed = fixed.replace(/\*\*\s+([^*]+?)\s+\*\*/g, '**$1**');

  // __粗体__ 两侧多余空格
  fixed = fixed.replace(/__\s+([^_]+?)\s+__/g, '__$1__');

  // ---- 第四步：确保块级元素前后有空行 ----
  // 标题前后
  fixed = fixed.replace(/([^\n])\n(#{1,4}\s)/g, '$1\n\n$2');
  fixed = fixed.replace(/(#{1,4}\s[^\n]+)\n([^\n#])/g, '$1\n\n$2');

  return fixed;
}

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
const InputArea = memo(({ onSubmit, loading, deepMode, onNewConversation, placeholder, showNewConvBtn = true }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        const textToSubmit = input;
        setInput('');
        onSubmit(textToSubmit);
      }
    }
  }, [input, onSubmit]);

  const handleChange = useCallback((e) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 360) + 'px';
    }
  }, []);

  const handleSubmitClick = useCallback(() => {
    if (input.trim()) {
      const textToSubmit = input;
      setInput('');
      onSubmit(textToSubmit);
    }
  }, [input, onSubmit]);

  const defaultPlaceholder = deepMode ? '描述当前情况，深度分析会调用工具...' : '描述你的情况...';

  return (
    <Box bg="gray.800" borderRadius="md" p={3} flexShrink={0}>
      <Flex gap={2} align="center">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
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
            maxHeight: '360px',
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
        {showNewConvBtn && (
          <Button
            variant="ghost"
            colorScheme="gray"
            size="sm"
            onClick={onNewConversation}
          >
            新对话
          </Button>
        )}
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
function MessageBubble({ message, onCopy, onRegenerate, onHelpful, isStreaming, copiedId, helpfulId, reasoning, reasoningLoading }) {
  const isUser = message.role === 'user';
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const hasReasoning = !isUser && reasoning;

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
        px={hasReasoning ? 0 : 4}
        py={hasReasoning ? 0 : 3}
        borderRadius="2xl"
        borderBottomRightRadius={isUser ? 'sm' : '2xl'}
        borderBottomLeftRadius={isUser ? '2xl' : 'sm'}
        position="relative"
        overflow="hidden"
      >
        {/* 思考过程 — 内嵌在气泡顶部 */}
        {hasReasoning && (
          <>
            <Flex
              as="button"
              onClick={() => setReasoningOpen(!reasoningOpen)}
              w="100%" px={4} py={2} align="center" gap={2}
              _hover={{ bg: 'whiteAlpha.50' }}
            >
              <Text fontSize="xs" color="yellow.300">
                {reasoningOpen ? '▼' : '▶'} 思考过程{reasoningLoading ? ' · 生成中...' : ''}
              </Text>
              {reasoningLoading && (
                <Box w="6px" h="6px" bg="yellow.400" borderRadius="full"
                  animation="pulse 1s infinite"
                  sx={{ '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }}
                />
              )}
            </Flex>
            {reasoningOpen && (
              <Box px={4} py={3} maxH="260px" overflowY="auto" borderBottom="1px solid" borderColor="whiteAlpha.200">
                <Text fontSize="13px" color="gray.300" lineHeight="1.8" whiteSpace="pre-wrap">{reasoning}</Text>
              </Box>
            )}
            {/* 正式回复内容 */}
            <Box px={4} py={3}>
              {message.content ? (
                <Box className="ai-coach-markdown" fontSize="14px" lineHeight="1.8" color="gray.100">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <Text as="h1" color="white" fontWeight="bold" fontSize="md" mt={3} mb={1}>{children}</Text>,
                      h2: ({ children }) => <Text as="h2" color="white" fontWeight="bold" fontSize="md" mt={3} mb={1}>{children}</Text>,
                      h3: ({ children }) => <Text as="h3" color="white" fontWeight="bold" fontSize="md" mt={3} mb={1}>{children}</Text>,
                      p: ({ children }) => <Text mb={2}>{children}</Text>,
                      strong: ({ children }) => <Text as="strong" color="teal.200" fontWeight="bold">{children}</Text>,
                      ul: ({ children }) => <Text as="ul" pl={4} mb={2}>{children}</Text>,
                      ol: ({ children }) => <Text as="ol" pl={4} mb={2}>{children}</Text>,
                      li: ({ children }) => <Text as="li" mb={1}>{children}</Text>,
                      blockquote: ({ children }) => <Box borderLeft="3px solid" borderColor="whiteAlpha.400" pl={3} py={1} color="gray.300">{children}</Box>,
                      hr: () => <Box borderTop="1px solid" borderColor="whiteAlpha.300" my={2} />,
                      code: ({ children }) => <Text as="code" bg="whiteAlpha.200" px={1} py={0.5} borderRadius="sm" fontSize="0.9em">{children}</Text>,
                    }}
                  >
                    {fixMarkdown(message.content)}
                  </ReactMarkdown>
                </Box>
              ) : (
                reasoningLoading && (
                  <HStack spacing={2}>
                    {[0, 150, 300].map((delay) => (
                      <Box key={delay} w="8px" h="8px" bg="teal.400" borderRadius="full"
                        animation={`bounce 1.4s infinite ease-in-out ${delay}ms`}
                        sx={{ '@keyframes bounce': { '0%,80%,100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1)' } } }}
                      />
                    ))}
                    <Text color="gray.400" fontSize="sm">思考中...</Text>
                  </HStack>
                )
              )}
            </Box>
          </>
        )}

        {/* 无思考过程时的普通用户/助手消息 */}
        {!hasReasoning && (
          <>
            {isUser ? (
              <Text whiteSpace="pre-wrap">{message.content}</Text>
            ) : (
              <Box className="ai-coach-markdown" fontSize="14px" lineHeight="1.8" color="gray.100">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <Text as="h1" color="white" fontWeight="bold" fontSize="md" mt={3} mb={1}>{children}</Text>,
                    h2: ({ children }) => <Text as="h2" color="white" fontWeight="bold" fontSize="md" mt={3} mb={1}>{children}</Text>,
                    h3: ({ children }) => <Text as="h3" color="white" fontWeight="bold" fontSize="md" mt={3} mb={1}>{children}</Text>,
                    p: ({ children }) => <Text mb={2}>{children}</Text>,
                    strong: ({ children }) => <Text as="strong" color="teal.200" fontWeight="bold">{children}</Text>,
                    ul: ({ children }) => <Text as="ul" pl={4} mb={2}>{children}</Text>,
                    ol: ({ children }) => <Text as="ol" pl={4} mb={2}>{children}</Text>,
                    li: ({ children }) => <Text as="li" mb={1}>{children}</Text>,
                    blockquote: ({ children }) => <Box borderLeft="3px solid" borderColor="whiteAlpha.400" pl={3} py={1} color="gray.300">{children}</Box>,
                    hr: () => <Box borderTop="1px solid" borderColor="whiteAlpha.300" my={2} />,
                    code: ({ children }) => <Text as="code" bg="whiteAlpha.200" px={1} py={0.5} borderRadius="sm" fontSize="0.9em">{children}</Text>,
                  }}
                >
                  {fixMarkdown(message.content)}
                </ReactMarkdown>
              </Box>
            )}
          </>
        )}

        {/* 助手消息底部操作栏 */}
        {!isUser && !isStreaming && message.content && (
          <Flex mt={2} pt={2} borderTop="1px solid" borderColor="whiteAlpha.200" gap={3} px={hasReasoning ? 4 : 0}>
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
                onMouseDown={(e) => e.preventDefault()}
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

// ====== 聊天实战子组件 ======

// 聊天实战消息气泡（girl/me 两种角色）
const CombatChatMessage = memo(({ msg, girlName }) => {
  const isGirl = msg.role === 'girl';
  return (
    <Flex justify={isGirl ? 'flex-start' : 'flex-end'} mb={3}>
      <Box maxW="85%">
        <Text fontSize="11px" color="gray.400" mb={1} textAlign={isGirl ? 'left' : 'right'}>
          {isGirl ? (girlName || '女生') : '我'}
        </Text>
        <Box
          bg={isGirl ? 'gray.700' : 'teal.700'}
          px={3} py={2}
          borderRadius="xl"
          borderBottomLeftRadius={isGirl ? 'sm' : undefined}
          borderBottomRightRadius={isGirl ? undefined : 'sm'}
        >
          <Text fontSize="13px" lineHeight="1.6">{msg.content}</Text>
        </Box>
      </Box>
    </Flex>
  );
});

// 建议风格标签颜色
const STYLE_COLORS = {
  '稳妥型': 'blue', '进攻型': 'red', '调侃型': 'orange',
  '幽默型': 'green', '更幽默': 'green', '暧昧型': 'pink', '更暧昧': 'pink',
  '自然型': 'cyan', '更自然': 'cyan', '推进型': 'red',
};

// 单张建议/优化卡片
const SuggestionCard = memo(({ item, index, isSelected, isDismissed, onSelect }) => {
  const text = item.reply || item.text || '';
  const style = item.type || item.style || '';
  const subtext = item.intention || item.point || '';
  const risk = item.riskNote || (item.riskLevel && item.riskLevel !== '低' ? item.riskLevel : '');

  return (
    <Box
      onClick={() => !isSelected && !isDismissed && onSelect(index)}
      bg={isSelected ? 'rgba(16,185,129,0.1)' : 'gray.700'}
      border="1px solid"
      borderColor={isSelected ? 'green.500' : (isDismissed ? 'gray.600' : 'gray.600')}
      borderRadius="lg"
      p={3}
      cursor={isSelected || isDismissed ? 'default' : 'pointer'}
      opacity={isDismissed ? 0.3 : 1}
      transform={isDismissed ? 'scale(0.95)' : 'none'}
      transition="all 0.2s"
      position="relative"
      _hover={!isSelected && !isDismissed ? { borderColor: 'teal.400', bg: 'whiteAlpha.50' } : {}}
    >
      {isSelected && (
        <Badge colorScheme="green" fontSize="10px" position="absolute" top={2} right={2}>
          ✓ 已选用
        </Badge>
      )}
      {style && (
        <Badge
          colorScheme={STYLE_COLORS[style] || 'gray'}
          fontSize="10px"
          mb={1}
          variant="subtle"
        >
          {style}
        </Badge>
      )}
      <Text fontSize="13px" lineHeight="1.6">{text}</Text>
      {subtext && <Text fontSize="11px" color="gray.400" mt={1}>{subtext}</Text>}
      {risk && <Text fontSize="11px" color="orange.300" mt={1}>⚠ {risk}</Text>}
    </Box>
  );
});

// 建议卡片组容器
const SuggestionGroup = memo(({
  suggestions, selectedIndex, onSelect, onRegenerate,
  onDismissAll, onSendDirect, loading, girlName, mode
}) => {
  if (!suggestions && !loading) return null;

  const items = suggestions?.items || [];
  const type = suggestions?.type || (mode === 'optimize' ? 'optimizations' : 'suggestions');

  return (
    <Box
      borderLeft="2px solid" borderColor="teal.500"
      pl={3} my={4}
    >
      {/* Header */}
      <Flex align="center" gap={2} mb={2}>
        <Text fontSize="11px" color="gray.400" letterSpacing=".5px">
          {type === 'suggestions' ? `💡 回复建议 (${girlName || '女生'})` : '⚡ 话术优化'}
        </Text>
        <Flex gap={1} ml="auto">
          <Button size="xs" variant="ghost" fontSize="10px" color="gray.400"
            onClick={onRegenerate} isLoading={loading}
          >🔄 重新生成</Button>
          {mode === 'optimize' && onSendDirect && (
            <Button size="xs" variant="ghost" fontSize="10px" color="green.300"
              onClick={onSendDirect}
            >📤 直接发送原文</Button>
          )}
          <Button size="xs" variant="ghost" fontSize="10px" color="gray.400"
            onClick={onDismissAll}
          >✕ 全部删除</Button>
        </Flex>
      </Flex>

      {/* Cards */}
      {loading ? (
        <Flex justify="center" py={4}>
          <HStack spacing={2}>
            {[0, 150, 300].map((delay) => (
              <Box key={delay} w="8px" h="8px" bg="teal.400" borderRadius="full"
                animation={`bounce 1.4s infinite ease-in-out ${delay}ms`}
                sx={{ '@keyframes bounce': { '0%,80%,100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1)' } } }}
              />
            ))}
          </HStack>
        </Flex>
      ) : items.length > 0 ? (
        <VStack spacing={2} align="stretch">
          {items.map((item, i) => (
            <SuggestionCard
              key={i}
              item={item}
              index={i}
              isSelected={selectedIndex === i}
              isDismissed={selectedIndex !== null && selectedIndex !== i}
              onSelect={onSelect}
            />
          ))}
        </VStack>
      ) : (
        <Text fontSize="12px" color="gray.500" textAlign="center" py={3}>
          AI 暂未生成建议，请重试
        </Text>
      )}
    </Box>
  );
});

// 双模式输入栏
const CombatInputBar = memo(({ mode, onModeChange, value, onChange, onSubmit, loading, girlName }) => {
  const textareaRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !loading) onSubmit();
    }
  }, [value, loading, onSubmit]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 360) + 'px'; }
  }, []);

  useEffect(() => { autoResize(); }, [value, autoResize]);

  return (
    <Box bg="gray.800" borderTop="1px solid" borderColor="gray.700" px={4} py={3} flexShrink={0}>
      {/* Mode toggle */}
      <Flex gap={1} mb={2}>
        <Button
          size="xs"
          variant={mode === 'suggest' ? 'solid' : 'ghost'}
          colorScheme={mode === 'suggest' ? 'blue' : undefined}
          color={mode !== 'suggest' ? 'gray.400' : undefined}
          onClick={() => onModeChange('suggest')}
          fontSize="12px"
        >💡 回复建议</Button>
        <Button
          size="xs"
          variant={mode === 'optimize' ? 'solid' : 'ghost'}
          colorScheme={mode === 'optimize' ? 'orange' : undefined}
          color={mode !== 'optimize' ? 'gray.400' : undefined}
          onClick={() => onModeChange('optimize')}
          fontSize="12px"
        >⚡ 话术优化</Button>
      </Flex>

      {/* Input row */}
      <Flex gap={2}>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          placeholder={mode === 'suggest' ? `粘贴${girlName || '女生'}说的消息...` : '粘贴你要优化的回复草稿...'}
          bg="gray.700"
          border="none"
          color="white"
          fontSize="13px"
          rows={1}
          resize="none"
          overflow="hidden"
          minH="40px"
          maxH="360px"
          isDisabled={loading}
          _focus={{ outline: 'none', boxShadow: '0 0 0 2px #319795' }}
          sx={{ fontFamily: 'inherit' }}
        />
        <Button
          colorScheme={mode === 'suggest' ? 'blue' : 'orange'}
          onClick={onSubmit}
          isLoading={loading}
          isDisabled={!value.trim()}
          fontSize="13px"
          px={6}
          alignSelf="flex-end"
        >
          发送
        </Button>
      </Flex>
    </Box>
  );
});

// 右侧女生上下文面板
const GirlContextSidebar = memo(({ girl, analysisContent }) => {
  if (!girl) return null;

  const stageColor = STAGE_COLORS[girl.stage] || 'gray';
  const heatColor = (girl.tensionScore || 5) >= 7 ? 'orange.400' : (girl.tensionScore || 5) >= 5 ? 'yellow.400' : 'blue.400';

  // 阶段策略提示
  const stageTips = {
    '陌生': [['🐢', '刚认识，先建立舒适感，不要急于推进'], ['💬', '重点：展示你的生活方式和价值观']],
    '朋友': [['🐢', '热度偏低，先建立舒适感，不要急于推进'], ['🔑', '目标：让她习惯你的存在，成为她的情绪出口']],
    '暧昧': [['🔥', '她已经有窗口信号，72小时内主动约见'], ['⚠️', '不要过度道歉或解释，她测试的是你的态度'], ['🔑', '目标：制造一个她有感觉的「在一起」时刻']],
    '约会': [['🔥', '热度高，可以更激进地推进关系'], ['🔑', '目标：升级肢体接触，明确关系预期']],
    '长期': [['💚', '长期关系，重点是维护和深化亲密度'], ['🔑', '保持新鲜感，定期制造小惊喜']],
  };
  const tips = stageTips[girl.stage] || stageTips['陌生'];

  return (
    <Box w="320px" flexShrink={0} display={{ base: 'none', lg: 'flex' }} flexDirection="column" overflowY="auto" minH="0" px={3} py={2}>
      {/* 女生上下文 */}
      <Card bg="gray.800" border="1px solid" borderColor="gray.700" mb={3}>
        <CardHeader pb={0}>
          <Flex align="center" gap={2}>
            <Box w="6px" h="6px" borderRadius="full" bg="teal.400" />
            <Text fontSize="12px" fontWeight="bold" color="gray.300" letterSpacing=".5px">
              女生上下文
            </Text>
          </Flex>
        </CardHeader>
        <CardBody>
          <VStack spacing={1} align="stretch" fontSize="13px">
            <Flex justify="space-between"><Text color="gray.400">姓名</Text><Text fontWeight="bold">{girl.name}</Text></Flex>
            <Flex justify="space-between"><Text color="gray.400">年龄/职业</Text><Text>{[girl.age, girl.occupation].filter(Boolean).join('岁 · ') || '未知'}</Text></Flex>
            <Flex justify="space-between"><Text color="gray.400">关系阶段</Text>
              <Badge colorScheme={stageColor}>{girl.stage || '未知'}</Badge>
            </Flex>
            <Flex justify="space-between"><Text color="gray.400">热度</Text>
              <Text color={heatColor} fontWeight="bold">{(girl.tensionScore || 5).toFixed(1)} / 10</Text>
            </Flex>
            <Flex justify="space-between"><Text color="gray.400">亲密度</Text><Text>{girl.intimacyLevel || 1} / 5</Text></Flex>
            {(girl.mbti || (girl.personality && typeof girl.personality === 'object' && girl.personality.mbti)) && (
              <Flex justify="space-between"><Text color="gray.400">MBTI</Text><Text>{girl.mbti || (girl.personality && girl.personality.mbti)}</Text></Flex>
            )}
          </VStack>
        </CardBody>
      </Card>

      {/* 阶段策略 */}
      <Card bg="gray.800" border="1px solid" borderColor="gray.700">
        <CardHeader pb={0}>
          <Flex align="center" gap={2}>
            <Box w="6px" h="6px" borderRadius="full" bg="orange.400" />
            <Text fontSize="12px" fontWeight="bold" color="gray.300" letterSpacing=".5px">
              阶段策略 · {girl.stage || '未知'}
            </Text>
          </Flex>
        </CardHeader>
        <CardBody>
          <VStack spacing={2} align="stretch">
            {tips.map((t, i) => (
              <Flex key={i} align="flex-start" gap={2} fontSize="12px" pb={i < tips.length - 1 ? 2 : 0}
                borderBottom={i < tips.length - 1 ? '1px solid' : 'none'} borderColor="gray.700">
                <Text>{t[0]}</Text>
                <Text color="gray.300">{t[1]}</Text>
              </Flex>
            ))}
          </VStack>
        </CardBody>
      </Card>
    </Box>
  );
});

// 聊天实战聊天区
const CombatChatPanel = memo(({
  history, suggestions, selectedIndex, onSelect,
  onRegenerate, onDismissAll, onSendDirect,
  loading, girlName, combatMode
}) => {
  const scrollRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, suggestions, loading]);

  const isEmpty = history.length === 0 && !suggestions && !loading;

  return (
    <Box flex="1" minH="0" overflowY="auto" p={4} ref={scrollRef}>
      {isEmpty ? (
        <Flex direction="column" align="center" justify="center" py={16} color="gray.400">
          <Text fontSize="36px" mb={3}>💬</Text>
          <Text fontSize="14px">在下方粘贴女生的消息，点击发送</Text>
          <Text fontSize="12px" mt={1}>AI 会生成回复建议，选中后自动成为你的回复</Text>
        </Flex>
      ) : (
        <>
          {history.map(msg => (
            <CombatChatMessage key={msg.id} msg={msg} girlName={girlName} />
          ))}
          <SuggestionGroup
            suggestions={suggestions}
            selectedIndex={selectedIndex}
            onSelect={onSelect}
            onRegenerate={onRegenerate}
            onDismissAll={onDismissAll}
            onSendDirect={onSendDirect}
            loading={loading}
            girlName={girlName}
            mode={combatMode}
          />
          <div ref={endRef} style={{ height: 1 }} />
        </>
      )}
    </Box>
  );
});

export default function AICoach() {
  const { user } = useAuth();
  const [girls, setGirls] = useState([]);
  const [selectedGirlId, setSelectedGirlId] = useState('');
  const [selectedGirl, setSelectedGirl] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [deepMode, setDeepMode] = useState(true); // 默认深度思考模式
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [helpfulId, setHelpfulId] = useState(null);
  const [error, setError] = useState('');
  const [thinkingLabel, setThinkingLabel] = useState(null); // 当前分析视角（来自 SSE meta 事件）
  const [reasoningContent, setReasoningContent] = useState(''); // DeepSeek 思考过程
  const reasoningContentRef = useRef('');
  const streamingContentRef = useRef('');
  const isStreamingRef = useRef(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const savedScrollPositionRef = useRef(0);
  const toast = useToast();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';

  // ====== 聊天实战 state ======
  const [combatHistories, setCombatHistories] = useState({}); // { [girlId]: CombatMessage[] }
  const [combatMode, setCombatMode] = useState('suggest'); // 'suggest' | 'optimize'
  const [combatInput, setCombatInput] = useState('');
  const [combatLoading, setCombatLoading] = useState(false);
  const [combatSuggestions, setCombatSuggestions] = useState(null);
  // { type: 'suggestions'|'optimizations', items: [...] }
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(null);
  const [lastDraftText, setLastDraftText] = useState('');
  // Girl-selected AI教练 state
  const [girlAnalysisContent, setGirlAnalysisContent] = useState('');
  const [girlAnalysisLoading, setGirlAnalysisLoading] = useState(false);
  // Track active tab (0 = AI教练, 1 = 聊天实战/回复建议)
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const getCurrentCombatHistory = useCallback(() => {
    return selectedGirlId ? (combatHistories[selectedGirlId] || []) : [];
  }, [selectedGirlId, combatHistories]);

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
  // 用最后一条消息的 id + 内容长度作为依赖，覆盖：
  // 1. 重新生成（id 变化）2. 流式输出内容增长（content length 变化）
  // useLayoutEffect 在浏览器绘制前同步执行，避免用户看到滚动跳动
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastMessageId = lastMessage?.id || null;
  const lastContentLen = lastMessage?.content?.length || 0;
  const reasoningLen = reasoningContent?.length || 0;
  useLayoutEffect(() => {
    const c = document.getElementById('chat-scroll-container');
    if (c) c.scrollTop = c.scrollHeight;
  }, [lastMessageId, lastContentLen, reasoningLen]);

  // loading 结束后确保在底部（兜底）
  useLayoutEffect(() => {
    if (!loading) {
      const c = document.getElementById('chat-scroll-container');
      if (c) c.scrollTop = c.scrollHeight;
    }
  }, [loading]);

  // 页面初始加载：DOM 就绪后滚动到底部
  useEffect(() => {
    const scrollNow = () => {
      const c = document.getElementById('chat-scroll-container');
      if (c) c.scrollTop = c.scrollHeight;
    };
    const t1 = setTimeout(scrollNow, 100);
    const t2 = setTimeout(scrollNow, 300);
    const t3 = setTimeout(scrollNow, 800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

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
    if (girlId) {
      // 选中女生：清空 AI教练消息，加载分析
      setMessages([]);
      setActiveSessionId(null);
      setActiveTabIndex(0);
      setGirlAnalysisContent('');
      loadGirlAnalysis(girlId);
    } else {
      // 取消选择：回到通用咨询，加载历史
      loadHistory('');
    }
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

    const assistantId = `asst-${Date.now()}`;

    // 一次性替换最后一条助手消息为新的空消息（避免两次 setMessages 造成的布局跳动）
    setMessages(prev => [
      ...prev.slice(0, -1),
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString()
      }
    ]);

    // 等待 React 提交 DOM 后滚动到底部
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = document.getElementById('chat-scroll-container');
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    });

    setLoading(true);
    setError('');
    setThinkingLabel(null);
    setReasoningContent('');
    reasoningContentRef.current = '';
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
          stream: true,
          girlId: selectedGirlId || undefined,
          regenerate: true
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // 始终使用流式模式
      if (false) {
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
                if (parsed.meta?.routedType) {
                  setThinkingLabel(`正在从「${parsed.meta.routedType}」视角分析...`);
                }
                if (parsed.reasoning) {
                  reasoningContentRef.current += parsed.reasoning;
                  setReasoningContent(reasoningContentRef.current);
                }
                if (parsed.content) {
                  setThinkingLabel(null);
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
            if (parsed.reasoning) {
              reasoningContentRef.current += parsed.reasoning;
              setReasoningContent(reasoningContentRef.current);
            }
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
      // 先清空聊天区域（避免 loadHistory 加载旧消息后闪烁）
      setMessages([]);
      setActiveSessionId(null);
      setError('');
      setThinkingLabel(null);
      setReasoningContent('');
      reasoningContentRef.current = '';
      streamingContentRef.current = '';
      // 刷新会话列表（旧会话标记为已归档，新会话在发送消息时自动创建）
      await loadHistory();
      // 再次确保清空（loadHistory 可能设回旧会话数据）
      setMessages([]);
      setActiveSessionId(null);
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

  // ====== 聊天实战 Handler ======

  // SSE 流式加载女生分析
  const loadGirlAnalysis = useCallback(async (girlId) => {
    if (!girlId) return;
    setGirlAnalysisLoading(true);
    setGirlAnalysisContent('');
    const token = localStorage.getItem('zhuiai_token');
    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/girl-summary/${girlId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('请求失败');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
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
            try {
              const parsed = JSON.parse(trimmed.substring(6));
              if (parsed.content) { accumulated += parsed.content; setGirlAnalysisContent(accumulated); }
            } catch {}
          }
        }
      }
      // fallback: 如果流中没有 content
      if (!accumulated) setGirlAnalysisContent('分析加载完成，可向我提问');
    } catch (e) {
      console.warn('[AICoach] loadGirlAnalysis failed:', e.message);
      setGirlAnalysisContent('暂无法加载分析，可直接向我提问');
    } finally {
      setGirlAnalysisLoading(false);
    }
  }, [apiUrl]);

  // 聊天实战 - 发送
  const handleCombatSend = useCallback(async () => {
    const text = combatInput.trim();
    if (!text || combatLoading || !selectedGirlId) return;
    setCombatInput('');
    const now = new Date().toISOString();
    const girlName = selectedGirl?.name || '女生';

    if (combatMode === 'suggest') {
      // 回复建议：先追加女生消息气泡
      const herMsg = { id: `combat-${Date.now()}`, role: 'girl', content: text, timestamp: now };
      setCombatHistories(prev => ({
        ...prev,
        [selectedGirlId]: [...(prev[selectedGirlId] || []), herMsg]
      }));
      setCombatSuggestions(null);
      setSelectedSuggestionIndex(null);
      setCombatLoading(true);
      try {
        const token = localStorage.getItem('zhuiai_token');
        const res = await fetch(`${apiUrl}/api/ai-coach/reply-suggestions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ girlId: selectedGirlId, lastMessage: text })
        });
        const data = await res.json();
        if (data.success && data.suggestions?.options?.length) {
          setCombatSuggestions({ type: 'suggestions', items: data.suggestions.options });
        } else {
          toast({ title: data.error || '获取建议失败', status: 'error', duration: 3000 });
        }
      } catch (e) {
        toast({ title: '网络错误', status: 'error', duration: 3000 });
      } finally {
        setCombatLoading(false);
      }
    } else {
      // 话术优化：不追加气泡，只调 API
      setLastDraftText(text);
      setCombatSuggestions(null);
      setSelectedSuggestionIndex(null);
      setCombatLoading(true);
      try {
        const token = localStorage.getItem('zhuiai_token');
        const res = await fetch(`${apiUrl}/api/ai-coach/optimize-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ girlId: selectedGirlId, originalReply: text })
        });
        const data = await res.json();
        if (data.success && data.optimizations?.length) {
          setCombatSuggestions({ type: 'optimizations', items: data.optimizations });
        } else {
          toast({ title: data.error || '优化失败', status: 'error', duration: 3000 });
        }
      } catch (e) {
        toast({ title: '网络错误', status: 'error', duration: 3000 });
      } finally {
        setCombatLoading(false);
      }
    }
  }, [combatInput, combatLoading, combatMode, selectedGirlId, selectedGirl, apiUrl, toast]);

  // 聊天实战 - 选中建议卡片
  const handleSelectSuggestion = useCallback((index) => {
    if (selectedSuggestionIndex !== null) return;
    const item = combatSuggestions?.items?.[index];
    if (!item) return;
    const replyText = item.reply || item.text || '';
    if (!replyText) return;
    setSelectedSuggestionIndex(index);
    const now = new Date().toISOString();
    const myMsg = { id: `combat-${Date.now()}`, role: 'user', content: replyText, timestamp: now };
    setCombatHistories(prev => ({
      ...prev,
      [selectedGirlId]: [...(prev[selectedGirlId] || []), myMsg]
    }));
  }, [selectedSuggestionIndex, combatSuggestions, selectedGirlId]);

  // 聊天实战 - 全部删除
  const handleDismissAllSuggestions = useCallback(() => {
    setCombatSuggestions(null);
    setSelectedSuggestionIndex(null);
  }, []);

  // 聊天实战 - 重新生成
  const handleRegenerateSuggestions = useCallback(() => {
    setCombatSuggestions(null);
    setSelectedSuggestionIndex(null);
    setCombatLoading(true);
    // 模拟延迟后重新发送请求
    setTimeout(() => {
      const token = localStorage.getItem('zhuiai_token');
      const lastId = selectedGirlId;
      if (!lastId) { setCombatLoading(false); return; }
      const history = combatHistories[lastId] || [];
      if (combatMode === 'suggest') {
        const lastGirlMsg = [...history].reverse().find(m => m.role === 'girl');
        if (!lastGirlMsg) { setCombatLoading(false); return; }
        fetch(`${apiUrl}/api/ai-coach/reply-suggestions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ girlId: lastId, lastMessage: lastGirlMsg.content })
        }).then(r => r.json()).then(data => {
          if (data.success && data.suggestions?.options?.length) {
            setCombatSuggestions({ type: 'suggestions', items: data.suggestions.options });
          }
        }).catch(() => {}).finally(() => setCombatLoading(false));
      } else {
        if (!lastDraftText) { setCombatLoading(false); return; }
        fetch(`${apiUrl}/api/ai-coach/optimize-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ girlId: lastId, originalReply: lastDraftText })
        }).then(r => r.json()).then(data => {
          if (data.success && data.optimizations?.length) {
            setCombatSuggestions({ type: 'optimizations', items: data.optimizations });
          }
        }).catch(() => {}).finally(() => setCombatLoading(false));
      }
    }, 500);
  }, [combatMode, selectedGirlId, combatHistories, lastDraftText, apiUrl]);

  // 聊天实战 - 直接发送原文（话术优化模式）
  const handleSendDirect = useCallback(() => {
    if (!lastDraftText) return;
    const now = new Date().toISOString();
    const myMsg = { id: `combat-${Date.now()}`, role: 'user', content: lastDraftText, timestamp: now };
    setCombatHistories(prev => ({
      ...prev,
      [selectedGirlId]: [...(prev[selectedGirlId] || []), myMsg]
    }));
    setCombatSuggestions(null);
    setSelectedSuggestionIndex(null);
    setLastDraftText('');
  }, [lastDraftText, selectedGirlId]);

  // 聊天实战 - 模式切换
  const handleCombatModeChange = useCallback((mode) => {
    setCombatMode(mode);
    setCombatInput('');
    setCombatSuggestions(null);
    setSelectedSuggestionIndex(null);
  }, []);

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
    setThinkingLabel(null);
    setReasoningContent('');
    reasoningContentRef.current = '';
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
          stream: true,
          girlId: selectedGirlId || undefined
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // 始终使用流式模式
      if (false) {
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
                if (parsed.meta?.routedType) {
                  setThinkingLabel(`正在从「${parsed.meta.routedType}」视角分析...`);
                }
                if (parsed.reasoning) {
                  reasoningContentRef.current += parsed.reasoning;
                  setReasoningContent(reasoningContentRef.current);
                }
                if (parsed.content) {
                  setThinkingLabel(null);
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

  const hasGirl = !!(selectedGirlId && selectedGirl);

  // ====== State 2: 选中女生 — 双 Tab 布局 ======
  if (hasGirl) {
    const currentCombatHistory = combatHistories[selectedGirlId] || [];

    // AI教练 with girl — 聊天面板（内联 JSX，避免每次渲染重置 DOM）
    const girlCoachChatContent = (
      <>
        <Box flex="1" minH="0" display="flex" flexDirection="column" bg="gray.800" borderRadius="md" mb={2} overflow="hidden">
          <Box id="chat-scroll-container" flex="1" overflowY="auto" p={4} ref={scrollContainerRef} overflowAnchor="none">
            {/* 女生分析内容 */}
            {girlAnalysisLoading ? (
              <Flex justify="flex-start" mb={4}>
                <HStack bg="gray.700" px={4} py={3} borderRadius="2xl" spacing={2}>
                  {[0, 150, 300].map((delay) => (
                    <Box key={delay} w="8px" h="8px" bg="teal.400" borderRadius="full"
                      animation={`bounce 1.4s infinite ease-in-out ${delay}ms`}
                      sx={{ '@keyframes bounce': { '0%,80%,100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1)' } } }}
                    />
                  ))}
                  <Text color="gray.400" fontSize="sm">正在分析{selectedGirl?.name || '女生'}...</Text>
                </HStack>
              </Flex>
            ) : girlAnalysisContent ? (
              <Flex justify="flex-start" mb={4}>
                <HStack align="flex-start" spacing={3}>
                  <Avatar size="sm" bg="teal.500" icon={<span>🤖</span>} />
                  <Box bg="gray.700" px={4} py={3} borderRadius="2xl" borderTopLeftRadius="sm" maxW="90%">
                    <Box fontSize="13px" lineHeight="1.7" color="gray.100">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          strong: ({ children }) => <Text as="strong" color="teal.300" fontWeight="bold">{children}</Text>,
                          p: ({ children }) => <Text mb={2}>{children}</Text>,
                          ul: ({ children }) => <Text as="ul" pl={4} mb={2}>{children}</Text>,
                          li: ({ children }) => <Text as="li" mb={1}>{children}</Text>,
                        }}
                      >{fixMarkdown(girlAnalysisContent)}</ReactMarkdown>
                    </Box>
                  </Box>
                </HStack>
              </Flex>
            ) : (
              <VStack spacing={4} py={8} justify="center" minH="200px">
                <Text color="gray.400" textAlign="center">
                  围绕{selectedGirl?.name || '女生'}的情况，向我提问
                </Text>
                <Wrap spacing={2} justify="center">
                  {QUICK_QUESTIONS.map((q, i) => (
                    <WrapItem key={i}>
                      <Button size="sm" variant="outline" colorScheme="teal"
                        onClick={() => handleSubmitInternal(q)} isDisabled={loading}>
                        {q}
                      </Button>
                    </WrapItem>
                  ))}
                </Wrap>
              </VStack>
            )}

            {/* 对话消息 */}
            {messages.length > 0 && messages.map((message, index) => {
              const isLastMessage = index === messages.length - 1;
              const prevIsUser = index > 0 && messages[index - 1]?.role === 'user';
              const isFirstAssistantAfterUser = message.role === 'assistant' && prevIsUser;
              const showReasoning = isFirstAssistantAfterUser && reasoningContent && isLastMessage;
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onCopy={handleCopy}
                  onRegenerate={handleRegenerate}
                  onHelpful={handleHelpful}
                  isStreaming={loading && isLastMessage && !message.content}
                  copiedId={copiedId}
                  helpfulId={helpfulId}
                  reasoning={showReasoning ? reasoningContent : null}
                  reasoningLoading={showReasoning && loading && !message.content}
                />
              );
            })}
            {error && (
              <Box mt={4} p={3} bg="red.900" borderRadius="md">
                <Text color="red.200">{error}</Text>
              </Box>
            )}
            <div ref={messagesEndRef} style={{ height: 1 }} />
          </Box>
        </Box>
        <InputArea
          onSubmit={handleSubmitInternal}
          loading={loading}
          deepMode={deepMode}
          onNewConversation={handleNewConversation}
          placeholder={`向 AI 教练提问${selectedGirl ? '（围绕' + selectedGirl.name + '）' : ''}...`}
          showNewConvBtn={false}
        />
      </>
    );

    return (
      <Box display="flex" flexDirection="column" h={{ base: 'calc(100vh - 96px)', lg: 'calc(100vh - 48px)' }} overflow="hidden">
        {/* Header */}
        <Flex justify="space-between" align="center" mb={2} flexShrink={0} gap={3} wrap="wrap">
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

        {/* Main: Left (Tabs) + Right (Context) */}
        <Flex flex="1" minH="0" overflow="hidden" gap={0}>
          {/* Left side */}
          <Box flex="1" minW="0" display="flex" flexDirection="column">
            <Tabs
              variant="soft-rounded" colorScheme="teal"
              index={activeTabIndex} onChange={setActiveTabIndex}
              sx={{ display: 'flex', flexDirection: 'column', flex: 1, minH: 0, overflow: 'hidden' }}
            >
              <TabList bg="gray.800" borderRadius="lg" p={1} flexShrink={0}>
                <Tab color="gray.400" _selected={{ color: 'white', bg: 'teal.600' }} fontSize="sm">
                  🤖 AI教练
                </Tab>
                <Tab color="gray.400" _selected={{ color: 'white', bg: 'teal.600' }} fontSize="sm">
                  💬 聊天实战
                </Tab>
              </TabList>

              <TabPanels sx={{ display: 'flex', flex: 1, minH: 0 }}>
                <TabPanel px={0} py={2} sx={{ display: 'flex', flexDirection: 'column', flex: 1, minH: 0, overflow: 'hidden' }}>
                  <Box flex="1" minH="0" display="flex" flexDirection="column" overflow="hidden">
                    {girlCoachChatContent}
                  </Box>
                </TabPanel>
                <TabPanel px={0} py={2} sx={{ display: 'flex', flexDirection: 'column', flex: 1, minH: 0, overflow: 'hidden' }}>
                  <Box flex="1" minH="0" display="flex" flexDirection="column" overflow="hidden">
                    <CombatChatPanel
                      history={currentCombatHistory}
                      suggestions={combatSuggestions}
                      selectedIndex={selectedSuggestionIndex}
                      onSelect={handleSelectSuggestion}
                      onRegenerate={handleRegenerateSuggestions}
                      onDismissAll={handleDismissAllSuggestions}
                      onSendDirect={handleSendDirect}
                      loading={combatLoading}
                      girlName={selectedGirl?.name}
                      combatMode={combatMode}
                    />
                    <CombatInputBar
                      mode={combatMode}
                      onModeChange={handleCombatModeChange}
                      value={combatInput}
                      onChange={setCombatInput}
                      onSubmit={handleCombatSend}
                      loading={combatLoading}
                      girlName={selectedGirl?.name}
                    />
                  </Box>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Box>

          {/* Right side: Context panel */}
          <GirlContextSidebar girl={selectedGirl} analysisContent={girlAnalysisContent} />
        </Flex>
      </Box>
    );
  }

  // ====== State 1: 通用咨询 — 3 Tab 布局（保持现有行为）======

  // Tab 1: AI教练（多轮对话）— 内联 JSX，避免每次渲染重置 DOM
  const aiCoachContent = (
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
        <Box id="chat-scroll-container" flex="1" overflowY="auto" p={4} ref={scrollContainerRef} overflowAnchor="none">
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
              {/* 对话消息 */}
              {messages.map((message, index) => {
                const isLastMessage = index === messages.length - 1;
                const prevIsUser = index > 0 && messages[index - 1]?.role === 'user';
                const isFirstAssistantAfterUser = message.role === 'assistant' && prevIsUser;
                const showReasoning = isFirstAssistantAfterUser && reasoningContent && isLastMessage;
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onCopy={handleCopy}
                    onRegenerate={handleRegenerate}
                    onHelpful={handleHelpful}
                    isStreaming={loading && isLastMessage && !message.content}
                    copiedId={copiedId}
                    helpfulId={helpfulId}
                    reasoning={showReasoning ? reasoningContent : null}
                    reasoningLoading={showReasoning && loading && !message.content}
                  />
                );
              })}
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

      <Tabs variant="soft-rounded" colorScheme="teal" sx={{ display: 'flex', flexDirection: 'column', flex: 1, minH: 0, overflow: 'hidden' }}>
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

        <TabPanels sx={{ display: 'flex', flex: 1, minH: 0 }}>
          <TabPanel px={0} py={2} sx={{ display: 'flex', flexDirection: 'column', flex: 1, minH: 0, overflow: 'hidden' }}>
            <Box flex="1" minH="0" display="flex" flexDirection="column" overflow="hidden">
              {aiCoachContent}
            </Box>
          </TabPanel>
          <TabPanel px={0} pt={4} overflowY="auto">
            <ReplySuggestionsPanel apiUrl={apiUrl} selectedGirlId={selectedGirlId} toast={toast} />
          </TabPanel>
          <TabPanel px={0} pt={4} overflowY="auto">
            <OptimizeReplyPanel apiUrl={apiUrl} selectedGirlId={selectedGirlId} toast={toast} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}

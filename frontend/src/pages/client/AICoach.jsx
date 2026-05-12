import { useState, useRef, useEffect, useLayoutEffect, useCallback, memo, useMemo } from 'react';
import {
  Box, VStack, HStack, Input, Button, Text, Card, CardBody, CardHeader,
  Heading, Select, Textarea, Spinner, Flex, Badge, Icon, Tooltip, useToast,
  Avatar, Wrap, WrapItem, useDisclosure, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalFooter, Tabs, TabList, TabPanels, Tab, TabPanel,
  Image, SimpleGrid, Switch, IconButton, Menu, MenuButton, MenuList, MenuItem
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { girls as girlsApi, analyzeChatHistory, deleteCombatMessage } from '../../utils/api';
import { captureError } from '../../utils/frontendErrorCapture';
import { FireIcon, SnowIcon, SparklesIcon, BrainIcon, InboxIcon } from '../../components/Icons';
import { marked } from 'marked';

// marked 配置：GFM 支持，链接新窗口打开
const renderer = new marked.Renderer();
renderer.link = function(href, title, text) {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};
marked.setOptions({ gfm: true, breaks: true, renderer });

// 渲染 Markdown → HTML（用 marked 替代 remark-gfm，兼容所有浏览器）
function renderMD(text) {
  if (!text) return '';
  try {
    return marked.parse(text);
  } catch {
    return text;
  }
}
import { Clipboard } from '@capacitor/clipboard';

// 共享 Markdown 渲染组件 — 全部使用原生 HTML 元素，让 CSS 控制排版
const markdownComponents = {
  h1: ({ node, ...props }) => <h1 {...props} />,
  h2: ({ node, ...props }) => <h2 {...props} />,
  h3: ({ node, ...props }) => <h3 {...props} />,
  h4: ({ node, ...props }) => <h4 {...props} />,
  p: ({ node, ...props }) => <p {...props} />,
  ul: ({ node, ...props }) => <ul {...props} />,
  ol: ({ node, ...props }) => <ol {...props} />,
  li: ({ node, ...props }) => <li {...props} />,
  blockquote: ({ node, ...props }) => <blockquote {...props} />,
  hr: ({ node, ...props }) => <hr {...props} />,
  pre: ({ node, ...props }) => <pre {...props} />,
  code: ({ node, inline, ...props }) =>
    inline ? <code {...props} /> : <code {...props} />,
  table: ({ node, ...props }) => <table {...props} />,
  thead: ({ node, ...props }) => <thead {...props} />,
  tbody: ({ node, ...props }) => <tbody {...props} />,
  tr: ({ node, ...props }) => <tr {...props} />,
  th: ({ node, ...props }) => <th {...props} />,
  td: ({ node, ...props }) => <td {...props} />,
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  strong: ({ node, ...props }) => <strong {...props} />,
  em: ({ node, ...props }) => <em {...props} />,
};

// 思考过程的组件 — 微调字号颜色
const reasoningMarkdownComponents = {
  ...markdownComponents,
  h1: ({ node, ...props }) => <h1 {...props} style={{ fontSize: '1.05em', color: 'rgba(245,240,232,0.75)' }} />,
  h2: ({ node, ...props }) => <h2 {...props} style={{ fontSize: '1em', color: 'rgba(245,240,232,0.75)' }} />,
  h3: ({ node, ...props }) => <h3 {...props} style={{ fontSize: '0.95em', color: 'rgba(245,240,232,0.7)' }} />,
  strong: ({ node, ...props }) => <strong {...props} style={{ color: 'rgba(226,176,68,0.8)' }} />,
};

/**
 * 修正 AI 产出的不规范 Markdown 格式
 * 只处理行首格式问题，避免破坏正常文本内容
 */
function fixMarkdown(text) {
  if (!text || typeof text !== 'string') return text;
  let fixed = text;

  // ---- 行首格式修复（只有行首才修，安全可靠）----
  // 标题：###text → ### text
  fixed = fixed.replace(/^(#{1,4})([^\s#\n])/gm, '$1 $2');

  // 引用：>text → > text
  fixed = fixed.replace(/^(>{1,2})([^\s>\n])/gm, '$1 $2');

  // 无序列表：-text → - text（不匹配 --- 分隔线）
  fixed = fixed.replace(/^-(?=[^\s-])([^\s\n])/gm, '- $1');

  // 有序列表：1.text → 1. text
  fixed = fixed.replace(/^(\d+\.)([^\s\n])/gm, '$1 $2');

  // ---- 粗体格式修复 ----
  // ** text ** → **text**
  fixed = fixed.replace(/\*\*\s+([^*]+?)\s+\*\*/g, '**$1**');
  // __ text __ → __text__
  fixed = fixed.replace(/__\s+([^_]+?)\s+__/g, '__$1__');

  // ---- 清理多余空行 ----
  fixed = fixed.replace(/\n{3,}/g, '\n\n');

  return fixed;
}

const STAGE_COLORS = {
  '陌生': 'gray',
  '搭讪': 'blue',
  '聊天': 'cyan',
  '暧昧': 'orange',
  '约会': 'green',
  '长期': 'gold'
};

function getHeatLevel(score) {
  if (score >= 7) return 'hot';
  if (score >= 5) return 'warm';
  return 'cold';
}


// 独立的输入区域组件 - 使用完全独立的本地状态
const InputArea = memo(({ onSubmit, onImageSubmit, onStop, loading, deepMode, onDeepModeToggle, onNewConversation, placeholder, showNewConvBtn = true }) => {
  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState(null); // { file, preview }
  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const toast = useToast();

  const handleImageSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast?.({ title: '图片大小不能超过10MB', status: 'warning' });
      return;
    }
    const preview = URL.createObjectURL(file);
    setAttachedImage({ file, preview });
    e.target.value = '';
  }, [toast]);

  const removeAttachedImage = useCallback(() => {
    if (attachedImage?.preview) {
      URL.revokeObjectURL(attachedImage.preview);
    }
    setAttachedImage(null);
  }, [attachedImage]);

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

  // 清空输入后重置 textarea 高度
  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input]);

  const handleSubmitClick = useCallback(() => {
    if (attachedImage) {
      // 有图片时调用 onImageSubmit
      if (input.trim()) {
        onImageSubmit(attachedImage.file, input.trim());
      } else {
        onImageSubmit(attachedImage.file, '');
      }
      setInput('');
      if (attachedImage.preview) {
        URL.revokeObjectURL(attachedImage.preview);
      }
      setAttachedImage(null);
      return;
    }
    if (input.trim()) {
      const textToSubmit = input;
      setInput('');
      onSubmit(textToSubmit);
    }
  }, [input, onSubmit, onImageSubmit, attachedImage]);

  const defaultPlaceholder = deepMode ? '描述情况，深度分析...' : '描述你的情况...';

  return (
    <Box bg="warm.800" borderRadius="md" p={3} flexShrink={0}>
      <Flex gap={2} align="center">
        {/* 图片上传按钮 */}
        <Tooltip label="添加图片">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => imageInputRef.current?.click()}
            disabled={loading}
            p={1}
            minW="36px"
          >
            <Icon as={InboxIcon} boxSize={4} color="rgba(245,240,232,0.6)" />
          </Button>
        </Tooltip>
        <input
          type="file"
          ref={imageInputRef}
          accept="image/*"
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />
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
            backgroundColor: 'var(--warm-matte)',
            border: 'none',
            borderRadius: '6px',
            color: 'var(--w80)',
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
          colorScheme={loading ? 'red' : 'gold'}
          onClick={loading ? onStop : handleSubmitClick}
          disabled={!loading && !input.trim() && !attachedImage}
          px={4}
        >
          {loading ? '停止' : '发送'}
        </Button>
              </Flex>
      {/* 图片预览 */}
      {attachedImage && (
        <Flex mt={2} gap={2} align="center">
          <Box position="relative" display="inline-block">
            <img
              src={attachedImage.preview}
              alt="attached"
              style={{
                maxWidth: '120px',
                maxHeight: '80px',
                borderRadius: '6px',
                objectFit: 'cover'
              }}
            />
            <button
              type="button"
              onClick={removeAttachedImage}
              style={{
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.7)',
                border: 'none',
                color: 'white',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
          </Box>
        </Flex>
      )}
    </Box>
  );
});

// ====== 会话选择栏（模块级组件） ======
const SessionBar = memo(({
  sessions, activeSessionId, selectedGirlId, loading,
  onSelectSession, onNewSession, deepMode, onDeepModeToggle
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
    <Flex align="center" gap={1} flexShrink={0} px={1} py={1}>
      <Select
        value={activeSessionId || ''}
        onChange={e => {
          const val = e.target.value;
          if (val === '') {
            if (activeSessionId) onNewSession();
          } else {
            onSelectSession(val);
          }
        }}
        bg="warm.700" border="none" color="white" size="xs"
        flex={1} maxW="140px"
        borderRadius="md"
        isDisabled={loading}
      >
        <option value="">+ 新会话</option>
        {displaySessions.map(s => (
          <option key={s.id} value={s.id}>{formatTime(s.createdAt)}</option>
        ))}
      </Select>
      <IconButton
        icon={<AddIcon />}
        size="xs"
        variant="ghost"
        colorScheme="gold"
        onClick={onNewSession}
        isLoading={loading}
        isDisabled={!activeSessionId}
        aria-label="新建会话"
        flexShrink={0}
      />
      {onDeepModeToggle ? (
        <Flex align="center" gap={1} flexShrink={0} ml={1}>
          <Text fontSize="9px" color={deepMode ? 'gold.300' : 'warm.300'} fontWeight="bold">
            {deepMode ? '深度' : '快速'}
          </Text>
          <Switch
            size="sm"
            isChecked={deepMode}
            onChange={onDeepModeToggle}
            colorScheme="orange"
          />
        </Flex>
      ) : null}
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
        body: JSON.stringify({ girlId: selectedGirlId, lastMessage: replyInput, style: style || undefined })
      });
      if (!res.ok) throw new Error(`回复建议请求失败 (${res.status})`);
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
      await Clipboard.write({ string: text });
      toast({ title: '已复制', status: 'success', duration: 2000 });
    } catch (e) {
      // Fallback for web
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;left:-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        toast({ title: '已复制', status: 'success', duration: 2000 });
      } catch (e2) {
        captureError(e2, { context: 'copyToClipboard' });
        toast({ title: '复制失败', status: 'error', duration: 2000 });
      }
    }
  }, [toast]);

  return (
    <>
      <Card bg="warm.800">
        <CardBody>
          <VStack spacing={4} align="stretch">
            <Box>
              <Text color="rgba(245,240,232,0.6)" fontSize="sm" mb={2}>女生最后一条消息</Text>
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
                  backgroundColor: 'var(--warm-matte)', border: 'none', borderRadius: '6px', color: 'var(--w80)',
                  width: '100%', height: '72px', minHeight: '72px', maxHeight: '100px',
                  padding: '8px 12px', resize: 'none', overflowY: 'hidden', outline: 'none',
                  fontSize: '14px', fontFamily: 'inherit', lineHeight: '1.4', boxSizing: 'border-box'
                }}
              />
            </Box>
            <HStack spacing={3}>
              <Box flex={1}>
                <Text color="rgba(245,240,232,0.6)" fontSize="sm" mb={2}>回复风格（可选）</Text>
                <Menu>
                  <MenuButton as={Button} size="sm" variant="outline" borderColor="warm.600" _hover={{ bg: 'warm.700' }} rightIcon={<Text fontSize="xs">▼</Text>} w="full">
                    {replyStyle || '不选则返回多种风格'}
                  </MenuButton>
                  <MenuList bg="warm.800" borderColor="warm.600" minW="140px">
                    {['稳妥型', '推进型', '调侃型'].map(opt => (
                      <MenuItem key={opt} _hover={{ bg: 'warm.700' }} onClick={() => { setReplyStyle(opt); setReplyStyleCustom(''); }}>{opt}</MenuItem>
                    ))}
                  </MenuList>
                </Menu>
              </Box>
              <Box flex={1}>
                <Text color="rgba(245,240,232,0.6)" fontSize="sm" mb={2}>或自定义风格</Text>
                <Input value={replyStyleCustom} onChange={e => { setReplyStyleCustom(e.target.value); setReplyStyle(''); }} placeholder="如：更幽默、更直接" bg="warm.700" border="none" color="white" />
              </Box>
            </HStack>
            <Button colorScheme="gold" onClick={handleGetReplySuggestions} isLoading={replyLoading} isDisabled={!replyInput.trim()} leftIcon={<Icon as={BrainIcon} />}>
              获取回复建议
            </Button>
            {replySuggestions && (
              <VStack spacing={3} align="stretch" mt={2}>
                <Flex justify="space-between" align="center">
                  <Text color="rgba(245,240,232,0.4)" fontSize="sm">生成 {replySuggestions.options?.length || 0} 个回复方案</Text>
                  {replySuggestions.relationshipStageLabel && <Badge colorScheme="gold">{replySuggestions.relationshipStageLabel}</Badge>}
                </Flex>
                {(replySuggestions.options || []).map((opt, idx) => (
                  <Box key={idx} bg="warm.700" p={4} borderRadius="md">
                    <Flex justify="space-between" align="center" mb={2}>
                      <Badge colorScheme={opt.type === '稳妥型' ? 'blue' : opt.type === '推进型' ? 'red' : opt.type === '调侃型' ? 'orange' : 'gray'}>{opt.type}</Badge>
                      <Button size="xs" variant="ghost" colorScheme="gold" onClick={() => copyToClipboard(opt.reply)}>复制</Button>
                    </Flex>
                    <Text color="white" mb={2}>{opt.reply}</Text>
                    {opt.intention && <Text color="rgba(245,240,232,0.2)" fontSize="xs" mb={1}>目的：{opt.intention}</Text>}
                    {opt.stageAdvice && <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>📍 {opt.stageAdvice}</Text>}
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
        body: JSON.stringify({ originalReply: optimizeInput, girlId: selectedGirlId, goal: goal || undefined })
      });
      if (!res.ok) throw new Error(`话术优化请求失败 (${res.status})`);
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
      await Clipboard.write({ string: text });
      toast({ title: '已复制', status: 'success', duration: 2000 });
    } catch (e) {
      // Fallback for web
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;left:-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        toast({ title: '已复制', status: 'success', duration: 2000 });
      } catch (e2) {
        captureError(e2, { context: 'copyToClipboard' });
        toast({ title: '复制失败', status: 'error', duration: 2000 });
      }
    }
  }, [toast]);

  return (
    <>
      <Card bg="warm.800">
        <CardBody>
          <VStack spacing={4} align="stretch">
            <Box>
              <Text color="rgba(245,240,232,0.6)" fontSize="sm" mb={2}>你想说的话</Text>
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
                  backgroundColor: 'var(--warm-matte)', border: 'none', borderRadius: '6px', color: 'var(--w80)',
                  width: '100%', height: '72px', minHeight: '72px', maxHeight: '100px',
                  padding: '8px 12px', resize: 'none', overflowY: 'hidden', outline: 'none',
                  fontSize: '14px', fontFamily: 'inherit', lineHeight: '1.4', boxSizing: 'border-box'
                }}
              />
            </Box>
            <HStack spacing={3}>
              <Box flex={1}>
                <Text color="rgba(245,240,232,0.6)" fontSize="sm" mb={2}>优化方向（可选）</Text>
                <Menu>
                  <MenuButton as={Button} size="sm" variant="outline" borderColor="warm.600" _hover={{ bg: 'warm.700' }} rightIcon={<Text fontSize="xs">▼</Text>} w="full">
                    {optimizeGoal || '不选则自动优化'}
                  </MenuButton>
                  <MenuList bg="warm.800" borderColor="warm.600" minW="140px">
                    {['更幽默', '更暧昧', '更自然', '更真诚'].map(opt => (
                      <MenuItem key={opt} _hover={{ bg: 'warm.700' }} onClick={() => { setOptimizeGoal(opt); setOptimizeGoalCustom(''); }}>{opt}</MenuItem>
                    ))}
                  </MenuList>
                </Menu>
              </Box>
              <Box flex={1}>
                <Text color="rgba(245,240,232,0.6)" fontSize="sm" mb={2}>或自定义方向</Text>
                <Input value={optimizeGoalCustom} onChange={e => { setOptimizeGoalCustom(e.target.value); setOptimizeGoal(''); }} placeholder="如：更俏皮、更温柔" bg="warm.700" border="none" color="white" />
              </Box>
            </HStack>
            <Button colorScheme="gold" onClick={handleOptimizeReply} isLoading={optimizeLoading} isDisabled={!optimizeInput.trim()} leftIcon={<Icon as={SparklesIcon} />}>
              优化话术
            </Button>
            {optimizedReplies && (
              <VStack spacing={3} align="stretch" mt={2}>
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">原始：<Text as="span" color="rgba(245,240,232,0.6)">{optimizeInput}</Text></Text>
                {(optimizedReplies || []).map((opt, idx) => (
                  <Box key={idx} bg="warm.700" p={4} borderRadius="md">
                    <Flex justify="space-between" align="center" mb={2}>
                      <Badge colorScheme="gold">{opt.style}</Badge>
                      <Button size="xs" variant="ghost" colorScheme="gold" onClick={() => copyToClipboard(opt.text)}>复制</Button>
                    </Flex>
                    <Text color="white" mb={2}>{opt.text}</Text>
                    <Text color="rgba(245,240,232,0.2)" fontSize="xs" mb={1}>{opt.point}</Text>
                    {opt.stageAdvice && <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>📍 {opt.stageAdvice}</Text>}
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

// 过滤思考过程中的元信息（开头的约束理解 + 结尾的结构规划），只保留中间实际分析
function filterReasoning(text) {
  if (!text) return '';
  // 不要分割文本，保持 Markdown 结构完整
  // 直接返回原文，由 marked 负责渲染
  return text;
}

// 分析思考过程组件 — 内嵌在女生分析气泡顶部，可折叠
const AnalysisReasoning = memo(({ reasoning, loading }) => {
  const [open, setOpen] = useState(true);
  if (!reasoning) return null;
  return (
    <>
      <Flex
        as="button" onClick={() => setOpen(!open)}
        w="100%" px={4} py={2} align="center" gap={2}
        _hover={{ bg: 'whiteAlpha.50' }}
      >
        <Text fontSize="xs" color="gold.300">
          {open ? '▼' : '▶'} 思考过程{loading ? ' · 生成中...' : ''}
        </Text>
        {loading && (
          <Box w="6px" h="6px" bg="gold.400" borderRadius="full"
            animation="pulse 1s infinite"
            sx={{ '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }}
          />
        )}
      </Flex>
      {open && (
        <Box px={4} py={3} maxH="260px" overflowY="auto" borderBottom="1px solid" borderColor="whiteAlpha.200">
          <Text fontSize="13px" color="rgba(245,240,232,0.6)" lineHeight="1.8" whiteSpace="pre-wrap">{filterReasoning(reasoning)}</Text>
        </Box>
      )}
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
      {/* 头像已移除以增加内容空间 */}
      <Box
        maxW="85%"
        className="bubble-glow"
        bg={isUser ? 'linear-gradient(135deg, rgba(226,176,68,0.88), rgba(201,127,89,0.82))' : 'rgba(255,255,255,0.06)'}
        border={isUser ? 'none' : '1px solid rgba(226,176,68,0.12)'}
        color={isUser ? 'rgba(30,20,0,0.9)' : 'rgba(255,255,255,0.92)'}
        px={hasReasoning ? 0 : 4}
        py={hasReasoning ? 0 : 3}
        borderRadius="18px 4px 18px 18px"
        boxShadow={isUser ? '0 4px 16px rgba(226,176,68,0.20)' : 'none'}
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
              <Text fontSize="xs" color="gold.300">
                {reasoningOpen ? '▼' : '▶'} 思考过程{reasoningLoading ? ' · 生成中...' : ''}
              </Text>
              {reasoningLoading && (
                <Box w="6px" h="6px" bg="gold.400" borderRadius="full"
                  animation="pulse 1s infinite"
                  sx={{ '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }}
                />
              )}
            </Flex>
            {reasoningOpen && (
              <Box px={4} py={3} maxH="260px" overflowY="auto" borderBottom="1px solid" borderColor="whiteAlpha.200">
                <Box className="ai-coach-markdown" fontSize="13px" lineHeight="1.8" color="rgba(245,240,232,0.6)">
                  <Box dangerouslySetInnerHTML={{ __html: renderMD(filterReasoning(reasoning)) }} />
                </Box>
              </Box>
            )}
            {/* 正式回复内容 */}
            <Box px={4} py={3}>
              {message.content ? (
                <Box className="ai-coach-markdown" fontSize="14px" lineHeight="1.8" color="warm.50">
                  <Box dangerouslySetInnerHTML={{ __html: renderMD(fixMarkdown(message.content)) }} />
                </Box>
              ) : (
                reasoningLoading && (
                  <HStack spacing={2}>
                    {[0, 150, 300].map((delay) => (
                      <Box key={delay} w="8px" h="8px" bg="gold.400" borderRadius="full"
                        animation={`bounce 1.4s infinite ease-in-out ${delay}ms`}
                        sx={{ '@keyframes bounce': { '0%,80%,100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1)' } } }}
                      />
                    ))}
                    <Text color="rgba(245,240,232,0.4)" fontSize="sm">思考中...</Text>
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
              <>
                {message.imageUrl && (
                  <Image
                    src={message.imageUrl}
                    alt="attached"
                    maxWidth="200px"
                    maxHeight="150px"
                    borderRadius="md"
                    mb={2}
                    objectFit="cover"
                  />
                )}
                <Text whiteSpace="pre-wrap">{message.content}</Text>
              </>
            ) : (
              <Box className="ai-coach-markdown" fontSize="14px" lineHeight="1.8" color="warm.50">
                <Box dangerouslySetInnerHTML={{ __html: renderMD(fixMarkdown(message.content)) }} />
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
                color="rgba(245,240,232,0.4)"
                onClick={() => onCopy(message.content, message.id)}
                _hover={{ color: 'gold.400' }}
              >
                {copiedId === message.id ? '已复制' : '复制'}
              </Button>
            </Tooltip>
            <Tooltip label="重新生成" placement="top">
              <Button
                size="xs"
                variant="ghost"
                color="rgba(245,240,232,0.4)"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onRegenerate(message.content)}
                _hover={{ color: 'gold.400' }}
              >
                重新生成
              </Button>
            </Tooltip>
            <Tooltip label="有帮助" placement="top">
              <Button
                size="xs"
                variant="ghost"
                color="rgba(245,240,232,0.4)"
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
                color="rgba(245,240,232,0.4)"
                onClick={() => onHelpful(message.id, false)}
                _hover={{ color: 'red.400' }}
              >
                👎
              </Button>
            </Tooltip>
            {helpfulId === message.id && (
              <Text fontSize="xs" color="rgba(245,240,232,0.2)" align="center">感谢反馈</Text>
            )}
          </Flex>
        )}

        {/* 思考中动画 */}
        {isStreaming && message.role === 'assistant' && !message.content && (
          <HStack spacing={1} mt={2}>
            <Spinner size="xs" color="gold.400" />
            <Text fontSize="xs" color="rgba(245,240,232,0.4)">AI思考中...</Text>
          </HStack>
        )}
      </Box>
      {/* 用户头像已移除以增加内容空间 */}
    </Flex>
  );
}

// ====== 聊天实战子组件 ======

// 聊天实战消息气泡（girl/me 两种角色）
const CombatChatMessage = memo(({ msg, girlName, onDelete }) => {
  const [hovered, setHovered] = useState(false);
  const isGirl = msg.role === 'girl';
  const timeStr = msg.timestamp
    ? (typeof msg.timestamp === 'string'
        ? new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
    : null;
  return (
    <Flex justify={isGirl ? 'flex-start' : 'flex-end'} mb={3} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <Box maxW="85%">
        <Flex justify={isGirl ? 'flex-start' : 'flex-end'} mb={1} gap={1} align="center">
          <Text fontSize="11px" color="rgba(245,240,232,0.4)" textAlign={isGirl ? 'left' : 'right'}>
            {isGirl ? (girlName || '女生') : '我'}
          </Text>
          {timeStr && (
            <Text fontSize="10px" color="rgba(245,240,232,0.55)">{timeStr}</Text>
          )}
          {hovered && onDelete && (
            <Text
              fontSize="12px"
              cursor="pointer"
              color="rgba(245,240,232,0.5)"
              _hover={{ color: 'red.400' }}
              onClick={() => onDelete(msg.id)}
            >
              🗑
            </Text>
          )}
        </Flex>
        <Box
          bg={isGirl ? 'warm.700' : 'warm.700'}
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

// 单张建议/优化卡片（带复制/收藏/风险可视化）
const SuggestionCard = memo(({ item, index, isSelected, isDismissed, onSelect, onCopy, onFavorite, isSaved }) => {
  const [hovered, setHovered] = useState(false);
  const text = item.reply || item.text || '';
  const style = item.type || item.style || '';
  const subtext = item.intention || item.point || '';
  const riskLevel = item.riskLevel || '';
  const riskNote = item.riskNote || '';

  // 风险等级左边框颜色
  const riskBorderColor = riskLevel === '高' ? 'red.500' : riskLevel === '中' ? 'orange.400' : null;

  return (
    <Box
      onClick={() => !isSelected && !isDismissed && onSelect(index)}
      bg={isSelected ? 'rgba(16,185,129,0.1)' : 'warm.700'}
      border="1px solid"
      borderLeft={riskBorderColor ? `3px solid var(--chakra-colors-${riskBorderColor.replace('.', '-')})` : undefined}
      borderColor={isSelected ? 'green.500' : hovered ? 'gold.400' : 'rgba(245,240,232,0.08)'}
      borderRadius="lg"
      p={3}
      cursor={isSelected || isDismissed ? 'default' : 'pointer'}
      opacity={isDismissed ? 0.3 : 1}
      transform={isDismissed ? 'scale(0.95)' : 'none'}
      transition="all 0.15s"
      position="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      _hover={!isSelected && !isDismissed ? { bg: hovered ? 'warm.600' : 'warm.700' } : {}}
    >
      {/* 操作栏（hover 或已收藏时显示） */}
      {(hovered || isSaved) && !isDismissed && (
        <Flex gap={1} mb={1.5} justify="flex-end">
          <Button size="xs" variant="ghost" color="rgba(245,240,232,0.4)" fontSize="10px"
            p={0} minW="20px" h="20px" onClick={(e) => { e.stopPropagation(); onCopy(text); }}
            title="复制内容">📋</Button>
          <Button size="xs" variant="ghost" color={isSaved ? 'pink.400' : 'rgba(245,240,232,0.4)'} fontSize="10px"
            p={0} minW="20px" h="20px" onClick={(e) => { e.stopPropagation(); onFavorite(item); }}
            title={isSaved ? '已收藏' : '收藏'}>{isSaved ? '❤️' : '🤍'}</Button>
        </Flex>
      )}

      {isSelected && (
        <Badge colorScheme="green" fontSize="10px" position="absolute" top={2} right={2}>
          ✓ 已选用
        </Badge>
      )}
      {style && (
        <Badge colorScheme={STYLE_COLORS[style] || 'gray'} fontSize="10px" mb={1} variant="subtle">
          {style}
        </Badge>
      )}
      <Text fontSize="13px" lineHeight="1.6">{text}</Text>
      {subtext && <Text fontSize="11px" color="rgba(245,240,232,0.4)" mt={1}>{subtext}</Text>}
      {riskNote && riskNote !== '无' && <Text fontSize="11px" color="orange.300" mt={1}>⚠ {riskNote}</Text>}
      {riskLevel && riskLevel !== '低' && !riskNote && (
        <Text fontSize="10px" color={riskLevel === '高' ? 'red.300' : 'orange.300'} mt={1}>
          {riskLevel === '高' ? '⚠ 高风险' : '⚡ 中风险'}
        </Text>
      )}
    </Box>
  );
});

// 建议卡片组容器
const SuggestionGroup = memo(({
  suggestions, selectedIndex, onSelect, onRegenerate,
  onDismissAll, onSendDirect, loading, girlName, mode,
  onCopy, onFavorite, isSaved
}) => {
  if (!suggestions && !loading) return null;

  const items = suggestions?.items || [];
  const type = suggestions?.type || (mode === 'optimize' ? 'optimizations' : 'suggestions');

  return (
    <Box
      borderLeft="2px solid" borderColor="gold.500"
      pl={3} my={4}
    >
      {/* Header */}
      <Flex align="center" gap={2} mb={2}>
        <Text fontSize="11px" color="rgba(245,240,232,0.4)" letterSpacing=".5px">
          {type === 'suggestions' ? `💡 回复建议 (${girlName || '女生'})` : '⚡ 话术优化'}
        </Text>
        <Flex gap={1} ml="auto">
          <Button size="xs" variant="ghost" fontSize="10px" color="rgba(245,240,232,0.4)"
            onClick={onRegenerate} isLoading={loading}
          >🔄 重新生成</Button>
          {mode === 'optimize' && onSendDirect && (
            <Button size="xs" variant="ghost" fontSize="10px" color="green.300"
              onClick={onSendDirect}
            >📤 直接发送原文</Button>
          )}
          <Button size="xs" variant="ghost" fontSize="10px" color="rgba(245,240,232,0.4)"
            onClick={onDismissAll}
          >✕ 全部删除</Button>
        </Flex>
      </Flex>

      {/* Cards */}
      {loading ? (
        <Flex justify="center" py={4}>
          <HStack spacing={2}>
            {[0, 150, 300].map((delay) => (
              <Box key={delay} w="8px" h="8px" bg="gold.400" borderRadius="full"
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
              onCopy={onCopy}
              onFavorite={onFavorite}
              isSaved={isSaved?.some(s => s.reply === (item.reply || item.text))}
            />
          ))}
        </VStack>
      ) : (
        <Text fontSize="12px" color="rgba(245,240,232,0.2)" textAlign="center" py={3}>
          AI 暂未生成建议，请重试
        </Text>
      )}
    </Box>
  );
});

// 聊天截图导入弹窗
const ImportChatModal = memo(({ isOpen, onClose, girlId, girlName, apiUrl, onImportComplete, toast }) => {
  const [step, setStep] = useState('upload'); // 'upload' | 'recognizing' | 'confirm' | 'importing'
  const [images, setImages] = useState([]); // File[]
  const [chatDate, setChatDate] = useState(new Date().toISOString().split('T')[0]);
  const [messages, setMessages] = useState([]); // [{role, content, time, index}]
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 10) {
      toast({ title: '最多选择10张截图', status: 'warning', duration: 2000 });
      files.splice(10);
    }
    setImages(prev => [...prev, ...files].slice(0, 10));
    e.target.value = '';
  }, [toast]);

  const removeImage = useCallback((idx) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleRecognize = useCallback(async () => {
    if (images.length === 0) return;
    setStep('recognizing');
    const formData = new FormData();
    images.forEach(f => formData.append('images', f));
    formData.append('girlId', girlId);
    formData.append('chatDate', chatDate);

    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/import-chat-screenshots`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('zhuiai_token')}` },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        if (data.messages.length === 0) {
          toast({ title: '未识别到对话内容，请换张截图试试', status: 'warning', duration: 3000 });
          setStep('upload');
        } else {
          setMessages(data.messages.map((m, i) => ({ ...m, index: i })));
          setStep('confirm');
        }
      } else {
        toast({ title: data.error || '识别失败', status: 'error', duration: 3000 });
        setStep('upload');
      }
    } catch {
      toast({ title: '识别请求失败，请重试', status: 'error', duration: 3000 });
      setStep('upload');
    }
  }, [images, chatDate, girlId, apiUrl, toast]);

  const confirmImport = useCallback(async () => {
    setStep('importing');
    const ts = new Date(chatDate + 'T00:00:00');
    onImportComplete(messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: ts.toISOString()
    })));
    onClose();
    // 重置状态
    setTimeout(() => {
      setStep('upload');
      setImages([]);
      setMessages([]);
      setEditingIndex(null);
      setChatDate(new Date().toISOString().split('T')[0]);
    }, 300);
  }, [messages, onImportComplete, onClose]);

  const toggleRole = useCallback((idx) => {
    setMessages(prev => prev.map((m, i) =>
      i === idx ? { ...m, role: m.role === 'girl' ? 'user' : 'girl' } : m
    ));
  }, []);

  const deleteMessage = useCallback((idx) => {
    setMessages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const startEdit = useCallback((idx) => {
    const msg = messages.find(m => m.index === idx);
    if (msg) { setEditingIndex(idx); setEditValue(msg.content); }
  }, [messages]);

  const saveEdit = useCallback(() => {
    if (editingIndex !== null) {
      setMessages(prev => prev.map(m => m.index === editingIndex ? { ...m, content: editValue.trim() || m.content } : m));
    }
    setEditingIndex(null);
    setEditValue('');
  }, [editingIndex, editValue]);

  const handleClose = useCallback(() => {
    if (step === 'recognizing' || step === 'importing') return;
    onClose();
    setTimeout(() => {
      setStep('upload');
      setImages([]);
      setMessages([]);
      setEditingIndex(null);
    }, 300);
  }, [step, onClose]);

  const isBusy = step === 'recognizing' || step === 'importing';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl" closeOnOverlayClick={!isBusy}>
      <ModalOverlay />
      <ModalContent bg="warm.800" borderColor="rgba(245,240,232,0.1)" color="white" maxW="640px">
        <ModalHeader fontSize="md" borderBottom="1px solid" borderColor="rgba(245,240,232,0.08)">
          导入聊天截图 {girlName ? `- ${girlName}` : ''}
        </ModalHeader>

        <ModalBody py={4}>
          {step === 'upload' && (
            <VStack spacing={4} align="stretch">
              <Text fontSize="13px" color="rgba(245,240,232,0.5)">
                上传你和{girlName || '女生'}在其他平台（微信等）的聊天截图，AI 会自动识别对话内容并导入到聊天实战中。
              </Text>
              {/* 图片选择 */}
              <Box>
                <Button as="label" size="sm" variant="outline" colorScheme="gold" cursor="pointer" leftIcon={<span>+</span>}>
                  选择截图
                  <input type="file" multiple accept="image/*" hidden onChange={handleFileSelect} />
                </Button>
                <Text as="span" ml={2} fontSize="12px" color="rgba(245,240,232,0.4)">{images.length}/10 张</Text>
              </Box>
              {/* 预览 */}
              {images.length > 0 && (
                <Flex wrap="wrap" gap={2} maxH="160px" overflowY="auto">
                  {images.map((file, idx) => (
                    <Box key={idx} position="relative" w="80px" h="80px" flexShrink={0}>
                      <Box as="img" src={URL.createObjectURL(file)} w="100%" h="100%" objectFit="cover"
                        borderRadius="md" border="1px solid" borderColor="rgba(245,240,232,0.15)" />
                      <Button size="xs" position="absolute" top="-6px" right="-6px"
                        borderRadius="full" w="20px" h="20px" minW="20px" p={0}
                        bg="red.500" color="white" fontSize="10px"
                        onClick={() => removeImage(idx)}>×</Button>
                    </Box>
                  ))}
                </Flex>
              )}
              {/* 日期 */}
              <Box>
                <Text fontSize="12px" color="rgba(245,240,232,0.4)" mb={1}>聊天日期</Text>
                <Input type="date" value={chatDate} onChange={e => setChatDate(e.target.value)}
                  bg="warm.700" border="none" color="white" fontSize="13px" size="sm" maxW="200px" />
              </Box>
            </VStack>
          )}

          {step === 'recognizing' && (
            <VStack spacing={3} py={8}>
              <Spinner color="gold.400" />
              <Text fontSize="13px" color="rgba(245,240,232,0.5)">正在识别对话内容...</Text>
            </VStack>
          )}

          {step === 'confirm' && (
            <VStack spacing={3} align="stretch">
              <Flex justify="space-between" align="center" mb={-1}>
                <Text fontSize="13px" color="gold.300">已识别 {messages.length} 条消息，请确认：</Text>
                <Flex gap={1} align="center">
                  <Text fontSize="11px" color="rgba(245,240,232,0.4)">聊天日期</Text>
                  <Input type="date" value={chatDate} onChange={e => setChatDate(e.target.value)}
                    bg="warm.700" border="none" color="white" fontSize="11px" size="xs" w="130px" />
                </Flex>
              </Flex>
              <Box maxH="360px" overflowY="auto" sx={{
                '&::-webkit-scrollbar': { width: '4px' },
                '&::-webkit-scrollbar-thumb': { bg: 'rgba(245,240,232,0.15)', borderRadius: '2px' }
              }}>
                <VStack spacing={2} align="stretch">
                  {messages.map((msg) => (
                    <Flex key={msg.index} gap={2} align="center"
                      justify={msg.role === 'user' ? 'flex-end' : 'flex-start'}>
                      {msg.role === 'girl' && (
                        <Button size="xs" variant="ghost" color="rgba(245,240,232,0.3)" fontSize="10px"
                          p={0} minW="24px" onClick={() => toggleRole(msg.index)} title="切换为女">👧</Button>
                      )}
                      {editingIndex === msg.index ? (
                        <Flex gap={1} flex={1}>
                          <Textarea value={editValue} onChange={e => setEditValue(e.target.value)}
                            bg="warm.700" color="white" fontSize="13px" size="sm" rows={2} flex={1}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } }} />
                          <Button size="xs" colorScheme="gold" onClick={saveEdit}>保存</Button>
                        </Flex>
                      ) : (
                        <Box
                          px={3} py={2} borderRadius="lg" maxW="70%" fontSize="13px" cursor="pointer"
                          bg={msg.role === 'user' ? 'gold.600' : 'rgba(245,240,232,0.1)'}
                          color="white"
                          onClick={() => startEdit(msg.index)}
                          title="点击编辑内容"
                        >
                          {msg.content}
                          {msg.time && <Text fontSize="10px" color="rgba(245,240,232,0.35)" mt={0.5}>{msg.time}</Text>}
                        </Box>
                      )}
                      {msg.role === 'user' && (
                        <Button size="xs" variant="ghost" color="rgba(245,240,232,0.3)" fontSize="10px"
                          p={0} minW="24px" onClick={() => toggleRole(msg.index)} title="切换为我">🙋</Button>
                      )}
                      <Button size="xs" variant="ghost" color="red.400" fontSize="12px"
                        p={0} minW="20px" onClick={() => deleteMessage(msg.index)} title="删除此条">×</Button>
                    </Flex>
                  ))}
                </VStack>
              </Box>
            </VStack>
          )}
        </ModalBody>

        <ModalFooter borderTop="1px solid" borderColor="rgba(245,240,232,0.08)" gap={2}>
          {step === 'upload' && (
            <>
              <Button size="sm" variant="ghost" color="rgba(245,240,232,0.5)" onClick={handleClose}>取消</Button>
              <Button size="sm" colorScheme="gold" onClick={handleRecognize} isDisabled={images.length === 0}>
                开始识别
              </Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button size="sm" variant="ghost" color="rgba(245,240,232,0.5)" onClick={() => setStep('upload')} isDisabled={isBusy}>
                重新选择
              </Button>
              <Button size="sm" variant="outline" colorScheme="gold" onClick={handleRecognize} isDisabled={isBusy}>
                重新识别
              </Button>
              <Button size="sm" colorScheme="gold" onClick={confirmImport} isLoading={step === 'importing'}>
                确认导入
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
});

// 双模式输入栏
const CombatInputBar = memo(({ mode, onModeChange, value, onChange, onSubmit, loading, girlName, onImportClick }) => {
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
    <Box bg="warm.800" borderTop="1px solid" borderColor="rgba(245,240,232,0.08)" px={4} py={3} flexShrink={0}>
      {/* Mode toggle */}
      <Flex gap={1} mb={2} align="center">
        <Tooltip
          label={mode === 'suggest'
            ? '输入女生原话，AI生成3个风格回复建议，选中直接发送'
            : '当前模式：生成多风格回复建议'}
          placement="top"
          hasArrow
          bg="warm.700"
          color="gold.200"
          fontSize="11px"
        >
          <Button
            size="xs"
            variant={mode === 'suggest' ? 'solid' : 'ghost'}
            colorScheme={mode === 'suggest' ? 'gold' : undefined}
            color={mode !== 'suggest' ? 'rgba(245,240,232,0.4)' : undefined}
            onClick={() => onModeChange('suggest')}
            fontSize="12px"
          >💡 回复建议</Button>
        </Tooltip>
        <Tooltip
          label={mode === 'optimize'
            ? '输入你的回复草稿，AI帮你优化表达效果'
            : '当前模式：优化回复草稿'}
          placement="top"
          hasArrow
          bg="warm.700"
          color="gold.200"
          fontSize="11px"
        >
          <Button
            size="xs"
            variant={mode === 'optimize' ? 'solid' : 'ghost'}
            colorScheme={mode === 'optimize' ? 'gold' : undefined}
            color={mode !== 'optimize' ? 'rgba(245,240,232,0.4)' : undefined}
            onClick={() => onModeChange('optimize')}
            fontSize="12px"
          >⚡ 话术优化</Button>
        </Tooltip>
        {onImportClick && (
          <Button
            size="xs"
            variant="ghost"
            color="rgba(245,240,232,0.4)"
            onClick={onImportClick}
            fontSize="12px"
            ml="auto"
            leftIcon={<Icon as={InboxIcon} boxSize={3} />}
          >导入聊天</Button>
        )}
      </Flex>

      {/* Input row */}
      <Flex gap={2}>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === 'suggest'
              ? `粘贴${girlName || '女生'}说的消息，AI生成回复建议...`
              : `粘贴你要优化的回复草稿，AI帮你改得更好...`
          }
          bg="warm.700"
          border="none"
          color="white"
          fontSize="13px"
          rows={1}
          resize="none"
          overflow="hidden"
          minH="40px"
          maxH="360px"
          isDisabled={loading}
          _focus={{ outline: 'none', boxShadow: '0 0 0 3px rgba(226,176,68,0.12)' }}
          sx={{ fontFamily: 'inherit' }}
        />
        <Button
          colorScheme="gold"
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
const GirlContextSidebar = memo(({ girl, contextData }) => {
  if (!girl) return null;

  const stageColor = STAGE_COLORS[girl.stage] || 'gray';
  const heatColor = (girl.tensionScore || 5) >= 7 ? 'orange.400' : (girl.tensionScore || 5) >= 5 ? 'yellow.400' : 'blue.400';

  // 阶段策略提示
  const stageTips = {
    '陌生': [['🐢', '刚认识，先建立舒适感，不要急于推进'], ['💬', '重点：展示你的生活方式和价值观']],
    '朋友': [['🐢', '热度偏低，先建立舒适感，不要急于推进'], ['🔑', '目标：让她习惯你的存在，成为她的情绪出口']],
    '暧昧': [['🔥', '她已经有窗口信号，72小时内主动约见'], ['⚠', '不要过度道歉或解释，她测试的是你的态度'], ['🔑', '目标：制造一个她有感觉的「在一起」时刻']],
    '约会': [['🔥', '热度高，可以更激进地推进关系'], ['🔑', '目标：升级肢体接触，明确关系预期']],
    '长期': [['💚', '长期关系，重点是维护和深化亲密度'], ['🔑', '保持新鲜感，定期制造小惊喜']],
  };
  const tips = stageTips[girl.stage] || stageTips['陌生'];

  const signals = contextData?.recentSignals || [];
  const pendingActions = contextData?.pendingActions || [];
  const clientProfile = contextData?.clientProfile || null;

  return (
    <Box w="320px" flexShrink={0} display={{ base: 'none', lg: 'flex' }} flexDirection="column" overflowY="auto" minH="0" px={3} py={2}>
      {/* 女生上下文 */}
      <Card bg="warm.800" border="1px solid" borderColor="rgba(245,240,232,0.08)" mb={3}>
        <CardHeader pb={0}>
          <Flex align="center" gap={2}>
            <Box w="6px" h="6px" borderRadius="full" bg="gold.400" />
            <Text fontSize="12px" fontWeight="bold" color="rgba(245,240,232,0.6)" letterSpacing=".5px">
              女生上下文
            </Text>
          </Flex>
        </CardHeader>
        <CardBody>
          <VStack spacing={1} align="stretch" fontSize="13px">
            <Flex justify="space-between"><Text color="rgba(245,240,232,0.4)">姓名</Text><Text fontWeight="bold">{girl.name}</Text></Flex>
            <Flex justify="space-between"><Text color="rgba(245,240,232,0.4)">年龄/职业</Text><Text>{[girl.age, girl.occupation].filter(Boolean).join('岁 · ') || '未知'}</Text></Flex>
            <Flex justify="space-between"><Text color="rgba(245,240,232,0.4)">关系阶段</Text>
              <Badge colorScheme={stageColor}>{girl.stage || '未知'}</Badge>
            </Flex>
            <Flex justify="space-between"><Text color="rgba(245,240,232,0.4)">热度</Text>
              <Text color={heatColor} fontWeight="bold">{(girl.tensionScore || 5).toFixed(1)} / 10</Text>
            </Flex>
            <Flex justify="space-between"><Text color="rgba(245,240,232,0.4)">亲密度</Text><Text>{girl.intimacyLevel || 1} / 5</Text></Flex>
            {contextData?.girlInfo?.mbti && (
              <Flex justify="space-between"><Text color="rgba(245,240,232,0.4)">MBTI</Text><Text>{contextData.girlInfo.mbti}</Text></Flex>
            )}
          </VStack>
        </CardBody>
      </Card>

      {/* 近期关键信号 */}
      {signals.length > 0 && (
        <Card bg="warm.800" border="1px solid" borderColor="rgba(245,240,232,0.08)" mb={3}>
          <CardHeader pb={0}>
            <Flex align="center" gap={2}>
              <Box w="6px" h="6px" borderRadius="full" bg="pink.400" />
              <Text fontSize="12px" fontWeight="bold" color="rgba(245,240,232,0.6)" letterSpacing=".5px">
                近期信号
              </Text>
            </Flex>
          </CardHeader>
          <CardBody>
            <VStack spacing={1.5} align="stretch">
              {signals.slice(0, 5).map((s, i) => (
                <Flex key={i} align="flex-start" gap={2} fontSize="11px">
                  <Badge colorScheme={s.type === 'positive' ? 'green' : s.type === 'negative' ? 'red' : 'gray'} fontSize="9px" mt="2px">
                    {s.type === 'positive' ? '利好' : s.type === 'negative' ? '注意' : '中性'}
                  </Badge>
                  <Text color="rgba(245,240,232,0.5)" flex={1} lineHeight="1.4">{s.event}</Text>
                </Flex>
              ))}
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* 待推进事项 */}
      {pendingActions.length > 0 && (
        <Card bg="warm.800" border="1px solid" borderColor="rgba(245,240,232,0.08)" mb={3}>
          <CardHeader pb={0}>
            <Flex align="center" gap={2}>
              <Box w="6px" h="6px" borderRadius="full" bg="purple.400" />
              <Text fontSize="12px" fontWeight="bold" color="rgba(245,240,232,0.6)" letterSpacing=".5px">
                待推进事项
              </Text>
            </Flex>
          </CardHeader>
          <CardBody>
            <VStack spacing={1.5} align="stretch">
              {pendingActions.slice(0, 5).map((action, i) => (
                <Flex key={i} align="flex-start" gap={2} fontSize="11px">
                  <Text color="gold.400" mt="1px">▸</Text>
                  <Text color="rgba(245,240,232,0.5)" lineHeight="1.4">{action}</Text>
                </Flex>
              ))}
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* 客户画像 */}
      {clientProfile && (
        <Card bg="warm.800" border="1px solid" borderColor="rgba(245,240,232,0.08)" mb={3}>
          <CardHeader pb={0}>
            <Flex align="center" gap={2}>
              <Box w="6px" h="6px" borderRadius="full" bg="cyan.400" />
              <Text fontSize="12px" fontWeight="bold" color="rgba(245,240,232,0.6)" letterSpacing=".5px">
                我的画像
              </Text>
            </Flex>
          </CardHeader>
          <CardBody>
            <VStack spacing={1} align="stretch" fontSize="11px">
              {clientProfile.clientType && clientProfile.clientType !== '未设置' && (
                <Flex justify="space-between">
                  <Text color="rgba(245,240,232,0.4)">客户类型</Text>
                  <Text>{clientProfile.clientType}</Text>
                </Flex>
              )}
              {clientProfile.learningAbility && clientProfile.learningAbility !== '未知' && (
                <Flex justify="space-between">
                  <Text color="rgba(245,240,232,0.4)">学习能力</Text>
                  <Text>{clientProfile.learningAbility}</Text>
                </Flex>
              )}
              {clientProfile.emotionalStable && clientProfile.emotionalStable !== '未知' && (
                <Flex justify="space-between">
                  <Text color="rgba(245,240,232,0.4)">情绪稳定</Text>
                  <Text>{clientProfile.emotionalStable}</Text>
                </Flex>
              )}
              {clientProfile.loveLanguage && (
                <Flex justify="space-between">
                  <Text color="rgba(245,240,232,0.4)">爱语</Text>
                  <Text fontSize="10px">{clientProfile.loveLanguage}</Text>
                </Flex>
              )}
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* 阶段策略 */}
      <Card bg="warm.800" border="1px solid" borderColor="rgba(245,240,232,0.08)">
        <CardHeader pb={0}>
          <Flex align="center" gap={2}>
            <Box w="6px" h="6px" borderRadius="full" bg="orange.400" />
            <Text fontSize="12px" fontWeight="bold" color="rgba(245,240,232,0.6)" letterSpacing=".5px">
              阶段策略 · {girl.stage || '未知'}
            </Text>
          </Flex>
        </CardHeader>
        <CardBody>
          <VStack spacing={2} align="stretch">
            {tips.map((t, i) => (
              <Flex key={i} align="flex-start" gap={2} fontSize="12px" pb={i < tips.length - 1 ? 2 : 0}
                borderBottom={i < tips.length - 1 ? '1px solid' : 'none'} borderColor="rgba(245,240,232,0.08)">
                <Text>{t[0]}</Text>
                <Text color="rgba(245,240,232,0.6)">{t[1]}</Text>
              </Flex>
            ))}
          </VStack>
        </CardBody>
      </Card>
    </Box>
  );
});



// 态势总览卡（在聊天实战为空时显示）
const SituationCard = memo(({ stage, tensionScore, intimacyLevel, recentSignals, pendingActions, lastMessageTime }) => {
  const stageColor = STAGE_COLORS[stage] || 'gray';
  const heatColor = (tensionScore || 5) >= 7 ? 'orange.400' : (tensionScore || 5) >= 5 ? 'yellow.400' : 'blue.400';

  const stageTips = {
    '陌生': '先建立舒适感，不要急于推进',
    '朋友': '让她习惯你的存在，成为情绪出口',
    '暧昧': '72小时内主动约见，制造「在一起」时刻',
    '约会': '升级肢体接触，明确关系预期',
    '长期': '维护亲密度，保持新鲜感',
  };
  const tip = stageTips[stage] || stageTips['陌生'];

  const signals = recentSignals || [];
  const actions = pendingActions || [];

  return (
    <Flex direction="column" align="center" justify="center" py={8} px={4} color="rgba(245,240,232,0.7)">
      {/* 顶部状态 */}
      <Flex gap={3} mb={5} align="center">
        <Badge colorScheme={stageColor} fontSize="13px" px={3} py={1}>{stage || '未设置阶段'}</Badge>
        <Flex align="center" gap={1}>
          <Text fontSize="12px" color="rgba(245,240,232,0.4)">热度</Text>
          <Text color={heatColor} fontWeight="bold" fontSize="14px">{(tensionScore || 5).toFixed(1)}</Text>
        </Flex>
        <Flex align="center" gap={1}>
          <Text fontSize="12px" color="rgba(245,240,232,0.4)">亲密度</Text>
          <Text fontWeight="bold" fontSize="14px">{intimacyLevel || 1}/5</Text>
        </Flex>
      </Flex>

      {/* 阶段策略 */}
      <Box bg="warm.700" borderRadius="xl" px={5} py={4} mb={5} w="100%" maxW="400px" textAlign="center">
        <Text fontSize="12px" color="rgba(245,240,232,0.4)" mb={1}>当前阶段策略</Text>
        <Text fontSize="14px" color="gold.300">{tip}</Text>
      </Box>

      {/* 近期信号 */}
      {signals.length > 0 && (
        <Box w="100%" maxW="400px" mb={4}>
          <Text fontSize="11px" color="rgba(245,240,232,0.3)" mb={2} letterSpacing=".5px">近期信号</Text>
          <VStack spacing={1} align="stretch">
            {signals.slice(0, 3).map((s, i) => (
              <Flex key={i} align="center" gap={2} fontSize="12px">
                <Badge colorScheme={s.type === 'positive' ? 'green' : s.type === 'negative' ? 'red' : 'gray'} fontSize="9px">
                  {s.type === 'positive' ? '利好' : s.type === 'negative' ? '注意' : '中性'}
                </Badge>
                <Text color="rgba(245,240,232,0.5)" noOfLines={1}>{s.event}</Text>
              </Flex>
            ))}
          </VStack>
        </Box>
      )}

      {/* 待办 */}
      {actions.length > 0 && (
        <Box w="100%" maxW="400px" mb={4}>
          <Text fontSize="11px" color="rgba(245,240,232,0.3)" mb={2} letterSpacing=".5px">待推进事项</Text>
          <VStack spacing={1} align="stretch">
            {actions.slice(0, 3).map((a, i) => (
              <Flex key={i} align="center" gap={2} fontSize="12px">
                <Text color="gold.400">▸</Text>
                <Text color="rgba(245,240,232,0.5)" noOfLines={1}>{a}</Text>
              </Flex>
            ))}
          </VStack>
        </Box>
      )}

      {/* 底部提示 */}
      <Text fontSize="12px" color="rgba(245,240,232,0.55)" mt={2}>
        在下方粘贴女生的消息，AI生成回复建议
      </Text>
    </Flex>
  );
});

// 聊天实战聊天区
const CombatChatPanel = memo(({
  history, suggestions, selectedIndex, onSelect,
  onRegenerate, onDismissAll, onSendDirect,
  loading, girlName, combatMode, contextData,
  onCopy, onFavorite, isSaved, onDelete
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
        <SituationCard
          stage={contextData?.girlInfo?.stage}
          tensionScore={contextData?.girlInfo?.tensionScore}
          intimacyLevel={contextData?.girlInfo?.intimacyLevel}
          recentSignals={contextData?.recentSignals}
          pendingActions={contextData?.pendingActions}
        />
      ) : (
        <>
          {history.map(msg => (
            <CombatChatMessage key={msg.id} msg={msg} girlName={girlName} onDelete={onDelete} />
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
            onCopy={onCopy}
            onFavorite={onFavorite}
            isSaved={isSaved}
          />
          <div ref={endRef} style={{ height: 1 }} />
        </>
      )}
    </Box>
  );
});

export default function AICoach() {
  const { user } = useAuth();
  const { socketRef } = useSocket();
  const [girls, setGirls] = useState([]);
  const [selectedGirlId, setSelectedGirlId] = useState(() => {
    try { return localStorage.getItem('zhuiai_last_girl_id') || ''; }
    catch { return ''; }
  });
  const [selectedGirl, setSelectedGirl] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [deepMode, setDeepMode] = useState(() => {
    try { return localStorage.getItem('zhuiai_deep_mode') !== 'false'; }
    catch { return true; }
  });
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
  const abortControllerRef = useRef(null); // 用于停止生成
  const streamingCancelledRef = useRef(false); // 标记是否被用户手动停止
  const analysisTaskRef = useRef({}); // taskId -> assistantId 映射
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const savedScrollPositionRef = useRef(0);
  const toast = useToast();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';

  // ====== 聊天实战 state ======
  const [combatHistories, setCombatHistories] = useState({}); // { [girlId]: CombatMessage[] }
  const [combatMode, setCombatMode] = useState(() => {
    try { return localStorage.getItem('zhuiai_combat_mode') || 'suggest'; }
    catch { return 'suggest'; }
  });
  const [combatInput, setCombatInput] = useState('');
  const [combatLoading, setCombatLoading] = useState(false);
  const [combatSuggestions, setCombatSuggestions] = useState(null);
  // { type: 'suggestions'|'optimizations', items: [...] }
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(null);
  const [savedReplies, setSavedReplies] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zhuiai_saved_replies') || '[]'); }
    catch { return []; }
  });
  const [lastDraftText, setLastDraftText] = useState('');
  // Girl-selected AI教练 state
  const [girlAnalysisContent, setGirlAnalysisContent] = useState('');
  const [girlAnalysisReasoning, setGirlAnalysisReasoning] = useState(''); // DeepSeek 思考过程
  const girlAnalysisReasoningRef = useRef('');
  const [girlAnalysisLoading, setGirlAnalysisLoading] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false); // 分析弹窗
  // Track active tab (0 = AI教练, 1 = 聊天实战/回复建议)
  const [activeTabIndex, setActiveTabIndex] = useState(() => {
    try { return parseInt(localStorage.getItem('zhuiai_active_tab') || '0', 10); }
    catch { return 0; }
  });
  // 聊天导入弹窗
  const [importModalOpen, setImportModalOpen] = useState(false);
  // 侧边栏上下文数据（信号/待办/客户画像）
  const [girlContextData, setGirlContextData] = useState(null);

  // 前端缓存：避免女生档案未变化时重复调用 AI（参考 Workbench 的 hash 比对机制）
  const coachCacheRef = useRef({}); // { [girlId]: { content, reasoning, girlDataHash, timestamp } }

  // P2-6: AI教练分析结果（女生核心需求/当前状态），实时注入到聊天实战上下文
  const combatContextRef = useRef(null); // { recentSignals, pendingActions, clientProfile, keyInsights }

  // 聊天上下文状态
  const [chatSummary, setChatSummary] = useState('');
  const [importAnalysis, setImportAnalysis] = useState(null); // { girlStyle, userStyle, problems, suggestions }

  // 计算女生侧 dataHash（与后端 computeGirlDataHash 对应，仅取关键变动字段）
  const computeGirlDataHash = useCallback((girl) => {
    if (!girl) return '';
    const signals = girl.signals ? (Array.isArray(girl.signals) ? girl.signals : (() => { try { return JSON.parse(girl.signals); } catch { return []; } })()) : [];
    const pendingActions = girl.pendingActions ? (Array.isArray(girl.pendingActions) ? girl.pendingActions : (() => { try { return JSON.parse(girl.pendingActions); } catch { return []; } })()) : [];
    const raw = [
      girl.tensionScore ?? 5.0,
      girl.intimacyLevel ?? 1,
      girl.stage || '',
      signals.length,
      pendingActions.length
    ].join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  }, []);

  const combatHistoryKey = selectedGirlId || '__general__';
  const getCurrentCombatHistory = useCallback(() => {
    return combatHistories[combatHistoryKey] || [];
  }, [combatHistoryKey, combatHistories]);

  // 更新 combatContextRef：同步 chatSummary、recentMessages、importAnalysis
  const updateCombatContext = useCallback((messages, newAnalysis = null) => {
    // 更新 recentMessages（最近10-20条）
    const recentMessages = messages.slice(-20);

    // 生成简单摘要（用于显示）
    const recentChatText = recentMessages.map(m => {
      const role = m.role === 'girl' ? '她' : '我';
      return `${role}: ${m.content.substring(0, 30)}${m.content.length > 30 ? '...' : ''}`;
    }).join('\n');

    // 更新 combatContextRef
    combatContextRef.current = {
      ...(combatContextRef.current || {}),
      chatSummary: chatSummary || recentChatText,
      recentMessages: recentMessages,
      importAnalysis: newAnalysis || importAnalysis || combatContextRef.current?.importAnalysis
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSummary, importAnalysis]);

  // 删除实战消息
  const handleDeleteCombatMessage = useCallback((messageId) => {
    const key = combatHistoryKey;
    const currentMessages = combatHistories[key] || [];
    const updatedMessages = currentMessages.filter(m => m.id !== messageId);

    setCombatHistories(prev => ({
      ...prev,
      [key]: updatedMessages
    }));

    deleteCombatMessage(selectedGirlId || key, messageId).catch(e => {
      console.warn('[AICoach] delete message failed:', e);
    });

    updateCombatContext(updatedMessages, importAnalysis);
  }, [combatHistories, combatHistoryKey, selectedGirlId, importAnalysis, updateCombatContext]);

  // 使用 useCallback 稳定 deepMode 切换函数
  const handleDeepModeToggle = useCallback(() => {
    setDeepMode(d => {
      const newValue = !d;
      try { localStorage.setItem('zhuiai_deep_mode', String(newValue)); } catch {}
      return newValue;
    });
  }, []);

  useEffect(() => {
    loadGirls();
  }, []);

  // 当 selectedGirlId 恢复后，加载对应数据
  useEffect(() => {
    if (!selectedGirlId) {
      loadHistory('');
      loadCombatHistory('__general__');
    } else {
      loadHistory(selectedGirlId);
      loadCombatHistory(selectedGirlId);
      loadGirlContext(selectedGirlId);
    }
  }, [selectedGirlId]);

  useEffect(() => {
    if (selectedGirlId) {
      const girl = girls.find(g => g.id === selectedGirlId);
      setSelectedGirl(girl || null);
    } else {
      setSelectedGirl(null);
    }
  }, [selectedGirlId, girls]);

  // 监听图片分析结果（异步 Socket.io 通知 + 轮询 fallback）

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

  // 监听 Socket.io 分析结果事件
  useEffect(() => {
    if (!socketRef?.current) return;

    const handleAnalysisCompleted = ({ taskId, type, content, imageUrl }) => {
      const assistantId = analysisTaskRef.current[taskId];
      if (!assistantId) return;
      const typeLabel = type === '聊天记录' ? '【聊天记录分析】\n'
        : type === '朋友圈' ? '【朋友圈分析】\n'
        : '【图片分析】\n';
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, content: typeLabel + (content || '') } : m)
      );
      setLoading(false);
      isStreamingRef.current = false;
      abortControllerRef.current = null;
      scrollToBottom();
      delete analysisTaskRef.current[taskId];
    };

    const handleAnalysisFailed = ({ taskId, error }) => {
      const assistantId = analysisTaskRef.current[taskId];
      if (!assistantId) return;
      captureError(new Error(error), { context: 'analysis:failed' });
      setError(error || '图片分析失败，请稍后重试');
      setMessages(prev => prev.filter(m => m.id !== assistantId));
      setLoading(false);
      isStreamingRef.current = false;
      abortControllerRef.current = null;
      scrollToBottom();
      delete analysisTaskRef.current[taskId];
    };

    socketRef.current.on('analysis:completed', handleAnalysisCompleted);
    socketRef.current.on('analysis:failed', handleAnalysisFailed);

    return () => {
      socketRef.current?.off('analysis:completed', handleAnalysisCompleted);
      socketRef.current?.off('analysis:failed', handleAnalysisFailed);
    };
  }, [socketRef, scrollToBottom]);

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

  // 自动调整 textarea 高度
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
      captureError(e);
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
      captureError(e, { context: '[AICoach] load history failed:' });
    } finally {
      setLoadingHistory(false);
    }
  };

  // 聊天实战 - 加载持久化历史
  const loadCombatHistory = useCallback(async (girlId) => {
    if (!girlId) return;
    const token = localStorage.getItem('zhuiai_token');
    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/combat-history/${girlId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.messages) {
          setCombatHistories(prev => ({
            ...prev,
            [girlId]: data.messages.map(m => ({
              id: m.id, role: m.role, content: m.content, timestamp: m.timestamp
            }))
          }));
        }
      }
    } catch (e) {
      console.warn('[AICoach] load combat history failed:', e.message);
    }
  }, [apiUrl]);

  // 聊天实战 - 持久化消息到后端（静默，不阻塞 UI）
  const persistCombatMessages = useCallback((girlId, msgs) => {
    const token = localStorage.getItem('zhuiai_token');
    fetch(`${apiUrl}/api/ai-coach/combat-history/${girlId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ messages: msgs.map(m => ({ role: m.role, content: m.content })) })
    }).catch(e => console.warn('[AICoach] persist combat message failed:', e.message));
  }, [apiUrl]);

  const handleGirlChange = (girlId) => {
    setSelectedGirlId(girlId);
    try { localStorage.setItem('zhuiai_last_girl_id', girlId); } catch {}
    setShowAnalysisModal(false); // 关闭分析弹窗
    if (girlId) {
      // 切换上下文：先清空避免混入旧上下文消息，再加载女生专属会话历史
      setMessages([]);
      setActiveSessionId(null);
      setActiveTabIndex(0);
      try { localStorage.setItem('zhuiai_active_tab', '0'); } catch {}
      setGirlAnalysisContent('');
      // 不再自动分析，改为手动触发
      loadGirlContext(girlId);
      loadHistory(girlId);
      loadCombatHistory(girlId);
    } else {
      // 取消选择：清空后加载通用咨询历史（无 girlId）
      setMessages([]);
      setActiveSessionId(null);
      loadHistory('');
      loadCombatHistory('__general__');
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
      await Clipboard.write({ string: content });
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      // Fallback for web
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(content);
        } else {
          const ta = document.createElement('textarea');
          ta.value = content;
          ta.style.cssText = 'position:fixed;left:-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        setCopiedId(messageId);
        setTimeout(() => setCopiedId(null), 2000);
      } catch (e2) {
        captureError(e2, { context: 'handleCopy' });
      }
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
          mode: deepMode ? 'pro' : 'flash', // 传递模式给后端
          girlId: selectedGirlId,
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
            // 去掉 SSE 的 "data: " 前缀再解析
            const bufferContent = buffer.trim().replace(/^data: /, '');
            if (bufferContent.startsWith('{')) {
              const parsed = JSON.parse(bufferContent);
              if (parsed.reasoning) {
                reasoningContentRef.current += parsed.reasoning;
                setReasoningContent(reasoningContentRef.current);
              }
              if (parsed.content) {
                streamingContentRef.current += parsed.content;
              }
            }
          } catch { /* ignore */ }
        }

        isStreamingRef.current = false;
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: streamingContentRef.current } : m)
        );
      }
    } catch (e) {
      captureError(e);
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
      const feedbackRes = await fetch(`${apiUrl}/api/ai-coach/feedback`, {
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
      if (!feedbackRes.ok) throw new Error(`反馈请求失败 (${feedbackRes.status})`);
      toast({
        title: '感谢反馈',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (e) {
      captureError(e, { context: '[Feedback] 提交失败:' });
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
        body: JSON.stringify({ girlId: selectedGirlId })
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
      // 显式传空字符串，确保加载"无女生"的通用会话（避免把其他女生历史带进来）
      await loadHistory(selectedGirlId ? selectedGirlId : '');
      // 再次确保清空（loadHistory 可能把其他女生会话内容设回来）
      setMessages([]);
      setActiveSessionId(null);
      toast({
        title: '已开启新对话',
        status: 'info',
        duration: 2000,
        isClosable: true,
      });
    } catch (e) {
      captureError(e, { context: '[AICoach] new-session failed:' });
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

  // SSE 流式加载女生分析（含前端 hash 缓存 + 实时流式显示）
  const loadGirlAnalysis = useCallback(async (girlId, options = {}) => {
    if (!girlId) return;
    const { forceRefresh = false } = options;
    const girl = girls.find(g => g.id === girlId);
    const currentGirlHash = computeGirlDataHash(girl);

    // 检查前端缓存：hash 匹配则直接复用，不调 API
    if (!forceRefresh) {
      const cached = coachCacheRef.current[girlId];
      if (cached && cached.girlDataHash === currentGirlHash) {
        setGirlAnalysisContent(cached.content);
        setGirlAnalysisReasoning(cached.reasoning || '');
        setGirlAnalysisLoading(false);
        return;
      }
    }

    setGirlAnalysisLoading(true);
    setGirlAnalysisContent('');
    setGirlAnalysisReasoning('');
    girlAnalysisReasoningRef.current = '';
    const token = localStorage.getItem('zhuiai_token');
    try {
      // 带上 hash 参数，让后端也可判断缓存命中
      let url = `${apiUrl}/api/ai-coach/girl-summary/${girlId}`;
      if (currentGirlHash) {
        url += `?cachedGirlHash=${encodeURIComponent(currentGirlHash)}`;
      }
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('请求失败');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let metaReceived = false;
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
              let jsonStr = trimmed.substring(6);
              // 去掉可能的前缀
              jsonStr = jsonStr.replace(/^data: /, '');
              if (!jsonStr.startsWith('{')) continue;
              const parsed = JSON.parse(jsonStr);
              // 处理 meta 帧（第一帧：cached / changeReason / staleAlert）
              if (!metaReceived && parsed.cached !== undefined) {
                metaReceived = true;
                if (parsed.cached === true) {
                  // 后端缓存命中，流式返回中，继续接收 content chunk
                }
                continue;
              }
              // DeepSeek 思考过程（reasoning_content，先于 content 到达）
              if (parsed.reasoning) {
                girlAnalysisReasoningRef.current += parsed.reasoning;
                setGirlAnalysisReasoning(prev => prev + parsed.reasoning);
                continue;
              }
              if (parsed.content) { accumulated += parsed.content; setGirlAnalysisContent(accumulated); }
            } catch {}
          }
        }
      }
      if (!accumulated) setGirlAnalysisContent('分析加载完成，可向我提问');
      // 写入前端缓存
      if (accumulated) {
        coachCacheRef.current[girlId] = {
          content: accumulated,
          reasoning: girlAnalysisReasoningRef.current || '',
          girlDataHash: currentGirlHash,
          timestamp: Date.now()
        };
      }
    } catch (e) {
      console.warn('[AICoach] loadGirlAnalysis failed:', e.message);
      setGirlAnalysisContent('暂无法加载分析，可直接向我提问');
    } finally {
      setGirlAnalysisLoading(false);
    }
  }, [apiUrl, girls, computeGirlDataHash]);

  // 加载侧边栏上下文数据（信号/待办/客户画像）
  const loadGirlContext = useCallback(async (girlId) => {
    if (!girlId) return;
    const token = localStorage.getItem('zhuiai_token');
    try {
      const cached = coachCacheRef.current[girlId];
      const url = cached?.girlDataHash
        ? `${apiUrl}/api/ai-coach/girl-context/${girlId}?cachedGirlHash=${encodeURIComponent(cached.girlDataHash)}`
        : `${apiUrl}/api/ai-coach/girl-context/${girlId}`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.cached) {
        if (data.girlDataHash && coachCacheRef.current[girlId]) {
          coachCacheRef.current[girlId].girlDataHash = data.girlDataHash;
        }
      }
      setGirlContextData(data);
      // P2-6: 同步更新 combatContextRef，聊天实战发送时作为隐藏上下文
      if (data.recentSignals || data.pendingActions || data.clientProfile || data.observations) {
        combatContextRef.current = {
          recentSignals: data.recentSignals || [],
          pendingActions: data.pendingActions || [],
          clientProfile: data.clientProfile || {},
          observations: data.observations || [],
          updatedAt: Date.now()
        };
      }
    } catch (e) {
      console.warn('[AICoach] loadGirlContext failed:', e.message);
    }
  }, [apiUrl]);

  // 聊天实战 - 发送
  const handleCombatSend = useCallback(async () => {
    const text = combatInput.trim();
    if (!text || combatLoading) return;
    setCombatInput('');
    const now = new Date().toISOString();
    const girlName = selectedGirl?.name || '女生';
    const key = combatHistoryKey;

    if (combatMode === 'suggest') {
      // 回复建议：先追加女生消息气泡
      const herMsg = { id: `combat-${Date.now()}`, role: 'girl', content: text, timestamp: now };
      setCombatHistories(prev => {
        const updated = [...(prev[key] || []), herMsg];
        persistCombatMessages(key, [herMsg]);
        updateCombatContext(updated, importAnalysis);
        return { ...prev, [key]: updated };
      });
      setCombatSuggestions(null);
      setSelectedSuggestionIndex(null);
      setCombatLoading(true);
      try {
        const token = localStorage.getItem('zhuiai_token');
        // P2-6: 注入隐藏上下文（AI教练分析结果）
        const hiddenContext = combatContextRef.current || null;
        const res = await fetch(`${apiUrl}/api/ai-coach/reply-suggestions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ girlId: selectedGirlId, lastMessage: text, hiddenContext })
        });
        if (!res.ok) throw new Error(`回复建议请求失败 (${res.status})`);
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
          body: JSON.stringify({
            girlId: selectedGirlId,
            originalReply: text,
            hiddenContext: combatContextRef.current || null
          })
        });
        if (!res.ok) throw new Error(`话术优化请求失败 (${res.status})`);
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
  }, [combatInput, combatLoading, combatMode, combatHistoryKey, selectedGirlId, selectedGirl, apiUrl, toast, persistCombatMessages]);

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
    setCombatHistories(prev => {
      const updated = [...(prev[combatHistoryKey] || []), myMsg];
      persistCombatMessages(combatHistoryKey, [myMsg]);
      updateCombatContext(updated, importAnalysis);
      return { ...prev, [combatHistoryKey]: updated };
    });
    // 选中后清除建议卡片
    setCombatSuggestions(null);
  }, [selectedSuggestionIndex, combatSuggestions, combatHistoryKey, persistCombatMessages, updateCombatContext, importAnalysis]);

  // 聊天实战 - 全部删除
  const handleDismissAllSuggestions = useCallback(() => {
    setCombatSuggestions(null);
    setSelectedSuggestionIndex(null);
  }, []);

  // 复制建议内容
  const handleCopySuggestion = useCallback((text) => {
    Clipboard.write({ string: text }).then(() => {
      toast({ title: '已复制到剪贴板', duration: 2000, colorScheme: 'green' });
    }).catch(() => {
      // Fallback for web
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          toast({ title: '已复制到剪贴板', duration: 2000, colorScheme: 'green' });
        }).catch(() => {
          toast({ title: '复制失败', duration: 2000, colorScheme: 'red' });
        });
      } else {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;left:-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          toast({ title: '已复制到剪贴板', duration: 2000, colorScheme: 'green' });
        } catch {
          toast({ title: '复制失败', duration: 2000, colorScheme: 'red' });
        }
      }
    });
  }, [toast]);

  // 收藏/取消收藏建议
  const handleFavoriteSuggestion = useCallback((item) => {
    const text = item.reply || item.text || '';
    const style = item.type || item.style || '';
    const entry = { reply: text, style, savedAt: new Date().toISOString() };
    setSavedReplies(prev => {
      const exists = prev.some(s => s.reply === text);
      if (exists) {
        const next = prev.filter(s => s.reply !== text);
        localStorage.setItem('zhuiai_saved_replies', JSON.stringify(next));
        toast({ title: '已取消收藏', duration: 2000 });
        return next;
      } else {
        const next = [entry, ...prev].slice(0, 100);
        localStorage.setItem('zhuiai_saved_replies', JSON.stringify(next));
        toast({ title: '已收藏到话术库', duration: 2000, colorScheme: 'pink' });
        return next;
      }
    });
  }, [toast]);

  // 聊天实战 - 重新生成
  const handleRegenerateSuggestions = useCallback(() => {
    setCombatSuggestions(null);
    setSelectedSuggestionIndex(null);
    setCombatLoading(true);
    // 模拟延迟后重新发送请求
    setTimeout(() => {
      const token = localStorage.getItem('zhuiai_token');
      const key = combatHistoryKey;
      const history = combatHistories[key] || [];
      const girlIdParam = selectedGirlId;
      if (combatMode === 'suggest') {
        const lastGirlMsg = [...history].reverse().find(m => m.role === 'girl');
        if (!lastGirlMsg) { setCombatLoading(false); return; }
        fetch(`${apiUrl}/api/ai-coach/reply-suggestions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ girlId: girlIdParam, lastMessage: lastGirlMsg.content })
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
          body: JSON.stringify({ girlId: girlIdParam, originalReply: lastDraftText })
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
      [combatHistoryKey]: [...(prev[combatHistoryKey] || []), myMsg]
    }));
    persistCombatMessages(combatHistoryKey, [myMsg]);
    setCombatSuggestions(null);
    setSelectedSuggestionIndex(null);
    setLastDraftText('');
  }, [lastDraftText, combatHistoryKey, persistCombatMessages]);

  // 聊天实战 - 模式切换
  const handleCombatModeChange = useCallback((mode) => {
    setCombatMode(mode);
    try { localStorage.setItem('zhuiai_combat_mode', mode); } catch {}
    setCombatInput('');
    setCombatSuggestions(null);
    setSelectedSuggestionIndex(null);
  }, []);

  // 聊天导入 - 完成确认后处理
  const handleImportComplete = useCallback(async (messages) => {
    if (!messages || messages.length === 0) return;

    const now = new Date().toISOString();
    const key = combatHistoryKey;
    const msgs = messages.map(m => ({
      id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: m.role,
      content: m.content,
      timestamp: now
    }));

    // 追加到当前女生聊天历史
    setCombatHistories(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), ...msgs]
    }));

    // 持久化
    persistCombatMessages(key, msgs);

    // 调用聊天分析API
    if (selectedGirlId) {
      try {
        const analysisResult = await analyzeChatHistory(messages, selectedGirlId);
        setChatSummary(analysisResult.chatSummary || '');
        setImportAnalysis(analysisResult.importAnalysis || null);

        // 更新 combatContextRef
        combatContextRef.current = {
          ...(combatContextRef.current || {}),
          chatSummary: analysisResult.chatSummary || '',
          recentMessages: msgs.slice(-20),
          importAnalysis: analysisResult.importAnalysis || null
        };
      } catch (e) {
        console.warn('[AICoach] analyze chat history failed:', e);
      }
    }

    // 切换到聊天实战 Tab
    setActiveTabIndex(1);
    // 切换到回复建议模式
    setCombatMode('suggest');
    try { localStorage.setItem('zhuiai_combat_mode', 'suggest'); } catch {}

    // 自动触发回复建议（用最后一条女生消息）
    const lastGirlMsg = [...msgs].reverse().find(m => m.role === 'girl');
    if (lastGirlMsg) {
      const token = localStorage.getItem('zhuiai_token');
      setCombatLoading(true);
      fetch(`${apiUrl}/api/ai-coach/reply-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          girlId: selectedGirlId,
          lastMessage: lastGirlMsg.content,
          hiddenContext: combatContextRef.current || null
        })
      }).then(r => r.json()).then(data => {
        if (data.success && data.suggestions?.options?.length) {
          setCombatSuggestions({ type: 'suggestions', items: data.suggestions.options });
        }
      }).catch(() => {}).finally(() => setCombatLoading(false));
    }
  }, [combatHistoryKey, selectedGirlId, apiUrl, persistCombatMessages, analyzeChatHistory]);

  // 处理图片提交（异步模式：立即返回，后台分析，Socket.io/轮询通知结果）
  const handleImageSubmit = useCallback(async (imageFile, textInput) => {
    if (loading) return;

    const token = localStorage.getItem('zhuiai_token');

    // 添加用户消息（带图片）
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: tempId,
        role: 'user',
        content: textInput || '[图片]',
        imageUrl: imageFile ? URL.createObjectURL(imageFile) : null,
        createdAt: new Date().toISOString()
      }
    ]);

    scrollToBottom();
    setLoading(true);
    setError('');
    setThinkingLabel(null);
    setReasoningContent('');
    reasoningContentRef.current = '';
    streamingContentRef.current = '';
    isStreamingRef.current = true;
    streamingCancelledRef.current = false;

    // 创建 AbortController，用于停止生成
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 添加一条空的助手消息（显示"分析中..."）
    const assistantId = `asst-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '图片分析中...',
        createdAt: new Date().toISOString()
      }
    ]);

    scrollToBottom();

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      if (textInput) {
        formData.append('message', textInput);
      }
      if (selectedGirlId) {
        formData.append('girlId', selectedGirlId);
      }

      // 异步模式：立即获得 taskId，后台处理
      const res = await fetch(`${apiUrl}/api/ai-coach/analyze-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
        signal: controller.signal
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const { taskId } = data;

      if (taskId) {
        // 存储 taskId -> assistantId 映射，等待 Socket.io 事件
        analysisTaskRef.current[taskId] = assistantId;

        // 启动轮询 fallback（60秒内每3秒轮询一次）
        let pollCount = 0;
        const maxPolls = 20;
        const pollInterval = setInterval(async () => {
          pollCount++;
          if (pollCount > maxPolls || isStreamingRef.current === false) {
            clearInterval(pollInterval);
            return;
          }
          try {
            const statusRes = await fetch(`${apiUrl}/api/ai-coach/analysis-status/${taskId}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.status === 'completed') {
                clearInterval(pollInterval);
                const typeLabel = statusData.type === '聊天记录' ? '【聊天记录分析】\n'
                  : statusData.type === '朋友圈' ? '【朋友圈分析】\n'
                  : '【图片分析】\n';
                setMessages(prev =>
                  prev.map(m => m.id === assistantId ? { ...m, content: typeLabel + (statusData.content || '') } : m)
                );
                setLoading(false);
                isStreamingRef.current = false;
                abortControllerRef.current = null;
                scrollToBottom();
                delete analysisTaskRef.current[taskId];
              } else if (statusData.status === 'failed') {
                clearInterval(pollInterval);
                captureError(new Error(statusData.error), { context: 'analysis:poll_failed' });
                setError(statusData.error || '图片分析失败，请稍后重试');
                setMessages(prev => prev.filter(m => m.id !== assistantId));
                setLoading(false);
                isStreamingRef.current = false;
                abortControllerRef.current = null;
                scrollToBottom();
                delete analysisTaskRef.current[taskId];
              }
            }
          } catch (e) {
            // 忽略轮询错误，等待 Socket.io 事件
          }
        }, 3000);
      } else {
        // 兼容旧版本：直接返回分析结果
        const typeLabel = data.type === '聊天记录' ? '【聊天记录分析】\n'
          : data.type === '朋友圈' ? '【朋友圈分析】\n'
          : '【图片分析】\n';
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: typeLabel + (data.content || '') } : m)
        );
        setLoading(false);
        isStreamingRef.current = false;
        abortControllerRef.current = null;
        scrollToBottom();
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        streamingCancelledRef.current = true;
      } else {
        captureError(e);
        setError(e.message || '网络错误，请重试');
        setMessages(prev => prev.filter(m => m.id !== tempId && m.id !== assistantId));
      }
      setLoading(false);
      isStreamingRef.current = false;
      abortControllerRef.current = null;
      scrollToBottom();
    }
  }, [loading, selectedGirlId, apiUrl, scrollToBottom]);

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
    streamingCancelledRef.current = false;

    // 创建 AbortController，用于停止生成
    const controller = new AbortController();
    abortControllerRef.current = controller;

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
          mode: deepMode ? 'pro' : 'flash',
          girlId: selectedGirlId
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // 始终使用流式模式
      if (false) {
        // 非流式分支（图片分析等场景）
        const data = await res.json();
        const typeLabel = data.type === '聊天记录' ? '【聊天记录分析】\n'
          : data.type === '朋友圈' ? '【朋友圈分析】\n'
          : '【图片分析】\n';
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: typeLabel + (data.content || '') } : m)
        );
        scrollToBottom();
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
          if (done) {
            break;
          }

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
            const bufferContent = buffer.trim().replace(/^data: /, '');
            if (bufferContent.startsWith('{')) {
              const parsed = JSON.parse(bufferContent);
              if (parsed.reasoning) {
                reasoningContentRef.current += parsed.reasoning;
                setReasoningContent(reasoningContentRef.current);
              }
              if (parsed.content) {
                streamingContentRef.current += parsed.content;
              }
            }
          } catch { /* ignore */ }
        }

        isStreamingRef.current = false;
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: streamingContentRef.current } : m)
        );
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        // 用户主动停止，保留已生成的内容
        streamingCancelledRef.current = true;
      } else {
        captureError(e);
        setError(e.message || '网络错误，请重试');
        // 移除失败的消息
        setMessages(prev => prev.filter(m => m.id !== tempId && m.id !== assistantId));
      }
    } finally {
      setLoading(false);
      isStreamingRef.current = false;
      abortControllerRef.current = null;
      // 确保最终滚动到底部
      scrollToBottom();
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    await handleSubmitInternal(input);
    setInput('');
  };

  // 停止生成
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await Clipboard.write({ string: text });
      toast({ title: '已复制', status: 'success', duration: 2000 });
    } catch (e) {
      // Fallback for web
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;left:-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        toast({ title: '已复制', status: 'success', duration: 2000 });
      } catch (e2) {
        toast({ title: '复制失败', status: 'error', duration: 2000 });
      }
    }
  };

  const QUICK_QUESTIONS = [
    '怎么判断她对我有没有意思？',
    '聊天不知道怎么开场怎么办？',
    '约她出来玩她总是说忙怎么办？',
    '怎么避免成为舔狗？'
  ];

  const hasGirl = !!(selectedGirlId && selectedGirl);
  const currentCombatHistory = combatHistories[combatHistoryKey] || [];

  // ====== State 2: 选中女生 — 双 Tab 布局 ======
  if (hasGirl) {

    // AI教练 with girl — 聊天面板（内联 JSX，避免每次渲染重置 DOM）
    const girlCoachChatContent = (
      <>
        <Box flex="1" minH="0" display="flex" flexDirection="column" bg="warm.800" borderRadius="md" mb={2} overflow="hidden">
          <Box id="chat-scroll-container" flex="1" overflowY="auto" p={4} ref={scrollContainerRef} sx={{ overflowAnchor: 'none' }}>
            {/* 加载状态 */}
            {loadingHistory ? (
              <VStack spacing={4} py={8} justify="center" minH="200px">
                <Spinner size="xl" color="gold.400" />
                <Text color="rgba(245,240,232,0.4)">加载聊天历史...</Text>
              </VStack>
            ) : messages.length === 0 && !girlAnalysisContent && !girlAnalysisLoading && (
              <VStack spacing={4} py={8} justify="center" minH="200px">
                <Text color="rgba(245,240,232,0.4)" textAlign="center">
                  围绕{selectedGirl?.name || '女生'}的情况，向我提问
                </Text>
                <Wrap spacing={2} justify="center">
                  {QUICK_QUESTIONS.map((q, i) => (
                    <WrapItem key={i}>
                      <Button
                        size="sm"
                        variant="outline"
                        colorScheme="gold"
                        onClick={() => handleSubmitInternal(q)}
                        isDisabled={loading}
                        borderRadius="xl"
                        px={4}
                        _hover={{ bg: 'rgba(226,176,68,0.12)', borderColor: 'gold.400' }}
                      >
                        {q}
                      </Button>
                    </WrapItem>
                  ))}
                </Wrap>
              </VStack>
            )}

            {/* 对话消息（历史 + 新对话） */}
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

            {/* 女生分析 — 作为对话的一部分，在最底部，像正常消息一样流式输出 */}
            {girlAnalysisLoading && !girlAnalysisContent && (
              <Flex justify="flex-start" mb={4}>
                <HStack bg="warm.700" px={4} py={3} borderRadius="2xl" spacing={2}>
                  {[0, 150, 300].map((delay) => (
                    <Box key={delay} w="8px" h="8px" bg="gold.400" borderRadius="full"
                      animation={`bounce 1.4s infinite ease-in-out ${delay}ms`}
                      sx={{ '@keyframes bounce': { '0%,80%,100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1)' } } }}
                    />
                  ))}
                  <Text color="rgba(245,240,232,0.4)" fontSize="sm">正在分析{selectedGirl?.name || '女生'}...</Text>
                </HStack>
              </Flex>
            )}
            {girlAnalysisContent && (
              <Flex justify="flex-start" mb={4}>
                <HStack align="flex-start" spacing={3}>
                  <Avatar size="sm" bg="gold.500" icon={<span>🤖</span>} />
                  <Box bg="warm.700" borderRadius="2xl" borderTopLeftRadius="sm" maxW="90%" overflow="hidden">
                    {girlAnalysisReasoning && (
                      <AnalysisReasoning
                        reasoning={girlAnalysisReasoning}
                        loading={girlAnalysisLoading}
                      />
                    )}
                    <Box px={4} py={3}>
                      <Box fontSize="13px" lineHeight="1.7" color="warm.50">
                        <Box dangerouslySetInnerHTML={{ __html: renderMD(fixMarkdown(girlAnalysisContent)) }} />
                      </Box>
                      {girlAnalysisLoading && (
                        <Box as="span" display="inline-block" w="2px" h="16px" bg="gold.400" ml="2px"
                          animation="blink 1s infinite" verticalAlign="text-bottom"
                          sx={{ '@keyframes blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } } }}
                        />
                      )}
                    </Box>
                  </Box>
                </HStack>
              </Flex>
            )}

            {error && (
              <Box mt={4} p={3} bg="red.900" borderRadius="md">
                <Text color="red.200">{error}</Text>
              </Box>
            )}
            <div ref={messagesEndRef} style={{ height: 1 }} />
          </Box>

          {/* 场景快捷入口 — 仅在无消息时显示 */}
          {messages.length === 0 && !loading && (
            <Box px={1} pb={2} flexShrink={0}>
              <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={2}>你可以问我：</Text>
              <SimpleGrid columns={2} spacing={2}>
                {[
                  { icon: '💬', title: '聊天话术', desc: '怎么开场、怎么推进关系' },
                  { icon: '🎯', title: '约会方案', desc: '去哪里、聊什么、穿什么' },
                  { icon: '📸', title: '朋友圈分析', desc: '发什么能吸引她注意' },
                  { icon: '💔', title: '关系困惑', desc: '她这句话是什么意思' },
                ].map(item => (
                  <Card
                    key={item.title}
                    bg="warm.700"
                    cursor="pointer"
                    border="1px solid"
                    borderColor="whiteAlpha.100"
                    _hover={{ borderColor: 'gold.500', bg: 'warm.600' }}
                    onClick={() => {
                      const textarea = document.querySelector('textarea[placeholder*="AI 教练"]');
                      if (textarea) {
                        textarea.value = item.desc;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.focus();
                      }
                    }}
                    transition="all 0.2s"
                  >
                    <CardBody py={2} px={3}>
                      <HStack spacing={2}>
                        <Text fontSize="lg">{item.icon}</Text>
                        <Box>
                          <Text color="white" fontSize="xs" fontWeight="bold">{item.title}</Text>
                          <Text color="rgba(245,240,232,0.4)" fontSize="10px">{item.desc}</Text>
                        </Box>
                      </HStack>
                    </CardBody>
                  </Card>
                ))}
              </SimpleGrid>
            </Box>
          )}

          </Box>
        <InputArea
          onSubmit={handleSubmitInternal}
          onImageSubmit={handleImageSubmit}
          onStop={handleStop}
          loading={loading}
          deepMode={deepMode}
          onDeepModeToggle={handleDeepModeToggle}
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
            <Menu>
              <MenuButton
                as={Button}
                size="sm"
                variant="outline"
                colorScheme="gold"
                borderColor="gold.600"
                _hover={{ bg: 'gold.900' }}
                rightIcon={<Text fontSize="xs">▼</Text>}
              >
                {selectedGirlId ? (
                  <HStack spacing={2}>
                    <Avatar
                      size="xs"
                      name={girls.find(g => g.id === selectedGirlId)?.name}
                      src={girls.find(g => g.id === selectedGirlId)?.avatar}
                      bg="gold.500"
                    />
                    <Text>{girls.find(g => g.id === selectedGirlId)?.name}</Text>
                  </HStack>
                ) : (
                  <Text color="rgba(245,240,232,0.6)">关联女生</Text>
                )}
              </MenuButton>
              <MenuList bg="warm.800" borderColor="warm.600" minW="180px">
                {(girls || []).map(g => (
                  <MenuItem
                    key={g.id}
                    onClick={() => handleGirlChange(g.id)}
                    bg={selectedGirlId === g.id ? 'gold.900' : 'transparent'}
                    _hover={{ bg: 'warm.700' }}
                  >
                    <HStack spacing={2}>
                      <Avatar size="xs" name={g.name} src={g.avatar} bg="gold.500" />
                      <Text>{g.name}</Text>
                      {g.stage && <Badge size="sm" colorScheme="orange" fontSize="10px">{g.stage}</Badge>}
                    </HStack>
                  </MenuItem>
                ))}
                {(!girls || girls.length === 0) && (
                  <MenuItem _hover={{ bg: 'transparent' }} cursor="default">
                    <Text color="rgba(245,240,232,0.4)" fontSize="sm">暂无女生</Text>
                  </MenuItem>
                )}
              </MenuList>
            </Menu>
            {selectedGirlId && (
              <Button
                size="sm"
                colorScheme="gold"
                variant="outline"
                onClick={() => {
                  setShowAnalysisModal(true);
                  loadGirlAnalysis(selectedGirlId);
                }}
                isLoading={girlAnalysisLoading}
              >
                分析
              </Button>
            )}
          </HStack>
        </Flex>

        {/* Main: Left (Tabs) + Right (Context) */}
        <Flex flex="1" minH="0" overflow="hidden" gap={0}>
          {/* Left side */}
          <Box flex="1" minW="0" display="flex" flexDirection="column">
            <Tabs
              variant="soft-rounded" colorScheme="gold"
              index={activeTabIndex} onChange={(i) => {
                setActiveTabIndex(i);
                try { localStorage.setItem('zhuiai_active_tab', String(i)); } catch {}
              }}
              sx={{ display: 'flex', flexDirection: 'column', flex: 1, minH: 0, overflow: 'hidden' }}
            >
              <TabList bg="warm.800" borderRadius="lg" p={1} flexShrink={0}>
                <Tab color="rgba(245,240,232,0.4)" _selected={{ color: 'white', bg: 'gold.600' }} fontSize="sm">
                  🤖 AI教练
                </Tab>
                <Tab color="rgba(245,240,232,0.4)" _selected={{ color: 'white', bg: 'gold.600' }} fontSize="sm">
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
                      contextData={girlContextData}
                      onCopy={handleCopySuggestion}
                      onFavorite={handleFavoriteSuggestion}
                      isSaved={savedReplies}
                      onDelete={handleDeleteCombatMessage}
                    />
                    <CombatInputBar
                      mode={combatMode}
                      onModeChange={handleCombatModeChange}
                      value={combatInput}
                      onChange={setCombatInput}
                      onSubmit={handleCombatSend}
                      loading={combatLoading}
                      girlName={selectedGirl?.name}
                      onImportClick={() => setImportModalOpen(true)}
                    />
                  </Box>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Box>

          {/* Right side: Context panel - 仅聊天实战Tab显示 */}
          <Box display={{ base: 'none', lg: activeTabIndex === 1 ? 'flex' : 'none' }} w="320px" flexShrink={0}>
            <GirlContextSidebar girl={selectedGirl} contextData={girlContextData} />
          </Box>
        </Flex>

        {/* 聊天导入弹窗 */}
        {selectedGirl && (
          <ImportChatModal
            isOpen={importModalOpen}
            onClose={() => setImportModalOpen(false)}
            girlId={selectedGirlId}
            girlName={selectedGirl?.name}
            apiUrl={apiUrl}
            onImportComplete={handleImportComplete}
            toast={toast}
          />
        )}
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
        deepMode={deepMode}
        onDeepModeToggle={handleDeepModeToggle}
      />
      {/* 固定高度的消息容器，flex布局 */}
      <Box flex="1" minH="0" display="flex" flexDirection="column" bg="warm.800" borderRadius="md" mb={2} overflow="hidden">
        {/* 消息列表区域 - 可滚动 */}
        <Box id="chat-scroll-container" flex="1" overflowY="auto" p={4} ref={scrollContainerRef} sx={{ overflowAnchor: 'none' }}>
          {loadingHistory ? (
            <VStack spacing={4} py={8} justify="center" minH="200px">
              <Spinner size="xl" color="gold.400" />
              <Text color="rgba(245,240,232,0.4)">加载聊天历史...</Text>
            </VStack>
          ) : messages.length === 0 ? (
            <VStack spacing={4} py={8} justify="center" minH="200px">
              <Text color="rgba(245,240,232,0.4)" textAlign="center">
                描述你的情况，AI 教练为你分析
              </Text>
              <Wrap spacing={2} justify="center">
                {QUICK_QUESTIONS.map((q, i) => (
                  <WrapItem key={i}>
                    <Button
                      size="sm"
                      variant="outline"
                      colorScheme="gold"
                      onClick={() => handleSubmitInternal(q)}
                      isDisabled={loading}
                      borderRadius="xl"
                      px={4}
                      _hover={{ bg: 'rgba(226,176,68,0.12)', borderColor: 'gold.400' }}
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
        onImageSubmit={handleImageSubmit}
        onStop={handleStop}
        loading={loading}
        deepMode={deepMode}
        onDeepModeToggle={handleDeepModeToggle}
        onNewConversation={handleNewConversation}
      />
    </>
  );

  return (
    <Box display="flex" flexDirection="column" h={{ base: 'calc(100vh - 96px)', lg: 'calc(100vh - 48px)' }} overflow="hidden">
      <Flex justify="space-between" align="center" mb={3} flexShrink={0} gap={3}>
        <Heading color="white" size="md">AI教练</Heading>
        <HStack spacing={2}>
          <Menu>
            <MenuButton as={Button} size="sm" variant="outline" colorScheme="gold" borderColor="gold.600" _hover={{ bg: 'gold.900' }} rightIcon={<Text fontSize="xs">▼</Text>}>
              {selectedGirlId ? (
                <HStack spacing={2}>
                  <Avatar size="xs" name={girls.find(g => g.id === selectedGirlId)?.name} src={girls.find(g => g.id === selectedGirlId)?.avatar} bg="gold.500" />
                  <Text>{girls.find(g => g.id === selectedGirlId)?.name}</Text>
                </HStack>
              ) : (
                <Text color="rgba(245,240,232,0.6)">关联女生</Text>
              )}
            </MenuButton>
            <MenuList bg="warm.800" borderColor="warm.600" minW="180px">
              {(girls || []).map(g => (
                <MenuItem key={g.id} _hover={{ bg: 'warm.700' }} onClick={() => handleGirlChange(g.id)}>
                  <HStack spacing={2}>
                    <Avatar size="xs" name={g.name} src={g.avatar} bg="gold.500" />
                    <Text>{g.name}</Text>
                    {g.stage && <Badge size="sm" colorScheme="orange" fontSize="10px">{g.stage}</Badge>}
                  </HStack>
                </MenuItem>
              ))}
              {(!girls || girls.length === 0) && (
                <MenuItem _hover={{ bg: 'transparent' }} cursor="default">
                  <Text color="rgba(245,240,232,0.4)" fontSize="sm">暂无女生</Text>
                </MenuItem>
              )}
            </MenuList>
          </Menu>
          {selectedGirlId && (
            <Button
              size="sm"
              colorScheme="gold"
              variant="outline"
              onClick={() => {
                setShowAnalysisModal(true);
                loadGirlAnalysis(selectedGirlId);
              }}
              isLoading={girlAnalysisLoading}
            >
              分析
            </Button>
          )}
        </HStack>
      </Flex>

      <Tabs variant="soft-rounded" colorScheme="gold" sx={{ display: 'flex', flexDirection: 'column', flex: 1, minH: 0, overflow: 'hidden' }} defaultIndex={0}>
        <TabList bg="warm.800" borderRadius="lg" p={1} flexShrink={0}>
          <Tab color="rgba(245,240,232,0.4)" _selected={{ color: 'white', bg: 'gold.600' }} fontSize="sm">
            🤖 AI教练
          </Tab>
          <Tab color="rgba(245,240,232,0.4)" _selected={{ color: 'white', bg: 'gold.600' }} fontSize="sm">
            💡 回复建议
          </Tab>
          <Tab color="rgba(245,240,232,0.4)" _selected={{ color: 'white', bg: 'gold.600' }} fontSize="sm">
            ⚡ 话术优化
          </Tab>
        </TabList>

        <TabPanels sx={{ display: 'flex', flex: 1, minH: 0 }}>
          <TabPanel px={0} py={2} sx={{ display: 'flex', flexDirection: 'column', flex: 1, minH: 0, overflow: 'hidden' }}>
            <Box flex="1" minH="0" display="flex" flexDirection="column" overflow="hidden">
              {aiCoachContent}
            </Box>
          </TabPanel>
          <TabPanel px={0} py={2} sx={{ display: 'flex', flexDirection: 'column', flex: 1, minH: 0, overflow: 'hidden' }}>
            <Box flex="1" minH="0" overflow="auto" p={2}>
              <ReplySuggestionsPanel apiUrl={apiUrl} selectedGirlId={selectedGirlId} toast={toast} />
            </Box>
          </TabPanel>
          <TabPanel px={0} py={2} sx={{ display: 'flex', flexDirection: 'column', flex: 1, minH: 0, overflow: 'hidden' }}>
            <Box flex="1" minH="0" overflow="auto" p={2}>
              <OptimizeReplyPanel apiUrl={apiUrl} selectedGirlId={selectedGirlId} toast={toast} />
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* 女生分析弹窗 */}
      <Modal isOpen={showAnalysisModal} onClose={() => setShowAnalysisModal(false)} size="xl">
        <ModalOverlay />
        <ModalContent bg="warm.800" color="white" maxH="80vh">
          <ModalHeader borderBottom="1px solid" borderColor="whiteAlpha.200">
            <Flex align="center" gap={2}>
              <Text>女生分析</Text>
              {selectedGirl && <Badge colorScheme="gold">{selectedGirl.name}</Badge>}
              {girlAnalysisLoading && <Spinner size="sm" color="gold.400" />}
            </Flex>
          </ModalHeader>
          <ModalBody py={4} overflowY="auto" maxH="calc(80vh - 120px)">
            {/* 思考过程 */}
            {girlAnalysisReasoning && (
              <Box mb={4} p={3} bg="warm.700" borderRadius="md" fontSize="13px">
                <Text color="gold.300" fontSize="xs" mb={1}>思考过程</Text>
                <Box color="rgba(245,240,232,0.6)" lineHeight="1.7">
                  <Box dangerouslySetInnerHTML={{ __html: renderMD(girlAnalysisReasoning) }} />
                </Box>
              </Box>
            )}
            {/* 分析内容 */}
            {girlAnalysisContent && (
              <Box fontSize="14px" lineHeight="1.8">
                <Box dangerouslySetInnerHTML={{ __html: renderMD(fixMarkdown(girlAnalysisContent)) }} />
              </Box>
            )}
            {!girlAnalysisContent && !girlAnalysisLoading && (
              <Text color="rgba(245,240,232,0.4)" textAlign="center" py={8}>
                点击"分析"按钮开始分析
              </Text>
            )}
          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200">
            <Button variant="ghost" onClick={() => setShowAnalysisModal(false)}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

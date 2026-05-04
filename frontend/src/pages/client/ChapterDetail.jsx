import { Box, Text, VStack, HStack, Button, Badge, Spinner, Center, IconButton, useToast } from '@chakra-ui/react';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { membership as membershipApi } from '../../utils/api';
import useKeepAliveData from '../../hooks/useKeepAliveData';
import { ArrowLeftIcon, CheckIcon, BookIcon } from '../../components/Icons';

// 解析 Markdown 粗体 **text**
function parseBold(text) {
  const parts = [];
  let remaining = text;
  let key = 0;
  while (remaining) {
    const match = remaining.match(/\*\*(.+?)\*\*/);
    if (match) {
      const idx = remaining.indexOf(match[0]);
      if (idx > 0) parts.push(<Text as="span" key={key++}>{remaining.slice(0, idx)}</Text>);
      parts.push(<Text as="span" key={key++} fontWeight="bold" color="gold.200">{match[1]}</Text>);
      remaining = remaining.slice(idx + match[0].length);
    } else {
      parts.push(<Text as="span" key={key++}>{remaining}</Text>);
      break;
    }
  }
  return parts;
}

export default function ChapterDetail() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [chapter, setChapter] = useState(null);
  const [allChapters, setAllChapters] = useState([]);
  const [progress, setProgress] = useState(null);
  const [personalizedContent, setPersonalizedContent] = useState(null);
  const [personalizedStale, setPersonalizedStale] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);
  const contentRef = useRef(null);

  // 禁止复制：全局键盘拦截
  useEffect(() => {
    function block(e) {
      if (e.ctrlKey || e.metaKey) {
        const key = e.key?.toLowerCase();
        if (['c', 'a', 'u', 's', 'p'].includes(key) || key === 'f12') {
          e.preventDefault();
        }
      }
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
        e.preventDefault();
      }
    }
    document.addEventListener('keydown', block);
    return () => document.removeEventListener('keydown', block);
  }, []);

  // 切换章节时滚动到顶部
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [chapterId]);

  // 自动标记为学习中
  useEffect(() => {
    if (chapter && (!progress || progress.status === 'not_started')) {
      updateProgress('in_progress');
    }
  }, [chapter, progress]);

  const { isInitialLoad } = useKeepAliveData(async () => {
    const [chRes, progRes, perRes] = await Promise.all([
      membershipApi.chapters().catch(() => ({ success: false })),
      membershipApi.learningProgress().catch(() => ({ success: false })),
      membershipApi.getPersonalizedChapter(chapterId).catch(() => null),
    ]);
    if (chRes.success) {
      const sorted = chRes.chapters;
      setAllChapters(sorted);
      const ch = sorted.find(c => c.chapterId === chapterId);
      setChapter(ch);
    }
    if (progRes.success) {
      const prog = progRes.progress.find(p => p.chapterId === chapterId);
      setProgress(prog);
    }
    if (perRes?.success && perRes.personalized) {
      setPersonalizedContent(perRes.personalized.content);
      setPersonalizedStale(perRes.personalized.isStale);
    }
    return true;
  }, { key: `/learning/${chapterId}`, refreshOnActivate: false });

  async function updateProgress(status) {
    try {
      const res = await membershipApi.updateLearningProgress(chapterId, status);
      if (res.success) {
        setProgress(res.progress);
        if (status === 'completed') {
          toast({
            title: '恭喜完成本章！',
            status: 'success',
            duration: 2000
          });
        }
      }
    } catch (err) {
      // 静默失败，不打扰用户
    }
  }

  function handleScroll(e) {
    const currentY = e.target.scrollTop;
    if (currentY > lastScrollY.current && currentY > 60) {
      setHeaderVisible(false);
    } else if (currentY < lastScrollY.current || currentY < 60) {
      setHeaderVisible(true);
    }
    lastScrollY.current = currentY;
  }

  const status = progress?.status || 'not_started';
  const statusColor = status === 'completed' ? 'green' : status === 'in_progress' ? 'blue' : 'gray';
  const statusLabel = status === 'completed' ? '已学完' : status === 'in_progress' ? '进行中' : '未开始';

  // 计算上一章/下一章
  const currentIndex = allChapters.findIndex(c => c.chapterId === chapterId);
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

  if (isInitialLoad) return (
    <Center h="100vh" bg="warm.900">
      <Spinner color="gold.400" />
    </Center>
  );

  if (!chapter) return (
    <Center h="100vh" bg="warm.900">
      <VStack>
        <Text color="rgba(245,240,232,0.4)">章节不存在</Text>
        <Button onClick={() => navigate('/learning')}>返回学习中心</Button>
      </VStack>
    </Center>
  );

  return (
    <Box
      h="100vh"
      overflow="hidden"
      bg="warm.900"
      position="relative"
    >
      {/* 顶部导航 - 沉浸式隐藏 */}
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        zIndex={10}
        bg="warm.900"
        pb={4}
        pt={{ base: 'env(safe-area-inset-top, 16px)', md: 12 }}
        px={6}
        transition="transform 0.3s ease"
        transform={headerVisible ? 'translateY(0)' : 'translateY(-100%)'}
      >
        <HStack justify="space-between" align="flex-start">
          <VStack align="flex-start" spacing={1}>
            <HStack gap={2}>
              <Badge colorScheme={statusColor} variant="subtle" fontSize="xs">
                {statusLabel}
              </Badge>
              <Text color="rgba(245,240,232,0.55)" fontSize="xs">第 {chapter.chapterId} 章</Text>
            </HStack>
            <Text color="white" fontSize="xl" fontWeight="bold" lineHeight="short">
              {chapter.title}
            </Text>
            {chapter.subtitle && (
              <Text color="rgba(245,240,232,0.4)" fontSize="sm">{chapter.subtitle}</Text>
            )}
          </VStack>
          <IconButton
            icon={<ArrowLeftIcon />}
            onClick={() => navigate('/learning')}
            aria-label="返回"
            color="white"
            bg="whiteAlpha.200"
            _hover={{ bg: 'whiteAlpha.300' }}
            borderRadius="full"
            size="md"
          />
        </HStack>
      </Box>

      {/* 阅读内容区 */}
      <Box
        ref={contentRef}
        h="100%"
        overflow="auto"
        pt={{ base: 'calc(env(safe-area-inset-top, 16px) + 36px)', md: 36 }}
        pb={8}
        px={6}
        onScroll={handleScroll}
        onContextMenu={(e) => e.preventDefault()}
        userSelect="none"
        css={{
          '&::-webkit-scrollbar': { width: '4px' },
          '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: '2px' },
        }}
      >
        {chapter.content ? (
          <Box
            maxW="680px"
            mx="auto"
            pb={12}
          >
            {/* 章节引导信息 */}
            <Box mb={8} pb={6} borderBottom="1px solid" borderColor="warm.800">
              <HStack gap={3} mb={4}>
                <Box
                  w="48px"
                  h="48px"
                  borderRadius="xl"
                  bg={status === 'completed' ? 'green.900' : 'rgba(0,212,170,0.15)'}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  {status === 'completed' ? (
                    <CheckIcon color="green.400" />
                  ) : (
                    <Text color="gold.400" fontWeight="bold" fontSize="lg">{chapter.chapterId}</Text>
                  )}
                </Box>
                <VStack align="flex-start" spacing={0}>
                  <Text color="white" fontWeight="semibold" fontSize="lg">{chapter.title}</Text>
                  {chapter.subtitle && (
                    <Text color="rgba(245,240,232,0.55)" fontSize="sm">{chapter.subtitle}</Text>
                  )}
                </VStack>
              </HStack>
            </Box>

            {/* 正文 */}
            <Box
              color="rgba(245,240,232,0.6)"
              fontSize="18px"
              lineHeight="1.9"
              fontFamily="'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
            >
              {(() => {
                const displayContent = personalizedContent || chapter.content;
                const lines = displayContent.split('\n');
                const usedIndices = new Set();
                const elements = [];

                for (let i = 0; i < lines.length; i++) {
                  if (usedIndices.has(i)) continue;
                  const line = lines[i];
                  const trimmed = line.trim();

                  // 分隔线 ---
                  if (trimmed === '---') {
                    elements.push(<Box key={i} my={6} borderBottom="1px solid" borderColor="warm.700" />);
                    continue;
                  }

                  if (!trimmed) {
                    elements.push(<Box key={i} h={4} />);
                    continue;
                  }

                  // 表格检测
                  if (trimmed.startsWith('|')) {
                    const tableLines = [];
                    let j = i;
                    while (j < lines.length && lines[j].trim().startsWith('|')) {
                      tableLines.push(lines[j].trim());
                      usedIndices.add(j);
                      j++;
                    }
                    // 过滤分隔行
                    const dataLines = tableLines.filter(line => !line.match(/^\|[\s\-:|]+\|$/));
                    if (dataLines.length >= 1) {
                      const rows = dataLines.map((rowLine, ri) => {
                        const cells = rowLine.split('|').filter((_, ci) => ci > 0 && ci < rowLine.split('|').length - 1);
                        return (
                          <Box key={ri} display="flex" borderBottom={ri < dataLines.length - 1 ? '1px solid' : 'none'} borderColor="warm.700">
                            {cells.map((cell, ci) => (
                              <Box key={ci} flex={1} py={2} px={3} fontSize="sm" color={ri === 0 ? 'white' : 'rgba(245,240,232,0.6)'} fontWeight={ri === 0 ? 'bold' : 'normal'} textAlign="left">
                                {parseBold(cell.trim())}
                              </Box>
                            ))}
                          </Box>
                        );
                      });
                      elements.push(<Box key={'table-' + i} mb={4} bg="rgba(255,255,255,0.03)" borderRadius="lg" overflow="hidden">{rows}</Box>);
                    }
                    continue;
                  }

                  // 标题格式
                  if (trimmed.startsWith('### ')) {
                    elements.push(
                      <Text key={i} color="gold.300" fontSize="lg" fontWeight="medium" mt={5} mb={2}>
                        {trimmed.slice(4)}
                      </Text>
                    );
                    continue;
                  }
                  if (trimmed.startsWith('## ')) {
                    elements.push(
                      <Text key={i} color="white" fontSize="xl" fontWeight="semibold" mt={6} mb={3}>
                        {trimmed.slice(3)}
                      </Text>
                    );
                    continue;
                  }
                  if (trimmed.startsWith('# ')) {
                    elements.push(
                      <Text key={i} color="white" fontSize="2xl" fontWeight="bold" mt={8} mb={4}>
                        {trimmed.slice(2)}
                      </Text>
                    );
                    continue;
                  }
                  // 空标题跳过
                  if (/^#{1,6}$/.test(trimmed)) {
                    continue;
                  }
                  // 其他 # 开头
                  if (trimmed.startsWith('#')) {
                    const match = trimmed.match(/^#+\s+(.+)/);
                    if (match) {
                      elements.push(
                        <Text key={i} color="rgba(245,240,232,0.6)" fontSize="md" fontWeight="medium" mt={4} mb={2}>
                          {match[1]}
                        </Text>
                      );
                    }
                    continue;
                  }

                  // 列表
                  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                    elements.push(
                      <HStack key={i} align="flex-start" mb={2} gap={3}>
                        <Text color="gold.400" mt={1}>·</Text>
                        <Text flex={1}>{parseBold(trimmed.slice(2))}</Text>
                      </HStack>
                    );
                    continue;
                  }

                  // 引用/重点
                  if (trimmed.startsWith('> ')) {
                    elements.push(
                      <Box
                        key={i}
                        ml={0}
                        pl={4}
                        borderLeft="3px solid"
                        borderColor="gold.400"
                        py={2}
                        mb={3}
                        color="rgba(245,240,232,0.6)"
                        fontStyle="italic"
                      >
                        {parseBold(trimmed.slice(2))}
                      </Box>
                    );
                    continue;
                  }

                  // 普通段落
                  elements.push(
                    <Text key={i} mb={4}>
                      {parseBold(trimmed)}
                    </Text>
                  );
                }

                return elements;
              })()}
            </Box>
          </Box>
        ) : (
          <Center py={20}>
            <VStack>
              <BookIcon boxSize={12} color="rgba(245,240,232,0.2)" />
              <Text color="rgba(245,240,232,0.4)" mt={4}>暂无章节内容</Text>
              <Text color="rgba(245,240,232,0.55)" fontSize="sm" mt={1}>请联系管理员添加内容</Text>
            </VStack>
          </Center>
        )}

        {/* 底部操作栏 - 章节导航 */}
        <Box
          mt={12}
          pt={6}
          pb={4}
          px={2}
          borderTop="1px solid"
          borderColor="warm.800"
        >
          <HStack justify="space-between" gap={4}>
            {prevChapter ? (
              <Button
                flex={1}
                size="lg"
                variant="ghost"
                colorScheme="gray"
                onClick={() => navigate(`/learning/${prevChapter.chapterId}`)}
                borderRadius="xl"
                bg="rgba(255,255,255,0.05)"
                _hover={{ bg: 'rgba(255,255,255,0.1)' }}
              >
                <VStack spacing={0} align="center">
                  <Text fontSize="xs" color="rgba(245,240,232,0.2)">上一章</Text>
                  <Text fontSize="sm">{prevChapter.title}</Text>
                </VStack>
              </Button>
            ) : (
              <Button
                flex={1}
                size="lg"
                variant="ghost"
                colorScheme="gray"
                onClick={() => navigate('/learning')}
                borderRadius="xl"
                bg="rgba(255,255,255,0.05)"
                _hover={{ bg: 'rgba(255,255,255,0.1)' }}
              >
                <Text fontSize="sm">返回目录</Text>
              </Button>
            )}

            {nextChapter && (
              <Button
                flex={1}
                size="lg"
                colorScheme="gold"
                onClick={() => navigate(`/learning/${nextChapter.chapterId}`)}
                borderRadius="xl"
              >
                <VStack spacing={0} align="center">
                  <Text fontSize="xs" color="gold.200">下一章</Text>
                  <Text fontSize="sm">{nextChapter.title}</Text>
                </VStack>
              </Button>
            )}
          </HStack>
        </Box>
      </Box>
    </Box>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Flex, VStack, HStack, Button, FormControl, FormLabel, Input,
  Textarea, useToast, Spinner, Center, Text, IconButton,
  useBreakpointValue
} from '@chakra-ui/react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiEye, FiEdit3, FiArrowLeft } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { membership as membershipApi } from '../../utils/api';
import useKeepAliveData from '../../hooks/useKeepAliveData';

export default function ChapterEditor() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = !!chapterId;

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const isMobile = useBreakpointValue({ base: true, lg: false });

  // 滚动同步
  const textareaRef = useRef(null);
  const previewRef = useRef(null);
  const syncing = useRef(false);

  const syncScroll = useCallback((source, target) => {
    if (syncing.current) return;
    syncing.current = true;
    const maxScroll = source.scrollHeight - source.clientHeight;
    if (maxScroll <= 0) { syncing.current = false; return; }
    const pct = source.scrollTop / maxScroll;
    const targetMax = target.scrollHeight - target.clientHeight;
    target.scrollTop = pct * targetMax;
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  const { isInitialLoad } = useKeepAliveData(async () => {
    if (!isEdit) return true;
    const res = await membershipApi.adminGetChapter(chapterId);
    if (res.success) {
      const ch = res.chapter;
      setTitle(ch.title || '');
      setSubtitle(ch.subtitle || '');
      setContent(ch.content || '');
      setStatus(ch.status || 'draft');
    } else {
      toast({ title: '章节不存在', status: 'error', duration: 4000 });
      navigate('/admin/chapters');
    }
    return true;
  }, { key: isEdit ? `/admin/chapters/${chapterId}` : '/admin/chapters/new', refreshOnActivate: true });

  async function handleSave() {
    if (!title.trim()) {
      toast({ title: '标题不能为空', status: 'warning', duration: 3000, duration: 2000 });
      return;
    }
    setSaving(true);
    try {
      const data = { title: title.trim(), subtitle: subtitle.trim(), content, status };
      const res = isEdit
        ? await membershipApi.adminUpdateChapter(chapterId, data)
        : await membershipApi.adminCreateChapter(data);
      if (res.success) {
        toast({ title: isEdit ? '已保存' : '已创建', status: 'success', duration: 2000 });
        navigate('/admin/chapters');
      }
    } catch (err) {
      toast({ title: '保存失败', description: err.message, status: 'error', duration: 4000, duration: 3000 });
    } finally {
      setSaving(false);
    }
  }

  if (isEdit && isInitialLoad) {
    return (
      <Center h="400px">
        <Spinner color="teal.400" />
      </Center>
    );
  }

  return (
    <Box h="calc(100vh - 48px)">
      {/* 顶部栏 */}
      <HStack justify="space-between" mb={4}>
        <HStack spacing={3}>
          <IconButton
            icon={<FiArrowLeft />}
            aria-label="返回"
            variant="ghost"
            color="rgba(245,240,232,0.4)"
            onClick={() => navigate('/admin/chapters')}
          />
          <Text color="white" fontSize="xl" fontWeight="bold">
            {isEdit ? '编辑章节' : '新建章节'}
          </Text>
          {isEdit && (
            <Text color="rgba(245,240,232,0.6)" fontSize="sm">第 {chapterId} 章</Text>
          )}
        </HStack>
        <HStack spacing={3}>
          {/* 移动端切换预览按钮 */}
          {isMobile && (
            <Button
              variant="ghost"
              colorScheme={previewMode ? 'teal' : 'gray'}
              leftIcon={previewMode ? <FiEdit3 /> : <FiEye />}
              onClick={() => setPreviewMode(!previewMode)}
            >
              {previewMode ? '编辑' : '预览'}
            </Button>
          )}
          <Button variant="ghost" colorScheme="gray" onClick={() => navigate('/admin/chapters')}>
            取消
          </Button>
          <Button colorScheme="gold" onClick={handleSave} isLoading={saving} px={8}>
            保存
          </Button>
        </HStack>
      </HStack>

      {/* 编辑区域 */}
      <Flex gap={4} h="calc(100% - 64px)" direction={{ base: 'column', lg: 'row' }}>
        {/* 左侧：表单 */}
        <Box
          flex={1}
          display={{ base: previewMode ? 'none' : 'block', lg: 'block' }}
          overflow="auto"
        >
          <VStack spacing={4} align="stretch" bg="warm.800" p={6} borderRadius="lg">
            <FormControl isRequired>
              <FormLabel color="gray.300">标题</FormLabel>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="章节标题"
                bg="warm.700"
                border="none"
                color="white"
                fontSize="lg"
                _placeholder={{ color: 'rgba(245,240,232,0.4)' }}
              />
            </FormControl>

            <FormControl>
              <FormLabel color="gray.300">副标题</FormLabel>
              <Input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="副标题（可选）"
                bg="warm.700"
                border="none"
                color="white"
                _placeholder={{ color: 'rgba(245,240,232,0.4)' }}
              />
            </FormControl>

            <FormControl>
              <FormLabel color="gray.300">状态</FormLabel>
              <HStack spacing={3}>
                <Button
                  size="sm"
                  variant={status === 'draft' ? 'solid' : 'outline'}
                  colorScheme={status === 'draft' ? 'gray' : 'gray'}
                  onClick={() => setStatus('draft')}
                >
                  下架
                </Button>
                <Button
                  size="sm"
                  variant={status === 'published' ? 'solid' : 'outline'}
                  colorScheme={status === 'published' ? 'green' : 'green'}
                  onClick={() => setStatus('published')}
                >
                  上架
                </Button>
              </HStack>
            </FormControl>

            <FormControl flex={1} display="flex" flexDirection="column">
              <FormLabel color="gray.300">正文（Markdown）</FormLabel>
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onScroll={() => {
                  if (textareaRef.current && previewRef.current) {
                    syncScroll(textareaRef.current, previewRef.current);
                  }
                }}
                placeholder="在此编写 Markdown 格式的章节内容..."
                bg="warm.700"
                border="none"
                color="white"
                fontFamily="monospace"
                fontSize="14px"
                lineHeight="1.8"
                flex={1}
                minH="400px"
                resize="none"
                _placeholder={{ color: 'rgba(245,240,232,0.4)' }}
                sx={{
                  '&::-webkit-scrollbar': { width: '4px' },
                  '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: '2px' },
                }}
              />
            </FormControl>
          </VStack>
        </Box>

        {/* 右侧：实时预览 */}
        <Box
          ref={previewRef}
          flex={1}
          display={{ base: previewMode ? 'block' : 'none', lg: 'block' }}
          overflow="auto"
          onScroll={() => {
            if (previewRef.current && textareaRef.current) {
              syncScroll(previewRef.current, textareaRef.current);
            }
          }}
          bg="warm.800"
          borderRadius="lg"
          p={6}
          borderLeft={{ lg: '1px solid' }}
          borderColor="warm.700"
        >
          <Text color="rgba(245,240,232,0.6)" fontSize="xs" mb={4} letterSpacing="wider">
            实时预览
          </Text>

          {title ? (
            <Box mb={6} pb={4} borderBottom="1px solid" borderColor="warm.700">
              <Text color="white" fontSize="2xl" fontWeight="bold">{title}</Text>
              {subtitle && <Text color="rgba(245,240,232,0.4)" mt={1}>{subtitle}</Text>}
            </Box>
          ) : (
            <Box mb={6} pb={4} borderBottom="1px solid" borderColor="warm.700">
              <Text color="warm.600" fontSize="2xl" fontStyle="italic">输入标题后在此预览</Text>
            </Box>
          )}

          {content ? (
            <Box
              className="markdown-body"
              color="gray.200"
              fontSize="15px"
              lineHeight="1.9"
              sx={{
                'h1,h2,h3,h4,h5,h6': { color: 'teal.300', mt: 5, mb: 2, fontWeight: 'bold' },
                h1: { fontSize: 'xl', borderBottom: '1px solid', borderColor: 'warm.700', pb: 2 },
                h2: { fontSize: 'lg' },
                h3: { fontSize: 'md' },
                p: { mb: 3 },
                'ul,ol': { pl: 5, mb: 3 },
                li: { mb: 1 },
                code: { bg: 'warm.700', px: 1.5, py: 0.5, borderRadius: 'sm', fontSize: 'xs' },
                pre: { bg: 'gray.900', p: 3, borderRadius: 'md', overflowX: 'auto', mb: 3 },
                blockquote: {
                  borderLeft: '3px solid', borderColor: 'teal.500', pl: 3, color: 'rgba(245,240,232,0.4)', mb: 3,
                  fontStyle: 'italic'
                },
                table: { w: '100%', mb: 3, borderCollapse: 'collapse' },
                th: { bg: 'warm.700', p: 2, textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid', borderColor: 'warm.600' },
                td: { p: 2, borderBottom: '1px solid', borderColor: 'warm.700' },
                strong: { color: 'white' },
                a: { color: 'teal.300' },
                hr: { borderColor: 'warm.700', my: 4 },
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </Box>
          ) : (
            <Text color="warm.600" fontStyle="italic">输入正文后在此预览</Text>
          )}
        </Box>
      </Flex>
    </Box>
  );
}

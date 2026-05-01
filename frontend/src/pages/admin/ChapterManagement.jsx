import { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, HStack, Button, Badge, Table, Thead, Tbody, Tr, Th, Td,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton,
  useDisclosure, useToast, Spinner, Center,
  VStack, Text, AlertDialog, AlertDialogOverlay, AlertDialogContent,
  AlertDialogHeader, AlertDialogBody, AlertDialogFooter, Tooltip, Icon
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { FiEdit2, FiTrash2, FiPlus, FiEye, FiEyeOff, FiGlobe, FiMenu } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { membership as membershipApi } from '../../utils/api';

// 预览 Modal（Markdown 渲染）
function PreviewModal({ isOpen, onClose, chapterId, chapter }) {
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && chapterId) {
      setLoading(true);
      membershipApi.adminGetChapter(chapterId)
        .then(res => {
          if (res.success) setDetail(res.chapter);
          else toast({ title: '加载失败', status: 'error', duration: 2000 });
        })
        .catch(err => toast({ title: '加载失败', description: err.message, status: 'error', duration: 3000 }))
        .finally(() => setLoading(false));
    }
  }, [isOpen, chapterId, toast]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="gray.800" color="white" maxH="85vh">
        <ModalHeader>
          <HStack>
            <Text>{chapter?.title || detail?.title || '预览'}</Text>
            {detail && (
              <Badge colorScheme={detail.status === 'published' ? 'green' : 'gray'}>
                {detail.status === 'published' ? '已上架' : '已下架'}
              </Badge>
            )}
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {loading ? (
            <Center py={12}><Spinner color="teal.400" /></Center>
          ) : detail ? (
            <Box>
              {detail.subtitle && (
                <Text color="gray.400" fontSize="sm" mb={4}>{detail.subtitle}</Text>
              )}
              <Box
                className="markdown-body"
                color="gray.200"
                fontSize="sm"
                sx={{
                  'h1,h2,h3': { color: 'teal.300', mt: 5, mb: 2, fontWeight: 'bold' },
                  h1: { fontSize: 'xl', borderBottom: '1px solid', borderColor: 'gray.700', pb: 2 },
                  h2: { fontSize: 'lg' },
                  h3: { fontSize: 'md' },
                  p: { mb: 3, lineHeight: '1.8' },
                  'ul,ol': { pl: 5, mb: 3 },
                  li: { mb: 1 },
                  code: { bg: 'gray.700', px: 1.5, py: 0.5, borderRadius: 'sm', fontSize: 'xs' },
                  pre: { bg: 'gray.900', p: 3, borderRadius: 'md', overflowX: 'auto', mb: 3 },
                  blockquote: { borderLeft: '3px solid', borderColor: 'teal.500', pl: 3, color: 'gray.400', mb: 3 },
                  table: { w: '100%', mb: 3 },
                  th: { bg: 'gray.700', p: 2, textAlign: 'left', fontWeight: 'bold' },
                  td: { p: 2, borderBottom: '1px solid', borderColor: 'gray.700' },
                  strong: { color: 'white' },
                  a: { color: 'teal.300' },
                  hr: { borderColor: 'gray.700', my: 4 }
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detail.content || '*暂无正文*'}
                </ReactMarkdown>
              </Box>
            </Box>
          ) : (
            <Text color="gray.500" textAlign="center" py={8}>加载失败</Text>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

// 删除确认对话框
function DeleteDialog({ isOpen, onClose, chapter, onDeleted }) {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await membershipApi.adminDeleteChapter(chapter.chapterId);
      if (res.success) {
        toast({ title: '章节已删除', status: 'success', duration: 2000 });
        onDeleted();
        onClose();
      }
    } catch (err) {
      toast({ title: '删除失败', description: err.message, status: 'error', duration: 3000 });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog isOpen={isOpen} onClose={onClose} leastDestructiveRef={undefined}>
      <AlertDialogOverlay>
        <AlertDialogContent bg="gray.800" color="white">
          <AlertDialogHeader>确认删除</AlertDialogHeader>
          <AlertDialogBody>
            确定要删除章节「{chapter?.title}」吗？此操作不可撤销，相关的学习进度数据也会被清空。
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={onClose}>取消</Button>
            <Button colorScheme="red" onClick={handleDelete} isLoading={deleting} ml={3}>
              删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}

// 主页面
export default function ChapterManagement() {
  const navigate = useNavigate();
  const toast = useToast();
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [toggling, setToggling] = useState({});
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [reordering, setReordering] = useState(false);
  const { isOpen: isDeleteOpen, onOpen: openDelete, onClose: closeDelete } = useDisclosure();
  const { isOpen: isPreviewOpen, onOpen: openPreview, onClose: closePreview } = useDisclosure();

  const loadChapters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await membershipApi.adminListChapters();
      if (res.success) setChapters(res.chapters);
    } catch (err) {
      toast({ title: '加载失败', description: err.message, status: 'error', duration: 3000 });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadChapters(); }, [loadChapters]);

  function handleCreate() {
    navigate('/admin/chapters/new');
  }

  function handleEdit(chapter) {
    navigate(`/admin/chapters/${chapter.chapterId}/edit`);
  }

  function handleDeleteClick(chapter) {
    setDeleting(chapter);
    openDelete();
  }

  function handlePreview(chapter) {
    setPreviewing(chapter);
    openPreview();
  }

  async function handleToggle(chapter) {
    const newStatus = chapter.status === 'published' ? 'draft' : 'published';
    setToggling(prev => ({ ...prev, [chapter.chapterId]: true }));
    try {
      const res = await membershipApi.adminPublishChapter(chapter.chapterId, newStatus);
      if (res.success) {
        toast({
          title: newStatus === 'published' ? '已上架' : '已下架',
          status: 'success',
          duration: 1500
        });
        loadChapters();
      }
    } catch (err) {
      toast({ title: '操作失败', description: err.message, status: 'error', duration: 3000 });
    } finally {
      setToggling(prev => ({ ...prev, [chapter.chapterId]: false }));
    }
  }

  // 拖拽排序
  function handleDragStart(e, chapterId) {
    setDragId(chapterId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', chapterId);
  }

  function handleDragOver(e, chapterId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (chapterId !== dragId) {
      setDragOverId(chapterId);
    }
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  async function handleDrop(e, targetId) {
    e.preventDefault();
    setDragOverId(null);
    setDragId(null);

    if (!dragId || dragId === targetId) return;

    const newChapters = [...chapters];
    const dragIndex = newChapters.findIndex(c => c.chapterId === dragId);
    const targetIndex = newChapters.findIndex(c => c.chapterId === targetId);
    if (dragIndex === -1 || targetIndex === -1) return;

    const [removed] = newChapters.splice(dragIndex, 1);
    newChapters.splice(targetIndex, 0, removed);

    setChapters(newChapters);
    setReordering(true);

    try {
      const orderedIds = newChapters.map(c => c.chapterId);
      const res = await membershipApi.adminReorderChapters(orderedIds);
      if (!res.success) {
        toast({ title: '排序失败', status: 'error', duration: 2000 });
        loadChapters();
      }
    } catch (err) {
      toast({ title: '排序失败', description: err.message, status: 'error', duration: 3000 });
      loadChapters();
    } finally {
      setReordering(false);
    }
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  if (loading) {
    return (
      <Center h="200px">
        <Spinner color="teal.400" />
      </Center>
    );
  }

  return (
    <Box>
      <HStack justify="space-between" mb={6}>
        <Heading size="lg" color="white">学习版块管理</Heading>
        <Button
          leftIcon={<FiPlus />}
          colorScheme="teal"
          onClick={handleCreate}
        >
          新建章节
        </Button>
      </HStack>

      {chapters.length === 0 ? (
        <Center py={16}>
          <VStack spacing={3}>
            <Text color="gray.500" fontSize="lg">暂无章节数据</Text>
            <Button
              leftIcon={<FiPlus />}
              colorScheme="teal"
              variant="outline"
              onClick={handleCreate}
            >
              创建第一个章节
            </Button>
          </VStack>
        </Center>
      ) : (
        <Box borderRadius="md" overflow="hidden">
          <Table variant="simple" size="sm">
            <Thead>
              <Tr bg="gray.800">
                <Th color="gray.400" border="none" w="36px" />
                <Th color="gray.400" border="none" w="60px">ID</Th>
                <Th color="gray.400" border="none">标题</Th>
                <Th color="gray.400" border="none" display={{ base: 'none', md: 'table-cell' }}>副标题</Th>
                <Th color="gray.400" border="none" w="80px" textAlign="center">状态</Th>
                <Th color="gray.400" border="none" w="200px">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {chapters.map((ch) => (
                <Tr
                  key={ch.chapterId}
                  _hover={{ bg: 'gray.800' }}
                  borderBottom="1px"
                  borderColor="gray.700"
                  bg={dragOverId === ch.chapterId ? 'teal.900' : 'transparent'}
                  transition="background 0.15s"
                  draggable
                  onDragStart={(e) => handleDragStart(e, ch.chapterId)}
                  onDragOver={(e) => handleDragOver(e, ch.chapterId)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, ch.chapterId)}
                  onDragEnd={handleDragEnd}
                  cursor={dragId === ch.chapterId ? 'grabbing' : 'default'}
                  opacity={dragId === ch.chapterId ? 0.5 : 1}
                >
                  <Td border="none" p={2}>
                    <Icon
                      as={FiMenu}
                      color="gray.500"
                      cursor="grab"
                      _hover={{ color: 'teal.300' }}
                    />
                  </Td>
                  <Td color="gray.400" border="none">
                    <Badge colorScheme="teal" variant="subtle">{ch.chapterId}</Badge>
                  </Td>
                  <Td color="white" border="none" fontWeight="medium">{ch.title}</Td>
                  <Td color="gray.400" border="none" display={{ base: 'none', md: 'table-cell' }}>
                    {ch.subtitle || '—'}
                  </Td>
                  <Td border="none" textAlign="center">
                    <Badge colorScheme={ch.status === 'published' ? 'green' : 'gray'} variant="subtle">
                      {ch.status === 'published' ? '已上架' : '已下架'}
                    </Badge>
                  </Td>
                  <Td border="none">
                    <HStack spacing={1}>
                      <Tooltip label="预览" openDelay={500}>
                        <Button
                          size="xs"
                          variant="ghost"
                          colorScheme="cyan"
                          onClick={() => handlePreview(ch)}
                        >
                          <FiEye />
                        </Button>
                      </Tooltip>
                      <Tooltip label={ch.status === 'published' ? '下架' : '上架'} openDelay={500}>
                        <Button
                          size="xs"
                          variant="ghost"
                          colorScheme={ch.status === 'published' ? 'orange' : 'green'}
                          onClick={() => handleToggle(ch)}
                          isLoading={toggling[ch.chapterId]}
                        >
                          {ch.status === 'published' ? <FiEyeOff /> : <FiGlobe />}
                        </Button>
                      </Tooltip>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="teal"
                        leftIcon={<FiEdit2 />}
                        onClick={() => handleEdit(ch)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        leftIcon={<FiTrash2 />}
                        onClick={() => handleDeleteClick(ch)}
                      >
                        删除
                      </Button>
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      <DeleteDialog
        isOpen={isDeleteOpen}
        onClose={closeDelete}
        chapter={deleting}
        onDeleted={loadChapters}
      />

      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={closePreview}
        chapterId={previewing?.chapterId}
        chapter={previewing}
      />
    </Box>
  );
}

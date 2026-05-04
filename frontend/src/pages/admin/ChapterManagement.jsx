import { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, HStack, Button, Badge, Table, Thead, Tbody, Tr, Th, Td,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton,
  useDisclosure, useToast, Spinner, Center,
  VStack, Text, AlertDialog, AlertDialogOverlay, AlertDialogContent,
  AlertDialogHeader, AlertDialogBody, AlertDialogFooter, Tooltip, Icon,
  Switch, Divider, Collapse, Input
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { FiEdit2, FiTrash2, FiPlus, FiEye, FiEyeOff, FiGlobe, FiMenu, FiChevronDown, FiChevronUp, FiUsers, FiFileText, FiX } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { membership as membershipApi } from '../../utils/api';
import useKeepAliveData from '../../hooks/useKeepAliveData';

// 个性化内容对比 Modal
function PersonalizationDetailModal({ isOpen, onClose, user }) {
  const toast = useToast();
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedChapterId, setExpandedChapterId] = useState(null);

  useEffect(() => {
    if (isOpen && user) {
      setLoading(true);
      setExpandedChapterId(null);
      membershipApi.adminGetUserPersonalizedChapters(user.id)
        .then(res => { if (res.success) setChapters(res.chapters); })
        .catch(err => toast({ title: '加载失败', description: err.message, status: 'error', duration: 4000 }))
        .finally(() => setLoading(false));
    }
  }, [isOpen, user, toast]);

  const statusColor = { completed: 'green', generating: 'blue', failed: 'red', pending: 'gray' };
  const statusLabel = { completed: '已完成', generating: '生成中', failed: '失败', pending: '待处理' };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="warm.900" color="white">
        <ModalHeader>
          <HStack justify="space-between">
            <HStack>
              <Text>{user?.nickname || user?.username} · 个性化内容对比</Text>
              <Badge colorScheme="purple">{chapters.length} 章</Badge>
            </HStack>
            <Button size="sm" variant="ghost" onClick={onClose}><FiX /></Button>
          </HStack>
        </ModalHeader>
        <ModalBody pb={6}>
          {loading ? (
            <Center py={12}><Spinner color="teal.400" /></Center>
          ) : chapters.length === 0 ? (
            <Center py={12}>
              <Text color="rgba(245,240,232,0.6)">该用户暂无个性化章节</Text>
            </Center>
          ) : (
            <VStack align="stretch" spacing={3}>
              {chapters.map((ch) => (
                <Box
                  key={ch.chapterId}
                  borderRadius="md"
                  border="1px"
                  borderColor={expandedChapterId === ch.chapterId ? 'purple.600' : 'warm.700'}
                  overflow="hidden"
                >
                  {/* 章节标题行 */}
                  <HStack
                    p={3}
                    justify="space-between"
                    cursor="pointer"
                    onClick={() => setExpandedChapterId(expandedChapterId === ch.chapterId ? null : ch.chapterId)}
                    _hover={{ bg: 'warm.800' }}
                    transition="background 0.15s"
                  >
                    <HStack gap={3}>
                      <Badge colorScheme="gold" variant="subtle" w="36px" textAlign="center">{ch.chapterId}</Badge>
                      <Text color="white" fontWeight="medium">{ch.title}</Text>
                    </HStack>
                    <HStack gap={2}>
                      <Badge colorScheme={statusColor[ch.status] || 'gray'} variant="subtle">
                        {statusLabel[ch.status] || ch.status}
                      </Badge>
                      <Text color="rgba(245,240,232,0.6)" fontSize="xs">
                        {new Date(ch.updatedAt).toLocaleDateString()}
                      </Text>
                      <Icon as={expandedChapterId === ch.chapterId ? FiChevronUp : FiChevronDown} color="rgba(245,240,232,0.4)" />
                    </HStack>
                  </HStack>

                  {/* 对比内容区 */}
                  {expandedChapterId === ch.chapterId && ch.original && ch.personalized && (
                    <Box
                      display={{ base: 'block', md: 'flex' }}
                      borderTop="1px"
                      borderColor="warm.700"
                    >
                      {/* 左侧：原文 */}
                      <Box
                        flex={1}
                        p={4}
                        borderRight={{ md: '1px solid' }}
                        borderColor={{ md: 'warm.700' }}
                        borderBottom={{ base: '1px solid', md: 'none' }}
                      >
                        <Text color="blue.400" fontWeight="bold" fontSize="sm" mb={3}>原文</Text>
                        <Box
                          color="rgba(245,240,232,0.5)"
                          fontSize="sm"
                          lineHeight="1.8"
                          whiteSpace="pre-wrap"
                          maxH="500px"
                          overflowY="auto"
                          css={{
                            '&::-webkit-scrollbar': { width: '4px' },
                            '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: '2px' },
                          }}
                        >
                          {ch.original}
                        </Box>
                      </Box>
                      {/* 右侧：个性化 */}
                      <Box
                        flex={1}
                        p={4}
                        borderBottom={{ base: '1px solid warm.700' }}
                      >
                        <Text color="purple.400" fontWeight="bold" fontSize="sm" mb={3}>专属版</Text>
                        <Box
                          color="rgba(245,240,232,0.7)"
                          fontSize="sm"
                          lineHeight="1.8"
                          whiteSpace="pre-wrap"
                          maxH="500px"
                          overflowY="auto"
                          css={{
                            '&::-webkit-scrollbar': { width: '4px' },
                            '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: '2px' },
                          }}
                        >
                          {ch.personalized}
                        </Box>
                      </Box>
                    </Box>
                  )}
                </Box>
              ))}
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

// 主页面

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
          else toast({ title: '加载失败', status: 'error', duration: 4000, duration: 2000 });
        })
        .catch(err => toast({ title: '加载失败', description: err.message, status: 'error', duration: 4000, duration: 3000 }))
        .finally(() => setLoading(false));
    }
  }, [isOpen, chapterId, toast]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="warm.800" color="white" maxH="85vh">
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
                <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={4}>{detail.subtitle}</Text>
              )}
              <Box
                className="markdown-body"
                color="gray.200"
                fontSize="sm"
                sx={{
                  'h1,h2,h3': { color: 'teal.300', mt: 5, mb: 2, fontWeight: 'bold' },
                  h1: { fontSize: 'xl', borderBottom: '1px solid', borderColor: 'warm.700', pb: 2 },
                  h2: { fontSize: 'lg' },
                  h3: { fontSize: 'md' },
                  p: { mb: 3, lineHeight: '1.8' },
                  'ul,ol': { pl: 5, mb: 3 },
                  li: { mb: 1 },
                  code: { bg: 'warm.700', px: 1.5, py: 0.5, borderRadius: 'sm', fontSize: 'xs' },
                  pre: { bg: 'gray.900', p: 3, borderRadius: 'md', overflowX: 'auto', mb: 3 },
                  blockquote: { borderLeft: '3px solid', borderColor: 'teal.500', pl: 3, color: 'rgba(245,240,232,0.4)', mb: 3 },
                  table: { w: '100%', mb: 3 },
                  th: { bg: 'warm.700', p: 2, textAlign: 'left', fontWeight: 'bold' },
                  td: { p: 2, borderBottom: '1px solid', borderColor: 'warm.700' },
                  strong: { color: 'white' },
                  a: { color: 'teal.300' },
                  hr: { borderColor: 'warm.700', my: 4 }
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detail.content || '*暂无正文*'}
                </ReactMarkdown>
              </Box>
            </Box>
          ) : (
            <Text color="rgba(245,240,232,0.6)" textAlign="center" py={8}>加载失败</Text>
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
      toast({ title: '删除失败', description: err.message, status: 'error', duration: 4000, duration: 3000 });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog isOpen={isOpen} onClose={onClose} leastDestructiveRef={undefined}>
      <AlertDialogOverlay>
        <AlertDialogContent bg="warm.800" color="white">
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
  const [deleting, setDeleting] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [toggling, setToggling] = useState({});
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [reordering, setReordering] = useState(false);
  const { isOpen: isDeleteOpen, onOpen: openDelete, onClose: closeDelete } = useDisclosure();
  const { isOpen: isPreviewOpen, onOpen: openPreview, onClose: closePreview } = useDisclosure();

  // 个性化用户管理
  const [perUsers, setPerUsers] = useState([]);
  const [perSearch, setPerSearch] = useState('');
  const [showPerSection, setShowPerSection] = useState(true);
  const [perToggling, setPerToggling] = useState({});
  const [selectedPerUser, setSelectedPerUser] = useState(null);
  const { isOpen: isPerDetailOpen, onOpen: openPerDetail, onClose: closePerDetail } = useDisclosure();

  const { data, isInitialLoad, refresh } = useKeepAliveData(async () => {
    const [chRes, perRes] = await Promise.all([
      membershipApi.adminListChapters(),
      membershipApi.adminListPersonalizationUsers().catch(() => ({ success: false })),
    ]);
    if (chRes.success) setChapters(chRes.chapters);
    if (perRes?.success) setPerUsers(perRes.users);
    return true;
  }, { key: '/admin/chapters' });


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
        refresh();
      }
    } catch (err) {
      toast({ title: '操作失败', description: err.message, status: 'error', duration: 4000, duration: 3000 });
    } finally {
      setToggling(prev => ({ ...prev, [chapter.chapterId]: false }));
    }
  }

  function handlePerUserClick(u) {
    setSelectedPerUser(u);
    openPerDetail();
  }

  async function handlePerToggle(userId, enabled) {
    setPerUsers(prev => prev.map(u => u.id === userId ? { ...u, personalizationEnabled: enabled } : u));
    setPerToggling(prev => ({ ...prev, [userId]: true }));
    try {
      const res = await membershipApi.adminTogglePersonalization(userId, enabled);
      if (res.success) {
        toast({ title: enabled ? '已开启' : '已关闭', status: 'success', duration: 2000 });
      }
    } catch (err) {
      // 失败回滚
      setPerUsers(prev => prev.map(u => u.id === userId ? { ...u, personalizationEnabled: !enabled } : u));
      toast({ title: '操作失败', description: err.message, status: 'error', duration: 4000, duration: 3000 });
    } finally {
      setPerToggling(prev => ({ ...prev, [userId]: false }));
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
        toast({ title: '排序失败', status: 'error', duration: 4000, duration: 2000 });
        refresh();
      }
    } catch (err) {
      toast({ title: '排序失败', description: err.message, status: 'error', duration: 4000, duration: 3000 });
      loadChapters();
    } finally {
      setReordering(false);
    }
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  if (isInitialLoad) {
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
          colorScheme="gold"
          onClick={handleCreate}
        >
          新建章节
        </Button>
      </HStack>

      {chapters.length === 0 ? (
        <Center py={16}>
          <VStack spacing={3}>
            <Text color="rgba(245,240,232,0.6)" fontSize="lg">暂无章节数据</Text>
            <Button
              leftIcon={<FiPlus />}
              colorScheme="gold"
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
              <Tr bg="warm.800">
                <Th color="rgba(245,240,232,0.4)" border="none" w="36px" />
                <Th color="rgba(245,240,232,0.4)" border="none" w="60px">ID</Th>
                <Th color="rgba(245,240,232,0.4)" border="none">标题</Th>
                <Th color="rgba(245,240,232,0.4)" border="none" display={{ base: 'none', md: 'table-cell' }}>副标题</Th>
                <Th color="rgba(245,240,232,0.4)" border="none" w="80px" textAlign="center">状态</Th>
                <Th color="rgba(245,240,232,0.4)" border="none" w="200px">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {chapters.map((ch) => (
                <Tr
                  key={ch.chapterId}
                  _hover={{ bg: 'warm.800' }}
                  borderBottom="1px"
                  borderColor="warm.700"
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
                      color="rgba(245,240,232,0.6)"
                      cursor="grab"
                      _hover={{ color: 'teal.300' }}
                    />
                  </Td>
                  <Td color="rgba(245,240,232,0.4)" border="none">
                    <Badge colorScheme="gold" variant="subtle">{ch.chapterId}</Badge>
                  </Td>
                  <Td color="white" border="none" fontWeight="medium">{ch.title}</Td>
                  <Td color="rgba(245,240,232,0.4)" border="none" display={{ base: 'none', md: 'table-cell' }}>
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
                        colorScheme="gold"
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

      {/* 个性化管理 */}
      <Divider borderColor="warm.700" my={6} />

      <Box
        cursor="pointer"
        onClick={() => setShowPerSection(!showPerSection)}
        mb={4}
      >
        <HStack justify="space-between">
          <HStack>
            <Icon as={FiUsers} color="purple.400" />
            <Heading size="md" color="white">个性化学习管理</Heading>
            {perUsers.length > 0 && (
              <Badge colorScheme="purple">{perUsers.length} 人</Badge>
            )}
          </HStack>
          <Icon as={showPerSection ? FiChevronUp : FiChevronDown} color="rgba(245,240,232,0.4)" />
        </HStack>
      </Box>

      <Collapse in={showPerSection} animateOpacity>
        {perUsers.length > 0 && (
          <Box mb={3}>
            <Input
              placeholder="搜索用户..."
              value={perSearch}
              onChange={(e) => setPerSearch(e.target.value)}
              w="200px"
              bg="warm.800"
              border="none"
              size="sm"
            />
          </Box>
        )}
        <Box borderRadius="md" overflow="hidden">
          <Table variant="simple" size="sm">
            <Thead>
              <Tr bg="warm.800">
                <Th color="rgba(245,240,232,0.4)" borderColor="warm.700">用户</Th>
                <Th color="rgba(245,240,232,0.4)" borderColor="warm.700" isNumeric>已完成</Th>
                <Th color="rgba(245,240,232,0.4)" borderColor="warm.700" isNumeric>生成中</Th>
                <Th color="rgba(245,240,232,0.4)" borderColor="warm.700" isNumeric>已失败</Th>
                <Th color="rgba(245,240,232,0.4)" borderColor="warm.700">状态</Th>
                <Th color="rgba(245,240,232,0.4)" borderColor="warm.700">开关</Th>
                <Th color="rgba(245,240,232,0.4)" borderColor="warm.700">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {perUsers
                .filter(u =>
                  (u.nickname || '').toLowerCase().includes(perSearch.toLowerCase()) ||
                  (u.username || '').toLowerCase().includes(perSearch.toLowerCase())
                )
                .map(u => (
                <Tr key={u.id} _hover={{ bg: 'warm.800' }} borderBottom="1px" borderColor="warm.700">
                  <Td borderColor="warm.700">
                    <Text color="white" fontWeight="medium">{u.nickname || u.username}</Text>
                    <Text color="rgba(245,240,232,0.6)" fontSize="xs">{u.username}</Text>
                  </Td>
                  <Td borderColor="warm.700" isNumeric>
                    <Badge colorScheme="green">{u.totalCompleted}</Badge>
                  </Td>
                  <Td borderColor="warm.700" isNumeric>
                    {u.totalGenerating > 0 ? <Badge colorScheme="blue">{u.totalGenerating}</Badge> : <Text color="rgba(245,240,232,0.6)">—</Text>}
                  </Td>
                  <Td borderColor="warm.700" isNumeric>
                    {u.totalFailed > 0 ? <Badge colorScheme="red">{u.totalFailed}</Badge> : <Text color="rgba(245,240,232,0.6)">—</Text>}
                  </Td>
                  <Td borderColor="warm.700">
                    <Badge colorScheme={u.personalizationEnabled ? 'green' : 'gray'}>
                      {u.personalizationEnabled ? '可用' : '已禁用'}
                    </Badge>
                  </Td>
                  <Td borderColor="warm.700">
                    <Switch
                      isChecked={u.personalizationEnabled}
                      onChange={(e) => handlePerToggle(u.id, e.target.checked)}
                      isDisabled={perToggling[u.id]}
                      colorScheme="teal"
                      size="lg"
                    />
                  </Td>
                  <Td borderColor="warm.700">
                    <Button
                      size="xs"
                      variant="ghost"
                      colorScheme="purple"
                      leftIcon={<FiFileText />}
                      onClick={() => handlePerUserClick(u)}
                    >
                      对比
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
        {perUsers.length === 0 && (
          <Center py={8}>
            <Text color="rgba(245,240,232,0.6)">暂无用户生成个性化学习内容</Text>
          </Center>
        )}
      </Collapse>

      <PersonalizationDetailModal
        isOpen={isPerDetailOpen}
        onClose={() => { closePerDetail(); setSelectedPerUser(null); }}
        user={selectedPerUser}
      />
    </Box>
  );
}

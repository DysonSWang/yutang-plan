import { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, HStack, Button, Badge, Table, Thead, Tbody, Tr, Th, Td,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, useDisclosure, FormControl, FormLabel, Input,
  NumberInput, NumberInputField, Textarea, useToast, Spinner, Center,
  VStack, Text, AlertDialog, AlertDialogOverlay, AlertDialogContent,
  AlertDialogHeader, AlertDialogBody, AlertDialogFooter
} from '@chakra-ui/react';
import { FiEdit2, FiTrash2, FiPlus } from 'react-icons/fi';
import { membership as membershipApi } from '../../utils/api';

// 章节编辑 Modal（新建/编辑复用）
function ChapterModal({ isOpen, onClose, chapter, onSaved }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [orderIndex, setOrderIndex] = useState(1);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = !!chapter;

  useEffect(() => {
    if (isOpen) {
      if (chapter) {
        setTitle(chapter.title || '');
        setSubtitle(chapter.subtitle || '');
        setOrderIndex(chapter.orderIndex || 1);
        setContent(chapter.content || '');
      } else {
        setTitle('');
        setSubtitle('');
        setOrderIndex(1);
        setContent('');
      }
    }
  }, [isOpen, chapter]);

  async function handleSave() {
    if (!title.trim()) {
      toast({ title: '标题不能为空', status: 'warning', duration: 2000 });
      return;
    }
    setSaving(true);
    try {
      const data = { title: title.trim(), subtitle: subtitle.trim(), orderIndex, content };
      const res = isEdit
        ? await membershipApi.adminUpdateChapter(chapter.chapterId, data)
        : await membershipApi.adminCreateChapter(data);
      if (res.success) {
        toast({ title: isEdit ? '章节已更新' : '章节已创建', status: 'success', duration: 2000 });
        onSaved();
        onClose();
      }
    } catch (err) {
      toast({ title: '操作失败', description: err.message, status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent bg="gray.800" color="white">
        <ModalHeader>{isEdit ? '编辑章节' : '新建章节'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>标题</FormLabel>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="章节标题"
                bg="gray.700"
                border="none"
              />
            </FormControl>
            <FormControl>
              <FormLabel>副标题</FormLabel>
              <Input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="副标题（可选）"
                bg="gray.700"
                border="none"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>排序序号</FormLabel>
              <NumberInput
                value={orderIndex}
                onChange={(_, n) => setOrderIndex(n)}
                min={0}
                bg="gray.700"
                border="none"
              >
                <NumberInputField />
              </NumberInput>
            </FormControl>
            <FormControl>
              <FormLabel>正文（Markdown）</FormLabel>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Markdown 格式正文（可选）"
                rows={12}
                bg="gray.700"
                border="none"
                fontFamily="monospace"
                fontSize="sm"
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>取消</Button>
          <Button colorScheme="teal" onClick={handleSave} isLoading={saving}>
            {isEdit ? '保存' : '创建'}
          </Button>
        </ModalFooter>
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
  const toast = useToast();
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { isOpen: isModalOpen, onOpen: openModal, onClose: closeModal } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: openDelete, onClose: closeDelete } = useDisclosure();

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
    setEditing(null);
    openModal();
  }

  function handleEdit(chapter) {
    setEditing(chapter);
    openModal();
  }

  function handleDeleteClick(chapter) {
    setDeleting(chapter);
    openDelete();
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
                <Th color="gray.400" border="none" w="60px">ID</Th>
                <Th color="gray.400" border="none">标题</Th>
                <Th color="gray.400" border="none" display={{ base: 'none', md: 'table-cell' }}>副标题</Th>
                <Th color="gray.400" border="none" w="60px" isNumeric>排序</Th>
                <Th color="gray.400" border="none" w="160px">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {chapters.map((ch) => (
                <Tr key={ch.chapterId} _hover={{ bg: 'gray.800' }} borderBottom="1px" borderColor="gray.700">
                  <Td color="gray.400" border="none">
                    <Badge colorScheme="teal" variant="subtle">{ch.chapterId}</Badge>
                  </Td>
                  <Td color="white" border="none" fontWeight="medium">{ch.title}</Td>
                  <Td color="gray.400" border="none" display={{ base: 'none', md: 'table-cell' }}>
                    {ch.subtitle || '—'}
                  </Td>
                  <Td color="gray.400" border="none" isNumeric>{ch.orderIndex}</Td>
                  <Td border="none">
                    <HStack spacing={1}>
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

      <ChapterModal
        isOpen={isModalOpen}
        onClose={closeModal}
        chapter={editing}
        onSaved={loadChapters}
      />

      <DeleteDialog
        isOpen={isDeleteOpen}
        onClose={closeDelete}
        chapter={deleting}
        onDeleted={loadChapters}
      />
    </Box>
  );
}

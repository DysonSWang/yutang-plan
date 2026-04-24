/**
 * 选中文本添加到日历
 * - 监听页面文本选择（桌面右键 / 移动端长按）
 * - 选中后显示浮动按钮
 * - 点击后弹出日期时间选择器
 * - 确认后调用 API 创建事件
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, FormControl, FormLabel, Input, Select, Textarea, VStack, HStack,
  Text, useToast, useDisclosure, Portal
} from '@chakra-ui/react';
import { events as eventsApi } from '../utils/api';
import { CalendarIcon } from './Icons';

export default function SelectionToCalendar({ clientId, girlList }) {
  const [selectedText, setSelectedText] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [form, setForm] = useState({
    title: '',
    content: '',
    dateTime: '',
    girlId: '',
    type: 'manual'
  });

  // 检测文本选择
  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 2 && text.length < 500) {
      // 获取选择区域的位置
      const range = selection?.getRangeAt(0);
      if (range) {
        const rect = range.getBoundingClientRect();
        const x = Math.min(rect.left + rect.width / 2, window.innerWidth - 160);
        const y = rect.top - 45 + window.scrollY;
        setPosition({ x, y });
        setSelectedText(text);
        setVisible(true);
      }
    } else {
      setVisible(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleSelectionChange);
    document.addEventListener('touchend', handleSelectionChange);

    // 桌面端：右键菜单（contextmenu 事件）
    document.addEventListener('contextmenu', (e) => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text && text.length > 2) {
        // 显示自定义菜单
        e.preventDefault();
        const selection = window.getSelection();
        const range = selection?.getRangeAt(0);
        if (range) {
          const rect = range.getBoundingClientRect();
          const x = Math.min(rect.left + rect.width / 2, window.innerWidth - 160);
          const y = rect.top - 45 + window.scrollY;
          setPosition({ x, y });
          setSelectedText(text);
          setVisible(true);
        }
      }
    });

    // 点击其他地方隐藏按钮
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.selection-calendar-btn')) {
        // 延迟隐藏，等待点击事件处理
        setTimeout(() => {
          if (!document.querySelector('.selection-calendar-modal:hover')) {
            // 不隐藏，因为可能用户在点击模态框
          }
        }, 100);
      }
    });

    return () => {
      document.removeEventListener('mouseup', handleSelectionChange);
      document.removeEventListener('touchend', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const openModal = () => {
    if (!clientId) {
      toast({ title: '请先选择客户', status: 'warning', duration: 2000 });
      return;
    }

    // 初始化表单
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const defaultTime = now.toISOString().slice(0, 16);

    setForm({
      title: selectedText.slice(0, 80),
      content: selectedText,
      dateTime: defaultTime,
      girlId: girlList?.length === 1 ? girlList[0].id : '',
      type: 'manual'
    });
    setVisible(false);
    onOpen();
  };

  const handleSave = async () => {
    if (!form.title) {
      toast({ title: '请填写标题', status: 'warning', duration: 2000 });
      return;
    }
    if (!form.dateTime) {
      toast({ title: '请选择时间', status: 'warning', duration: 2000 });
      return;
    }
    if (!clientId) return;

    setLoading(true);
    try {
      const res = await eventsApi.create({
        clientId,
        girlId: form.girlId || null,
        title: form.title,
        content: form.content,
        eventTime: new Date(form.dateTime),
        type: 'manual',
        source: 'chat_selection',
        aiContext: selectedText.length > 200 ? selectedText.slice(0, 200) + '...' : selectedText,
        status: 'pending'
      });

      if (res.success) {
        toast({ title: '事件已添加到日历', status: 'success', duration: 2000 });
        // 清除选择
        window.getSelection()?.removeAllRanges();
        onClose();
      } else {
        toast({ title: res.error || '添加失败', status: 'error', duration: 2000 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '添加失败', status: 'error', duration: 2000 });
    } finally {
      setLoading(false);
    }
  };

  // 如果没有选择客户，不显示按钮
  if (!clientId) return null;

  return (
    <>
      {/* 浮动添加按钮 */}
      {visible && (
        <Box
          className="selection-calendar-btn"
          position="fixed"
          top={position.y}
          left={position.x}
          transform="translateX(-50%)"
          zIndex={9999}
          style={{ pointerEvents: 'auto' }}
          sx={{
            animation: 'fadeInUp 0.15s ease-out',
            '@keyframes fadeInUp': {
              from: { opacity: 0, transform: 'translateX(-50%) translateY(4px)' },
              to: { opacity: 1, transform: 'translateX(-50%) translateY(0)' }
            }
          }}
        >
          <Button
            size="sm"
            colorScheme="blue"
            leftIcon={<CalendarIcon />}
            onClick={openModal}
            boxShadow="lg"
            borderRadius="full"
            whiteSpace="nowrap"
          >
            添加到日历
          </Button>
        </Box>
      )}

      {/* 添加事件模态框 */}
      <Modal isOpen={isOpen} onClose={onClose} size="md">
        <Portal>
          <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
        </Portal>
        <ModalContent bg="gray.800" className="selection-calendar-modal">
          <ModalHeader color="white">添加到日历</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            <VStack spacing={4} align="stretch">
              {/* 选中的文本预览 */}
              {selectedText && (
                <Box bg="gray.750" p={3} borderRadius="md" borderLeft="3px solid" borderColor="blue.400">
                  <Text color="gray.400" fontSize="xs" mb={1}>选中的内容</Text>
                  <Text color="gray.300" fontSize="sm" noOfLines={3}>
                    "{selectedText.length > 200 ? selectedText.slice(0, 200) + '...' : selectedText}"
                  </Text>
                </Box>
              )}

              <HStack spacing={3}>
                <FormControl isRequired flex={1}>
                  <FormLabel color="gray.400" fontSize="sm">标题</FormLabel>
                  <Input
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="事件标题"
                    bg="gray.700" color="white"
                  />
                </FormControl>
                <FormControl w="150px">
                  <FormLabel color="gray.400" fontSize="sm">关联女生</FormLabel>
                  <Select
                    value={form.girlId}
                    onChange={e => setForm({ ...form, girlId: e.target.value })}
                    bg="gray.700" color="white"
                  >
                    <option value="">不关联</option>
                    {(girlList || []).map(g => (
                      <option key={g.id} value={g.id}>{g.name || g.nickname}</option>
                    ))}
                  </Select>
                </FormControl>
              </HStack>

              <FormControl isRequired>
                <FormLabel color="gray.400" fontSize="sm">时间</FormLabel>
                <Input
                  type="datetime-local"
                  value={form.dateTime}
                  onChange={e => setForm({ ...form, dateTime: e.target.value })}
                  bg="gray.700" color="white"
                />
              </FormControl>

              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">备注</FormLabel>
                <Textarea
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  placeholder="详细描述"
                  bg="gray.700" color="white"
                  rows={3}
                />
              </FormControl>
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" colorScheme="gray" size="sm" mr={2} onClick={onClose}>
              取消
            </Button>
            <Button colorScheme="blue" size="sm" onClick={handleSave} isLoading={loading}>
              添加到日历
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

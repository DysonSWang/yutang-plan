import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import {
  Box, Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, FormControl, FormLabel, Input, Select, Textarea, VStack, HStack,
  Text, Badge, useToast, Spinner, Flex, SimpleGrid, useDisclosure,
  Menu, MenuButton, MenuList, MenuItem, IconButton, Tooltip
} from '@chakra-ui/react';
import { events as eventsApi, dates as datesApi } from '../utils/api';
import { captureError } from '../utils/frontendErrorCapture';
import { FireIcon, CalendarIcon, PlusIcon, TrashIcon, EditIcon, CheckIcon } from './Icons';
import { useConfirmModal } from './ConfirmModal';

const DATE_STATUS_CONFIG = {
  pending_plan: { label: '待策划', color: 'orange' },
  planned: { label: '已策划', color: 'gold' },
  pending_client_confirm: { label: '待确认', color: 'gold' },
  confirmed: { label: '已确认', color: 'green' },
  completed: { label: '已完成', color: 'gold' },
  cancelled: { label: '已取消', color: 'gray' }
};

const EVENT_STATUS_CONFIG = {
  pending: { label: '待办', color: 'gold' },
  completed: { label: '已完成', color: 'green' },
  cancelled: { label: '已取消', color: 'gray' }
};

const TYPE_CONFIG = {
  date: { label: '约会', defaultColor: '#4ade80' },
  action: { label: '行动项', defaultColor: '#f59e0b' },
  manual: { label: '手动', defaultColor: '#e2b044' }
};

function toLocalDatetimeString(date) {
  if (!date) return '';
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDatetimeString(str) {
  if (!str) return null;
  // 兼容 "2026-04-2913:00" 格式，转换为 "2026-04-29T13:00"
  const normalized = str.replace(/^(\d{4}-\d{2}-\d{2})(\d{2}:\d{2})$/, '$1T$2');
  return new Date(normalized);
}

function getSavedView() {
  try { return localStorage.getItem('calendarView') || 'dayGridMonth'; } catch { return 'dayGridMonth'; }
}
function saveView(view) {
  try { localStorage.setItem('calendarView', view); } catch { /* noop */ }
}

export default function ClientCalendar({ clientId, clientNickname, girlList, refreshKey }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calendarView, setCalendarView] = useState(getSavedView);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editMode, setEditMode] = useState('view'); // 'view' | 'edit' | 'create'
  const [isDateEvent, setIsDateEvent] = useState(false);
  const { confirm, ConfirmModal } = useConfirmModal();
  const [form, setForm] = useState({
    girlId: '', dateTime: '', title: '', content: '', type: 'manual', status: 'pending'
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const calendarRef = useRef(null);
  const containerRef = useRef(null);

  const { isOpen, onOpen, onClose } = useDisclosure();

  // 当日历容器从隐藏变为可见时，触发 resize
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const api = calendarRef.current?.getApi();
      if (api && el.offsetParent !== null) {
        api.updateSize();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const loadEvents = useCallback(async () => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    try {
      const res = await eventsApi.batch({ clientId });
      if (res.success) {
        setEvents(res.events || []);
      }
    } catch (e) {
      captureError(e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadEvents(); }, [loadEvents, refreshKey]);

  const mapEventToCalendar = (ev) => {
    let bgColor, borderColor;
    if (ev.isDate) {
      // 约会事件
      const cfg = DATE_STATUS_CONFIG[ev.dateStatus] || { color: 'gray' };
      bgColor = getStatusBg(cfg.color);
      borderColor = getStatusBorder(cfg.color);
    } else {
      // 普通事件
      if (ev.status === 'completed') {
        bgColor = '#2d3748'; borderColor = '#4a5568';
      } else if (ev.status === 'cancelled') {
        bgColor = '#4a5568'; borderColor = 'rgba(245,240,232,0.4)';
      } else {
        const cfg = TYPE_CONFIG[ev.type] || TYPE_CONFIG.manual;
        bgColor = ev.color || cfg.defaultColor;
        borderColor = shadeColor(bgColor, -15);
      }
    }

    return {
      id: ev.id,
      title: ev.title,
      start: ev.eventTime,
      end: ev.endTime,
      backgroundColor: bgColor,
      borderColor: borderColor,
      textColor: '#fff',
      classNames: ev.isDate ? ['fc-event-date'] : ['fc-event-action'],
      editable: !ev.isDate,
      extendedProps: {
        ...ev,
        isDateEvent: ev.isDate,
        eventType: ev.isDate ? 'date' : ev.type
      }
    };
  };

  const getStatusBg = (color) => {
    const map = {
      orange: '#f59e0b', teal: '#e2b044', purple: '#c17f59',
      green: '#4ade80', cyan: '#e2b044', gray: 'rgba(245,240,232,0.4)', blue: '#e2b044', red: '#ef4444'
    };
    return map[color] || 'rgba(245,240,232,0.4)';
  };

  const getStatusBorder = (color) => {
    const map = {
      orange: '#c05621', teal: '#285e61', purple: '#6b46c1',
      green: '#276749', cyan: '#0987a0', gray: '#4a5568', blue: '#2b6cb0', red: '#c53030'
    };
    return map[color] || '#4a5568';
  };

  function shadeColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt; const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  const handleDateClick = (info) => {
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const defaultTime = info.date < now
      ? info.dateStr.slice(0, 11) + now.toTimeString().slice(0, 5)
      : info.dateStr.slice(0, 16);

    setForm({
      girlId: girlList?.length === 1 ? girlList[0].id : '',
      dateTime: defaultTime,
      title: '',
      content: '',
      type: 'manual',
      status: 'pending'
    });
    setSelectedEvent(null);
    setIsDateEvent(false);
    setEditMode('create');
    onOpen();
  };

  const handleEventClick = (info) => {
    const ev = info.event;
    const props = ev.extendedProps;

    setSelectedEvent({ id: ev.id, ...props });
    setIsDateEvent(props.isDateEvent);

    if (props.isDateEvent) {
      // 约会事件 → 查看/编辑约会详情
      setForm({
        girlId: props.girl?.id || '',
        dateTime: toLocalDatetimeString(ev.start),
        title: props.title || '',
        content: props.content || props.location || '',
        type: 'date',
        status: props.dateStatus || 'pending_plan'
      });
      setEditMode('view');
    } else {
      // 普通事件 → 查看/编辑事件
      setForm({
        girlId: props.girl?.id || '',
        dateTime: toLocalDatetimeString(ev.start),
        title: props.title || '',
        content: props.content || '',
        type: props.type || 'manual',
        status: props.status || 'pending'
      });
      setEditMode('view');
    }
    onOpen();
  };

  const handleSave = async () => {
    // 验证必填字段
    if (!clientId) {
      toast({ title: '无法创建，请刷新页面重试', status: 'error', duration: 3000 });
      return;
    }
    if (!form.title && form.type !== 'date') {
      toast({ title: '请填写标题', status: 'warning', duration: 2000 });
      return;
    }
    if (!form.dateTime) {
      toast({ title: '请选择时间', status: 'warning', duration: 2000 });
      return;
    }
    setSaving(true);
    try {
      if (editMode === 'create') {
        if (isDateEvent) {
          // 创建约会
          const res = await datesApi.create({
            clientId,
            girlId: form.girlId,
            dateTime: fromLocalDatetimeString(form.dateTime),
            title: form.title,
            notes: form.content,
          });
          if (res.success) {
            toast({ title: '约会创建成功', status: 'success', duration: 2000 });
            onClose();
            loadEvents();
          } else {
            toast({ title: res.error || '创建失败', status: 'error', duration: 3000 });
          }
        } else {
          // 创建事件
          const res = await eventsApi.create({
            clientId,
            girlId: form.girlId || null,
            title: form.title,
            content: form.content,
            eventTime: fromLocalDatetimeString(form.dateTime),
            type: form.type,
            status: 'pending'
          });
          if (res.success) {
            toast({ title: '事件已添加', status: 'success', duration: 2000 });
            onClose();
            loadEvents();
          } else {
            toast({ title: res.error || '创建失败', status: 'error', duration: 3000 });
          }
        }
      } else {
        if (isDateEvent) {
          // 更新约会
          const eventId = selectedEvent.eventId || selectedEvent.id.replace('date:', '');
          const res = await datesApi.update(eventId, {
            girlId: form.girlId,
            dateTime: fromLocalDatetimeString(form.dateTime),
            title: form.title,
            notes: form.content,
          });
          if (res.success) {
            toast({ title: '约会已更新', status: 'success', duration: 2000 });
            onClose();
            loadEvents();
          } else {
            toast({ title: res.error || '更新失败', status: 'error', duration: 2000 });
          }
        } else {
          // 更新事件
          const eventId = selectedEvent.eventId || selectedEvent.id;
          const res = await eventsApi.update(eventId, {
            title: form.title,
            content: form.content,
            eventTime: fromLocalDatetimeString(form.dateTime),
            status: form.status,
            girlId: form.girlId || null,
          });
          if (res.success) {
            toast({ title: '事件已更新', status: 'success', duration: 2000 });
            onClose();
            loadEvents();
          } else {
            toast({ title: res.error || '更新失败', status: 'error', duration: 2000 });
          }
        }
      }
    } catch (e) {
      captureError(e);
      toast({ title: '操作失败', status: 'error', duration: 2000 });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEvent) return;
    const ok = await confirm({
      title: '删除事件',
      message: isDateEvent ? '确定删除这条约会记录？' : '确定删除这个事件？',
      confirmText: '删除',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      let res;
      if (isDateEvent) {
        const eventId = selectedEvent.eventId || selectedEvent.id.replace('date:', '');
        res = await datesApi.update(eventId, { status: 'cancelled' });
      } else {
        const eventId = selectedEvent.eventId || selectedEvent.id;
        res = await eventsApi.delete(eventId);
      }
      if (res.success !== false) {
        toast({ title: isDateEvent ? '约会已取消' : '事件已删除', status: 'success', duration: 2000 });
        onClose();
        loadEvents();
      } else {
        toast({ title: res.error || '操作失败', status: 'error', duration: 2000 });
      }
    } catch (e) {
      captureError(e);
      toast({ title: '操作失败', status: 'error', duration: 2000 });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleComplete = async () => {
    if (!selectedEvent || isDateEvent) return;
    const newStatus = selectedEvent.status === 'completed' ? 'pending' : 'completed';
    const eventId = selectedEvent.eventId || selectedEvent.id;
    try {
      const res = await eventsApi.updateStatus(eventId, newStatus);
      if (res.success) {
        toast({ title: newStatus === 'completed' ? '已标记完成' : '已取消完成', status: 'success', duration: 1500 });
        onClose();
        loadEvents();
      }
    } catch (e) {
      toast({ title: '操作失败', status: 'error', duration: 2000 });
    }
  };

  const startEdit = () => setEditMode('edit');

  const switchToDate = () => setIsDateEvent(true);
  const switchToEvent = () => setIsDateEvent(false);

  const calendarEvents = events.map(mapEventToCalendar);

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={3}>
        <HStack spacing={2}>
          <Text color="rgba(245,240,232,0.4)" fontSize="sm">
            {clientNickname || '客户'} 的日历
          </Text>
          {/* 图例 */}
          <HStack spacing={2} ml={4}>
            <HStack spacing={1}>
              <Box w={2} h={2} borderRadius="sm" bg="green.500" />
              <Text fontSize="xs" color="rgba(245,240,232,0.55)">约会</Text>
            </HStack>
            <HStack spacing={1}>
              <Box w={2} h={2} borderRadius="sm" bg="orange.500" />
              <Text fontSize="xs" color="rgba(245,240,232,0.55)">行动项</Text>
            </HStack>
            <HStack spacing={1}>
              <Box w={2} h={2} borderRadius="sm" bg="blue.500" />
              <Text fontSize="xs" color="rgba(245,240,232,0.2)">手动</Text>
            </HStack>
          </HStack>
        </HStack>
        <HStack spacing={2}>
          <Button size="xs" colorScheme="gold" variant="outline" onClick={loadEvents}>
            刷新
          </Button>
        </HStack>
      </Flex>

      {loading ? (
        <Flex justify="center" py={8}><Spinner color="gold.400" /></Flex>
      ) : (
        <Box ref={containerRef} minH="500px" sx={{
          '.fc': { fontFamily: 'inherit' },
          '.fc .fc-toolbar-title': { color: 'rgba(245,240,232,0.6)', fontSize: 'md !important' },
          '.fc .fc-button': {
            backgroundColor: 'gold.600 !important', borderColor: 'gold.600 !important',
            fontSize: 'xs !important', padding: '4px 8px !important',
          },
          '.fc .fc-button-primary:not(:disabled).fc-button-active': {
            backgroundColor: 'gold.700 !important', borderColor: 'gold.700 !important',
          },
          '.fc .fc-button-primary:hover': { backgroundColor: 'gold.500 !important' },
          '.fc .fc-col-header-cell-cushion': { color: 'rgba(245,240,232,0.4)', fontSize: 'xs' },
          '.fc .fc-daygrid-day-number': { color: 'rgba(245,240,232,0.4)', fontSize: 'xs' },
          '.fc .fc-daygrid-day.fc-day-today': { backgroundColor: 'rgba(226,176,68,0.1) !important' },
          '.fc .fc-daygrid-event': { fontSize: '11px', borderRadius: '3px', padding: '1px 3px' },
          '.fc .fc-timegrid-event': { fontSize: '11px', borderRadius: '3px' },
          '.fc .fc-event-dot': { display: 'none' },
          '.fc .fc-daygrid-more-link': { color: 'teal.300', fontSize: '11px' },
          '.fc .fc-popover': { backgroundColor: 'warm.700', borderColor: 'warm.600' },
          '.fc .fc-popover-header': { backgroundColor: 'warm.800', color: 'rgba(245,240,232,0.6)' },
          '.fc td, .fc th': { borderColor: 'warm.700 !important' },
          '.fc .fc-scrollgrid': { borderColor: 'warm.700 !important' },
          '.fc-event-action': { cursor: 'pointer' },
          '.fc-event-date': { cursor: 'pointer' },
        }}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={calendarView}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            events={calendarEvents}
            datesSet={(arg) => {
              const newView = arg.view.type;
              if (newView !== calendarView) {
                setCalendarView(newView);
                saveView(newView);
              }
            }}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            height="auto"
            eventDisplay="block"
            dayMaxEvents={5}
            locale="zh-cn"
            buttonText={{ today: '今天', month: '月', week: '周', day: '日' }}
            editable={false}
            droppable={false}
            contentHeight={600}
          />
        </Box>
      )}

      {/* Event Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
        <ModalContent bg="warm.800" maxH="90vh" overflow="auto">
          <ModalHeader color="white">
            {editMode === 'create' ? (isDateEvent ? '新建约会' : '添加事件') :
             editMode === 'edit' ? (isDateEvent ? '编辑约会' : '编辑事件') :
             (isDateEvent ? '约会详情' : '事件详情')}
            {selectedEvent && editMode === 'view' && (
              <Badge ml={2} colorScheme={isDateEvent
                ? (DATE_STATUS_CONFIG[selectedEvent.dateStatus]?.color || 'gray')
                : (EVENT_STATUS_CONFIG[selectedEvent.status]?.color || 'gray')
              }>
                {isDateEvent
                  ? (DATE_STATUS_CONFIG[selectedEvent.dateStatus]?.label || selectedEvent.dateStatus)
                  : (EVENT_STATUS_CONFIG[selectedEvent.status]?.label || selectedEvent.status)
                }
              </Badge>
            )}
            {selectedEvent && selectedEvent.source && editMode === 'view' && (
              <Badge ml={2} colorScheme="blue" variant="outline">
                {TYPE_CONFIG[selectedEvent.type]?.label || selectedEvent.type}
              </Badge>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            {editMode === 'view' ? (
              <VStack spacing={3} align="stretch">
                {/* 创建时选择类型按钮 */}
                {editMode === 'view' && selectedEvent?.isDateEvent === undefined && !isDateEvent && (
                  <Flex mb={2} gap={2}>
                    <Badge colorScheme="green" px={2} py={1}>
                      {TYPE_CONFIG[selectedEvent?.type]?.label || '事件'}
                    </Badge>
                  </Flex>
                )}

                <SimpleGrid columns={2} spacing={3}>
                  {selectedEvent?.girl?.name && (
                    <Box bg="warm.800" p={3} borderRadius="md">
                      <Text color="rgba(245,240,232,0.4)" fontSize="xs">女生</Text>
                      <Text color="teal.300">{selectedEvent.girl.name}</Text>
                    </Box>
                  )}
                  <Box bg="warm.800" p={3} borderRadius="md">
                    <Text color="rgba(245,240,232,0.4)" fontSize="xs">时间</Text>
                    <Text color="white" fontSize="sm">
                      {selectedEvent?.eventTime ? new Date(selectedEvent.eventTime).toLocaleString('zh-CN') : '-'}
                    </Text>
                  </Box>
                  {selectedEvent?.location && (
                    <Box bg="warm.800" p={3} borderRadius="md">
                      <Text color="rgba(245,240,232,0.4)" fontSize="xs">地点</Text>
                      <Text color="gray.300">{selectedEvent.location}</Text>
                    </Box>
                  )}
                  {selectedEvent?.rating && (
                    <Box bg="warm.800" p={3} borderRadius="md">
                      <Text color="rgba(245,240,232,0.4)" fontSize="xs">评价</Text>
                      <HStack spacing={0}>
                        {[1, 2, 3, 4, 5].map(i => (
                          <Box key={i} color={i <= selectedEvent.rating ? 'orange.400' : 'warm.600'} fontSize="lg">
                            <FireIcon />
                          </Box>
                        ))}
                      </HStack>
                    </Box>
                  )}
                </SimpleGrid>

                {selectedEvent?.content && (
                  <Box bg="warm.800" p={3} borderRadius="md">
                    <Text color="rgba(245,240,232,0.4)" fontSize="xs">内容</Text>
                    <Text color="gray.300" fontSize="sm">{selectedEvent.content}</Text>
                  </Box>
                )}

                {selectedEvent?.aiContext && (
                  <Box bg="warm.800" p={3} borderRadius="md">
                    <Text color="rgba(245,240,232,0.4)" fontSize="xs">AI 原文</Text>
                    <Text color="rgba(245,240,232,0.55)" fontSize="xs" fontStyle="italic">
                      "{selectedEvent.aiContext}"
                    </Text>
                  </Box>
                )}
              </VStack>
            ) : (
              <VStack spacing={4} align="stretch">
                {/* 创建时选择类型 */}
                {editMode === 'create' && (
                  <Flex gap={2}>
                    <Button
                      size="sm"
                      colorScheme={!isDateEvent ? 'blue' : 'gray'}
                      variant={!isDateEvent ? 'solid' : 'outline'}
                      leftIcon={<CalendarIcon />}
                      onClick={switchToEvent}
                    >
                      事件/行动项
                    </Button>
                    <Button
                      size="sm"
                      colorScheme={isDateEvent ? 'green' : 'gray'}
                      variant={isDateEvent ? 'solid' : 'outline'}
                      leftIcon={<CalendarIcon />}
                      onClick={switchToDate}
                    >
                      约会
                    </Button>
                  </Flex>
                )}

                <SimpleGrid columns={2} spacing={3}>
                  {isDateEvent ? (
                    <FormControl isRequired>
                      <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">女生</FormLabel>
                      <Select
                        value={form.girlId}
                        onChange={e => setForm({ ...form, girlId: e.target.value })}
                        bg="warm.700" color="white"
                      >
                        <option value="">选择女生</option>
                        {(girlList || []).map(g => (
                          <option key={g.id} value={g.id}>{g.name || g.nickname}</option>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">关联女生</FormLabel>
                      <Select
                        value={form.girlId}
                        onChange={e => setForm({ ...form, girlId: e.target.value })}
                        bg="warm.700" color="white"
                      >
                        <option value="">不关联</option>
                        {(girlList || []).map(g => (
                          <option key={g.id} value={g.id}>{g.name || g.nickname}</option>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  <FormControl isRequired>
                    <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">时间</FormLabel>
                    <Input
                      type="datetime-local"
                      value={form.dateTime}
                      onChange={e => setForm({ ...form, dateTime: e.target.value })}
                      bg="warm.700" color="white"
                    />
                  </FormControl>
                  <FormControl isRequired={!isDateEvent}>
                    <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">{isDateEvent ? '标题' : '标题'}</FormLabel>
                    <Input
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      placeholder={isDateEvent ? '如：第一次见面' : '如：联系女生、约见面'}
                      bg="warm.700" color="white"
                    />
                  </FormControl>
                  {!isDateEvent && (
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">状态</FormLabel>
                      <Select
                        value={form.status}
                        onChange={e => setForm({ ...form, status: e.target.value })}
                        bg="warm.700" color="white"
                      >
                        <option value="pending">待办</option>
                        <option value="completed">已完成</option>
                        <option value="cancelled">已取消</option>
                      </Select>
                    </FormControl>
                  )}
                </SimpleGrid>

                <FormControl>
                  <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">{isDateEvent ? '备注' : '内容'}</FormLabel>
                  <Textarea
                    value={form.content}
                    onChange={e => setForm({ ...form, content: e.target.value })}
                    placeholder={isDateEvent ? '约会备注' : '事件详情、具体行动描述'}
                    bg="warm.700" color="white"
                    rows={3}
                  />
                </FormControl>
              </VStack>
            )}
          </ModalBody>

          <ModalFooter>
            {editMode === 'view' ? (
              <HStack spacing={2}>
                {!isDateEvent && selectedEvent?.status !== 'completed' && (
                  <Button
                    variant="ghost"
                    colorScheme="green"
                    size="sm"
                    leftIcon={<CheckIcon />}
                    onClick={handleToggleComplete}
                  >
                    标记完成
                  </Button>
                )}
                {!isDateEvent && selectedEvent?.status === 'completed' && (
                  <Button
                    variant="ghost"
                    colorScheme="gray"
                    size="sm"
                    leftIcon={<CheckIcon />}
                    onClick={handleToggleComplete}
                  >
                    取消完成
                  </Button>
                )}
                <Button variant="ghost" colorScheme="red" size="sm" onClick={handleDelete} isLoading={deleting}>
                  删除
                </Button>
                <Button colorScheme="gold" size="sm" onClick={startEdit}>
                  编辑
                </Button>
              </HStack>
            ) : (
              <>
                <Button variant="ghost" colorScheme="gray" size="sm" mr={2} onClick={onClose}>
                  取消
                </Button>
                <Button colorScheme="gold" size="sm" onClick={handleSave} isLoading={saving}>
                  保存
                </Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
      <ConfirmModal />
    </Box>
  );
}

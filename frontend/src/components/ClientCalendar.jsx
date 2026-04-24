import { useState, useEffect, useCallback, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import {
  Box, Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, FormControl, FormLabel, Input, Select, Textarea, VStack, HStack,
  Text, Badge, Divider, useToast, Spinner, Flex, SimpleGrid, useDisclosure,
  NumberInput, NumberInputField, NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper
} from '@chakra-ui/react';
import { dates as datesApi } from '../utils/api';
import { FireIcon } from './Icons';

const STATUS_CONFIG = {
  pending_plan: { label: '待策划', color: 'orange' },
  planned: { label: '已策划', color: 'teal' },
  pending_client_confirm: { label: '待确认', color: 'purple' },
  confirmed: { label: '已确认', color: 'green' },
  completed: { label: '已完成', color: 'cyan' },
  cancelled: { label: '已取消', color: 'gray' }
};

const STATUS_OPTIONS = [
  { value: 'pending_plan', label: '待策划' },
  { value: 'planned', label: '已策划' },
  { value: 'pending_client_confirm', label: '待客户确认' },
  { value: 'confirmed', label: '已确认' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

function toLocalDatetimeString(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDatetimeString(str) {
  if (!str) return null;
  return new Date(str);
}

export default function ClientCalendar({ clientId, clientNickname, girlList }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editMode, setEditMode] = useState(false); // 'view' | 'edit' | 'create'
  const [form, setForm] = useState({
    girlId: '', dateTime: '', title: '', location: '', status: 'pending_plan', notes: '', duration: ''
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const toast = useToast();
  const calendarRef = useRef(null);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const loadEvents = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await datesApi.list({ clientId });
      if (res.success) {
        const mapped = res.dates.map(d => {
          const cfg = STATUS_CONFIG[d.status] || { color: 'gray' };
          return {
            id: d.id,
            title: d.title || d.girl?.name || '约会',
            start: d.dateTime,
            backgroundColor: getStatusBg(cfg.color),
            borderColor: getStatusBorder(cfg.color),
            textColor: '#fff',
            extendedProps: {
              girl: d.girl,
              girlName: d.girl?.name,
              location: d.location,
              status: d.status,
              statusLabel: STATUS_CONFIG[d.status]?.label || d.status,
              notes: d.notes,
              rating: d.rating,
              title: d.title,
              duration: d.duration,
              totalExpense: d.totalExpense,
              girlStage: d.girl?.stage,
            }
          };
        });
        setEvents(mapped);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const getStatusBg = (color) => {
    const map = {
      orange: '#dd6b20', teal: '#319795', purple: '#805ad5',
      green: '#38a169', cyan: '#00b5d8', gray: '#718096', blue: '#3182ce', red: '#e53e3e'
    };
    return map[color] || '#718096';
  };

  const getStatusBorder = (color) => {
    const map = {
      orange: '#c05621', teal: '#285e61', purple: '#6b46c1',
      green: '#276749', cyan: '#0987a0', gray: '#4a5568', blue: '#2b6cb0', red: '#c53030'
    };
    return map[color] || '#4a5568';
  };

  const handleDateClick = (info) => {
    const today = new Date();
    today.setHours(today.getHours() + 1, 0, 0, 0);
    const defaultTime = info.date < today ? info.dateStr.slice(0, 11) + today.toTimeString().slice(0, 5) : info.dateStr.slice(0, 16);
    setForm({ girlId: '', dateTime: defaultTime, title: '', location: '', status: 'pending_plan', notes: '', duration: '' });
    setSelectedEvent(null);
    setEditMode('create');
    onOpen();
  };

  const handleEventClick = (info) => {
    const ev = info.event;
    const props = ev.extendedProps;
    setSelectedEvent({
      id: ev.id,
      girl: props.girl,
      dateTime: ev.start,
      title: props.title,
      location: props.location,
      status: props.status,
      notes: props.notes,
      rating: props.rating,
      duration: props.duration,
      totalExpense: props.totalExpense,
    });
    setForm({
      girlId: props.girl?.id || '',
      dateTime: toLocalDatetimeString(ev.start),
      title: props.title || '',
      location: props.location || '',
      status: props.status || 'pending_plan',
      notes: props.notes || '',
      duration: props.duration || ''
    });
    setEditMode('view');
    onOpen();
  };

  const handleSave = async () => {
    if (!form.girlId || !form.dateTime) {
      toast({ title: '请选择女生和约会时间', status: 'warning', duration: 2000 });
      return;
    }
    setSaving(true);
    try {
      let res;
      if (editMode === 'create') {
        res = await datesApi.create({
          clientId,
          girlId: form.girlId,
          dateTime: fromLocalDatetimeString(form.dateTime),
          title: form.title,
          location: form.location,
          status: form.status,
          notes: form.notes,
        });
      } else {
        res = await datesApi.update(selectedEvent.id, {
          girlId: form.girlId,
          dateTime: fromLocalDatetimeString(form.dateTime),
          title: form.title,
          location: form.location,
          status: form.status,
          notes: form.notes,
        });
      }
      if (res.success) {
        toast({ title: editMode === 'create' ? '约会创建成功' : '约会已更新', status: 'success', duration: 2000 });
        onClose();
        loadEvents();
      } else {
        toast({ title: res.error || '保存失败', status: 'error', duration: 2000 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '保存失败', status: 'error', duration: 2000 });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEvent) return;
    if (!window.confirm('确定删除这条约会记录？')) return;
    setDeleting(true);
    try {
      const res = await datesApi.update(selectedEvent.id, { status: 'cancelled' });
      if (res.success) {
        toast({ title: '已取消约会', status: 'success', duration: 2000 });
        onClose();
        loadEvents();
      } else {
        toast({ title: res.error || '操作失败', status: 'error', duration: 2000 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '操作失败', status: 'error', duration: 2000 });
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = () => setEditMode('edit');

  const handleMonthChange = (info) => {
    setCurrentMonth(info.start);
  };

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={3}>
        <Text color="gray.400" fontSize="sm">
          {clientNickname || '客户'} 的约会日历
        </Text>
        <Button size="xs" colorScheme="teal" onClick={() => { loadEvents(); }}>
          刷新
        </Button>
      </Flex>

      {loading ? (
        <Flex justify="center" py={8}><Spinner color="teal.400" /></Flex>
      ) : (
        <Box
          sx={{
            '.fc': { fontFamily: 'inherit' },
            '.fc .fc-toolbar-title': { color: 'gray.200', fontSize: 'md !important' },
            '.fc .fc-button': {
              backgroundColor: 'teal.600 !important',
              borderColor: 'teal.600 !important',
              fontSize: 'xs !important',
              padding: '4px 8px !important',
            },
            '.fc .fc-button-primary:not(:disabled).fc-button-active': {
              backgroundColor: 'teal.700 !important',
              borderColor: 'teal.700 !important',
            },
            '.fc .fc-button-primary:hover': { backgroundColor: 'teal.500 !important' },
            '.fc .fc-col-header-cell-cushion': { color: 'gray.400', fontSize: 'xs' },
            '.fc .fc-daygrid-day-number': { color: 'gray.300', fontSize: 'xs' },
            '.fc .fc-daygrid-day.fc-day-today': { backgroundColor: 'rgba(49,151,149,0.1) !important' },
            '.fc .fc-daygrid-event': { fontSize: '11px', borderRadius: '3px', padding: '1px 3px' },
            '.fc .fc-timegrid-event': { fontSize: '11px', borderRadius: '3px' },
            '.fc .fc-event-dot': { display: 'none' },
            '.fc .fc-daygrid-more-link': { color: 'teal.300', fontSize: '11px' },
            '.fc .fc-popover': { backgroundColor: 'gray.700', borderColor: 'gray.600' },
            '.fc .fc-popover-header': { backgroundColor: 'gray.750', color: 'gray.200' },
            '.fc td, .fc th': { borderColor: 'gray.700 !important' },
            '.fc .fc-scrollgrid': { borderColor: 'gray.700 !important' },
          }}
        >
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            events={events}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            datesSet={handleMonthChange}
            height="auto"
            eventDisplay="block"
            dayMaxEvents={3}
            locale="zh-cn"
            buttonText={{
              today: '今天',
              month: '月',
              week: '周',
              day: '日',
            }}
          />
        </Box>
      )}

      {/* Event Create/Edit/View Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
        <ModalContent bg="gray.800" maxH="90vh" overflow="auto">
          <ModalHeader color="white">
            {editMode === 'create' ? '新建约会' : editMode === 'view' ? '约会详情' : '编辑约会'}
            {selectedEvent && editMode === 'view' && (
              <Badge ml={2} colorScheme={STATUS_CONFIG[selectedEvent.status]?.color || 'gray'}>
                {STATUS_CONFIG[selectedEvent.status]?.label || selectedEvent.status}
              </Badge>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            {editMode === 'view' ? (
              <VStack spacing={3} align="stretch">
                <SimpleGrid columns={2} spacing={3}>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="xs">女生</Text>
                    <Text color="teal.300">{selectedEvent?.girl?.name || '-'}</Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="xs">阶段</Text>
                    <Text color="gray.300">{selectedEvent?.girlStage || '-'}</Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="xs">时间</Text>
                    <Text color="white" fontSize="sm">
                      {selectedEvent?.dateTime ? new Date(selectedEvent.dateTime).toLocaleString('zh-CN') : '-'}
                    </Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="xs">时长</Text>
                    <Text color="gray.300">{selectedEvent?.duration || '-'}</Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="xs">地点</Text>
                    <Text color="gray.300">{selectedEvent?.location || '-'}</Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="xs">花费</Text>
                    <Text color="gray.300">{selectedEvent?.totalExpense ? `¥${selectedEvent.totalExpense}` : '-'}</Text>
                  </Box>
                </SimpleGrid>

                {selectedEvent?.title && (
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="xs">标题</Text>
                    <Text color="white">{selectedEvent.title}</Text>
                  </Box>
                )}

                {selectedEvent?.notes && (
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="xs">备注</Text>
                    <Text color="gray.300" fontSize="sm">{selectedEvent.notes}</Text>
                  </Box>
                )}

                {selectedEvent?.rating && (
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="xs">评价</Text>
                    <HStack spacing={0}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <Box key={i} color={i <= selectedEvent.rating ? 'orange.400' : 'gray.600'} fontSize="lg">
                          <FireIcon />
                        </Box>
                      ))}
                    </HStack>
                  </Box>
                )}
              </VStack>
            ) : (
              <VStack spacing={4} align="stretch">
                <SimpleGrid columns={2} spacing={3}>
                  <FormControl isRequired>
                    <FormLabel color="gray.400" fontSize="sm">女生</FormLabel>
                    <Select
                      value={form.girlId}
                      onChange={e => setForm({ ...form, girlId: e.target.value })}
                      bg="gray.700" color="white"
                    >
                      <option value="">选择女生</option>
                      {(girlList || []).map(g => (
                        <option key={g.id} value={g.id}>{g.name || g.nickname}</option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel color="gray.400" fontSize="sm">状态</FormLabel>
                    <Select
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value })}
                      bg="gray.700" color="white"
                    >
                      {STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel color="gray.400" fontSize="sm">约会时间</FormLabel>
                    <Input
                      type="datetime-local"
                      value={form.dateTime}
                      onChange={e => setForm({ ...form, dateTime: e.target.value })}
                      bg="gray.700" color="white"
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel color="gray.400" fontSize="sm">时长</FormLabel>
                    <Select
                      value={form.duration}
                      onChange={e => setForm({ ...form, duration: e.target.value })}
                      bg="gray.700" color="white"
                      placeholder="选择时长"
                    >
                      {['1小时', '2小时', '3小时', '半天', '一整天'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </Select>
                  </FormControl>
                </SimpleGrid>

                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">标题</FormLabel>
                  <Input
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="如：第一次见面、升级约会"
                    bg="gray.700" color="white"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">地点</FormLabel>
                  <Input
                    value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                    placeholder="约会地点"
                    bg="gray.700" color="white"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">备注</FormLabel>
                  <Textarea
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="备注信息"
                    bg="gray.700" color="white"
                    rows={3}
                  />
                </FormControl>
              </VStack>
            )}
          </ModalBody>

          <ModalFooter>
            {editMode === 'view' ? (
              <>
                <Button variant="ghost" colorScheme="red" size="sm" mr={2} onClick={handleDelete} isLoading={deleting}>
                  取消约会
                </Button>
                <Button colorScheme="teal" size="sm" onClick={startEdit}>
                  编辑
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" colorScheme="gray" size="sm" mr={2} onClick={onClose}>
                  取消
                </Button>
                <Button colorScheme="teal" size="sm" onClick={handleSave} isLoading={saving}>
                  保存
                </Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

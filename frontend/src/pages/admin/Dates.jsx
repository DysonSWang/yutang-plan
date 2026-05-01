import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Box, Heading, Card, CardBody, Table, Thead, Tbody, Tr, Th, Td, Button, Badge, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalBody, ModalCloseButton, useDisclosure, SimpleGrid, FormControl,
  FormLabel, Input, Select, Textarea, VStack, HStack, Flex, Text, Divider, useToast, Icon,
  Spinner, NumberInput, NumberInputField, Tabs, TabList, TabPanels, Tab, TabPanel, Progress, Alert,
  AlertIcon, AlertDescription, Wrap, WrapItem, Tag
} from '@chakra-ui/react';
import { dates, clients, girls as girlsApi, events as eventsApi } from '../../utils/api';
import { CalendarIcon, SparklesIcon, FireIcon, WarningIcon, CheckCircleIcon, QuestionIcon } from '../../components/Icons';
import ClientCalendar from '../../components/ClientCalendar';

const STATUS_CONFIG = {
  'pending_plan': { label: '待策划', color: 'orange' },
  'planned': { label: '已策划', color: 'teal' },
  'pending_client_confirm': { label: '待确认', color: 'purple' },
  'confirmed': { label: '已确认', color: 'green' },
  'completed': { label: '已完成', color: 'cyan' },
  'cancelled': { label: '已取消', color: 'gray' }
};

const DATE_STYLES = ['正常约会', '朋友式约会', '暧昧升温约会', '浪漫约会', '轻松散步', '运动约会', '文化体验'];
const TIME_PREFERENCES = ['工作日晚上', '周末下午', '周末晚上', '节假日', '任意时间'];
const DURATIONS = ['1小时', '2小时', '3小时', '半天', '一整天'];
const BUDGETS = ['100以下', '100-300', '300-500', '500-800', '800-1500', '1500以上', '不限'];
const GIRL_STAGES = ['陌生', '搭讪', '聊天', '暧昧', '约会', '锁定', '长期'];
const RATING_LABELS = ['', '极差', '差', '一般', '好', '非常好'];
const POSITIVE_SIGNALS = [
  '主动发起话题', '回复速度快', '主动邀约', '分享日常', '主动肢体接触',
  '表白心意', '眼神交流多', '主动结账', '询问下次见面', '提起未来计划'
];
const NEGATIVE_SIGNALS = [
  '回复变慢', '敷衍回应', '经常消失', '拒绝邀约', '态度冷淡',
  '不再主动', '提及其他人', '聊天冷淡', '肢体回避', '提前离开'
];

function parseJSON(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

export default function AdminDates() {
  const [datesList, setDatesList] = useState([]);
  const [clientList, setClientList] = useState([]);
  const [girlList, setGirlList] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const { isOpen: isDetailOpen, onOpen: openDetailModal, onClose: closeDetail } = useDisclosure();
  const { isOpen: isCreateOpen, onOpen: openCreate, onClose: closeCreate } = useDisclosure();
  const { isOpen: isEvaluateOpen, onOpen: openEvaluate, onClose: closeEvaluate } = useDisclosure();
  const toast = useToast();

  // 表单状态
  const [form, setForm] = useState(getInitForm());
  // 评价状态
  const [evalForm, setEvalForm] = useState(getInitEvalForm());
  // 选中的信号
  const [posSignalList, setPosSignalList] = useState([]);
  const [negSignalList, setNegSignalList] = useState([]);
  // 消费记录
  const [expenses, setExpenses] = useState([{ item: '', amount: '' }]);
  // AI生成中
  const [generating, setGenerating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  // 约会前检查清单
  const [checklist, setChecklist] = useState([]);
  const [checklistSaving, setChecklistSaving] = useState(false);
  // 方案讨论
  const [discussion, setDiscussion] = useState([]);
  const [discussMsg, setDiscussMsg] = useState('');
  const [discussing, setDiscussing] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const discussEndRef = useRef(null);
  // 访谈相关
  const [generatingInterview, setGeneratingInterview] = useState(false);
  const [pushingInterview, setPushingInterview] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [interviewOverview, setInterviewOverview] = useState('');
  const [reportResult, setReportResult] = useState(null);
  // AI分析 - 事件和提醒
  const [dateEvents, setDateEvents] = useState([]);
  // 日历视图相关
  const [calendarViewClient, setCalendarViewClient] = useState(null);
  const [calendarGirlList, setCalendarGirlList] = useState([]);
  const [calendarClientList, setCalendarClientList] = useState([]);
  // 日历刷新令牌：每次日期操作后+1，驱动 ClientCalendar 重载
  const [refreshKey, setRefreshKey] = useState(0);

  const loadClients = useCallback(async () => {
    try {
      const res = await clients.list();
      if (res.success) setClientList(res.clients);
    } catch (e) { console.error(e); }
  }, []);

  const loadGirlsForClient = useCallback(async (clientId) => {
    try {
      const res = await girlsApi.list({ clientId });
      if (res.success) setGirlList(res.girls);
    } catch (e) { console.error(e); }
  }, []);

  const loadDates = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedClient) params.clientId = selectedClient;
      if (statusFilter) params.status = statusFilter;
      const res = await dates.list(params);
      if (res.success) setDatesList(res.dates);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [selectedClient, statusFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadDates(); loadClients(); }, [loadDates, loadClients]);

  useEffect(() => {
    if (selectedClient) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadGirlsForClient(selectedClient);
    } else {
      setGirlList([]);
    }
  }, [selectedClient, loadGirlsForClient]);

  function getInitForm() {
    return {
      clientId: '', girlId: '', dateTime: '', title: '', location: '',
      dateStyle: '', budget: '', timePreference: '', duration: '',
      specialRequirements: '', purpose: '', notes: ''
    };
  }

  function getInitEvalForm() {
    return {
      rating: 3, postNotes: '', girlStageAfter: '', duration: '', totalExpense: '',
      tensionChange: '', nextPurpose: '',
      // 见面时刻
      girlAppearance: '', girlOnTime: '', girlGreetedFirst: '',
      // 对话质量
      silenceDuration: '', awkwardMoments: '',
      // 肢体进展
      physicalProgress: '', // 牵手/挽手臂/接吻/其他
      // 离别时刻
      goodbyeInitiator: '', nextDateMentioned: '',
      // 情绪曲线
      moodStart: 5, moodMid: 5, moodEnd: 5,
      // 评审团新增
      girlEngagementStart: 3, girlEngagementMid: 3, girlEngagementEnd: 3,
      comfortBehaviors: '', topicDepth: '', clientAnchor: '',
      // 其他
      highlight: '', lowlight: '', clientSelfScore: '', expectationGap: ''
    };
  }

  const openCreateModal = () => {
    setSelectedClient('');
    setForm(getInitForm()); setGirlList([]);
    openCreate();
  };

  const handleCreate = async () => {
    if (!form.clientId || !form.girlId || !form.dateTime) {
      toast({ title: '请填写客户、女生和约会时间', status: 'warning', duration: 2000 }); return;
    }
    try {
      const conditions = {
        dateStyle: form.dateStyle, budget: form.budget,
        timePreference: form.timePreference, duration: form.duration,
        specialRequirements: form.specialRequirements, purpose: form.purpose,
        locationPreference: form.location
      };
      const res = await dates.create({
        clientId: form.clientId, girlId: form.girlId,
        dateTime: form.dateTime, title: form.title, location: form.location,
        notes: form.notes, conditions
      });
      if (res.success) {
        toast({ title: '约会创建成功', status: 'success', duration: 2000 });
        closeCreate();
        loadDates();
        setRefreshKey(n => n + 1);
      }
    } catch (e) { console.error(e); toast({ title: '创建失败', status: 'error', duration: 2000 }); }
  };

  const openDetail = async (date) => {
    try {
      const res = await dates.get(date.id);
      if (res.success) {
        setSelectedDate(res.date);
                // 初始化检查清单
        if (res.date.preDateChecklist) {
          setChecklist(parseJSON(res.date.preDateChecklist, []));
        } else {
          const tpl = await dates.getChecklistTemplate();
          if (tpl.success) setChecklist(tpl.template);
        }
        // 初始化讨论记录
        if (res.date.planDiscussion) {
          setDiscussion(parseJSON(res.date.planDiscussion, []));
        } else {
          setDiscussion([]);
        }
        setShowDiscussion(false);
        setDiscussMsg('');
        // 加载关联的事件和提醒
        try {
          const evRes = await eventsApi.list({ dateId: res.date.id });
          if (evRes.success) setDateEvents(evRes.events || []);
          else setDateEvents([]);
        } catch { setDateEvents([]); }
        openDetailModal();
      }
    } catch (e) { console.error(e); }
  };

  const toggleEventStatus = async (eventId, currentStatus) => {
    const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    try {
      await eventsApi.updateStatus(eventId, nextStatus);
      setDateEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, status: nextStatus } : ev));
    } catch (e) { console.error(e); }
  };

  const deleteEvent = async (eventId) => {
    try {
      await eventsApi.delete(eventId);
      setDateEvents(prev => prev.filter(ev => ev.id !== eventId));
    } catch (e) { console.error(e); }
  };

  const addReminder = async () => {
    if (!selectedDate) return;
    const title = window.prompt('输入提醒内容：');
    if (!title?.trim()) return;
    try {
      const res = await eventsApi.create({
        clientId: selectedDate.clientId,
        girlId: selectedDate.girlId || undefined,
        title: title.trim(),
        type: 'manual',
        eventTime: selectedDate.dateTime || new Date().toISOString(),
        status: 'pending',
        dateId: selectedDate.id,
      });
      if (res.success && res.event) {
        setDateEvents(prev => [...prev, res.event]);
      }
    } catch (e) { console.error(e); }
  };

  const openEval = () => {
    setEvalForm(getInitEvalForm());
    setPosSignalList([]); setNegSignalList([]);
    setExpenses([{ item: '', amount: '' }]);
    closeDetail();
    openEvaluate();
  };

  const handleGeneratePlan = async () => {
    if (!selectedDate) return;
    setGenerating(true);
    try {
      const res = await dates.generatePlan(selectedDate.id);
      if (res.success) {
        setSelectedDate(res.date);
        setDiscussion([]);
        setShowDiscussion(false);
        toast({ title: 'AI约会方案生成成功', status: 'success', duration: 3000 });
      } else {
        toast({ title: res.error || '生成失败', status: 'error', duration: 3000 });
      }
    } catch (e) { console.error(e); toast({ title: '生成失败', status: 'error', duration: 3000 }); }
    setGenerating(false);
  };

  const handleDiscuss = async () => {
    if (!selectedDate || !discussMsg.trim()) return;
    const msg = discussMsg;
    setDiscussMsg('');
    setDiscussing(true);
    try {
      const res = await dates.discuss(selectedDate.id, msg);
      if (res.success) {
        const updated = await dates.get(selectedDate.id);
        if (updated.success) {
          setSelectedDate(updated.date);
          setDiscussion(parseJSON(updated.date.planDiscussion, []));
        }
        toast({
          title: res.planUpdated ? '方案已根据讨论优化更新' : 'AI 已回复',
          status: res.planUpdated ? 'success' : 'info',
          duration: 2500
        });
        setShowDiscussion(true);
        setTimeout(() => discussEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        toast({ title: res.error || '讨论失败', status: 'error', duration: 2500 });
        setDiscussMsg(msg);
      }
    } catch (e) {
      console.error(e);
      toast({ title: '讨论失败', status: 'error', duration: 2500 });
      setDiscussMsg(msg);
    }
    setDiscussing(false);
  };

  const handlePushToClient = async () => {
    if (!selectedDate) return;
    try {
      const res = await dates.pushToClient(selectedDate.id);
      if (res.success) {
        const updated = await dates.get(selectedDate.id);
        if (updated.success) setSelectedDate(updated.date);
        toast({ title: '方案已推送，等待客户确认', status: 'success', duration: 3000 });
        loadDates();
        setRefreshKey(n => n + 1);
      } else {
        toast({ title: res.error || '推送失败', status: 'error', duration: 2500 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '推送失败', status: 'error', duration: 2500 });
    }
  };

  const handleDeletePlan = async () => {
    if (!selectedDate) return;
    try {
      const res = await dates.deletePlan(selectedDate.id);
      if (res.success) {
        const updated = await dates.get(selectedDate.id);
        if (updated.success) setSelectedDate(updated.date);
        toast({ title: '方案已删除', status: 'success', duration: 2000 });
        loadDates();
        setRefreshKey(n => n + 1);
      } else {
        toast({ title: res.error || '删除失败', status: 'error', duration: 2500 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '删除失败', status: 'error', duration: 2500 });
    }
  };

  const handleGenerateInterview = async () => {
    if (!selectedDate) return;
    setGeneratingInterview(true);
    setReportResult(null);
    try {
      const res = await dates.generateInterview(selectedDate.id);
      if (res.success) {
        setInterviewOverview(res.interviewOverview || '');
        const updated = await dates.get(selectedDate.id);
        if (updated.success) setSelectedDate(updated.date);
        toast({ title: res.alreadyGenerated ? '已加载访谈问题' : '个性化访谈问题已生成', status: 'success', duration: 3000 });
      } else {
        toast({ title: res.error || '生成失败', status: 'error', duration: 3000 });
      }
    } catch (e) { console.error(e); toast({ title: '生成失败', status: 'error', duration: 3000 }); }
    setGeneratingInterview(false);
  };

  const handlePushInterview = async () => {
    if (!selectedDate) return;
    setPushingInterview(true);
    try {
      const res = await dates.pushInterview(selectedDate.id);
      if (res.success) {
        const updated = await dates.get(selectedDate.id);
        if (updated.success) setSelectedDate(updated.date);
        toast({ title: '访谈已推送给客户', status: 'success', duration: 3000 });
        loadDates();
      } else {
        toast({ title: res.error || '推送失败', status: 'error', duration: 2500 });
      }
    } catch (e) { console.error(e); toast({ title: '推送失败', status: 'error', duration: 2500 }); }
    setPushingInterview(false);
  };

  const handleGenerateReport = async () => {
    if (!selectedDate) return;
    setGeneratingReport(true);
    try {
      const res = await dates.generateReviewReport(selectedDate.id);
      if (res.success && res.report) {
        setReportResult(res.report);
        const updated = await dates.get(selectedDate.id);
        if (updated.success) setSelectedDate(updated.date);
        toast({ title: '复盘报告已生成', status: 'success', duration: 3000 });
      } else {
        toast({ title: res.error || '生成失败', status: 'error', duration: 3000 });
      }
    } catch (e) { console.error(e); toast({ title: '生成失败', status: 'error', duration: 3000 }); }
    setGeneratingReport(false);
  };

  const getInterviewStatus = (date) => {
    if (!date.postDateInterview) return null;
    const iv = parseJSON(date.postDateInterview, {});
    if (!iv.generatedQuestions?.length) return null;
    if (iv.questionStatus === 'answered') return 'answered';
    if (iv.questionStatus === 'pending' && iv.pushedAt) return 'pending';
    return 'draft';
  };

  const handleEvaluate = async () => {
    if (!selectedDate) return;
    setEvaluating(true);
    try {
      const posSignals = posSignalList.map(s => ({ signal: s }));
      const negSignals = negSignalList.map(s => ({ signal: s }));
      const expList = expenses.filter(e => e.item && e.amount).map(e => ({ item: e.item, amount: parseFloat(e.amount) }));
      const total = expList.reduce((sum, e) => sum + e.amount, 0);

      const res = await dates.evaluate(selectedDate.id, {
        ...evalForm,
        positiveSignals: posSignals, negativeSignals: negSignals,
        expenseRecord: expList, totalExpense: total
      });
      if (res.success) {
                setSelectedDate(res.date);
        toast({ title: '评价已保存', status: 'success', duration: 3000 });
        closeEvaluate();
        loadDates();
        setRefreshKey(n => n + 1);
      }
    } catch (e) { console.error(e); toast({ title: '保存失败', status: 'error', duration: 2000 }); }
    setEvaluating(false);
  };

  const handleUpdate = async (updates) => {
    if (!selectedDate) return;
    try {
      const res = await dates.update(selectedDate.id, updates);
      if (res.success) {
        setSelectedDate(res.date);
        toast({ title: '已更新', status: 'success', duration: 1500 });
        if (updates.status === 'cancelled') {
          loadDates();
          setRefreshKey(n => n + 1);
        }
      }
    } catch (e) { console.error(e); }
  };

  const toggleChecklistItem = (catIndex, itemIndex) => {
    const updated = checklist.map((cat, ci) => {
      if (ci !== catIndex) return cat;
      return {
        ...cat,
        items: (cat.items || []).map((item, ii) => {
          if (ii !== itemIndex) return item;
          return { ...item, checked: !item.checked };
        })
      };
    });
    setChecklist(updated);
  };

  const saveChecklist = async () => {
    if (!selectedDate) return;
    setChecklistSaving(true);
    try {
      await dates.updateChecklist(selectedDate.id, checklist);
      toast({ title: '检查清单已保存', status: 'success', duration: 1500 });
    } catch (e) {
      console.error(e);
      toast({ title: '保存失败', status: 'error', duration: 1500 });
    }
    setChecklistSaving(false);
  };

  const renderPlan = (plan) => {
    if (!plan) return null;
    const p = typeof plan === 'string' ? parseJSON(plan) : plan;
    if (!p) return null;
    return (
      <Box>
        {p.overview && <Alert status="info" mb={4} borderRadius="md"><AlertIcon /><AlertDescription>{p.overview}</AlertDescription></Alert>}

        {p.venue && (
          <Card bg="gray.750" mb={4}>
            <CardBody>
              <Text color="teal.400" fontWeight="bold" mb={2}>推荐地点</Text>
              <SimpleGrid columns={2} spacing={3}>
                <Box><Text color="gray.400" fontSize="sm">名称</Text><Text color="white">{p.venue.name}</Text></Box>
                <Box><Text color="gray.400" fontSize="sm">类型</Text><Text color="white">{p.venue.type}</Text></Box>
                <Box><Text color="gray.400" fontSize="sm">地址</Text><Text color="white">{p.venue.address}</Text></Box>
                <Box><Text color="gray.400" fontSize="sm">预算</Text><Text color="white">{p.venue.budget}</Text></Box>
              </SimpleGrid>
              {p.venue.reason && <Text color="gray.300" fontSize="sm" mt={2}><b>选点理由：</b>{p.venue.reason}</Text>}
            </CardBody>
          </Card>
        )}

        {Array.isArray(p.schedule) && p.schedule.length > 0 && (
          <Card bg="gray.750" mb={4}>
            <CardBody>
              <Text color="teal.400" fontWeight="bold" mb={3}>时间安排</Text>
              <VStack spacing={2} align="stretch">
                {p.schedule.map((s, i) => (
                  <Flex key={i} gap={3} p={2} bg="gray.700" borderRadius="md" align="center">
                    <Badge colorScheme="teal" minW="60px" textAlign="center">{s.time}</Badge>
                    <Box flex={1}>
                      <Text color="white" fontSize="sm">{s.activity}</Text>
                      {s.note && <Text color="gray.400" fontSize="xs">{s.note}</Text>}
                    </Box>
                    <Text color="gray.500" fontSize="xs">{s.duration}</Text>
                  </Flex>
                ))}
              </VStack>
            </CardBody>
          </Card>
        )}

        {p.talkingPoints?.length > 0 && (
          <Card bg="gray.750" mb={4}>
            <CardBody>
              <Text color="orange.400" fontWeight="bold" mb={3}>聊天话题</Text>
              <VStack spacing={2} align="stretch">
                {p.talkingPoints.map((t, i) => (
                  <Box key={i} p={2} bg="gray.700" borderRadius="md">
                    <Flex justify="space-between" mb={1}>
                      <Text color="orange.300" fontSize="sm">{t.topic}</Text>
                      <Badge colorScheme="purple" fontSize="xs">{t.goal}</Badge>
                    </Flex>
                    <Text color="gray.300" fontSize="xs">{t.content}</Text>
                  </Box>
                ))}
              </VStack>
            </CardBody>
          </Card>
        )}

        {Array.isArray(p.precautions) && p.precautions.length > 0 && (
          <Card bg="gray.750" mb={4}>
            <CardBody>
              <Text color="red.400" fontWeight="bold" mb={3}>注意事项</Text>
              <VStack spacing={2} align="stretch">
                {p.precautions.map((p2, i) => (
                  <Box key={i} p={2} bg="gray.700" borderRadius="md">
                    <Text color="red.300" fontSize="sm">⚠ {p2.point}</Text>
                    <Text color="gray.400" fontSize="xs">{p2.suggestion}</Text>
                  </Box>
                ))}
              </VStack>
            </CardBody>
          </Card>
        )}

        <SimpleGrid columns={2} spacing={4}>
          {p.outfit && (
            <Card bg="gray.750">
              <CardBody>
                <Text color="pink.400" fontWeight="bold" mb={2}>穿搭建议</Text>
                <Text color="white" fontSize="sm">风格：{p.outfit.style}</Text>
                <Text color="white" fontSize="sm">颜色：{p.outfit.colors}</Text>
                <Text color="red.300" fontSize="xs">避免：{p.outfit.avoid}</Text>
              </CardBody>
            </Card>
          )}
          {p.budgetTips && (
            <Card bg="gray.750">
              <CardBody>
                <Text color="green.400" fontWeight="bold" mb={2}>预算建议</Text>
                <Text color="white" fontSize="sm">{p.budgetTips}</Text>
              </CardBody>
            </Card>
          )}
        </SimpleGrid>

        {p.successSignals?.length > 0 && (
          <Card bg="gray.750" mt={4}>
            <CardBody>
              <Text color="green.400" fontWeight="bold" mb={2}>约会好信号</Text>
              <Wrap>
                {p.successSignals.map((s, i) => <WrapItem key={i}><Tag colorScheme="green" size="sm">{s}</Tag></WrapItem>)}
              </Wrap>
            </CardBody>
          </Card>
        )}
      </Box>
    );
  };

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const total = datesList.length;
    const completed = datesList.filter(d => d.status === 'completed');
    const rated = completed.filter(d => d.rating);
    const cancelled = datesList.filter(d => d.status === 'cancelled');
    const active = datesList.filter(d => d.status !== 'completed' && d.status !== 'cancelled');
    const thisMonthDates = datesList.filter(d => {
      const dt = new Date(d.dateTime);
      return dt.getFullYear() === thisYear && dt.getMonth() === thisMonth;
    });
    const totalExpense = datesList.reduce((sum, d) => sum + (d.totalExpense || 0), 0);
    const avgRating = rated.length > 0
      ? (rated.reduce((s, d) => s + d.rating, 0) / rated.length).toFixed(1)
      : '-';
    const avgExpense = completed.length > 0
      ? Math.round(totalExpense / completed.length)
      : 0;
    return { total, completed: completed.length, rated: rated.length, cancelled: cancelled.length, active: active.length, thisMonth: thisMonthDates.length, totalExpense, avgRating, avgExpense };
  }, [datesList]);

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading color="white">约会管理</Heading>
        <HStack>
          <Select placeholder="筛选客户" w="160px" value={selectedClient} onChange={e => { setSelectedClient(e.target.value); }} bg="gray.800" color="white" size="sm">
            {clientList.map(c => <option key={c.id} value={c.id}>{c.nickname || c.username}</option>)}
          </Select>
          <Select placeholder="全部状态" w="130px" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} bg="gray.800" color="white" size="sm">
            <option value="">全部</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Button colorScheme="teal" onClick={openCreateModal} size="sm">+ 创建约会</Button>
          <Button variant="outline" colorScheme="gray" size="sm" onClick={loadDates}>刷新</Button>
        </HStack>
      </Flex>

      {/* 统计面板 */}
      <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3} mb={4}>
        <Card bg="gray.800" variant="filled">
          <CardBody p={3}>
            <Text color="gray.400" fontSize="xs">总约会</Text>
            <Text color="white" fontSize="xl" fontWeight="bold">{stats.total}</Text>
            <HStack spacing={2} mt={1}>
              <Text color="teal.400" fontSize="xs">{stats.thisMonth} 本月</Text>
              <Text color="orange.400" fontSize="xs">{stats.active} 进行中</Text>
            </HStack>
          </CardBody>
        </Card>
        <Card bg="gray.800" variant="filled">
          <CardBody p={3}>
            <Text color="gray.400" fontSize="xs">已完成</Text>
            <Text color="green.400" fontSize="xl" fontWeight="bold">{stats.completed}</Text>
            <Text color="gray.500" fontSize="xs">{stats.total > 0 ? Math.round(stats.completed / stats.total * 100) : 0}% 完成率</Text>
          </CardBody>
        </Card>
        <Card bg="gray.800" variant="filled">
          <CardBody p={3}>
            <Text color="gray.400" fontSize="xs">平均评分</Text>
            <Text color="yellow.400" fontSize="xl" fontWeight="bold">{stats.avgRating}</Text>
            <Text color="gray.500" fontSize="xs">{stats.rated} 条评价</Text>
          </CardBody>
        </Card>
        <Card bg="gray.800" variant="filled">
          <CardBody p={3}>
            <Text color="gray.400" fontSize="xs">总花费</Text>
            <Text color="pink.400" fontSize="xl" fontWeight="bold">¥{stats.totalExpense.toLocaleString()}</Text>
            <Text color="gray.500" fontSize="xs">均¥{stats.avgExpense.toLocaleString()}/完成</Text>
          </CardBody>
        </Card>
        <Card bg="gray.800" variant="filled">
          <CardBody p={3}>
            <Text color="gray.400" fontSize="xs">已取消</Text>
            <Text color="red.400" fontSize="xl" fontWeight="bold">{stats.cancelled}</Text>
            <Text color="gray.500" fontSize="xs">{stats.total > 0 ? Math.round(stats.cancelled / stats.total * 100) : 0}% 取消率</Text>
          </CardBody>
        </Card>
      </SimpleGrid>

      <Tabs colorScheme="teal" variant="enclosed">
        <TabList bg="gray.750" borderRadius="lg" p={1} mb={4}>
          <Tab _selected={{ bg: 'teal.600', color: 'white' }} color="gray.400" borderRadius="md" fontSize="sm">
            表格 ({datesList.length})
          </Tab>
          <Tab _selected={{ bg: 'teal.600', color: 'white' }} color="gray.400" borderRadius="md" fontSize="sm">
            日历
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel px={0}>
          <Card bg="gray.800">
            <CardBody>
              {loading ? (
                <Flex justify="center" py={8}><Spinner /></Flex>
              ) : datesList.length === 0 ? (
                <Text color="gray.500" textAlign="center" py={8}>暂无约会记录</Text>
              ) : (
                <>
                  {/* 桌面端表格 */}
                  <Box display={{ base: 'none', lg: 'block' }}>
                    <Table variant="simple" color="gray.300" size="sm">
                      <Thead>
                        <Tr>
                          <Th color="gray.400">约会</Th>
                          <Th color="gray.400">女生</Th>
                          <Th color="gray.400">客户</Th>
                          <Th color="gray.400">时间</Th>
                          <Th color="gray.400">状态</Th>
                          <Th color="gray.400">地点</Th>
                          <Th color="gray.400">花费</Th>
                          <Th color="gray.400">评价</Th>
                          <Th color="gray.400">操作</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {datesList.map(d => {
                          const cfg = STATUS_CONFIG[d.status] || { label: d.status, color: 'gray' };
                          const parsedPlan = parseJSON(d.aiPlan);
                          return (
                            <Tr key={d.id} _hover={{ bg: 'gray.750' }} transition="background 0.15s">
                              <Td>
                                <Text color="white" fontWeight="bold" fontSize="sm">{d.title || '约会'}</Text>
                                {d.planStatus === 'generating' && <Spinner size="xs" color="teal.400" />}
                                {d.planStatus === 'generated' && parsedPlan?.venue && (
                                  <Text color="gray.500" fontSize="xs">{parsedPlan.venue.name}</Text>
                                )}
                              </Td>
                              <Td>
                                <Text color="teal.300" fontSize="sm">{d.girl?.name || '-'}</Text>
                                {d.girl?.stage && <Badge colorScheme="teal" size="xs">{d.girl.stage}</Badge>}
                              </Td>
                              <Td><Text color="gray.300" fontSize="sm">{d.user?.nickname || '-'}</Text></Td>
                              <Td><Text color="gray.300" fontSize="xs">{d.dateTime ? new Date(d.dateTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</Text></Td>
                              <Td><Badge colorScheme={cfg.color}>{cfg.label}</Badge></Td>
                              <Td><Text color="gray.400" fontSize="xs" maxW="100px" noOfLines={1}>{d.location || '-'}</Text></Td>
                              <Td><Text color="gray.300" fontSize="sm">{d.totalExpense ? `¥${d.totalExpense}` : '-'}</Text></Td>
                              <Td>
                                {d.rating ? (
                                  <HStack spacing={1}>
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <Icon key={i} as={FireIcon} color={i < d.rating ? 'orange.400' : 'gray.600'} boxSize={3} />
                                    ))}
                                  </HStack>
                                ) : <Text color="gray.600">-</Text>}
                              </Td>
                              <Td>
                                <HStack spacing={2}>
                                  <Button size="xs" colorScheme="teal" variant="ghost" onClick={() => openDetail(d)}>详情</Button>
                                  {(d.status === 'pending_plan') && (
                                    <Button size="xs" colorScheme="orange" variant="ghost" onClick={async () => {
                                      setSelectedDate(d);
                                      await openDetail(d);
                                    }}>策划</Button>
                                  )}
                                  {d.status === 'planned' && (
                                    <Button size="xs" colorScheme="green" variant="ghost" onClick={() => { setSelectedDate(d); openEval(); }}>评价</Button>
                                  )}
                                </HStack>
                              </Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </Box>

                  {/* 移动端卡片列表 */}
                  <Box display={{ base: 'block', lg: 'none' }}>
                    <VStack spacing={2} align="stretch">
                      {datesList.map(d => {
                        const cfg = STATUS_CONFIG[d.status] || { label: d.status, color: 'gray' };
                        return (
                          <Card key={d.id} bg="gray.750" size="sm" cursor="pointer" onClick={() => openDetail(d)} _hover={{ bg: 'gray.700' }}>
                            <CardBody py={3} px={4}>
                              <Flex justify="space-between" align="center" mb={2}>
                                <Text color="white" fontWeight="bold" fontSize="sm">{d.title || '约会'}</Text>
                                <Badge colorScheme={cfg.color}>{cfg.label}</Badge>
                              </Flex>
                              <HStack spacing={3} wrap="wrap" mb={2}>
                                <Text color="teal.300" fontSize="xs">{d.girl?.name || '-'}</Text>
                                <Text color="gray.400" fontSize="xs">{d.user?.nickname || '-'}</Text>
                                <Text color="gray.400" fontSize="xs">{d.dateTime ? new Date(d.dateTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</Text>
                              </HStack>
                              <HStack spacing={2}>
                                {d.rating && (
                                  <HStack spacing={0}>
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <Icon key={i} as={FireIcon} color={i < d.rating ? 'orange.400' : 'gray.600'} boxSize={3} />
                                    ))}
                                  </HStack>
                                )}
                                {d.totalExpense && <Text color="gray.400" fontSize="xs">¥{d.totalExpense}</Text>}
                                <Button size="xs" colorScheme="teal" variant="ghost" onClick={(e) => { e.stopPropagation(); openDetail(d); }}>详情</Button>
                              </HStack>
                            </CardBody>
                          </Card>
                        );
                      })}
                    </VStack>
                  </Box>
                </>
              )}
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel px={0}>
          <Card bg="gray.800">
            <CardBody>
              {selectedClient ? (
                <ClientCalendar
                  clientId={selectedClient}
                  clientNickname={clientList.find(c => c.id === selectedClient)?.nickname || ''}
                  girlList={girlList}
                  refreshKey={refreshKey}
                />
              ) : (
                <Flex direction="column" align="center" py={12} gap={3}>
                  <Icon as={CalendarIcon} color="gray.500" boxSize={10} />
                  <Text color="gray.400">请先在上方选择客户</Text>
                  <Text color="gray.500" fontSize="sm">切换到「表格」标签可在全部客户视图中筛选</Text>
                </Flex>
              )}
            </CardBody>
          </Card>
        </TabPanel>
        </TabPanels>
      </Tabs>

      {/* 创建约会 */}
      <Modal isOpen={isCreateOpen} onClose={closeCreate} size="xl">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflow="auto">
          <ModalHeader color="white">创建约会</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              <SimpleGrid columns={2} spacing={4}>
                <FormControl isRequired>
                  <FormLabel color="gray.400" fontSize="sm">所属客户</FormLabel>
                  <Select placeholder="选择客户" value={form.clientId} onChange={e => { setForm({...form, clientId: e.target.value, girlId: ''}); }} bg="gray.700" color="white">
                    {clientList.map(c => <option key={c.id} value={c.id}>{c.nickname || c.username}</option>)}
                  </Select>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel color="gray.400" fontSize="sm">约会对象</FormLabel>
                  <Select placeholder={selectedClient ? '选择女生' : '先选客户'} value={form.girlId} onChange={e => setForm({...form, girlId: e.target.value})} bg="gray.700" color="white" isDisabled={!selectedClient}>
                    {girlList.map(g => <option key={g.id} value={g.id}>{g.name}（{g.stage || '未知阶段'}）</option>)}
                  </Select>
                </FormControl>
              </SimpleGrid>
              <SimpleGrid columns={2} spacing={4}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">约会简称</FormLabel>
                  <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="如：第一次见面" bg="gray.700" />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel color="gray.400" fontSize="sm">约会时间</FormLabel>
                  <Input type="datetime-local" value={form.dateTime} onChange={e => setForm({...form, dateTime: e.target.value})} bg="gray.700" />
                </FormControl>
              </SimpleGrid>
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">地点</FormLabel>
                <Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="预计地点" bg="gray.700" />
              </FormControl>

              <Divider borderColor="gray.600" />
              <Text color="gray.400" fontSize="sm">以下信息用于AI生成约会方案（选填，但越详细越精准）</Text>

              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">约会风格</FormLabel>
                  <Select value={form.dateStyle} onChange={e => setForm({...form, dateStyle: e.target.value})} bg="gray.700" color="white">
                    <option value="">选择风格</option>
                    {DATE_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">预算</FormLabel>
                  <Select value={form.budget} onChange={e => setForm({...form, budget: e.target.value})} bg="gray.700" color="white">
                    <option value="">选择预算</option>
                    {BUDGETS.map(b => <option key={b} value={b}>{b}</option>)}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">时长</FormLabel>
                  <Select value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} bg="gray.700" color="white">
                    <option value="">选择时长</option>
                    {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </FormControl>
              </SimpleGrid>
              <SimpleGrid columns={2} spacing={4}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">时间偏好</FormLabel>
                  <Select value={form.timePreference} onChange={e => setForm({...form, timePreference: e.target.value})} bg="gray.700" color="white">
                    <option value="">选择偏好</option>
                    {TIME_PREFERENCES.map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">约会目的</FormLabel>
                  <Input value={form.purpose} onChange={e => setForm({...form, purpose: e.target.value})} placeholder="加深了解/推进关系..." bg="gray.700" />
                </FormControl>
              </SimpleGrid>
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">特殊要求</FormLabel>
                <Textarea value={form.specialRequirements} onChange={e => setForm({...form, specialRequirements: e.target.value})} placeholder="女生禁忌/偏好/特殊需求..." bg="gray.700" rows={2} />
              </FormControl>
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">备注</FormLabel>
                <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="其他备注..." bg="gray.700" rows={2} />
              </FormControl>
              <Button colorScheme="teal" onClick={handleCreate} transition="all 0.15s" _hover={{ transform: 'translateY(-1px)' }}>创建约会</Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 约会详情 */}
      <Modal isOpen={isDetailOpen} onClose={closeDetail} size="4xl">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="90vh" overflow="auto">
          <ModalHeader color="white">
            {selectedDate?.title || '约会详情'}
            {selectedDate && <Badge ml={2} colorScheme={STATUS_CONFIG[selectedDate.status]?.color}>{STATUS_CONFIG[selectedDate.status]?.label}</Badge>}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {selectedDate && (
              <Box>
                <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4} mb={4}>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">女生</Text>
                    <Text color="teal.300">{selectedDate.girl?.name || '-'}</Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">客户</Text>
                    <Text color="white">{selectedDate.user?.nickname || '-'}</Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">时间</Text>
                    <Text color="white" fontSize="sm">{selectedDate.dateTime ? new Date(selectedDate.dateTime).toLocaleString('zh-CN') : '-'}</Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">地点</Text>
                    <Input size="xs" value={selectedDate.location || ''} onBlur={e => handleUpdate({ location: e.target.value })} bg="gray.700" />
                  </Box>
                </SimpleGrid>

                {/* 约会前检查清单 */}
                {checklist.length > 0 && (
                  <Card bg="gray.750" mb={4}>
                    <CardBody>
                      <Flex justify="space-between" align="center" mb={3}>
                        <HStack spacing={2}>
                          <Icon as={CheckCircleIcon} color="teal.400" />
                          <Text color="teal.400" fontWeight="bold">约会前检查清单</Text>
                          <Badge colorScheme="teal" fontSize="xs">
                            {checklist.reduce((sum, cat) => sum + (cat.items || []).filter(i => i.checked).length, 0)}/{checklist.reduce((sum, cat) => sum + (cat.items || []).length, 0)} 完成
                          </Badge>
                        </HStack>
                        <Button size="xs" colorScheme="teal" variant="outline" onClick={saveChecklist} isLoading={checklistSaving}>保存</Button>
                      </Flex>
                      <VStack spacing={4} align="stretch">
                        {checklist.map((cat, ci) => (
                          <Box key={ci}>
                            <Text color="gray.400" fontSize="xs" mb={2} fontWeight="bold">{cat.category}</Text>
                            <VStack spacing={1} align="stretch">
                              {cat.items.map((item, ii) => (
                                <Flex
                                  key={item.id}
                                  align="center"
                                  gap={2}
                                  p={2}
                                  bg={item.checked ? 'green.900' : 'gray.700'}
                                  borderRadius="md"
                                  cursor="pointer"
                                  onClick={() => toggleChecklistItem(ci, ii)}
                                  transition="all 0.15s"
                                  _hover={{ bg: item.checked ? 'green.800' : 'gray.600' }}
                                >
                                  <Icon
                                    as={CheckCircleIcon}
                                    color={item.checked ? 'green.400' : 'gray.500'}
                                    boxSize={4}
                                  />
                                  <Text
                                    color={item.checked ? 'green.300' : 'gray.300'}
                                    fontSize="sm"
                                    textDecoration={item.checked ? 'line-through' : 'none'}
                                  >
                                    {item.label}
                                  </Text>
                                </Flex>
                              ))}
                            </VStack>
                          </Box>
                        ))}
                      </VStack>
                    </CardBody>
                  </Card>
                )}

                {/* 约会条件 */}
                {selectedDate.conditions && (
                  <Card bg="gray.750" mb={4}>
                    <CardBody>
                      <Text color="gray.400" fontSize="sm" mb={3}>约会条件</Text>
                      {(() => {
                        const c = parseJSON(selectedDate.conditions);
                        if (!c) return null;
                        return (
                          <Wrap spacing={2}>
                            {c.dateStyle && <WrapItem><Tag colorScheme="blue">{c.dateStyle}</Tag></WrapItem>}
                            {c.budget && <WrapItem><Tag colorScheme="green">{c.budget}</Tag></WrapItem>}
                            {c.duration && <WrapItem><Tag colorScheme="purple">{c.duration}</Tag></WrapItem>}
                            {c.timePreference && <WrapItem><Tag colorScheme="orange">{c.timePreference}</Tag></WrapItem>}
                            {c.purpose && <WrapItem><Tag>{c.purpose}</Tag></WrapItem>}
                          </Wrap>
                        );
                      })()}
                    </CardBody>
                  </Card>
                )}

                {/* 约会方案 */}
                {selectedDate.planStatus === 'generating' ? (
                  <Card bg="gray.750" mb={4}>
                    <CardBody>
                      <Flex align="center" gap={3}>
                        <Spinner color="teal.400" />
                        <Text color="gray.300">AI 正在生成约会方案，请稍候...</Text>
                      </Flex>
                    </CardBody>
                  </Card>
                ) : selectedDate.aiPlan ? (
                  <Box mb={4}>
                    <Flex justify="space-between" align="center" mb={2}>
                      <HStack spacing={2}>
                        <Heading size="sm" color="teal.400">AI 约会方案</Heading>
                        {selectedDate.planStatus === 'pushed' && <Badge colorScheme="purple">已推送</Badge>}
                        {selectedDate.clientConfirmed && <Badge colorScheme="green">客户已确认</Badge>}
                      </HStack>
                      <HStack spacing={2}>
                        <Button size="xs" colorScheme="teal" variant="outline" leftIcon={<Icon as={SparklesIcon} />} onClick={handleGeneratePlan} isLoading={generating} isDisabled={generating}>
                          重新生成
                        </Button>
                        {(selectedDate.planStatus === 'generated' || selectedDate.planStatus === 'pushed') && (
                          <Button
                            size="xs" colorScheme="purple" variant="outline"
                            onClick={() => setShowDiscussion(!showDiscussion)}
                          >
                            {showDiscussion ? '收起讨论' : '与AI讨论'}
                          </Button>
                        )}
                        {selectedDate.planStatus === 'generated' && (
                          <Button size="xs" colorScheme="purple" onClick={handlePushToClient}>
                            推送客户确认
                          </Button>
                        )}
                        <Button size="xs" colorScheme="red" variant="ghost" onClick={handleDeletePlan}>
                          删除方案
                        </Button>
                      </HStack>
                    </Flex>
                    {renderPlan(selectedDate.aiPlan)}

                    {/* 操盘手-AI讨论区 */}
                    {showDiscussion && (
                      <Card bg="gray.900" mt={4}>
                        <CardBody>
                          <Flex justify="space-between" align="center" mb={3}>
                            <Text color="purple.400" fontWeight="bold">与AI讨论优化方案</Text>
                            <Badge colorScheme="purple">{discussion.length / 2} 轮对话</Badge>
                          </Flex>

                          {discussion.length > 0 && (
                            <VStack spacing={3} align="stretch" mb={3} maxH="300px" overflowY="auto">
                              {discussion.map((msg, i) => (
                                <Flex key={i} justify={msg.role === 'operator' ? 'flex-end' : 'flex-start'}>
                                  <Box
                                    maxW="80%"
                                    p={3}
                                    borderRadius="lg"
                                    bg={msg.role === 'operator' ? 'purple.900' : 'gray.700'}
                                    borderBottomRightRadius={msg.role === 'operator' ? '4px' : 'lg'}
                                    borderBottomLeftRadius={msg.role === 'operator' ? 'lg' : '4px'}
                                  >
                                    <Text color={msg.role === 'operator' ? 'purple.200' : 'gray.200'} fontSize="sm" whiteSpace="pre-wrap">
                                      {msg.content}
                                    </Text>
                                    <Text color="gray.500" fontSize="xs" mt={1}>
                                      {msg.role === 'operator' ? '操盘手' : '月老AI'} · {new Date(msg.timestamp).toLocaleTimeString('zh-CN')}
                                    </Text>
                                  </Box>
                                </Flex>
                              ))}
                              <div ref={discussEndRef} />
                            </VStack>
                          )}

                          <HStack>
                            <Textarea
                              value={discussMsg}
                              onChange={e => setDiscussMsg(e.target.value)}
                              placeholder="输入你的调整意见，比如：'预算降低一点，换更私密的餐厅' 或 '增加户外活动，减少吃饭时间'"
                              bg="gray.800" color="white" size="sm" rows={2}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleDiscuss();
                                }
                              }}
                            />
                            <Button
                              colorScheme="purple" size="sm" onClick={handleDiscuss}
                              isLoading={discussing} isDisabled={!discussMsg.trim() || discussing}
                              h="auto"
                            >
                              发送
                            </Button>
                          </HStack>
                        </CardBody>
                      </Card>
                    )}
                  </Box>
                ) : (
                  <Card bg="gray.750" mb={4}>
                    <CardBody>
                      <Flex direction="column" align="center" py={6} gap={3}>
                        <Icon as={CalendarIcon} color="gray.500" boxSize={10} />
                        <Text color="gray.400">暂无约会方案</Text>
                        <Button colorScheme="teal" leftIcon={<Icon as={SparklesIcon} />} onClick={handleGeneratePlan} isLoading={generating} isDisabled={generating}>
                          一键生成约会方案
                        </Button>
                      </Flex>
                    </CardBody>
                  </Card>
                )}

                {/* AI分析 - 事件和提醒 */}
                <Card bg="gray.750" mb={4}>
                  <CardBody>
                    <Flex justify="space-between" align="center" mb={3}>
                      <HStack spacing={2}>
                        <Icon as={SparklesIcon} color="cyan.400" />
                        <Heading size="sm" color="cyan.400">AI分析</Heading>
                        <Badge colorScheme="cyan" fontSize="xs">{dateEvents.length} 项</Badge>
                      </HStack>
                      <Button size="xs" colorScheme="cyan" variant="outline" onClick={addReminder}>
                        + 添加提醒
                      </Button>
                    </Flex>
                    {dateEvents.length === 0 ? (
                      <Flex direction="column" align="center" py={6} gap={2}>
                        <Icon as={SparklesIcon} color="gray.500" boxSize={8} />
                        <Text color="gray.400" fontSize="sm">暂无事件和提醒</Text>
                        <Text color="gray.500" fontSize="xs">AI将在约会策划后自动生成行动项</Text>
                      </Flex>
                    ) : (
                      <VStack spacing={2} align="stretch">
                        {dateEvents.map(ev => (
                          <Flex key={ev.id} p={3} bg="gray.700" borderRadius="md" gap={3} align="center"
                            opacity={ev.status === 'completed' ? 0.5 : 1}>
                            <Icon
                              as={ev.status === 'completed' ? CheckCircleIcon : CalendarIcon}
                              color={ev.status === 'completed' ? 'green.400' : ev.type === 'date' ? 'teal.400' : 'orange.400'}
                              boxSize={4}
                              cursor="pointer"
                              onClick={() => toggleEventStatus(ev.id, ev.status)}
                            />
                            <Box flex={1}>
                              <Text
                                color={ev.status === 'completed' ? 'gray.500' : 'white'}
                                fontSize="sm"
                                textDecoration={ev.status === 'completed' ? 'line-through' : 'none'}
                              >
                                {ev.title}
                              </Text>
                              {ev.content && (
                                <Text color="gray.400" fontSize="xs">{ev.content}</Text>
                              )}
                              <HStack spacing={2} mt={1}>
                                <Badge
                                  colorScheme={ev.type === 'date' ? 'teal' : ev.type === 'action' ? 'orange' : 'gray'}
                                  size="xs"
                                >
                                  {ev.type === 'date' ? '约会' : ev.type === 'action' ? '行动项' : '提醒'}
                                </Badge>
                                <Text color="gray.500" fontSize="xs">
                                  {ev.eventTime ? new Date(ev.eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                </Text>
                              </HStack>
                            </Box>
                            <Button size="xs" variant="ghost" color="gray.500"
                              onClick={() => deleteEvent(ev.id)}>删除</Button>
                          </Flex>
                        ))}
                      </VStack>
                    )}
                  </CardBody>
                </Card>

                {/* 客户反馈 */}
                {selectedDate.clientFeedback && (() => {
                  const feedback = parseJSON(selectedDate.clientFeedback, []);
                  if (!feedback.length) return null;
                  return (
                    <Card bg="orange.900" border="1px solid" borderColor="orange.600" mb={4}>
                      <CardBody>
                        <Flex justify="space-between" align="center" mb={3}>
                          <HStack spacing={2}>
                            <Icon as={WarningIcon} color="orange.300" />
                            <Text color="orange.300" fontWeight="bold">客户调整建议</Text>
                            <Badge colorScheme="orange">{feedback.length}条</Badge>
                          </HStack>
                          <Button size="xs" colorScheme="orange" variant="outline"
                            leftIcon={<Icon as={SparklesIcon} />}
                            onClick={() => { setShowDiscussion(true); setTimeout(() => discussEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }}>
                            根据反馈优化方案
                          </Button>
                        </Flex>
                        <VStack spacing={3} align="stretch">
                          {feedback.map((f, i) => (
                            <Box key={i} p={3} bg="orange.950" borderRadius="md" borderLeft="3px solid" borderColor="orange.400">
                              <Text color="orange.200" fontSize="sm" fontWeight="bold">建议：{f.adjustment}</Text>
                              {f.reason && <Text color="orange.300" fontSize="xs" mt={1}>原因：{f.reason}</Text>}
                              <Text color="gray.400" fontSize="xs" mt={1}>{new Date(f.submittedAt).toLocaleString('zh-CN')}</Text>
                            </Box>
                          ))}
                        </VStack>
                      </CardBody>
                    </Card>
                  );
                })()}

                {/* 约会后记录 */}
                {selectedDate.status === 'completed' && (
                  <Box>
                    <Divider mb={4} borderColor="gray.600" />
                    <Heading size="sm" color="white" mb={4}>约会后记录</Heading>
                    <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4} mb={4}>
                      <Box bg="gray.750" p={3} borderRadius="md">
                        <Text color="gray.400" fontSize="sm">评价</Text>
                        <HStack>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Icon key={i} as={FireIcon} color={i < (selectedDate.rating || 0) ? 'orange.400' : 'gray.600'} boxSize={4} />
                          ))}
                        </HStack>
                      </Box>
                      <Box bg="gray.750" p={3} borderRadius="md">
                        <Text color="gray.400" fontSize="sm">总花费</Text>
                        <Text color="white">¥{selectedDate.totalExpense || 0}</Text>
                      </Box>
                      <Box bg="gray.750" p={3} borderRadius="md">
                        <Text color="gray.400" fontSize="sm">时长</Text>
                        <Text color="white">{selectedDate.duration || '-'}</Text>
                      </Box>
                      <Box bg="gray.750" p={3} borderRadius="md">
                        <Text color="gray.400" fontSize="sm">约会后阶段</Text>
                        <Text color="teal.300">{selectedDate.girlStageAfter || '-'}</Text>
                      </Box>
                    </SimpleGrid>

                    {/* 消费明细 */}
                    {selectedDate.expenseRecord && (
                      <Card bg="gray.750" mb={4}>
                        <CardBody>
                          <Text color="gray.400" fontSize="sm" mb={2}>消费明细</Text>
                          <VStack spacing={1} align="stretch">
                            {parseJSON(selectedDate.expenseRecord, []).map((e, i) => (
                              <Flex key={i} justify="space-between">
                                <Text color="gray.300" fontSize="sm">{e.item}</Text>
                                <Text color="white" fontSize="sm">¥{e.amount}</Text>
                              </Flex>
                            ))}
                          </VStack>
                        </CardBody>
                      </Card>
                    )}

                    {/* 正面/负面信号 */}
                    {(selectedDate.positiveSignals || selectedDate.negativeSignals) && (
                      <SimpleGrid columns={2} spacing={4} mb={4}>
                        <Card bg="gray.750">
                          <CardBody>
                            <Text color="green.400" fontSize="sm" mb={2}>正面信号</Text>
                            <Wrap>
                              {parseJSON(selectedDate.positiveSignals, []).map((s, i) => <WrapItem key={i}><Tag colorScheme="green" size="sm">{s.signal}</Tag></WrapItem>)}
                            </Wrap>
                          </CardBody>
                        </Card>
                        <Card bg="gray.750">
                          <CardBody>
                            <Text color="red.400" fontSize="sm" mb={2}>负面信号</Text>
                            <Wrap>
                              {parseJSON(selectedDate.negativeSignals, []).map((s, i) => <WrapItem key={i}><Tag colorScheme="red" size="sm">{s.signal}</Tag></WrapItem>)}
                            </Wrap>
                          </CardBody>
                        </Card>
                      </SimpleGrid>
                    )}

                    {/* 待办事项 */}
                    {selectedDate.followUpActions && (
                      <Card bg="gray.750" mb={4}>
                        <CardBody>
                          <Text color="blue.400" fontSize="sm" mb={2}>跟进事项</Text>
                          <VStack spacing={2} align="stretch">
                            {parseJSON(selectedDate.followUpActions, []).map((a, i) => (
                              <Flex key={i} align="center" gap={2}>
                                <Badge colorScheme={a.priority === '高' ? 'red' : 'gray'}>{a.priority}</Badge>
                                <Text color="white" fontSize="sm">{a.action}</Text>
                              </Flex>
                            ))}
                          </VStack>
                        </CardBody>
                      </Card>
                    )}

                    {/* 约会总结 */}
                    {selectedDate.postNotes && (
                      <Card bg="gray.750" mb={4}>
                        <CardBody>
                          <Text color="gray.400" fontSize="sm" mb={2}>约会总结</Text>
                          <Text color="white" fontSize="sm" whiteSpace="pre-wrap">{selectedDate.postNotes}</Text>
                        </CardBody>
                      </Card>
                    )}

                    {/* 访谈详情 */}
                    {selectedDate.postDateInterview && (() => {
                      const iv = parseJSON(selectedDate.postDateInterview, {});
                      if (!iv || Object.keys(iv).length === 0) return null;
                      return (
                        <Card bg="gray.750" mb={4}>
                          <CardBody>
                            <Text color="teal.400" fontWeight="bold" mb={3}>访谈详情</Text>
                            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3} mb={3}>
                              {iv.girlAppearance && <Box><Text color="gray.400" fontSize="xs">穿着打扮</Text><Tag size="sm" colorScheme="purple">{iv.girlAppearance}</Tag></Box>}
                              {iv.girlOnTime && <Box><Text color="gray.400" fontSize="xs">赴约情况</Text><Tag size="sm" colorScheme="blue">{iv.girlOnTime}</Tag></Box>}
                              {iv.girlGreetedFirst && <Box><Text color="gray.400" fontSize="xs">打招呼</Text><Tag size="sm" colorScheme="cyan">{iv.girlGreetedFirst}</Tag></Box>}
                              {iv.silenceDuration && <Box><Text color="gray.400" fontSize="xs">沉默时长</Text><Tag size="sm" colorScheme="gray">{iv.silenceDuration}</Tag></Box>}
                              {iv.goodbyeInitiator && <Box><Text color="gray.400" fontSize="xs">结束方式</Text><Tag size="sm" colorScheme="orange">{iv.goodbyeInitiator}</Tag></Box>}
                              {iv.nextDateMentioned && <Box><Text color="gray.400" fontSize="xs">下次暗示</Text><Tag size="sm" colorScheme="green">{iv.nextDateMentioned}</Tag></Box>}
                              {iv.clientSelfScore && <Box><Text color="gray.400" fontSize="xs">客户自评</Text><Tag size="sm">{iv.clientSelfScore}/5</Tag></Box>}
                              {iv.expectationGap && <Box><Text color="gray.400" fontSize="xs">预期偏差</Text><Tag size="sm" colorScheme="teal">{iv.expectationGap}</Tag></Box>}
                            </SimpleGrid>
                            {iv.physicalProgress && <Box mb={3}><Text color="gray.400" fontSize="xs">肢体进展</Text><Wrap mt={1}>{(iv.physicalProgress || '').split(',').filter(Boolean).map(s => <WrapItem key={s}><Tag size="sm" colorScheme="pink">{s}</Tag></WrapItem>)}</Wrap></Box>}
                            <SimpleGrid columns={2} spacing={3}>
                              {iv.highlight && <Box><Text color="green.400" fontSize="xs">亮点</Text><Text color="gray.300" fontSize="sm">{iv.highlight}</Text></Box>}
                              {iv.lowlight && <Box><Text color="red.400" fontSize="xs">槽点</Text><Text color="gray.300" fontSize="sm">{iv.lowlight}</Text></Box>}
                            </SimpleGrid>
                            {iv.awkwardMoments && <Box mt={3}><Text color="yellow.400" fontSize="xs">尴尬时刻</Text><Text color="gray.300" fontSize="sm">{iv.awkwardMoments}</Text></Box>}
                            {(iv.moodStart || iv.moodMid || iv.moodEnd) && (
                              <Box mt={3}>
                                <Text color="gray.400" fontSize="xs">情绪曲线</Text>
                                <HStack spacing={2} mt={1}>
                                  <Badge colorScheme={iv.moodStart >= 4 ? 'green' : iv.moodStart >= 3 ? 'yellow' : 'red'}>开始 {iv.moodStart}</Badge>
                                  <Text color="gray.500">→</Text>
                                  <Badge colorScheme={iv.moodMid >= 4 ? 'green' : iv.moodMid >= 3 ? 'yellow' : 'red'}>中期 {iv.moodMid}</Badge>
                                  <Text color="gray.500">→</Text>
                                  <Badge colorScheme={iv.moodEnd >= 4 ? 'green' : iv.moodEnd >= 3 ? 'yellow' : 'red'}>结束 {iv.moodEnd}</Badge>
                                </HStack>
                              </Box>
                            )}
                            {(iv.girlEngagementStart || iv.girlEngagementMid || iv.girlEngagementEnd) && (
                              <Box mt={3}>
                                <Text color="gray.400" fontSize="xs">女生投入度曲线</Text>
                                <HStack spacing={2} mt={1}>
                                  <Badge colorScheme={iv.girlEngagementStart >= 4 ? 'green' : iv.girlEngagementStart >= 3 ? 'yellow' : 'red'}>开始 {iv.girlEngagementStart}</Badge>
                                  <Text color="gray.500">→</Text>
                                  <Badge colorScheme={iv.girlEngagementMid >= 4 ? 'green' : iv.girlEngagementMid >= 3 ? 'yellow' : 'red'}>中期 {iv.girlEngagementMid}</Badge>
                                  <Text color="gray.500">→</Text>
                                  <Badge colorScheme={iv.girlEngagementEnd >= 4 ? 'green' : iv.girlEngagementEnd >= 3 ? 'yellow' : 'red'}>结束 {iv.girlEngagementEnd}</Badge>
                                </HStack>
                              </Box>
                            )}
                            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3} mt={3}>
                              {iv.comfortBehaviors && <Box><Text color="gray.400" fontSize="xs">舒适行为</Text><Text color="green.300" fontSize="xs">{iv.comfortBehaviors}</Text></Box>}
                              {iv.topicDepth && <Box><Text color="gray.400" fontSize="xs">话题深度</Text><Tag size="sm" colorScheme="purple">{iv.topicDepth}</Tag></Box>}
                              {iv.clientAnchor && <Box><Text color="gray.400" fontSize="xs">关键观察</Text><Text color="cyan.300" fontSize="xs">{iv.clientAnchor}</Text></Box>}
                            </SimpleGrid>
                          </CardBody>
                        </Card>
                      );
                    })()}
                  </Box>
                )}

                {/* 个性化访谈区域（约会完成后） */}
                {selectedDate.status === 'completed' && (
                  <Box>
                    <Divider mb={4} borderColor="gray.600" />
                    <Flex justify="space-between" align="center" mb={4}>
                      <HStack spacing={2}>
                        <Icon as={QuestionIcon} color="cyan.400" />
                        <Heading size="sm" color="cyan.400">个性化访谈与复盘</Heading>
                        {(() => {
                          const ivStatus = getInterviewStatus(selectedDate);
                          if (ivStatus === 'answered') return <Badge colorScheme="green">已回答</Badge>;
                          if (ivStatus === 'pending') return <Badge colorScheme="purple">待填写</Badge>;
                          if (ivStatus === 'draft') return <Badge colorScheme="orange">草稿</Badge>;
                          return null;
                        })()}
                      </HStack>
                      <HStack spacing={2}>
                        <Button size="xs" colorScheme="cyan" variant="outline"
                          leftIcon={<Icon as={SparklesIcon} />}
                          onClick={handleGenerateInterview}
                          isLoading={generatingInterview}>
                          生成访谈问题
                        </Button>
                        {(() => {
                          const status = getInterviewStatus(selectedDate);
                          if (status === 'draft') {
                            return <Button size="xs" colorScheme="purple" variant="outline" onClick={handlePushInterview} isLoading={pushingInterview}>推送客户</Button>;
                          }
                          if (status === 'pending') {
                            return <Badge colorScheme="purple">已推送，等待客户填写</Badge>;
                          }
                          if (status === 'answered') {
                            return <Button size="xs" colorScheme="green"
                              leftIcon={<Icon as={SparklesIcon} />}
                              onClick={handleGenerateReport}
                              isLoading={generatingReport}>
                              生成复盘报告
                            </Button>;
                          }
                          return null;
                        })()}
                      </HStack>
                    </Flex>

                    {/* 访谈问题预览 */}
                    {(() => {
                      const iv = parseJSON(selectedDate.postDateInterview, {});
                      const questions = iv.generatedQuestions || [];
                      const status = getInterviewStatus(selectedDate);

                      if (questions.length === 0) {
                        return (
                          <Card bg="gray.750" mb={4}>
                            <CardBody>
                              <Flex direction="column" align="center" py={4} gap={2}>
                                <Icon as={QuestionIcon} color="gray.500" boxSize={8} />
                                <Text color="gray.400" fontSize="sm">点击「生成访谈问题」为这次约会创建个性化问卷</Text>
                              </Flex>
                            </CardBody>
                          </Card>
                        );
                      }

                      return (
                        <VStack spacing={3} align="stretch" mb={4}>
                          {interviewOverview && (
                            <Alert status="cyan" borderRadius="md">
                              <AlertIcon />
                              <AlertDescription fontSize="sm">{interviewOverview}</AlertDescription>
                            </Alert>
                          )}
                          {questions.map((q, i) => (
                            <Card key={q.id || i} bg="gray.750">
                              <CardBody p={3}>
                                <Flex align="flex-start" gap={2}>
                                  <Badge colorScheme="cyan" minW="24px" textAlign="center">{i + 1}</Badge>
                                  <Box flex={1}>
                                    <Text color="white" fontSize="sm" mb={1}>{q.question}</Text>
                                    {q.purpose && <Text color="gray.500" fontSize="xs">目的：{q.purpose}</Text>}
                                    {q.options?.length > 0 && (
                                      <Wrap mt={2} spacing={1}>
                                        {q.options.map((opt, oi) => <WrapItem key={oi}><Tag size="sm" colorScheme="gray">{opt}</Tag></WrapItem>)}
                                      </Wrap>
                                    )}
                                    {status === 'answered' && iv.clientAnswers && (
                                      <Box mt={2} p={2} bg="green.900" borderRadius="md">
                                        <Text color="green.300" fontSize="xs">
                                          客户回答：{iv.clientAnswers.find(a => a.id === (q.id || `q${i+1}`))?.answer || '未回答'}
                                        </Text>
                                      </Box>
                                    )}
                                  </Box>
                                </Flex>
                              </CardBody>
                            </Card>
                          ))}
                        </VStack>
                      );
                    })()}

                    {/* 复盘报告展示 */}
                    {(reportResult || (() => {
                      const iv = parseJSON(selectedDate.postDateInterview, {});
                      return iv.reviewReport;
                    })()) && (() => {
                      const iv = parseJSON(selectedDate.postDateInterview, {});
                      const report = reportResult || iv.reviewReport;
                      if (!report) return null;
                      return (
                        <Card bg="green.900" border="1px solid" borderColor="green.600" mb={4}>
                          <CardBody>
                            <Text color="green.400" fontWeight="bold" mb={3}>复盘报告</Text>
                            <Alert status="info" mb={4} borderRadius="md">
                              <AlertIcon />
                              <AlertDescription>{report.summary}</AlertDescription>
                            </Alert>

                            {report.compatibilityScore && (
                              <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4} mb={4}>
                                <Box bg="green.800" p={3} borderRadius="md" textAlign="center">
                                  <Text color="gray.400" fontSize="xs">匹配度</Text>
                                  <Text color="teal.300" fontSize="2xl" fontWeight="bold">{report.compatibilityScore}</Text>
                                </Box>
                                {report.relationshipProgress && (
                                  <Box bg="green.800" p={3} borderRadius="md" colSpan={3}>
                                    <Text color="gray.400" fontSize="xs">关系进度</Text>
                                    <Text color="white" fontSize="sm">{report.relationshipProgress}</Text>
                                  </Box>
                                )}
                              </SimpleGrid>
                            )}

                            {report.tensionAnalysis && (
                              <Box mb={3}>
                                <Text color="orange.400" fontSize="sm" mb={1}>热度分析</Text>
                                <Text color="gray.300" fontSize="sm">{report.tensionAnalysis}</Text>
                              </Box>
                            )}

                            {report.clientInsights && (
                              <Box mb={3}>
                                <Text color="cyan.400" fontSize="sm" mb={1}>客户洞察</Text>
                                <Text color="gray.300" fontSize="sm">{report.clientInsights}</Text>
                              </Box>
                            )}

                            {report.girlInsights && (
                              <Box mb={3}>
                                <Text color="pink.400" fontSize="sm" mb={1}>女生观察</Text>
                                <Text color="gray.300" fontSize="sm">{report.girlInsights}</Text>
                              </Box>
                            )}

                            {report.positiveSignalsDetailed?.length > 0 && (
                              <Box mb={3}>
                                <Text color="green.400" fontSize="sm" mb={2}>正面信号</Text>
                                <VStack spacing={1} align="stretch">
                                  {report.positiveSignalsDetailed.map((s, i) => (
                                    <Flex key={i} p={2} bg="green.800" borderRadius="md" gap={2}>
                                      <Badge colorScheme="green" alignSelf="center">{s.significance || ''}</Badge>
                                      <Box>
                                        <Text color="green.200" fontSize="sm">{s.signal}</Text>
                                        <Text color="gray.400" fontSize="xs">{s.analysis}</Text>
                                      </Box>
                                    </Flex>
                                  ))}
                                </VStack>
                              </Box>
                            )}

                            {report.negativeSignalsDetailed?.length > 0 && (
                              <Box mb={3}>
                                <Text color="red.400" fontSize="sm" mb={2}>需要注意的信号</Text>
                                <VStack spacing={1} align="stretch">
                                  {report.negativeSignalsDetailed.map((s, i) => (
                                    <Flex key={i} p={2} bg="red.900" borderRadius="md" gap={2}>
                                      <Badge colorScheme="red" alignSelf="center">风险</Badge>
                                      <Box>
                                        <Text color="red.200" fontSize="sm">{s.signal}</Text>
                                        <Text color="gray.400" fontSize="xs">{s.mitigation}</Text>
                                      </Box>
                                    </Flex>
                                  ))}
                                </VStack>
                              </Box>
                            )}

                            {report.nextActions?.length > 0 && (
                              <Box mb={3}>
                                <Text color="blue.400" fontSize="sm" mb={2}>下一步行动</Text>
                                <VStack spacing={2} align="stretch">
                                  {report.nextActions.map((a, i) => (
                                    <Flex key={i} p={3} bg="blue.900" borderRadius="md" gap={3} align="center">
                                      <Badge colorScheme={a.priority === '高' ? 'red' : a.priority === '中' ? 'orange' : 'gray'}>{a.priority}</Badge>
                                      <Box flex={1}>
                                        <Text color="white" fontSize="sm" fontWeight="bold">{a.action}</Text>
                                        <HStack spacing={2} mt={1}>
                                          {a.timing && <Tag size="sm" colorScheme="teal">{a.timing}</Tag>}
                                          {a.channel && <Tag size="sm" colorScheme="purple">{a.channel}</Tag>}
                                        </HStack>
                                      </Box>
                                      {a.reason && <Text color="gray.400" fontSize="xs" maxW="200px">{a.reason}</Text>}
                                    </Flex>
                                  ))}
                                </VStack>
                              </Box>
                            )}

                            {report.nextDatePlan && (
                              <Card bg="gray.750">
                                <CardBody>
                                  <Text color="teal.400" fontSize="sm" mb={2}>下次约会建议</Text>
                                  <SimpleGrid columns={2} spacing={3}>
                                    {report.nextDatePlan.suggestedTiming && <Box><Text color="gray.400" fontSize="xs">建议时间</Text><Text color="white" fontSize="sm">{report.nextDatePlan.suggestedTiming}</Text></Box>}
                                    {report.nextDatePlan.suggestedActivity && <Box><Text color="gray.400" fontSize="xs">建议活动</Text><Text color="white" fontSize="sm">{report.nextDatePlan.suggestedActivity}</Text></Box>}
                                    {report.nextDatePlan.keyFocus && <Box><Text color="gray.400" fontSize="xs">核心目标</Text><Text color="white" fontSize="sm">{report.nextDatePlan.keyFocus}</Text></Box>}
                                    {report.nextDatePlan.budgetEstimate && <Box><Text color="gray.400" fontSize="xs">预算</Text><Text color="white" fontSize="sm">{report.nextDatePlan.budgetEstimate}</Text></Box>}
                                  </SimpleGrid>
                                </CardBody>
                              </Card>
                            )}

                            {report.warningSigns?.[0] !== '无' && report.warningSigns?.length > 0 && (
                              <Alert status="warning" mt={3} borderRadius="md">
                                <AlertIcon />
                                <AlertDescription fontSize="sm">
                                  警示信号：{report.warningSigns.join('、')}
                                </AlertDescription>
                              </Alert>
                            )}
                          </CardBody>
                        </Card>
                      );
                    })()}

                    {/* 档案更新提示 */}
                    {(() => {
                      const iv = parseJSON(selectedDate.postDateInterview, {});
                      const report = reportResult || iv.reviewReport;
                      if (!report) return null;
                      const updates = [];
                      if (report.girlUpdates?.tensionScore || report.girlUpdates?.intimacyLevel) updates.push('女生档案已更新（热度/亲密度）');
                      if (report.clientUpdates?.learningPoints) updates.push('客户档案已更新（学习记录/优势短板）');
                      if (updates.length > 0) {
                        return (
                          <Alert status="info" mb={4} borderRadius="md">
                            <AlertIcon />
                            <AlertDescription fontSize="sm">{updates.join(' · ')}</AlertDescription>
                          </Alert>
                        );
                      }
                      return null;
                    })()}
                  </Box>
                )}

                {/* 操作按钮 */}
                <HStack mt={4} spacing={4}>
                  {(selectedDate.status === 'planned' || selectedDate.status === 'confirmed') && (
                    <Button colorScheme="green" onClick={openEval}>填写约会评价</Button>
                  )}
                  {selectedDate.status === 'pending_plan' && (
                    <Button colorScheme="teal" leftIcon={<Icon as={SparklesIcon} />} onClick={handleGeneratePlan} isLoading={generating}>
                      AI 生成方案
                    </Button>
                  )}
                  {selectedDate.status === 'pending_client_confirm' && (
                    <Badge colorScheme="purple" p={2}>等待客户确认中...</Badge>
                  )}
                  {selectedDate.clientConfirmed && selectedDate.status === 'confirmed' && (
                    <Badge colorScheme="green" p={2}>客户已确认方案 ✓</Badge>
                  )}
                  {selectedDate.status !== 'completed' && selectedDate.status !== 'cancelled' && (
                    <Button colorScheme="gray" variant="outline" onClick={() => handleUpdate({ status: 'cancelled' })}>取消约会</Button>
                  )}
                </HStack>
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 约会后评价 */}
      <Modal isOpen={isEvaluateOpen} onClose={closeEvaluate} size="xl">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="90vh" overflow="auto">
          <ModalHeader color="white">约会后评价 — {selectedDate?.girl?.name}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">约会时长</FormLabel>
                  <Select value={evalForm.duration} onChange={e => setEvalForm({...evalForm, duration: e.target.value})} bg="gray.700" color="white">
                    <option value="">选择时长</option>
                    {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">总花费</FormLabel>
                  <NumberInput value={evalForm.totalExpense} onChange={(_, v) => setEvalForm({...evalForm, totalExpense: v})} bg="gray.700" min={0}>
                    <NumberInputField />
                  </NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">约会后女生阶段</FormLabel>
                  <Select value={evalForm.girlStageAfter} onChange={e => setEvalForm({...evalForm, girlStageAfter: e.target.value})} bg="gray.700" color="white">
                    <option value="">选择阶段</option>
                    {GIRL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </FormControl>
              </SimpleGrid>

              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">热度变化</FormLabel>
                <Select value={evalForm.tensionChange} onChange={e => setEvalForm({...evalForm, tensionChange: e.target.value})} bg="gray.700" color="white">
                  <option value="">选择变化</option>
                  <option value="显著上升">显著上升 🔥</option>
                  <option value="小幅上升">小幅上升 ↗</option>
                  <option value="持平">持平 →</option>
                  <option value="小幅下降">小幅下降 ↘</option>
                  <option value="明显下降">明显下降 ↓</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">评价（{evalForm.rating}星 / {RATING_LABELS[evalForm.rating]}）</FormLabel>
                <HStack spacing={2}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Button key={i} variant={i < evalForm.rating ? 'solid' : 'outline'} colorScheme={i < evalForm.rating ? 'orange' : 'gray'}
                      onClick={() => setEvalForm({...evalForm, rating: i + 1})} size="sm">
                      {i + 1}星
                    </Button>
                  ))}
                </HStack>
              </FormControl>

              {/* 见面时刻 */}
              <Divider borderColor="gray.600" />
              <Text color="gray.300" fontSize="sm" fontWeight="bold">见面时刻</Text>
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">女生穿着打扮</FormLabel>
                  <Select value={evalForm.girlAppearance || ''} onChange={e => setEvalForm({...evalForm, girlAppearance: e.target.value})} bg="gray.700" color="white" size="sm">
                    <option value="">选择</option>
                    <option value="精心打扮">精心打扮</option>
                    <option value="正常穿搭">正常穿搭</option>
                    <option value="随意/邋遢">随意/邋遢</option>
                    <option value="比平时漂亮">比平时漂亮</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">女生是否准时</FormLabel>
                  <Select value={evalForm.girlOnTime || ''} onChange={e => setEvalForm({...evalForm, girlOnTime: e.target.value})} bg="gray.700" color="white" size="sm">
                    <option value="">选择</option>
                    <option value="提前到达">提前到达</option>
                    <option value="准时到达">准时到达</option>
                    <option value="迟到5分钟内">迟到5分钟内</option>
                    <option value="迟到10分钟以上">迟到10分钟以上</option>
                    <option value="客户迟到">客户迟到</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">谁先打招呼</FormLabel>
                  <Select value={evalForm.girlGreetedFirst || ''} onChange={e => setEvalForm({...evalForm, girlGreetedFirst: e.target.value})} bg="gray.700" color="white" size="sm">
                    <option value="">选择</option>
                    <option value="女生主动">女生主动</option>
                    <option value="客户主动">客户主动</option>
                    <option value="互相打招呼">互相打招呼</option>
                    <option value="有点尴尬才打招呼">有点尴尬才打招呼</option>
                  </Select>
                </FormControl>
              </SimpleGrid>

              {/* 对话质量 */}
              <SimpleGrid columns={2} spacing={3}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">沉默时长</FormLabel>
                  <Select value={evalForm.silenceDuration || ''} onChange={e => setEvalForm({...evalForm, silenceDuration: e.target.value})} bg="gray.700" color="white" size="sm">
                    <option value="">选择</option>
                    <option value="几乎没有沉默">几乎没有沉默</option>
                    <option value="偶尔小沉默（正常）">偶尔小沉默（正常）</option>
                    <option value="有几次尴尬沉默">有几次尴尬沉默</option>
                    <option value="沉默较多较尴尬">沉默较多较尴尬</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">尴尬时刻</FormLabel>
                  <Input value={evalForm.awkwardMoments || ''} onChange={e => setEvalForm({...evalForm, awkwardMoments: e.target.value})} placeholder="发生了什么" bg="gray.700" size="sm" />
                </FormControl>
              </SimpleGrid>

              {/* 肢体进展 */}
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">肢体进展（多选）</FormLabel>
                <Wrap>
                  {['无肢体接触', '自然牵手', '挽手臂', '搂腰', '接吻', '搂抱/拥抱', '主动靠近坐', '回避接触'].map(s => (
                    <WrapItem key={s}>
                      <Tag
                        colorScheme={evalForm.physicalProgress?.includes(s) ? 'pink' : 'gray'}
                        cursor="pointer"
                        onClick={() => {
                          const cur = evalForm.physicalProgress || '';
                          const list = cur ? cur.split(',').filter(Boolean) : [];
                          const next = list.includes(s) ? list.filter(x => x !== s) : [...list, s];
                          setEvalForm({...evalForm, physicalProgress: next.join(',')});
                        }}
                        size="sm"
                      >
                        {evalForm.physicalProgress?.includes(s) ? '✓ ' : ''}{s}
                      </Tag>
                    </WrapItem>
                  ))}
                </Wrap>
              </FormControl>

              {/* 离别时刻 */}
              <SimpleGrid columns={2} spacing={3}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">谁先提出结束</FormLabel>
                  <Select value={evalForm.goodbyeInitiator || ''} onChange={e => setEvalForm({...evalForm, goodbyeInitiator: e.target.value})} bg="gray.700" color="white" size="sm">
                    <option value="">选择</option>
                    <option value="女生主动提">女生主动提</option>
                    <option value="客户主动提">客户主动提</option>
                    <option value="双方默契结束">双方默契结束</option>
                    <option value="因客观原因结束">因客观原因结束</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">有无暗示下次见面</FormLabel>
                  <Select value={evalForm.nextDateMentioned || ''} onChange={e => setEvalForm({...evalForm, nextDateMentioned: e.target.value})} bg="gray.700" color="white" size="sm">
                    <option value="">选择</option>
                    <option value="女生主动提下次">女生主动提下次</option>
                    <option value="客户提出女生答应">客户提出女生答应</option>
                    <option value="客户提出待定">客户提出待定</option>
                    <option value="双方都没提">双方都没提</option>
                    <option value="模糊约定">模糊约定</option>
                  </Select>
                </FormControl>
              </SimpleGrid>

              {/* 情绪曲线 */}
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">
                  情绪曲线：开始 {evalForm.moodStart} → 中期 {evalForm.moodMid} → 结束 {evalForm.moodEnd}
                </FormLabel>
                <HStack spacing={4} justify="center">
                  <VStack spacing={1}>
                    <Text color="gray.400" fontSize="xs">开始</Text>
                    <HStack spacing={1}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Box key={i} w="20px" h="20px" borderRadius="sm" bg={i < evalForm.moodStart ? (evalForm.moodStart >= 4 ? 'green.400' : evalForm.moodStart >= 3 ? 'yellow.400' : 'red.400') : 'gray.600'}
                          cursor="pointer" onClick={() => setEvalForm({...evalForm, moodStart: i + 1})} />
                      ))}
                    </HStack>
                  </VStack>
                  <Text color="gray.500">→</Text>
                  <VStack spacing={1}>
                    <Text color="gray.400" fontSize="xs">中期</Text>
                    <HStack spacing={1}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Box key={i} w="20px" h="20px" borderRadius="sm" bg={i < evalForm.moodMid ? (evalForm.moodMid >= 4 ? 'green.400' : evalForm.moodMid >= 3 ? 'yellow.400' : 'red.400') : 'gray.600'}
                          cursor="pointer" onClick={() => setEvalForm({...evalForm, moodMid: i + 1})} />
                      ))}
                    </HStack>
                  </VStack>
                  <Text color="gray.500">→</Text>
                  <VStack spacing={1}>
                    <Text color="gray.400" fontSize="xs">结束</Text>
                    <HStack spacing={1}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Box key={i} w="20px" h="20px" borderRadius="sm" bg={i < evalForm.moodEnd ? (evalForm.moodEnd >= 4 ? 'green.400' : evalForm.moodEnd >= 3 ? 'yellow.400' : 'red.400') : 'gray.600'}
                          cursor="pointer" onClick={() => setEvalForm({...evalForm, moodEnd: i + 1})} />
                      ))}
                    </HStack>
                  </VStack>
                </HStack>
              </FormControl>

              {/* 女生投入度曲线（评审团新增） */}
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">
                  女生投入度：开始 {evalForm.girlEngagementStart} → 中期 {evalForm.girlEngagementMid} → 结束 {evalForm.girlEngagementEnd}
                </FormLabel>
                <Text color="gray.500" fontSize="xs" mb={2}>女生在约会不同阶段的投入程度，比情绪评分更有预测力</Text>
                <HStack spacing={4} justify="center">
                  <VStack spacing={1}>
                    <Text color="gray.400" fontSize="xs">开始</Text>
                    <HStack spacing={1}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Box key={i} w="20px" h="20px" borderRadius="sm" bg={i < evalForm.girlEngagementStart ? (evalForm.girlEngagementStart >= 4 ? 'green.400' : evalForm.girlEngagementStart >= 3 ? 'yellow.400' : 'red.400') : 'gray.600'}
                          cursor="pointer" onClick={() => setEvalForm({...evalForm, girlEngagementStart: i + 1})} />
                      ))}
                    </HStack>
                  </VStack>
                  <Text color="gray.500">→</Text>
                  <VStack spacing={1}>
                    <Text color="gray.400" fontSize="xs">中期</Text>
                    <HStack spacing={1}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Box key={i} w="20px" h="20px" borderRadius="sm" bg={i < evalForm.girlEngagementMid ? (evalForm.girlEngagementMid >= 4 ? 'green.400' : evalForm.girlEngagementMid >= 3 ? 'yellow.400' : 'red.400') : 'gray.600'}
                          cursor="pointer" onClick={() => setEvalForm({...evalForm, girlEngagementMid: i + 1})} />
                      ))}
                    </HStack>
                  </VStack>
                  <Text color="gray.500">→</Text>
                  <VStack spacing={1}>
                    <Text color="gray.400" fontSize="xs">结束</Text>
                    <HStack spacing={1}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Box key={i} w="20px" h="20px" borderRadius="sm" bg={i < evalForm.girlEngagementEnd ? (evalForm.girlEngagementEnd >= 4 ? 'green.400' : evalForm.girlEngagementEnd >= 3 ? 'yellow.400' : 'red.400') : 'gray.600'}
                          cursor="pointer" onClick={() => setEvalForm({...evalForm, girlEngagementEnd: i + 1})} />
                      ))}
                    </HStack>
                  </VStack>
                </HStack>
              </FormControl>

              {/* 舒适行为 & 话题深度 & 客户锚点（评审团新增） */}
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">女生舒适行为</FormLabel>
                  <Input value={evalForm.comfortBehaviors || ''} onChange={e => setEvalForm({...evalForm, comfortBehaviors: e.target.value})} placeholder="如：主动倒水/递纸巾..." bg="gray.700" size="sm" />
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">话题深入程度</FormLabel>
                  <Select value={evalForm.topicDepth || ''} onChange={e => setEvalForm({...evalForm, topicDepth: e.target.value})} bg="gray.700" color="white" size="sm">
                    <option value="">选择</option>
                    <option value="表面寒暄">表面寒暄</option>
                    <option value="有来有往">有来有往</option>
                    <option value="深度交流">深度交流</option>
                    <option value="交心对话">交心对话</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">客户关键观察</FormLabel>
                  <Input value={evalForm.clientAnchor || ''} onChange={e => setEvalForm({...evalForm, clientAnchor: e.target.value})} placeholder="1-3个最关键观察点" bg="gray.700" size="sm" />
                </FormControl>
              </SimpleGrid>

              {/* 亮点/槽点 */}
              <SimpleGrid columns={2} spacing={3}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">约会亮点</FormLabel>
                  <Input value={evalForm.highlight || ''} onChange={e => setEvalForm({...evalForm, highlight: e.target.value})} placeholder="最成功的环节..." bg="gray.700" size="sm" />
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">约会槽点</FormLabel>
                  <Input value={evalForm.lowlight || ''} onChange={e => setEvalForm({...evalForm, lowlight: e.target.value})} placeholder="最需要改进的..." bg="gray.700" size="sm" />
                </FormControl>
              </SimpleGrid>

              {/* 客户自评 */}
              <SimpleGrid columns={2} spacing={3}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">客户自我评分（1-5）</FormLabel>
                  <Select value={evalForm.clientSelfScore || ''} onChange={e => setEvalForm({...evalForm, clientSelfScore: e.target.value})} bg="gray.700" color="white" size="sm">
                    <option value="">选择</option>
                    <option value="1">1 - 很差</option>
                    <option value="2">2 - 较差</option>
                    <option value="3">3 - 一般</option>
                    <option value="4">4 - 良好</option>
                    <option value="5">5 - 很好</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="xs">预期偏差</FormLabel>
                  <Select value={evalForm.expectationGap || ''} onChange={e => setEvalForm({...evalForm, expectationGap: e.target.value})} bg="gray.700" color="white" size="sm">
                    <option value="">选择</option>
                    <option value="超出预期">超出预期</option>
                    <option value="符合预期">符合预期</option>
                    <option value="略低于预期">略低于预期</option>
                    <option value="远低于预期">远低于预期</option>
                    <option value="超出认知">超出认知（意外好/坏）</option>
                  </Select>
                </FormControl>
              </SimpleGrid>

              {/* 消费记录 */}
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">消费明细</FormLabel>
                <VStack spacing={2} align="stretch">
                  {expenses.map((e, i) => (
                    <HStack key={i}>
                      <Input placeholder="项目（如：晚餐）" value={e.item} onChange={ev => {
                        const list = [...expenses]; list[i].item = ev.target.value; setExpenses(list);
                      }} bg="gray.700" size="sm" />
                      <NumberInput w="120px" value={e.amount} onChange={(_, v) => {
                        const list = [...expenses]; list[i].amount = v; setExpenses(list);
                      }} bg="gray.700" min={0}>
                        <NumberInputField />
                      </NumberInput>
                      <Button size="sm" colorScheme="red" variant="ghost" onClick={() => setExpenses(expenses.filter((_, j) => j !== i))}>删</Button>
                    </HStack>
                  ))}
                  <Button size="sm" variant="outline" colorScheme="gray" onClick={() => setExpenses([...expenses, { item: '', amount: '' }])}>+ 添加</Button>
                </VStack>
              </FormControl>

              {/* 正面信号 */}
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">正面信号（多选）</FormLabel>
                <Wrap>
                  {POSITIVE_SIGNALS.map(s => (
                    <WrapItem key={s}>
                      <Tag
                        colorScheme={posSignalList.includes(s) ? 'green' : 'gray'}
                        cursor="pointer"
                        onClick={() => setPosSignalList(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                      >
                        {posSignalList.includes(s) ? '✓ ' : ''}{s}
                      </Tag>
                    </WrapItem>
                  ))}
                </Wrap>
              </FormControl>

              {/* 负面信号 */}
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">需要注意的信号（多选）</FormLabel>
                <Wrap>
                  {NEGATIVE_SIGNALS.map(s => (
                    <WrapItem key={s}>
                      <Tag
                        colorScheme={negSignalList.includes(s) ? 'red' : 'gray'}
                        cursor="pointer"
                        onClick={() => setNegSignalList(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                      >
                        {negSignalList.includes(s) ? '! ' : ''}{s}
                      </Tag>
                    </WrapItem>
                  ))}
                </Wrap>
              </FormControl>

              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">下次约会目的</FormLabel>
                <Input value={evalForm.nextPurpose} onChange={e => setEvalForm({...evalForm, nextPurpose: e.target.value})} placeholder="继续推进关系/确认关系..." bg="gray.700" />
              </FormControl>

              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">约会总结（必填）</FormLabel>
                <Textarea value={evalForm.postNotes} onChange={e => setEvalForm({...evalForm, postNotes: e.target.value})}
                  placeholder="约会中发生了什么？女生的反应如何？有哪些需要记录的细节..." bg="gray.700" rows={4} />
              </FormControl>

              <Button colorScheme="green" onClick={handleEvaluate} isLoading={evaluating} size="lg"
                leftIcon={<Icon as={SparklesIcon} />}>
                保存评价（AI将生成复盘分析）
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

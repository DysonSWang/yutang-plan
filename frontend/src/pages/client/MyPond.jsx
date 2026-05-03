import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Heading, Text, SimpleGrid, Card, CardBody, Badge, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalCloseButton, useDisclosure, VStack, HStack, Icon, Flex,
  Input, Button, useToast, NumberInput, NumberInputField, NumberInputStepper,
  NumberIncrementStepper, NumberDecrementStepper, Select, FormControl, FormLabel,
  Skeleton, Tabs, TabList, TabPanels, Tab, TabPanel, Avatar, Divider, Alert, AlertIcon,
  AlertDescription, Spinner, Progress,
} from '@chakra-ui/react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { zhCN } from 'date-fns/locale/zh-CN';
import 'react-datepicker/dist/react-datepicker.css';
import { CalendarIcon, SparklesIcon, QuestionIcon, MapPinIcon, ClockIcon, HeartIcon, FishIcon } from '../../components/Icons';
import ClientCalendar from '../../components/ClientCalendar';
import { dates, clients, girls as girlsApi, getMediaUrl } from '../../utils/api';
import { captureError } from '../../utils/frontendErrorCapture';
import useKeepAliveData from '../../hooks/useKeepAliveData';
import EmptyState from '../../components/EmptyState';
import AnimatedNumber from '../../components/AnimatedNumber';

registerLocale('zh-CN', zhCN);

const STAGE_COLORS = {
  '陌生': 'gray', '搭讪': 'blue', '聊天': 'cyan', '暧昧': 'yellow', '约会': 'orange', '长期': 'green',
};

function parseJSON(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function formatLocalDateTime(date) {
  if (!date) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function cleanStreamText(text) {
  if (!text) return '';
  return text
    .replace(/^[\s]*[\[\{][\s]*/gm, '')
    .replace(/[\s]*[\]\}][\s]*[,]?[\s]*$/gm, '')
    .replace(/"[^"]*"\s*:\s*/g, '')
    .replace(/^\s*"|"\s*[,]?\s*$/gm, '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function filterReasoning(text) {
  if (!text) return '';
  return text
    .split(/[。\n]/)
    .filter(s => {
      const t = s.trim();
      if (!t) return false;
      if (/json/i.test(t)) return false;
      if (/overview.*venue.*schedule|包含.*字段|字段.*包含/.test(t)) return false;
      if (/我们被要求|需要生成|注意.*格式|按照.*格式|确保.*输出|返回.*格式|根据.*要求.*生成/.test(t)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** ===================== 女生 Tab ===================== */
function GirlsTab({ girlsList, isInitialLoad, onAddGirl, onGirlClick }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [addForm, setAddForm] = useState({ name: '', age: '', occupation: '' });
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const handleAdd = async () => {
    if (!addForm.name.trim()) { toast({ title: '请输入昵称', status: 'warning' }); return; }
    setAdding(true);
    try {
      const res = await girlsApi.clientAdd({ name: addForm.name.trim(), age: addForm.age || undefined, occupation: addForm.occupation || undefined });
      if (res.success) {
        toast({ title: res.quotaLeft !== undefined ? `添加成功，剩余 ${res.quotaLeft} 个名额` : '添加成功', status: 'success' });
        setAddForm({ name: '', age: '', occupation: '' });
        onClose();
        onAddGirl();
      } else if (res.code === 'QUOTA_EXCEEDED') {
        toast({ title: `额度已用完，请联系操盘手升级`, status: 'warning', duration: 4000 });
      } else {
        toast({ title: res.error || '添加失败', status: 'error' });
      }
    } catch (e) {
      toast({ title: '添加失败', status: 'error' });
    } finally { setAdding(false); }
  };

  return (
    <Box>
      <Flex justify="space-between" align="start" mb={6}>
        <Box>
          <Heading color="white" fontFamily="heading" fontSize="2xl">缘分</Heading>
          <Text color="rgba(245,240,232,0.25)" fontSize="sm" mt={1}>
            已添加 <Text as="span" color="gold.400"><AnimatedNumber value={(girlsList ?? []).length} /></Text> 位
          </Text>
        </Box>
        <Button colorScheme="gold" size="sm" onClick={onOpen} leftIcon={<Icon as={HeartIcon} w={3} h={3} />}>添加女生</Button>
      </Flex>

      {isInitialLoad ? (
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
          {[1,2,3].map(i => <Skeleton key={i} height="120px" borderRadius="lg" />)}
        </SimpleGrid>
      ) : (girlsList ?? []).length === 0 ? (
        <EmptyState type="pond" onAction={onOpen} actionLabel="添加第一个" />
      ) : (
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
          {girlsList.map(girl => (
            <Card key={girl.id} bg="warm.800" cursor="pointer" onClick={() => onGirlClick(girl)}
              _hover={{ bg: 'warm.700', transform: 'translateY(-2px)' }} transition="all 0.2s">
              <CardBody>
                <HStack justify="space-between" mb={2}>
                  <Text color="white" fontWeight="bold" fontSize="lg">{girl.name}</Text>
                  <Badge colorScheme={STAGE_COLORS[girl.stage] || 'gray'} fontSize="xs">{girl.stage || '未知'}</Badge>
                </HStack>
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">
                  {[girl.age ? `${girl.age}岁` : '', girl.occupation || ''].filter(Boolean).join(' · ') || '待完善'}
                </Text>
                <HStack mt={3} spacing={2}>
                  <Icon as={HeartIcon} color="rose.400" w={3} h={3} />
                  <Text color="rgba(245,240,232,0.25)" fontSize="xs">亲密度 <Text as="span" color="gold.400">x{girl.intimacyLevel || 1}</Text></Text>
                </HStack>
              </CardBody>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <Modal isOpen={isOpen} onClose={onClose} size="md">
        <ModalOverlay /><ModalContent bg="warm.800">
          <ModalHeader color="white">添加女生</ModalHeader><ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel color="rgba(245,240,232,0.4)">昵称</FormLabel>
                <Input value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})}
                  placeholder="输入昵称" bg="warm.700" color="white"
                  onKeyPress={e => { if (e.key === 'Enter') handleAdd(); }} />
              </FormControl>
              <HStack spacing={4}>
                <FormControl>
                  <FormLabel color="rgba(245,240,232,0.4)">年龄</FormLabel>
                  <NumberInput value={addForm.age} onChange={(_, v) => setAddForm({...addForm, age: v})} bg="warm.700" min={18} max={60}>
                    <NumberInputField color="white" /><NumberInputStepper>
                      <NumberIncrementStepper color="rgba(245,240,232,0.4)" />
                      <NumberDecrementStepper color="rgba(245,240,232,0.4)" />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel color="rgba(245,240,232,0.4)">职业</FormLabel>
                  <Select value={addForm.occupation} onChange={e => setAddForm({...addForm, occupation: e.target.value})}
                    bg="warm.700" color="white" placeholder="选择">
                    {['学生', '上班族', '自由职业', '企业主', '公务员', '医生', '律师', '教师', '销售', '设计师', '程序员', '其他'].map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                </FormControl>
              </HStack>
              <Button colorScheme="gold" onClick={handleAdd} isLoading={adding} w="100%">添加</Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

/** ===================== 约会 Tab ===================== */
function DatesTab({ datesList, allDates, pendingInterviews, isInitialLoad, onRefresh, onOpenDate, girlList }) {
  const [filterGirlId, setFilterGirlId] = useState('');

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
    return {
      pending: allDates.filter(d => d.status === 'pending_client_confirm').length,
      interviews: pendingInterviews.length,
      completed: allDates.filter(d => d.status === 'completed').length,
      thisMonth: allDates.filter(d => {
        if (!d.dateTime) return false;
        const dt = new Date(d.dateTime);
        return dt.getFullYear() === thisYear && dt.getMonth() === thisMonth;
      }).length,
      thisWeekExpense: allDates.reduce((sum, d) => {
        if (!d.dateTime || d.status === 'cancelled') return sum;
        const dt = new Date(d.dateTime);
        if (dt >= now && dt <= weekEnd) return sum + (d.totalExpense || 0);
        return sum;
      }, 0),
    };
  }, [allDates, pendingInterviews]);

  const upcomingDate = allDates
    .filter(d => d.dateTime && d.status !== 'completed' && d.status !== 'cancelled')
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))[0] || null;

  const filteredDates = useMemo(() => datesList
    .filter(d => !filterGirlId || d.girlId === filterGirlId)
    .sort((a, b) => new Date(a.dateTime || 0) - new Date(b.dateTime || 0)), [datesList, filterGirlId]);

  const formatDateRelative = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (target.getTime() === today.getTime()) return '今天';
    if (target.getTime() === tomorrow.getTime()) return '明天';
    if (target < today) return '已过期';
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (diff <= 7) return `本周${'日一二三四五六'[date.getDay()]}`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  const getAvatar = (girl) => {
    if (!girl) return null;
    if (girl.avatar) return getMediaUrl(girl.avatar);
    if (girl.photos) {
      try {
        const photos = typeof girl.photos === 'string' ? JSON.parse(girl.photos) : girl.photos;
        if (Array.isArray(photos) && photos[0]) return getMediaUrl(photos[0]);
      } catch {}
    }
    const name = girl.name || '';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash = hash & hash;
    }
    return `https://i.pravatar.cc/150?img=${Math.abs(hash) % 70}`;
  };

  return (
    <Box>
      {/* 访谈入口 */}
      {pendingInterviews.length > 0 && (
        <Alert status="cyan" mb={4} borderRadius="md">
          <AlertIcon />
          <AlertDescription fontSize="sm">
            您有 <strong>{pendingInterviews.length}</strong> 份约会反馈等待填写
          </AlertDescription>
        </Alert>
      )}

      {/* 统计栏 */}
      {!isInitialLoad && (allDates.length > 0 || pendingInterviews.length > 0) && (
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={6}>
          <Card bg="warm.800" border="1px solid" borderColor="orange.600">
            <CardBody py={4} px={4}>
              <Flex align="center" gap={3}>
                <Box w="40px" h="40px" borderRadius="10px" bg="rgba(249,115,22,0.2)" display="flex" alignItems="center" justifyContent="center" fontSize="20px">📋</Box>
                <Box>
                  <Text fontSize="2xl" fontWeight="bold" color="orange.400">{stats.interviews}</Text>
                  <Text fontSize="xs" color="rgba(245,240,232,0.4)">待反馈</Text>
                </Box>
              </Flex>
            </CardBody>
          </Card>
          <Card bg="warm.800" border="1px solid" borderColor="green.600">
            <CardBody py={4} px={4}>
              <Flex align="center" gap={3}>
                <Box w="40px" h="40px" borderRadius="10px" bg="rgba(34,197,94,0.2)" display="flex" alignItems="center" justifyContent="center" fontSize="20px">🎉</Box>
                <Box>
                  <Text fontSize="2xl" fontWeight="bold" color="green.400">{stats.completed}</Text>
                  <Text fontSize="xs" color="rgba(245,240,232,0.4)">已完成</Text>
                </Box>
              </Flex>
            </CardBody>
          </Card>
          <Card bg="warm.800" border="1px solid" borderColor="cyan.600">
            <CardBody py={4} px={4}>
              <Flex align="center" gap={3}>
                <Box w="40px" h="40px" borderRadius="10px" bg="rgba(6,182,212,0.2)" display="flex" alignItems="center" justifyContent="center" fontSize="20px">📅</Box>
                <Box>
                  <Text fontSize="2xl" fontWeight="bold" color="cyan.400">{stats.thisMonth}</Text>
                  <Text fontSize="xs" color="rgba(245,240,232,0.4)">本月约会</Text>
                </Box>
              </Flex>
            </CardBody>
          </Card>
          <Card bg="warm.800" border="1px solid" borderColor="pink.600">
            <CardBody py={4} px={4}>
              <Flex align="center" gap={3}>
                <Box w="40px" h="40px" borderRadius="10px" bg="rgba(244,114,182,0.2)" display="flex" alignItems="center" justifyContent="center" fontSize="20px">💳</Box>
                <Box>
                  <Text fontSize="2xl" fontWeight="bold" color="pink.400">¥{stats.thisWeekExpense}</Text>
                  <Text fontSize="xs" color="rgba(245,240,232,0.4)">本周花费</Text>
                </Box>
              </Flex>
            </CardBody>
          </Card>
        </SimpleGrid>
      )}

      {/* 即将到来 */}
      {!isInitialLoad && upcomingDate && (
        <Box mb={6}>
          <Text fontSize="lg" fontWeight="bold" mb={3} color="white">
            <Box as="span" display="inline-block" w="4px" h="20px" bg="gold.500" borderRadius="2px" mr={3} verticalAlign="middle"></Box>
            即将到来
          </Text>
          <Card bg="linear-gradient(135deg, rgba(0,212,170,0.15) 0%, rgba(168,85,247,0.15) 100%)"
            border="1px solid" borderColor="gold.500" cursor="pointer" onClick={() => onOpenDate(upcomingDate)}
            _hover={{ borderColor: 'gold.400', transform: 'translateY(-2px)' }} transition="all 0.2s">
            <CardBody py={5} px={6}>
              <Flex align="center" gap={6} wrap="wrap">
                <Box textAlign="center" minW="70px">
                  <Text fontSize="36px" fontWeight="bold" color="gold.400" lineHeight="1">
                    {new Date(upcomingDate.dateTime).getDate()}
                  </Text>
                  <Text fontSize="sm" color="rgba(245,240,232,0.4)">{formatDateRelative(upcomingDate.dateTime)}</Text>
                </Box>
                <Box flex={1}>
                  <HStack spacing={2} mb={1}>
                    <Avatar size="sm" name={upcomingDate.girl?.name} src={getAvatar(upcomingDate.girl)} />
                    <Text color="white" fontWeight="bold" fontSize="lg">{upcomingDate.girl?.name}</Text>
                    <Badge colorScheme={upcomingDate.status === 'confirmed' || upcomingDate.status === 'planned' ? 'green' : 'yellow'}>
                      {upcomingDate.status === 'confirmed' ? '已确认' : upcomingDate.status === 'planned' ? '已策划' : '待确认'}
                    </Badge>
                  </HStack>
                  <Text color="gray.300" fontSize="sm">{upcomingDate.title || '约会'}</Text>
                </Box>
                <HStack spacing={2}>
                  <Button colorScheme="gold" size="sm">查看方案</Button>
                </HStack>
              </Flex>
            </CardBody>
          </Card>
        </Box>
      )}

      {/* 约会列表 */}
      {isInitialLoad ? (
        <Flex justify="center" py={12}><Spinner /></Flex>
      ) : filteredDates.length === 0 && pendingInterviews.length === 0 ? (
        <Card bg="warm.800"><CardBody>
          <Flex direction="column" align="center" py={12} gap={3}>
            <Icon as={CalendarIcon} color="rgba(245,240,232,0.2)" boxSize={12} />
            <Text color="rgba(245,240,232,0.4)">暂无约会</Text>
            <Text color="rgba(245,240,232,0.2)" fontSize="sm">点击女生卡片"约她"开始</Text>
          </Flex>
        </CardBody></Card>
      ) : (
        <VStack spacing={4} align="stretch">
          <Flex gap={3} wrap="wrap">
            <Select placeholder={`全部女生 (${girlList.length})`} w="180px" size="sm" bg="warm.800" color="white" borderColor="warm.600" value={filterGirlId} onChange={e => setFilterGirlId(e.target.value)}>
              {girlList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            {filterGirlId && <Button size="sm" variant="ghost" onClick={() => setFilterGirlId('')}>清除过滤</Button>}
          </Flex>
          {filteredDates.map(d => (
            <Card key={d.id} bg="warm.800" border="1px solid" borderColor="purple.500"
              cursor="pointer" onClick={() => onOpenDate(d)}
              _hover={{ borderColor: 'purple.400', transform: 'translateY(-2px)' }} transition="all 0.2s">
              <CardBody py={4} px={5}>
                <Flex gap={4} align="flex-start">
                  <Avatar size="lg" name={d.girl?.name} src={getAvatar(d.girl)} />
                  <Box flex={1}>
                    <Flex justify="space-between" align="flex-start" mb={2}>
                      <Box>
                        <HStack spacing={2} mb={1}>
                          <Heading size="md" color="white">{d.girl?.name}</Heading>
                        </HStack>
                        <Text color="gray.300" fontSize="sm">{d.title || '约会'}</Text>
                      </Box>
                      <Badge colorScheme={d.status === 'completed' ? 'cyan' : d.status === 'confirmed' || d.status === 'planned' ? 'green' : 'yellow'}>
                        {d.status === 'completed' ? '已完成' : d.status === 'confirmed' ? '已确认' : d.status === 'planned' ? '已策划' : '待策划'}
                      </Badge>
                    </Flex>
                    <HStack spacing={4} color="gray.300" fontSize="sm">
                      {d.dateTime && <HStack spacing={1}><ClockIcon /><Text>{new Date(d.dateTime).toLocaleString('zh-CN')}</Text></HStack>}
                      {d.location && <HStack spacing={1}><MapPinIcon /><Text>{d.location}</Text></HStack>}
                    </HStack>
                  </Box>
                </Flex>
              </CardBody>
            </Card>
          ))}
        </VStack>
      )}
    </Box>
  );
}

/** ===================== 日历 Tab ===================== */
function CalendarTab({ clientId, girlList, refreshKey }) {
  if (!clientId) return <Flex justify="center" py={12}><Spinner /></Flex>;
  return <ClientCalendar clientId={clientId} girlList={girlList} refreshKey={refreshKey} />;
}

/** ===================== 主页面 ===================== */
export default function MyPond() {
  const navigate = useNavigate();
  const [clientId, setClientId] = useState(null);
  const [girlList, setGirlList] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState(1);
  const [selectedGirlForDate, setSelectedGirlForDate] = useState(null);
  const [dateForm, setDateForm] = useState({
    title: '', dateTime: '', location: '', notes: '',
    scene: '', budget: '', duration: '半天', transportMode: '地铁/打车',
    relationshipStage: '初次见面', specialRequirements: ''
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showAiFields, setShowAiFields] = useState(false);
  const [filterGirlId, setFilterGirlId] = useState('');
  const toast = useToast();

  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();
  const { isOpen: isInterviewOpen, onOpen: onInterviewOpen, onClose: onInterviewClose } = useDisclosure();

  const { data, isInitialLoad, refresh } = useKeepAliveData(async () => {
    const [pendingRes, allDatesRes, interviewsRes] = await Promise.all([
      dates.getClientPending(),
      dates.list().catch(() => ({ success: false, dates: [] })),
      dates.getClientInterviews().catch(() => ({ success: false }))
    ]);
    return {
      datesList: pendingRes.success ? pendingRes.dates || [] : [],
      allDates: allDatesRes.success ? allDatesRes.dates || [] : [],
      pendingInterviews: interviewsRes?.success ? interviewsRes.interviews || [] : [],
    };
  }, { key: '/dates' });

  const { data: girlsList = [], refresh: refreshGirls } = useKeepAliveData(
    async () => { const res = await girlsApi.list(); return res.success ? res.girls : []; },
    { key: '/my-pond' }
  );

  const datesList = data?.datesList ?? [];
  const allDates = data?.allDates ?? [];
  const pendingInterviews = data?.pendingInterviews ?? [];

  useEffect(() => {
    const saved = localStorage.getItem('dating_transportMode');
    if (saved) setDateForm(prev => ({ ...prev, transportMode: saved }));
  }, []);

  useEffect(() => {
    const loadClientInfo = async () => {
      try {
        const res = await clients.me();
        if (res.client?.id) setClientId(res.client.id);
        if (res.client?.girls) setGirlList(res.client.girls);
        if (res.client?.preferredTransportMode) {
          setDateForm(prev => ({ ...prev, transportMode: res.client.preferredTransportMode }));
        }
      } catch (e) { captureError(e); }
    };
    loadClientInfo();
  }, []);

  const resetDateForm = () => {
    setDateForm({ title: '', dateTime: '', location: '', notes: '', scene: '', budget: '', duration: '半天', transportMode: localStorage.getItem('dating_transportMode') || '地铁/打车', relationshipStage: '初次见面', specialRequirements: '' });
    setShowAiFields(false); setSelectedGirlForDate(null); setAddStep(1);
  };

  const handleSaveDate = async () => {
    if (!selectedGirlForDate) { toast({ title: '请选择约会对象', status: 'warning' }); return; }
    setSaving(true);
    try {
      const res = await dates.create({ girlId: selectedGirlForDate.id, dateTime: dateForm.dateTime || undefined, location: dateForm.location, title: dateForm.title || '新约会', notes: dateForm.notes });
      if (res.success) { toast({ title: '约会添加成功', status: 'success', duration: 2000 }); setShowAddModal(false); resetDateForm(); refresh(); }
      else { toast({ title: res.error || '添加失败', status: 'error' }); }
    } catch (e) { toast({ title: '添加失败', status: 'error' }); }
    setSaving(false);
  };

  const openDateDetail = (d) => {
    setSelectedDate(d);
    setDateModalOpen(true);
  };

  const openInterview = (iv) => {
    setSelectedDate(iv);
    onInterviewOpen();
  };

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading color="white">缘分与约会</Heading>
        <HStack spacing={2}>
          <Button variant="outline" colorScheme="gray" size="sm" onClick={refresh} isLoading={isInitialLoad}>刷新</Button>
          <Button colorScheme="gold" leftIcon={<SparklesIcon />} onClick={() => setShowAddModal(true)}>添加约会</Button>
        </HStack>
      </Flex>

      <Tabs colorScheme="gold" variant="soft-rounded" defaultIndex={window.location.hash === '#calendar' ? 2 : window.location.hash === '#dates' ? 1 : 0} isLazy lazyBehavior="keepMounted">
        <TabList>
          <Tab>女生</Tab>
          <Tab>约会</Tab>
          <Tab>日历</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <GirlsTab
              girlsList={girlsList}
              isInitialLoad={isInitialLoad}
              onAddGirl={refreshGirls}
              onGirlClick={(girl) => navigate(`/my-pond/${girl.id}`)}
            />
          </TabPanel>
          <TabPanel px={0}>
            <DatesTab
              datesList={datesList}
              allDates={allDates}
              pendingInterviews={pendingInterviews}
              isInitialLoad={isInitialLoad}
              onRefresh={refresh}
              onOpenDate={openDateDetail}
              girlList={girlList}
            />
          </TabPanel>
          <TabPanel px={0}>
            <CalendarTab clientId={clientId} girlList={girlList} refreshKey={isInitialLoad} />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* 添加约会 Modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); resetDateForm(); }} size="lg">
        <ModalOverlay /><ModalContent bg="warm.800" maxH="85vh" overflow="auto">
          <ModalHeader color="white">{addStep === 1 ? '选择约会对象' : '填写约会信息'}</ModalHeader>
          <ModalCloseButton onClick={() => { setShowAddModal(false); resetDateForm(); }} />
          <ModalBody pb={6}>
            <Flex justify="center" gap={2} mb={8}>
              {[1, 2].map(step => (
                <Box key={step} w={addStep === step ? '32px' : '8px'} h="8px" borderRadius="full"
                  bg={addStep >= step ? 'gold.500' : 'warm.600'} transition="all 0.3s" />
              ))}
            </Flex>

            {addStep === 1 && (
              <VStack spacing={4} align="stretch">
                <Text color="rgba(245,240,232,0.4)" textAlign="center" mb={2}>选择约会对象</Text>
                <VStack spacing={3} align="stretch" maxH="300px" overflowY="auto">
                  {(girlsList ?? []).length === 0 ? (
                    <Text color="rgba(245,240,232,0.2)" textAlign="center" py={8}>暂无比心仪的女生</Text>
                  ) : girlsList.map(girl => (
                    <Card key={girl.id}
                      cursor="pointer"
                      bg={selectedGirlForDate?.id === girl.id ? 'rgba(0,212,170,0.15)' : 'warm.800'}
                      border="2px solid"
                      borderColor={selectedGirlForDate?.id === girl.id ? 'gold.500' : 'warm.600'}
                      onClick={() => { setSelectedGirlForDate(girl); setAddStep(2); }}
                      _hover={{ borderColor: 'gold.400' }} transition="all 0.2s">
                      <CardBody py={3} px={4}>
                        <HStack spacing={3}>
                          <Avatar size="md" name={girl.name} />
                          <Box flex={1}>
                            <HStack spacing={2}>
                              <Text color="white" fontWeight="bold">{girl.name}</Text>
                              <Badge colorScheme={STAGE_COLORS[girl.stage] || 'gray'} size="sm">{girl.stage || '未知'}</Badge>
                            </HStack>
                            {girl.age && <Text color="rgba(245,240,232,0.4)" fontSize="xs">{girl.age}岁{girl.occupation ? ` · ${girl.occupation}` : ''}</Text>}
                          </Box>
                          {selectedGirlForDate?.id === girl.id && <Box color="gold.400" fontSize="20px">✓</Box>}
                        </HStack>
                      </CardBody>
                    </Card>
                  ))}
                </VStack>
                <Button colorScheme="gold" size="lg" mt={4} isDisabled={!selectedGirlForDate} onClick={() => setAddStep(2)}>下一步</Button>
              </VStack>
            )}

            {addStep === 2 && (
              <VStack spacing={4} align="stretch">
                {selectedGirlForDate && (
                  <Card bg="warm.800" border="1px solid" borderColor="gold.500">
                    <CardBody py={3} px={4}>
                      <Flex align="center" gap={3}>
                        <Avatar size="md" name={selectedGirlForDate.name} />
                        <Text color="white" fontWeight="bold">{selectedGirlForDate.name}</Text>
                        <Button size="xs" variant="ghost" colorScheme="gold" onClick={() => setAddStep(1)}>修改</Button>
                      </Flex>
                    </CardBody>
                  </Card>
                )}
                <FormControl>
                  <FormLabel color="rgba(245,240,232,0.4)">约会标题</FormLabel>
                  <Input placeholder="如：周末约会" value={dateForm.title} onChange={e => setDateForm({...dateForm, title: e.target.value})} bg="warm.700" borderColor="warm.600" />
                </FormControl>
                <FormControl>
                  <FormLabel color="rgba(245,240,232,0.4)">约会时间</FormLabel>
                  <DatePicker selected={dateForm.dateTime ? new Date(dateForm.dateTime) : null}
                    onChange={(date) => setDateForm({...dateForm, dateTime: formatLocalDateTime(date)})}
                    showTimeSelect timeIntervals={15} dateFormat="yyyy/MM/dd ah:mm" locale="zh-CN"
                    placeholderText="选择日期和时间"
                    customInput={<Input bg="warm.700" borderColor="warm.600" _placeholder={{ color: 'rgba(245,240,232,0.2)' }} />} />
                </FormControl>
                <FormControl>
                  <FormLabel color="rgba(245,240,232,0.4)">约会地点</FormLabel>
                  <Input placeholder="如：北京三里屯" value={dateForm.location} onChange={e => setDateForm({...dateForm, location: e.target.value})} bg="warm.700" borderColor="warm.600" />
                </FormControl>
                <FormControl>
                  <FormLabel color="rgba(245,240,232,0.4)">备注（选填）</FormLabel>
                  <Input placeholder="备注信息" value={dateForm.notes} onChange={e => setDateForm({...dateForm, notes: e.target.value})} bg="warm.700" borderColor="warm.600" />
                </FormControl>
                <HStack mt={4} spacing={3}>
                  <Button colorScheme="green" flex={1} size="lg" isLoading={saving} onClick={handleSaveDate}>保存约会</Button>
                  <Button variant={showAiFields ? 'solid' : 'outline'} colorScheme={showAiFields ? 'brand' : 'gray'} leftIcon={<SparklesIcon />} flex={1} size="lg" onClick={() => setShowAiFields(!showAiFields)}>
                    {showAiFields ? '收起' : 'AI 策划'}
                  </Button>
                </HStack>
                <Button variant="outline" colorScheme="gray" onClick={() => setAddStep(1)} mt={2}>上一步</Button>
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

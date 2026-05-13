import { parseJSON, cleanStreamText, filterReasoning, formatLocalDateTime, formatDateRelative } from '../../utils/uiHelpers';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Heading, Text, SimpleGrid, Card, CardBody, Badge, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalCloseButton, useDisclosure, VStack, HStack, Icon, Flex,
  Input, Button, useToast, NumberInput, NumberInputField, NumberInputStepper,
  NumberIncrementStepper, NumberDecrementStepper, Select, FormControl, FormLabel,
  Skeleton, Tabs, TabList, TabPanels, Tab, TabPanel, Avatar, Divider, Alert, AlertIcon,
  AlertDescription, Progress, Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { zhCN } from 'date-fns/locale/zh-CN';
import 'react-datepicker/dist/react-datepicker.css';
import { CalendarIcon, SparklesIcon, QuestionIcon, MapPinIcon, ClockIcon, HeartIcon, FishIcon, CreditCardIcon, CheckCircleIcon, CheckIcon, ClipboardIcon, FemaleIcon, GiftIcon } from '../../components/Icons';
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
/** ===================== 女生 Tab ===================== */
function GirlsTab({ girlsList, isInitialLoad, onAddGirl, onGirlClick }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [addForm, setAddForm] = useState({ name: '', age: '', occupation: '' });
  const [adding, setAdding] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const toast = useToast();

  const handleAdd = async () => {
    if (!addForm.name.trim()) { toast({ title: '请输入昵称', status: 'warning', duration: 3000 }); return; }
    setAdding(true);
    try {
      const res = await girlsApi.clientAdd({ name: addForm.name.trim(), age: addForm.age || undefined, occupation: addForm.occupation || undefined });
      if (res.success) {
        toast({ title: res.quotaLeft !== undefined ? `添加成功，剩余 ${res.quotaLeft} 个名额` : '添加成功', status: 'success' });
        setAddForm({ name: '', age: '', occupation: '' });
        setShowMore(false);
        onClose();
        onAddGirl();
      } else if (res.code === 'QUOTA_EXCEEDED') {
        toast({ title: `额度已用完，请联系操盘手升级`, status: 'warning', duration: 3000, duration: 4000 });
      } else {
        toast({ title: res.error || '添加失败', status: 'error', duration: 4000 });
      }
    } catch (e) {
      toast({ title: '添加失败', status: 'error', duration: 4000 });
    } finally { setAdding(false); }
  };

  return (
    <Box>
      <Flex justify="space-between" align="start" mb={6}>
        <Box>
          <Heading color="white" fontFamily="heading" fontSize="2xl">缘分</Heading>
          <Text color="rgba(245,240,232,0.55)" fontSize="sm" mt={1}>
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
            <Card key={girl.id} className="hover-lift" bg="warm.800" cursor="pointer" onClick={() => onGirlClick(girl)}>
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
                  <Text color="rgba(245,240,232,0.55)" fontSize="xs">亲密度 <Text as="span" color="gold.400">x{girl.intimacyLevel || 1}</Text></Text>
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
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }} />
              </FormControl>
              <Button
                size="sm"
                variant="ghost"
                color="rgba(245,240,232,0.45)"
                onClick={() => setShowMore(!showMore)}
                _hover={{ color: 'rgba(245,240,232,0.7)' }}
              >
                {showMore ? '收起更多信息' : '+ 更多（年龄、职业）'}
              </Button>
              {showMore && (
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
              )}
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
          <Card className="hover-lift" bg="warm.800" border="1px solid" borderColor="orange.600">
            <CardBody py={4} px={4}>
              <Flex align="center" gap={3}>
                <Box w="40px" h="40px" borderRadius="10px" bg="rgba(249,115,22,0.2)" display="flex" alignItems="center" justifyContent="center"><Icon as={ClipboardIcon} boxSize={5} color="orange.400" /></Box>
                <Box>
                  <Text fontSize="2xl" fontWeight="bold" color="orange.400">{stats.interviews}</Text>
                  <Text fontSize="xs" color="rgba(245,240,232,0.4)">待反馈</Text>
                </Box>
              </Flex>
            </CardBody>
          </Card>
          <Card className="hover-lift" bg="warm.800" border="1px solid" borderColor="green.600">
            <CardBody py={4} px={4}>
              <Flex align="center" gap={3}>
                <Box w="40px" h="40px" borderRadius="10px" bg="rgba(34,197,94,0.2)" display="flex" alignItems="center" justifyContent="center"><Icon as={CheckCircleIcon} boxSize={5} color="green.400" /></Box>
                <Box>
                  <Text fontSize="2xl" fontWeight="bold" color="green.400">{stats.completed}</Text>
                  <Text fontSize="xs" color="rgba(245,240,232,0.4)">已完成</Text>
                </Box>
              </Flex>
            </CardBody>
          </Card>
          <Card className="hover-lift" bg="warm.800" border="1px solid" borderColor="cyan.600">
            <CardBody py={4} px={4}>
              <Flex align="center" gap={3}>
                <Box w="40px" h="40px" borderRadius="10px" bg="rgba(6,182,212,0.2)" display="flex" alignItems="center" justifyContent="center"><Icon as={CalendarIcon} boxSize={5} color="cyan.400" /></Box>
                <Box>
                  <Text fontSize="2xl" fontWeight="bold" color="cyan.400">{stats.thisMonth}</Text>
                  <Text fontSize="xs" color="rgba(245,240,232,0.4)">本月约会</Text>
                </Box>
              </Flex>
            </CardBody>
          </Card>
          <Card className="hover-lift" bg="warm.800" border="1px solid" borderColor="pink.600">
            <CardBody py={4} px={4}>
              <Flex align="center" gap={3}>
                <Box w="40px" h="40px" borderRadius="10px" bg="rgba(244,114,182,0.2)" display="flex" alignItems="center" justifyContent="center"><Icon as={CreditCardIcon} boxSize={5} color="pink.400" /></Box>
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
                    <Avatar size="sm" name={upcomingDate.girl?.name} src={upcomingDate.girl?.avatar ? getMediaUrl(upcomingDate.girl.avatar) : undefined} />
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
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
          {[1,2,3].map(i => <Skeleton key={i} height="100px" borderRadius="lg" />)}
        </SimpleGrid>
      ) : filteredDates.length === 0 && pendingInterviews.length === 0 ? (
        <Card bg="warm.800"><CardBody>
          <Flex direction="column" align="center" py={12} gap={3}>
            <Icon as={CalendarIcon} color="rgba(245,240,232,0.4)" boxSize={12} />
            <Text color="rgba(245,240,232,0.4)">暂无约会</Text>
            <Text color="rgba(245,240,232,0.55)" fontSize="sm">点击女生卡片"约她"开始</Text>
          </Flex>
        </CardBody></Card>
      ) : (
        <VStack spacing={4} align="stretch">
          <Flex gap={3} wrap="wrap">
            <Menu>
              <MenuButton as={Button} size="sm" variant="outline" borderColor="warm.600" _hover={{ bg: 'warm.700' }} rightIcon={<Text fontSize="xs">▼</Text>}>
                {filterGirlId ? girlList.find(g => g.id === filterGirlId)?.name : `全部女生 (${girlList.length})`}
              </MenuButton>
              <MenuList bg="warm.800" borderColor="warm.600" minW="160px">
                <MenuItem _hover={{ bg: 'warm.700' }} onClick={() => setFilterGirlId('')}>
                  <Text color="rgba(245,240,232,0.6)">全部女生 ({girlList.length})</Text>
                </MenuItem>
                {girlList.map(g => (
                  <MenuItem key={g.id} _hover={{ bg: 'warm.700' }} onClick={() => setFilterGirlId(g.id)}>
                    <HStack spacing={2}>
                      <Avatar size="xs" name={g.name} src={g.avatar} bg="purple.400" />
                      <Text>{g.name}</Text>
                    </HStack>
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
            {filterGirlId && <Button size="sm" variant="ghost" onClick={() => setFilterGirlId('')}>清除过滤</Button>}
          </Flex>
          {filteredDates.map(d => (
            <Card key={d.id} bg="warm.800" border="1px solid" borderColor="purple.500"
              cursor="pointer" onClick={() => onOpenDate(d)}
              _hover={{ borderColor: 'purple.400', transform: 'translateY(-2px)' }} transition="all 0.2s">
              <CardBody py={4} px={5}>
                <Flex gap={4} align="flex-start">
                  <Avatar size="lg" name={d.girl?.name} src={d.girl?.avatar ? getMediaUrl(d.girl.avatar) : undefined} />
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
function CalendarTab({ clientId, girlList, refreshKey, onDateDetail }) {
  if (!clientId) return <Flex justify="center" py={12}><Skeleton h="200px" w="100%" borderRadius="lg" /></Flex>;
  return <ClientCalendar clientId={clientId} girlList={girlList} refreshKey={refreshKey} onDateDetail={onDateDetail} />;
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
  const aiFieldsRef = useRef(null);
  const addModalRef = useRef(null);
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
    if (!selectedGirlForDate) { toast({ title: '请选择约会对象', status: 'warning', duration: 3000 }); return; }
    setSaving(true);
    try {
      const res = await dates.create({ girlId: selectedGirlForDate.id, dateTime: dateForm.dateTime || undefined, location: dateForm.location, title: dateForm.title || '新约会', notes: dateForm.notes });
      if (res.success) { toast({ title: '约会添加成功', status: 'success', duration: 2000 }); setShowAddModal(false); resetDateForm(); refresh(); }
      else { toast({ title: res.error || '添加失败', status: 'error', duration: 4000 }); }
    } catch (e) { toast({ title: '添加失败', status: 'error', duration: 4000 }); }
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

  const handleRefresh = async () => {
    await Promise.all([refresh(), refreshGirls()]);
  };

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading color="white">缘分与约会</Heading>
        <HStack spacing={2}>
          <Button colorScheme="gold" leftIcon={<SparklesIcon />} onClick={() => setShowAddModal(true)}>添加约会</Button>
        </HStack>
      </Flex>

      <Tabs colorScheme="gold" variant="soft-rounded" defaultIndex={window.location.hash === '#calendar' ? 2 : window.location.hash === '#dates' ? 1 : 0} isLazy lazyBehavior="keepMounted">
        <TabList sx={{ '& button': { transition: 'all 0.2s ease' } }} flexShrink={0}>
          <Tab _selected={{ color: 'warm.950', bg: 'gold.500' }}><Icon as={FemaleIcon} boxSize={4} mr={1} />女生</Tab>
          <Tab _selected={{ color: 'warm.950', bg: 'gold.500' }}><Icon as={GiftIcon} boxSize={4} mr={1} />约会</Tab>
          <Tab _selected={{ color: 'warm.950', bg: 'gold.500' }}><Icon as={CalendarIcon} boxSize={4} mr={1} />日历</Tab>
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
            <CalendarTab clientId={clientId} girlList={girlList} refreshKey={isInitialLoad}
              onDateDetail={(dateId) => {
                const dateItem = allDates.find(d => d.id === dateId);
                if (dateItem) openDateDetail(dateItem);
              }}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* 添加约会 Modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); resetDateForm(); }} size="lg">
        <ModalOverlay /><ModalContent bg="warm.800" maxH="85vh" overflow="auto" ref={addModalRef}>
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
                    <Text color="rgba(245,240,232,0.55)" textAlign="center" py={8}>暂无比心仪的女生</Text>
                  ) : girlsList.map(girl => (
                    <Card key={girl.id}
                      cursor="pointer"
                      bg={selectedGirlForDate?.id === girl.id ? 'rgba(0,212,170,0.15)' : 'warm.800'}
                      border="2px solid"
                      borderColor={selectedGirlForDate?.id === girl.id ? 'gold.500' : 'warm.600'}
                      onClick={() => { setSelectedGirlForDate(girl); setAddStep(2); setTimeout(() => addModalRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50); }}
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
                          {selectedGirlForDate?.id === girl.id && <Icon as={CheckIcon} color="gold.400" boxSize={5} />}
                        </HStack>
                      </CardBody>
                    </Card>
                  ))}
                </VStack>
                <Button colorScheme="gold" size="lg" mt={4} isDisabled={!selectedGirlForDate} onClick={() => { setAddStep(2); setTimeout(() => addModalRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50); }}>下一步</Button>
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
                    customInput={<Input bg="warm.700" borderColor="warm.600" _placeholder={{ color: 'rgba(245,240,232,0.4)' }} />} />
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
                  <Button variant={showAiFields ? 'solid' : 'outline'} colorScheme={showAiFields ? 'brand' : 'gray'} leftIcon={<SparklesIcon />} flex={1} size="lg" onClick={() => {
                    const willShow = !showAiFields;
                    setShowAiFields(willShow);
                    if (willShow) {
                      setTimeout(() => aiFieldsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                    }
                  }}>
                    {showAiFields ? '收起 AI 策划' : 'AI 智能策划'}
                  </Button>
                </HStack>

                {/* AI 智能策划区域 */}
                {showAiFields && (
                  <VStack spacing={3} align="stretch" mt={2} ref={aiFieldsRef}>
                    <Divider />
                    <HStack spacing={2}><Icon as={SparklesIcon} boxSize={4} color="gold.400" /><Text color="gold.400" fontWeight="bold" fontSize="sm">AI 精细化方案（基于上方已填写的偏好）</Text></HStack>
                    <Text color="rgba(245,240,232,0.4)" fontSize="xs">填写上方"更多选项"后，AI 将生成更精准的时间表、场地推荐和聊天话题</Text>
                    <Button colorScheme="gold" leftIcon={<SparklesIcon />} size="lg" onClick={() => { setGenerating(true); toast({ title: 'AI 正在精心策划中...', status: 'info', duration: 2000 }); handleGeneratePlan?.(); }} isLoading={generating} loadingText="策划中...">
                      生成精细化方案
                    </Button>
                  </VStack>
                )}

                <Button variant="outline" colorScheme="gray" onClick={() => setAddStep(1)} mt={2}>上一步</Button>
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

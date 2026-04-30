import { useEffect, useState } from 'react';
import {
  Box, Heading, Card, CardBody, Button, Badge, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalCloseButton, useDisclosure, VStack, HStack, Text,
  SimpleGrid, Flex, Divider, Tag, Wrap, WrapItem, useToast, Textarea, FormControl,
  FormLabel, Icon, Alert, AlertIcon, AlertDescription, Spinner, Progress, Tabs, TabList, TabPanels, Tab, TabPanel, Input, Select, Center
} from '@chakra-ui/react';
import { CalendarIcon, SparklesIcon, QuestionIcon, CopyIcon } from '../../components/Icons';
import ClientCalendar from '../../components/ClientCalendar';
import { dates, membership as membershipApi, clients } from '../../utils/api';

function parseJSON(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

// 访谈状态标签映射
const STATUS_COLORS = {
  plan_pending: 'orange',
  planned: 'teal',
  pending_client_confirm: 'purple',
  confirmed: 'green',
  completed: 'green',
  interview_pending: 'cyan',
  interview_answered: 'teal',
};
const STATUS_LABELS = {
  plan_pending: '待策划',
  planned: '已策划',
  pending_client_confirm: '待确认',
  confirmed: '已确认',
  completed: '已完成',
  interview_pending: '待填写访谈',
  interview_answered: '访谈已填',
};

export default function ClientDates() {
  const [datesList, setDatesList] = useState([]);
  const [allDates, setAllDates] = useState([]);
  const [aiPlans, setAiPlans] = useState([]);
  const [clientId, setClientId] = useState(null);
  const [girlList, setGirlList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackReason, setFeedbackReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pendingInterviews, setPendingInterviews] = useState([]);
  const [interviewModal, setInterviewModal] = useState(null);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [interviewAnswers, setInterviewAnswers] = useState({});
  const [interviewSubmitting, setInterviewSubmitting] = useState(false);
  const [selectedAiPlan, setSelectedAiPlan] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [aiForm, setAiForm] = useState({ title: '', scene: '', budget: '', duration: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState('ai'); // 'ai' | 'manual'
  const [manualForm, setManualForm] = useState({ title: '', girlId: '', dateTime: '', location: '', notes: '' });
  const [girlsList, setGirlsList] = useState([]);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const toast = useToast();

  // 加载女生列表
  useEffect(() => {
    if (showAddModal && addMode === 'manual') {
      loadGirls();
    }
  }, [showAddModal, addMode]);

  const loadGirls = async () => {
    try {
      const res = await fetch('/api/girls/my', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      }).then(r => r.json());
      if (res.success) setGirlsList(res.girls || []);
    } catch (e) { console.error(e); }
  };

  const handleManualSubmit = async () => {
    if (!manualForm.girlId) {
      toast({ title: '请选择约会对象', status: 'warning' });
      return;
    }
    setManualSubmitting(true);
    try {
      const res = await fetch('/api/dates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: manualForm.title || '新约会',
          girlId: parseInt(manualForm.girlId),
          dateTime: manualForm.dateTime || null,
          location: manualForm.location,
          notes: manualForm.notes
        })
      }).then(r => r.json());
      if (res.success) {
        toast({ title: '约会添加成功', status: 'success', duration: 2000 });
        setShowAddModal(false);
        setManualForm({ title: '', girlId: '', dateTime: '', location: '', notes: '' });
        loadAll();
      } else {
        toast({ title: res.error || '添加失败', status: 'error' });
      }
    } catch (e) {
      toast({ title: '添加失败', status: 'error' });
    }
    setManualSubmitting(false);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pendingRes, allDatesRes, interviewsRes, aiPlansRes] = await Promise.all([
        dates.getClientPending(),
        dates.list().catch(() => ({ success: false, dates: [] })),
        dates.getClientInterviews().catch(() => ({ success: false })),
        membershipApi.datingPlans().catch(() => ({ success: false }))
      ]);
      if (pendingRes.success) setDatesList(pendingRes.dates || []);
      if (allDatesRes.success) setAllDates(allDatesRes.dates || []);
      if (interviewsRes?.success) setPendingInterviews(interviewsRes.interviews || []);
      if (aiPlansRes?.success) setAiPlans(aiPlansRes.plans || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // 加载客户ID和女生列表
  useEffect(() => {
    const loadClientInfo = async () => {
      try {
        const res = await clients.me();
        if (res.client?.id) {
          setClientId(res.client.id);
        }
        if (res.client?.girls) {
          setGirlList(res.client.girls);
        }
      } catch (e) { console.error(e); }
    };
    loadClientInfo();
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadAll(); }, []);

  const openDetail = async (d) => {
    setSelected(d);
    setFeedbackText('');
    setFeedbackReason('');
    onOpen();
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setConfirming(true);
    try {
      const res = await dates.clientConfirm(selected.id);
      if (res.success) {
        toast({ title: res.message, status: 'success', duration: 3000 });
        onClose();
        loadAll();
      } else {
        toast({ title: res.error || '确认失败', status: 'error', duration: 2500 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '确认失败', status: 'error', duration: 2500 });
    }
    setConfirming(false);
  };

  const handleFeedback = async () => {
    if (!selected || !feedbackText.trim()) {
      toast({ title: '请填写调整建议', status: 'warning', duration: 2000 });
      return;
    }
    setSubmitting(true);
    try {
      const res = await dates.submitClientFeedback(selected.id, {
        adjustment: feedbackText,
        reason: feedbackReason
      });
      if (res.success) {
        toast({ title: '调整建议已提交，顾问会优化方案', status: 'success', duration: 3000 });
        onClose();
        loadAll();
      } else {
        toast({ title: res.error || '提交失败', status: 'error', duration: 2500 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '提交失败', status: 'error', duration: 2500 });
    }
    setSubmitting(false);
  };

  const generateAiPlan = async () => {
    if (!aiForm.scene) {
      toast({ title: '请填写约会场景', status: 'warning' });
      return;
    }
    setGenerating(true);
    try {
      const res = await membershipApi.generateDatingPlan(aiForm);
      if (res.success) {
        setAiPlans([res.plan, ...aiPlans]);
        setSelectedAiPlan(res.plan);
        setAiForm({ title: '', scene: '', budget: '', duration: '' });
        toast({ title: '方案生成中...', status: 'info', duration: 3000 });
      }
    } catch (err) {
      toast({ title: '生成失败', description: err.message, status: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  // 打开访谈问卷
  const openInterview = (interview) => {
    setInterviewModal(interview);
    const initAnswers = {};
    (interview.questions || []).forEach(q => {
      initAnswers[q.id || `q${interview.questions.indexOf(q) + 1}`] = '';
    });
    setInterviewAnswers(initAnswers);
    setInterviewOpen(true);
  };

  const submitInterview = async () => {
    if (!interviewModal) return;
    setInterviewSubmitting(true);
    try {
      const answers = Object.entries(interviewAnswers).map(([id, answer]) => ({
        id, answer: answer.trim()
      })).filter(a => a.answer);
      if (answers.length === 0) {
        toast({ title: '请至少回答一个问题', status: 'warning', duration: 2000 });
        setInterviewSubmitting(false);
        return;
      }
      const res = await dates.submitInterview(interviewModal.dateId, answers);
      if (res.success) {
        toast({ title: '访谈已提交，顾问正在生成复盘分析', status: 'success', duration: 3000 });
        setInterviewOpen(false);
        setInterviewModal(null);
        loadAll();
      } else {
        toast({ title: res.error || '提交失败', status: 'error', duration: 2500 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '提交失败', status: 'error', duration: 2500 });
    }
    setInterviewSubmitting(false);
  };

  const renderPlan = (plan) => {
    if (!plan) return null;
    const p = typeof plan === 'string' ? parseJSON(plan) : plan;
    if (!p) return null;
    return (
      <Box>
        {p.overview && (
          <Alert status="info" mb={4} borderRadius="md">
            <AlertIcon /><AlertDescription>{p.overview}</AlertDescription>
          </Alert>
        )}

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

        {p.schedule?.length > 0 && (
          <Card bg="gray.750" mb={4}>
            <CardBody>
              <Text color="teal.400" fontWeight="bold" mb={3}>约会时间表</Text>
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

        {p.precautions?.length > 0 && (
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

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading color="white">约会与方案</Heading>
        <HStack spacing={2}>
          <Button variant="outline" colorScheme="gray" size="sm" onClick={loadAll} isLoading={loading}>刷新</Button>
          <Button colorScheme="brand" leftIcon={<SparklesIcon />} onClick={() => setShowAddModal(true)}>
            添加约会
          </Button>
        </HStack>
      </Flex>

      <Tabs colorScheme="brand" variant="soft-rounded" mb={6} defaultIndex={window.location.hash === '#calendar' ? 1 : 0}>
        <TabList>
          <Tab>约会方案</Tab>
          <Tab>我的日历</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            {/* 访谈入口 */}
            {pendingInterviews.length > 0 && (
              <Box mb={4}>
                <Alert status="cyan" mb={4} borderRadius="md">
                  <AlertIcon />
                  <AlertDescription fontSize="sm">
                    您有 <strong>{pendingInterviews.length}</strong> 份约会反馈访谈等待填写，顾问需要了解您的约会体验来优化后续方案。
                  </AlertDescription>
                </Alert>
                <VStack spacing={3} align="stretch">
                  {pendingInterviews.map((iv, i) => (
                    <Card key={iv.dateId || i} bg="cyan.900" border="1px solid" borderColor="cyan.600">
                      <CardBody>
                        <Flex justify="space-between" align="center">
                          <Box>
                            <HStack spacing={2} mb={1}>
                              <Icon as={QuestionIcon} color="cyan.300" />
                              <Text color="cyan.200" fontWeight="bold">{iv.title}</Text>
                              <Badge colorScheme="cyan">{iv.questions?.length || 0}个问题</Badge>
                            </HStack>
                            {iv.interviewOverview && (
                              <Text color="cyan.300" fontSize="sm" mb={1}>{iv.interviewOverview}</Text>
                            )}
                            <Text color="gray.400" fontSize="xs">
                              约会对象：{iv.girlName} · 推送时间：{iv.pushedAt ? new Date(iv.pushedAt).toLocaleDateString('zh-CN') : '-'}
                            </Text>
                          </Box>
                          <Button colorScheme="cyan" size="sm" onClick={() => openInterview(iv)}>
                            填写访谈
                          </Button>
                        </Flex>
                      </CardBody>
                    </Card>
                  ))}
                </VStack>
              </Box>
            )}

            {/* 约会列表 */}
            {loading ? (
              <Flex justify="center" py={12}><Spinner /></Flex>
            ) : datesList.length === 0 && aiPlans.length === 0 && pendingInterviews.length === 0 ? (
              <Card bg="gray.800">
                <CardBody>
                  <Flex direction="column" align="center" py={12} gap={3}>
                    <Icon as={CalendarIcon} color="gray.500" boxSize={12} />
                    <Text color="gray.400">暂无约会方案</Text>
                    <Text color="gray.500" fontSize="sm">点击右上角"添加约会"开始</Text>
                  </Flex>
                </CardBody>
              </Card>
            ) : (
              <VStack spacing={4} align="stretch">
                {/* AI 方案列表 */}
                {aiPlans.map(plan => (
                  <Card
                    key={plan.id}
                    bg="gray.800"
                    border="1px solid rgba(0,212,170,0.3)"
                    cursor="pointer"
                    _hover={{ borderColor: 'brand.500' }}
                    onClick={() => setSelectedAiPlan(plan)}
                  >
                    <CardBody>
                      <Flex justify="space-between" align="flex-start" mb={2}>
                        <Box>
                          <HStack spacing={2} mb={1}>
                            <Icon as={SparklesIcon} color="brand.400" />
                            <Heading size="md" color="white">{plan.title || 'AI 约会方案'}</Heading>
                            <Badge colorScheme={plan.planStatus === 'generated' ? 'green' : plan.planStatus === 'generating' ? 'blue' : 'gray'}>
                              {plan.planStatus === 'generated' ? '已生成' : plan.planStatus === 'generating' ? '生成中' : '草稿'}
                            </Badge>
                          </HStack>
                          {plan.scene && <Text color="gray.400" fontSize="sm">{plan.scene}</Text>}
                          {plan.budget && <Text color="gray.500" fontSize="xs">预算：{plan.budget} · 时长：{plan.duration}</Text>}
                        </Box>
                        <Text color="gray.500" fontSize="xs">
                          {new Date(plan.createdAt).toLocaleDateString('zh-CN')}
                        </Text>
                      </Flex>
                    </CardBody>
                  </Card>
                ))}
                {/* 顾问方案列表 */}
                {datesList.map(d => {
                  const plan = parseJSON(d.aiPlan);
                  return (
                    <Card key={d.id} bg="gray.800" border="1px solid borderColor.purple.600">
                      <CardBody>
                        <Flex justify="space-between" align="flex-start" mb={3}>
                          <Box>
                            <HStack spacing={2} mb={1}>
                              <Heading size="md" color="white">{d.title || '约会方案'}</Heading>
                              <Badge colorScheme="purple">顾问</Badge>
                            </HStack>
                            <HStack spacing={3}>
                              <Text color="gray.400" fontSize="sm">对象：{d.girl?.name}</Text>
                              <Text color="gray.400" fontSize="sm">时间：{d.dateTime ? new Date(d.dateTime).toLocaleString('zh-CN') : '-'}</Text>
                              {d.location && <Text color="gray.400" fontSize="sm">地点：{d.location}</Text>}
                            </HStack>
                          </Box>
                          <VStack spacing={2} align="flex-end">
                            <Button colorScheme="purple" onClick={() => openDetail(d)} size="sm">
                              查看方案
                            </Button>
                            <Text color="gray.500" fontSize="xs">
                              推送时间：{d.pushToClientAt ? new Date(d.pushToClientAt).toLocaleDateString('zh-CN') : '-'}
                            </Text>
                          </VStack>
                        </Flex>
                        {plan?.venue && (
                          <Box bg="gray.750" p={3} borderRadius="md">
                            <Text color="gray.400" fontSize="sm">推荐：{plan.venue.name} · {plan.venue.type}</Text>
                            {plan.overview && <Text color="gray.300" fontSize="sm" mt={1}>{plan.overview}</Text>}
                          </Box>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </VStack>
            )}
          </TabPanel>

          {/* 日历视图 */}
          <TabPanel px={0}>
            {clientId ? (
              <ClientCalendar
                clientId={clientId}
                girlList={girlList}
                refreshKey={loading}
              />
            ) : (
              <Flex justify="center" py={12}><Spinner /></Flex>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* 方案详情 */}
      <Modal isOpen={isOpen} onClose={onClose} size="3xl">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflow="auto">
          <ModalHeader color="white">
            {selected?.title || '约会方案'}
            <Badge ml={2} colorScheme="purple">待确认</Badge>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {selected && (
              <Box>
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={4}>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">约会对象</Text>
                    <Text color="teal.300">{selected.girl?.name}</Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">约会时间</Text>
                    <Text color="white" fontSize="sm">
                      {selected.dateTime ? new Date(selected.dateTime).toLocaleString('zh-CN') : '-'}
                    </Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">地点</Text>
                    <Text color="white">{selected.location || '-'}</Text>
                  </Box>
                </SimpleGrid>

                <Divider borderColor="gray.600" mb={4} />

                {renderPlan(selected.aiPlan)}

                <Divider borderColor="gray.600" my={4} />

                {/* 确认/调整 */}
                <Alert status="info" mb={4} borderRadius="md">
                  <AlertIcon />
                  <AlertDescription fontSize="sm">
                    查看完方案后，可以直接确认，或提出调整建议让顾问优化。
                  </AlertDescription>
                </Alert>

                <VStack spacing={3} align="stretch">
                  <Text color="gray.300" fontSize="sm" fontWeight="bold">我想调整方案</Text>
                  <FormControl>
                    <FormLabel color="gray.400" fontSize="sm">调整建议</FormLabel>
                    <Textarea
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      placeholder="比如：换一个更安静的餐厅 / 预算降低一些 / 增加户外活动..."
                      bg="gray.700" color="white" rows={2}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel color="gray.400" fontSize="sm">原因（选填）</FormLabel>
                    <Textarea
                      value={feedbackReason}
                      onChange={e => setFeedbackReason(e.target.value)}
                      placeholder="为什么想调整？"
                      bg="gray.700" color="white" rows={2}
                    />
                  </FormControl>
                  <HStack>
                    <Button
                      colorScheme="purple" variant="outline" flex={1}
                      onClick={handleFeedback} isLoading={submitting}
                      isDisabled={!feedbackText.trim() || submitting}
                    >
                      提交调整建议
                    </Button>
                    <Button
                      colorScheme="green" flex={1}
                      onClick={handleConfirm} isLoading={confirming}
                    >
                      确认此方案 ✓
                    </Button>
                  </HStack>
                </VStack>
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 访谈问卷弹窗 */}
      <Modal isOpen={interviewOpen} onClose={() => setInterviewOpen(false)} size="2xl">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflow="auto">
          <ModalHeader color="white">
            {interviewModal?.title || '约会反馈访谈'}
            <Badge ml={2} colorScheme="cyan">个性化问卷</Badge>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {interviewModal && (
              <Box>
                {interviewModal.interviewOverview && (
                  <Alert status="cyan" mb={4} borderRadius="md">
                    <AlertIcon />
                    <AlertDescription fontSize="sm">{interviewModal.interviewOverview}</AlertDescription>
                  </Alert>
                )}

                <VStack spacing={4} align="stretch">
                  {(interviewModal.questions || []).map((q, i) => {
                    const qId = q.id || `q${i + 1}`;
                    return (
                      <Card key={qId} bg="gray.750">
                        <CardBody>
                          <Flex align="flex-start" gap={3} mb={2}>
                            <Badge colorScheme="cyan" minW="24px" textAlign="center">{i + 1}</Badge>
                            <Box flex={1}>
                              <Text color="white" fontSize="sm" mb={1}>{q.question}</Text>
                              {q.purpose && (
                                <Text color="gray.500" fontSize="xs">（{q.purpose}）</Text>
                              )}
                            </Box>
                          </Flex>

                          {q.options?.length > 0 ? (
                            <Wrap spacing={2}>
                              {q.options.map((opt, oi) => {
                                const selected = String(interviewAnswers[qId] || '').split(',').includes(opt);
                                return (
                                  <WrapItem key={oi}>
                                    <Tag
                                      colorScheme={selected ? 'cyan' : 'gray'}
                                      cursor="pointer"
                                      onClick={() => {
                                        const cur = interviewAnswers[qId] || '';
                                        const list = cur ? cur.split(',').filter(Boolean) : [];
                                        const next = selected ? list.filter(x => x !== opt) : [...list, opt];
                                        setInterviewAnswers({ ...interviewAnswers, [qId]: next.join(',') });
                                      }}
                                    >
                                      {selected ? '✓ ' : ''}{opt}
                                    </Tag>
                                  </WrapItem>
                                );
                              })}
                            </Wrap>
                          ) : (
                            <Textarea
                              value={interviewAnswers[qId] || ''}
                              onChange={e => setInterviewAnswers({ ...interviewAnswers, [qId]: e.target.value })}
                              placeholder="请输入您的回答..."
                              bg="gray.700" color="white" rows={2} size="sm"
                            />
                          )}
                        </CardBody>
                      </Card>
                    );
                  })}
                </VStack>

                <HStack mt={6} justify="flex-end">
                  <Button variant="outline" colorScheme="gray" onClick={() => setInterviewOpen(false)}>稍后填写</Button>
                  <Button colorScheme="cyan" onClick={submitInterview} isLoading={interviewSubmitting}>
                    提交访谈
                  </Button>
                </HStack>
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* AI 方案详情 */}
      <Modal isOpen={!!selectedAiPlan} onClose={() => setSelectedAiPlan(null)} size="3xl">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflow="auto">
          <ModalHeader color="white">
            {selectedAiPlan?.title || 'AI 约会方案'}
            <Badge ml={2} colorScheme="brand">AI</Badge>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {selectedAiPlan && (
              <Box>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={4}>
                  {selectedAiPlan.scene && (
                    <Box bg="gray.750" p={3} borderRadius="md">
                      <Text color="gray.400" fontSize="sm">约会场景</Text>
                      <Text color="teal.300">{selectedAiPlan.scene}</Text>
                    </Box>
                  )}
                  {selectedAiPlan.budget && (
                    <Box bg="gray.750" p={3} borderRadius="md">
                      <Text color="gray.400" fontSize="sm">预算</Text>
                      <Text color="white">{selectedAiPlan.budget}</Text>
                    </Box>
                  )}
                  {selectedAiPlan.duration && (
                    <Box bg="gray.750" p={3} borderRadius="md">
                      <Text color="gray.400" fontSize="sm">时长</Text>
                      <Text color="white">{selectedAiPlan.duration}</Text>
                    </Box>
                  )}
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">状态</Text>
                    <Badge colorScheme={selectedAiPlan.planStatus === 'generated' ? 'green' : selectedAiPlan.planStatus === 'generating' ? 'blue' : 'gray'}>
                      {selectedAiPlan.planStatus === 'generated' ? '已生成' : selectedAiPlan.planStatus === 'generating' ? '生成中' : '草稿'}
                    </Badge>
                  </Box>
                </SimpleGrid>

                {selectedAiPlan.planStatus === 'generating' ? (
                  <Center py={20}>
                    <VStack>
                      <Spinner size="lg" color="brand.500" />
                      <Text color="gray.400" mt={3}>AI 正在为你策划约会方案...</Text>
                    </VStack>
                  </Center>
                ) : selectedAiPlan.content ? (
                  <Box
                    p={6}
                    bg="rgba(255,255,255,0.02)"
                    border="1px solid rgba(255,255,255,0.06)"
                    borderRadius="xl"
                    color="gray.200"
                    fontSize="sm"
                    lineHeight="1.8"
                    whiteSpace="pre-wrap"
                  >
                    {selectedAiPlan.content}
                  </Box>
                ) : (
                  <Text color="gray.400">暂无方案内容</Text>
                )}

                <HStack mt={6} justify="flex-end">
                  <Button
                    leftIcon={<CopyIcon />}
                    variant="outline"
                    colorScheme="brand"
                    onClick={() => {
                      if (selectedAiPlan.content) {
                        navigator.clipboard.writeText(selectedAiPlan.content);
                        toast({ title: '已复制', status: 'success', duration: 2000 });
                      }
                    }}
                  >
                    复制方案
                  </Button>
                </HStack>
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 添加约会 Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} size="lg">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflow="auto">
          <ModalHeader color="white">添加约会</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {/* 模式选择 */}
            <HStack spacing={4} mb={6}>
              <Card
                flex={1}
                cursor="pointer"
                bg={addMode === 'ai' ? 'rgba(0,212,170,0.15)' : 'gray.750'}
                border="2px solid"
                borderColor={addMode === 'ai' ? 'brand.500' : 'gray.600'}
                onClick={() => setAddMode('ai')}
                _hover={{ borderColor: 'brand.400' }}
              >
                <CardBody textAlign="center" py={6}>
                  <Icon as={SparklesIcon} color={addMode === 'ai' ? 'brand.400' : 'gray.400'} boxSize={10} mb={3} />
                  <Text color={addMode === 'ai' ? 'brand.400' : 'gray.300'} fontWeight="bold">AI 生成</Text>
                  <Text color="gray.500" fontSize="sm">描述场景，AI 帮你策划</Text>
                </CardBody>
              </Card>
              <Card
                flex={1}
                cursor="pointer"
                bg={addMode === 'manual' ? 'rgba(0,212,170,0.15)' : 'gray.750'}
                border="2px solid"
                borderColor={addMode === 'manual' ? 'brand.500' : 'gray.600'}
                onClick={() => setAddMode('manual')}
                _hover={{ borderColor: 'brand.400' }}
              >
                <CardBody textAlign="center" py={6}>
                  <Icon as={CalendarIcon} color={addMode === 'manual' ? 'brand.400' : 'gray.400'} boxSize={10} mb={3} />
                  <Text color={addMode === 'manual' ? 'brand.400' : 'gray.300'} fontWeight="bold">自己填写</Text>
                  <Text color="gray.500" fontSize="sm">手动输入约会信息</Text>
                </CardBody>
              </Card>
            </HStack>

            {addMode === 'ai' ? (
              /* AI 生成表单 */
              <VStack spacing={4} align="stretch">
                <Input
                  placeholder="方案标题（选填）"
                  value={aiForm.title}
                  onChange={e => setAiForm({ ...aiForm, title: e.target.value })}
                  bg="gray.700"
                  borderColor="gray.600"
                  _placeholder={{ color: 'gray.500' }}
                />
                <Textarea
                  placeholder="约会场景描述，例如：想和女生去一家有氛围的餐厅吃饭，她是上海人，喜欢粤菜，预算1000元左右"
                  value={aiForm.scene}
                  onChange={e => setAiForm({ ...aiForm, scene: e.target.value })}
                  bg="gray.700"
                  borderColor="gray.600"
                  _placeholder={{ color: 'gray.500' }}
                  rows={4}
                />
                <HStack>
                  <Input
                    placeholder="预算，如：1000元左右"
                    value={aiForm.budget}
                    onChange={e => setAiForm({ ...aiForm, budget: e.target.value })}
                    bg="gray.700"
                    borderColor="gray.600"
                    _placeholder={{ color: 'gray.500' }}
                  />
                  <Select
                    placeholder="时长"
                    value={aiForm.duration}
                    onChange={e => setAiForm({ ...aiForm, duration: e.target.value })}
                    bg="gray.700"
                    borderColor="gray.600"
                    w="140px"
                  >
                    <option value="2小时内">2小时内</option>
                    <option value="半天">半天</option>
                    <option value="一天">一天</option>
                    <option value="多天">多天</option>
                  </Select>
                </HStack>
                <Button
                  colorScheme="brand"
                  leftIcon={<SparklesIcon />}
                  onClick={() => {
                    if (!aiForm.scene) {
                      toast({ title: '请填写约会场景', status: 'warning' });
                      return;
                    }
                    setGenerating(true);
                    setShowAddModal(false);
                    generateAiPlan();
                  }}
                  isLoading={generating}
                  loadingText="AI 策划中..."
                >
                  开始生成
                </Button>
              </VStack>
            ) : (
              /* 手动填写表单 */
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">约会标题</FormLabel>
                  <Input
                    placeholder="如：周末约会"
                    value={manualForm.title}
                    onChange={e => setManualForm({ ...manualForm, title: e.target.value })}
                    bg="gray.700"
                    borderColor="gray.600"
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel color="gray.400" fontSize="sm">约会对象</FormLabel>
                  <Select
                    placeholder="选择女生"
                    value={manualForm.girlId}
                    onChange={e => setManualForm({ ...manualForm, girlId: e.target.value })}
                    bg="gray.700"
                    borderColor="gray.600"
                  >
                    {girlsList.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">约会时间</FormLabel>
                  <Input
                    type="datetime-local"
                    value={manualForm.dateTime}
                    onChange={e => setManualForm({ ...manualForm, dateTime: e.target.value })}
                    bg="gray.700"
                    borderColor="gray.600"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">地点</FormLabel>
                  <Input
                    placeholder="约会地点"
                    value={manualForm.location}
                    onChange={e => setManualForm({ ...manualForm, location: e.target.value })}
                    bg="gray.700"
                    borderColor="gray.600"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">备注</FormLabel>
                  <Textarea
                    placeholder="备注信息（选填）"
                    value={manualForm.notes}
                    onChange={e => setManualForm({ ...manualForm, notes: e.target.value })}
                    bg="gray.700"
                    borderColor="gray.600"
                    rows={2}
                  />
                </FormControl>
                <Button
                  colorScheme="brand"
                  leftIcon={<CalendarIcon />}
                  onClick={handleManualSubmit}
                  isLoading={manualSubmitting}
                >
                  添加约会
                </Button>
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

import { useEffect, useState } from 'react';
import {
  Box, Heading, Card, CardBody, Button, Badge, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalCloseButton, useDisclosure, VStack, HStack, Text,
  SimpleGrid, Flex, Divider, Tag, Wrap, WrapItem, useToast, Textarea, FormControl,
  FormLabel, Icon, Alert, AlertIcon, AlertDescription, Spinner, Progress, Tabs, TabList, TabPanels, Tab, TabPanel, Input, Select
} from '@chakra-ui/react';
import { CalendarIcon, SparklesIcon, QuestionIcon, CopyIcon } from '../../components/Icons';
import { dates, membership as membershipApi } from '../../utils/api';

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
  const toast = useToast();

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pendingRes, interviewsRes] = await Promise.all([
        dates.getClientPending(),
        dates.getClientInterviews().catch(() => ({ success: false }))
      ]);
      if (pendingRes.success) setDatesList(pendingRes.dates || []);
      if (interviewsRes?.success) setPendingInterviews(interviewsRes.interviews || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

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
        <Button variant="outline" colorScheme="gray" size="sm" onClick={loadAll} isLoading={loading}>刷新</Button>
      </Flex>

      <Tabs colorScheme="brand" variant="soft-rounded" mb={6}>
        <TabList>
          <Tab>约会方案</Tab>
          <Tab>AI约会方案</Tab>
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

            {loading ? (
              <Flex justify="center" py={12}><Spinner /></Flex>
            ) : datesList.length === 0 && pendingInterviews.length === 0 ? (
              <Card bg="gray.800">
                <CardBody>
                  <Flex direction="column" align="center" py={12} gap={3}>
                    <Icon as={CalendarIcon} color="gray.500" boxSize={12} />
                    <Text color="gray.400">暂无待确认的约会方案</Text>
                    <Text color="gray.500" fontSize="sm">顾问策划好约会后，会在这里通知您</Text>
                  </Flex>
                </CardBody>
              </Card>
            ) : (
              <VStack spacing={4} align="stretch">
                {datesList.map(d => {
                  const plan = parseJSON(d.aiPlan);
                  return (
                    <Card key={d.id} bg="gray.800" border="1px solid" borderColor="purple.600">
                      <CardBody>
                        <Flex justify="space-between" align="flex-start" mb={3}>
                          <Box>
                            <HStack spacing={2} mb={1}>
                              <Heading size="md" color="white">{d.title || '约会方案'}</Heading>
                              <Badge colorScheme="purple">待确认</Badge>
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

          <TabPanel px={0}>
            <AIDatingPlans />
          </TabPanel>
        </TabPanels>
      </Tabs>

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

      {loading ? (
        <Flex justify="center" py={12}><Spinner /></Flex>
      ) : datesList.length === 0 && pendingInterviews.length === 0 ? (
        <Card bg="gray.800">
          <CardBody>
            <Flex direction="column" align="center" py={12} gap={3}>
              <Icon as={CalendarIcon} color="gray.500" boxSize={12} />
              <Text color="gray.400">暂无待确认的约会方案</Text>
              <Text color="gray.500" fontSize="sm">顾问策划好约会后，会在这里通知您</Text>
            </Flex>
          </CardBody>
        </Card>
      ) : (
        <VStack spacing={4} align="stretch">
          {datesList.map(d => {
            const plan = parseJSON(d.aiPlan);
            return (
              <Card key={d.id} bg="gray.800" border="1px solid" borderColor="purple.600">
                <CardBody>
                  <Flex justify="space-between" align="flex-start" mb={3}>
                    <Box>
                      <HStack spacing={2} mb={1}>
                        <Heading size="md" color="white">{d.title || '约会方案'}</Heading>
                        <Badge colorScheme="purple">待确认</Badge>
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
    </Box>
  );
}

// AI约会方案子组件
function AIDatingPlans() {
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({ title: '', scene: '', budget: '', duration: '' });

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    try {
      const res = await membershipApi.datingPlans();
      if (res.success) setPlans(res.plans);
    } catch (err) {
      toast({ title: '加载失败', description: err.message, status: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan() {
    if (!form.scene) {
      toast({ title: '请填写约会场景', status: 'warning' });
      return;
    }
    setGenerating(true);
    try {
      const res = await membershipApi.generateDatingPlan(form);
      if (res.success) {
        setPlans([res.plan, ...plans]);
        setSelectedPlan(res.plan);
        setForm({ title: '', scene: '', budget: '', duration: '' });
        toast({ title: '方案生成中...', status: 'info', duration: 3000 });
      }
    } catch (err) {
      toast({ title: '生成失败', description: err.message, status: 'error' });
    } finally {
      setGenerating(false);
    }
  }

  if (selectedPlan) {
    return (
      <Box>
        <Button variant="ghost" colorScheme="gray" mb={4} onClick={() => setSelectedPlan(null)}>
          ← 返回列表
        </Button>
        <HStack justify="space-between" mb={4}>
          <Box>
            <Heading size="md" color="white">{selectedPlan.title}</Heading>
            {selectedPlan.scene && <Text color="gray.400" mt={1}>{selectedPlan.scene}</Text>}
            {selectedPlan.budget && <Text color="gray.500" fontSize="sm">预算：{selectedPlan.budget} · 时长：{selectedPlan.duration}</Text>}
          </Box>
          <Button
            leftIcon={<CopyIcon />}
            variant="outline"
            colorScheme="brand"
            size="sm"
            onClick={() => {
              if (selectedPlan.content) {
                navigator.clipboard.writeText(selectedPlan.content);
                toast({ title: '已复制', status: 'success', duration: 2000 });
              }
            }}
          >
            复制方案
          </Button>
        </HStack>

        {selectedPlan.planStatus === 'generating' ? (
          <Center py={20}>
            <VStack>
              <Spinner size="lg" color="brand.500" />
              <Text color="gray.400" mt={3}>AI 正在为你策划约会方案...</Text>
            </VStack>
          </Center>
        ) : selectedPlan.content ? (
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
            {selectedPlan.content}
          </Box>
        ) : (
          <Text color="gray.400">暂无方案内容</Text>
        )}
      </Box>
    );
  }

  return (
    <Box>
      {/* 创建新方案 */}
      <Box mb={6} p={5} bg="rgba(0,212,170,0.05)" border="1px solid rgba(0,212,170,0.15)" borderRadius="xl">
        <Text color="brand.400" fontWeight="bold" mb={4}>创建新方案</Text>
        <VStack spacing={3} align="stretch">
          <Input
            placeholder="方案标题（选填）"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            bg="gray.700"
            borderColor="gray.600"
            _placeholder={{ color: 'gray.500' }}
          />
          <Textarea
            placeholder="约会场景描述，例如：想和女生去一家有氛围的餐厅吃饭，她是上海人，喜欢粤菜，预算1000元左右"
            value={form.scene}
            onChange={e => setForm({ ...form, scene: e.target.value })}
            bg="gray.700"
            borderColor="gray.600"
            _placeholder={{ color: 'gray.500' }}
            rows={3}
          />
          <HStack>
            <Input
              placeholder="预算，如：1000元左右"
              value={form.budget}
              onChange={e => setForm({ ...form, budget: e.target.value })}
              bg="gray.700"
              borderColor="gray.600"
              _placeholder={{ color: 'gray.500' }}
            />
            <Select
              placeholder="时长"
              value={form.duration}
              onChange={e => setForm({ ...form, duration: e.target.value })}
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
            onClick={generatePlan}
            isLoading={generating}
            loadingText="AI 策划中..."
            alignSelf="flex-end"
          >
            生成方案
          </Button>
        </VStack>
      </Box>

      {/* 方案列表 */}
      {loading ? (
        <Center py={10}><Spinner /></Center>
      ) : plans.length === 0 ? (
        <Center py={10}>
          <VStack>
            <SparklesIcon boxSize={10} color="gray.600" />
            <Text color="gray.400">还没有约会方案，描述场景开始创作吧</Text>
          </VStack>
        </Center>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {plans.map(plan => (
            <Card
              key={plan.id}
              bg="gray.800"
              border="1px solid rgba(255,255,255,0.08)"
              cursor="pointer"
              _hover={{ borderColor: 'brand.500' }}
              onClick={() => setSelectedPlan(plan)}
              transition="all 0.2s"
            >
              <CardBody>
                <HStack justify="space-between" mb={2}>
                  <Text color="white" fontWeight="bold">{plan.title}</Text>
                  <Badge colorScheme={plan.planStatus === 'generated' ? 'green' : plan.planStatus === 'generating' ? 'blue' : 'gray'}>
                    {plan.planStatus === 'generated' ? '已生成' : plan.planStatus === 'generating' ? '生成中' : '草稿'}
                  </Badge>
                </HStack>
                {plan.scene && <Text color="gray.400" fontSize="sm">{plan.scene}</Text>}
                {plan.budget && <Text color="gray.500" fontSize="xs" mt={1}>预算：{plan.budget}</Text>}
                <Text color="gray.500" fontSize="xs" mt={1}>
                  {new Date(plan.createdAt).toLocaleDateString('zh-CN')}
                </Text>
              </CardBody>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Box, Flex, Heading, Text, Card, CardBody, CardHeader, Button, Select, Textarea, SimpleGrid, Badge, VStack, HStack, Divider, Spinner, useToast, Tabs, TabList, TabPanels, Tab, TabPanel, Icon, Input, useDisclosure } from '@chakra-ui/react';
import { clients, girls, chatLogs, chatPartner } from '../../utils/api';
import { FiSend, FiMessageSquare, FiTarget, FiZap, FiAlertCircle, FiCheck } from 'react-icons/fi';
import { HeartIcon } from '../../components/Icons';

const COACHES = [
  { id: 'general', name: '通用教练' },
  { id: 'naye', name: '纳爷' },
  { id: 'tuobuhua', name: '脱不花' },
  { id: 'tong', name: '童锦程' },
];

export default function AdminWorkbench() {
  const [clientList, setClientList] = useState([]);
  const [girlsList, setGirlsList] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedGirl, setSelectedGirl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [currentCoachName, setCurrentCoachName] = useState('');
  const [situation, setSituation] = useState('');
  const [coachId, setCoachId] = useState('general');
  const [deepMode, setDeepMode] = useState(false);
  const [optimized, setOptimized] = useState(null); // deprecated - kept for backward compat
  const [sendingContent, setSendingContent] = useState('');
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [recentLogs, setRecentLogs] = useState([]);
  const toast = useToast();

  // 实战聊天状态
  const [chatHistory, setChatHistory] = useState([]);
  const [girlMessage, setGirlMessage] = useState('');
  const [myMessage, setMyMessage] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [optimizations, setOptimizations] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [battleMode, setBattleMode] = useState('analyze');
  const [chatMode, setChatMode] = useState('suggest'); // 'suggest' | 'optimize'
  const messagesEndRef = useRef(null);
  const analysisRef = useRef(null);

  // 异步反馈状态
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [currentGirlState, setCurrentGirlState] = useState(null); // 用于 diff
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [feedbackAnalyzing, setFeedbackAnalyzing] = useState(false); // 采纳后"分析中"状态
  const pollingRef = useRef(null);

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, aiSuggestions]);

  // 轮询待审核更新
  const fetchPendingUpdates = async () => {
    if (!selectedGirl?.id) return;
    try {
      const res = await chatPartner.pendingUpdates(selectedGirl.id);
      if (res.success) {
        setPendingUpdates(res.updates || []);
        setCurrentGirlState(res.currentState);
      }
    } catch {
      // ignore polling errors silently
    }
  };

  useEffect(() => {
    if (selectedGirl?.id) {
      fetchPendingUpdates();
      pollingRef.current = setInterval(fetchPendingUpdates, 5000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedGirl?.id]);

  const loadClients = async () => {
    try {
      const res = await clients.list();
      if (res.success && res.clients.length > 0) {
        setClientList(res.clients);
        selectClient(res.clients[0]);
      }
    } catch {
      console.error('请求错误');
    }
  };

  const selectClient = async (client) => {
    setSelectedClient(client);
    setSelectedGirl(null);
    setResponse(null);
    try {
      const res = await girls.list({ clientId: client.id });
      if (res.success) setGirlsList(res.girls);
    } catch {
      console.error('请求错误');
    }
  };

  const selectGirl = async (girl) => {
    setSelectedGirl(girl);
    setResponse(null);
    setChatHistory([]);
    setAiAnalysis('');
    setAiSuggestions([]);
    setOptimizations([]);
    setSendingContent('');
    setOptimized(null);
    setBattleMode('analyze');
    setMyMessage('');
    setGirlMessage('');
    try {
      const res = await chatLogs.byGirl(girl.id);
      if (res.success) setRecentLogs(res.logs);
    } catch {
      console.error('请求错误');
    }
  };

  // ========== 情况咨询 ==========
  // deepMode=true → 非流式，走 coach-engine 工具链（add_signal/update_tension/record_learning）
  // deepMode=false → 流式，快思考
  const handleSituation = async () => {
    if (!situation.trim()) return;
    setLoading(true);
    setResponse(null);
    setAiAnalysis('');

    const token = localStorage.getItem('yutang_token');
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';
    const coachName = COACHES.find(c => c.id === coachId)?.name || 'AI教练';
    setCurrentCoachName(coachName);

    try {
      // 深度模式（useTools）走非流式，触发 coach-engine 工具调用
      // 快速模式走流式，无工具调用
      const doStream = !deepMode;

      const res = await fetch(`${apiUrl}/api/ai-coach/situation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          situation,
          coachId,
          girlId: selectedGirl?.id,
          stream: doStream
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      if (doStream) {
        // 流式模式（SSE）
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let analysis = '';

        if (analysisRef.current) analysisRef.current.innerHTML = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.substring(6);
              if (!jsonStr.startsWith('{')) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.content) {
                  analysis += parsed.content;
                  if (analysisRef.current) {
                    analysisRef.current.innerHTML = analysis.replace(/\n/g, '<br>');
                  }
                }
                if (parsed.error) toast({ title: '分析失败', status: 'error' });
              } catch { /* ignore non-JSON chunk */ void 0; }
            }
          }
        }

        setAiAnalysis(analysis);
        setResponse({ coach: coachName, analysis });
      } else {
        // 非流式模式（JSON，支持工具调用）
        const data = await res.json();
        if (data.success) {
          setAiAnalysis(data.analysis || '');
          if (analysisRef.current) {
            analysisRef.current.innerHTML = (data.analysis || '').replace(/\n/g, '<br>');
          }
          setResponse({ coach: data.coachName || coachName, analysis: data.analysis });
        } else {
          throw new Error(data.error || '分析失败');
        }
      }
    } catch {
      toast({ title: '分析失败', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // ========== 实战聊天 ==========
  const handleGirlMessage = async () => {
    if (!girlMessage.trim()) return;
    if (!selectedGirl) {
      toast({ title: '请先选择女生', status: 'warning' });
      return;
    }

    setIsAnalyzing(true);

    const newHistory = [...chatHistory, { role: 'girl', content: girlMessage }];
    setChatHistory(newHistory);
    setGirlMessage('');

    try {
      const res = await chatPartner.analyze({
        girlId: selectedGirl.id,
        message: girlMessage,
        history: chatHistory.map(m => ({ role: m.role, content: m.content }))
      });

      if (res.success) {
        setAiAnalysis(res.analysis || '');
        setAiSuggestions(res.suggestions || []);
        setBattleMode('manual');
      }
    } catch {
      toast({ title: 'AI分析失败', status: 'error' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 话术优化 - 操盘手粘贴自己想发的话，AI 给出优化版本
  const handleOptimizeMessage = async () => {
    if (!myMessage.trim()) return;
    if (!selectedGirl) {
      toast({ title: '请先选择女生', status: 'warning' });
      return;
    }

    setIsOptimizing(true);
    setOptimizations([]);
    setBattleMode('manual');

    try {
      const res = await chatPartner.optimizeMessage({
        girlId: selectedGirl.id,
        myMessage: myMessage,
        history: chatHistory.map(m => ({ role: m.role, content: m.content }))
      });

      if (res.success) {
        setOptimizations(res.optimizations || []);
      }
    } catch {
      toast({ title: '话术优化失败', status: 'error' });
    } finally {
      setIsOptimizing(false);
    }
  };

  // 采纳建议 → 异步反馈分析（不阻塞，立即显示）
  const handleSelectSuggestion = async (suggestion) => {
    const replyText = suggestion.text || suggestion.reply || suggestion;
    const style = suggestion.style || suggestion.optimizationType || '建议';
    const intention = suggestion.intention || suggestion.point || '';

    setSendingContent(replyText);
    setOptimized(null);
    setBattleMode('manual');
    setOptimizations([]);
    setAiSuggestions([]);
    setFeedbackAnalyzing(true); // 显示"分析中"

    // 立即把这条消息加入聊天历史
    setChatHistory(prev => [...prev, { role: 'user', content: replyText, adopted: true }]);
    setAiAnalysis('');

    if (selectedGirl && selectedClient) {
      try {
        const girlMsg = chatHistory.filter(m => m.role === 'girl').pop()?.content || '';
        await chatPartner.feedback({
          girlId: selectedGirl.id,
          clientId: selectedClient.id,
          receiverName: selectedGirl.name,
          chosenReply: replyText,
          originalGirlMessage: girlMsg,
          style,
          intention
        });

        // 立即轮询一次，尝试获取刚生成的待审核更新
        setTimeout(() => fetchPendingUpdates(), 500);
      } catch {
        console.warn('反馈记录失败');
      }
    }
  };

  // 代聊发送
  const handleSend = async () => {
    if (!sendingContent.trim() || !selectedGirl || !selectedClient) return;
    try {
      const res = await chatLogs.create({
        girlId: selectedGirl.id,
        clientId: selectedClient.id,
        receiverName: selectedGirl.name,
        content: sendingContent,
        aiAdopted: !!optimized,
        isVisibleToClient: visibleToClient
      });
      if (res.success) {
        toast({ title: '代聊记录已保存', status: 'success' });
        setSendingContent('');
        setOptimized(null);
        setVisibleToClient(false);
        setChatHistory(prev => [...prev, { role: 'user', content: sendingContent, adopted: false }]);
        loadGirlLogs();
      }
    } catch {
      toast({ title: '保存失败', status: 'error' });
    }
  };

  const handleClearChat = () => {
    setChatHistory([]);
    setAiAnalysis('');
    setAiSuggestions([]);
    setOptimizations([]);
    setSendingContent('');
    setGirlMessage('');
    setMyMessage('');
    setBattleMode('analyze');
  };

  // 采纳单条待审核更新
  const handleApproveUpdate = async (updateId) => {
    try {
      await chatPartner.applyUpdate(updateId);
      setPendingUpdates(prev => prev.filter(u => u.id !== updateId));
      // 刷新女生状态
      if (selectedGirl?.id) {
        const res = await girls.get(selectedGirl.id);
        if (res.success && res.girl) {
          setSelectedGirl(res.girl);
        }
      }
      toast({ title: '已采纳更新', status: 'success', duration: 1500 });
    } catch {
      toast({ title: '采纳失败', status: 'error' });
    }
  };

  // 忽略单条待审核更新
  const handleRejectUpdate = async (updateId) => {
    try {
      await chatPartner.approveUpdates([updateId], false);
      setPendingUpdates(prev => prev.filter(u => u.id !== updateId));
      toast({ title: '已忽略', status: 'info', duration: 1500 });
    } catch {
      toast({ title: '操作失败', status: 'error' });
    }
  };

  // 全部采纳
  const handleApproveAll = async () => {
    const ids = pendingUpdates.map(u => u.id);
    try {
      await chatPartner.approveUpdates(ids, true);
      setPendingUpdates([]);
      setShowUpdatePanel(false);
      if (selectedGirl?.id) {
        const res = await girls.get(selectedGirl.id);
        if (res.success && res.girl) {
          setSelectedGirl(res.girl);
        }
      }
      toast({ title: `已采纳 ${ids.length} 条更新`, status: 'success', duration: 2000 });
    } catch {
      toast({ title: '批量采纳失败', status: 'error' });
    }
  };

  // 全部忽略
  const handleRejectAll = async () => {
    const ids = pendingUpdates.map(u => u.id);
    try {
      await chatPartner.approveUpdates(ids, false);
      setPendingUpdates([]);
      setShowUpdatePanel(false);
      toast({ title: `已忽略 ${ids.length} 条更新`, status: 'info', duration: 1500 });
    } catch {
      toast({ title: '批量忽略失败', status: 'error' });
    }
  };

  // 格式化热度显示
  const getTensionEmoji = (score) => {
    if (score >= 8) return '🔥🔥🔥';
    if (score >= 7) return '🔥🔥';
    if (score >= 5) return '🔥';
    if (score >= 3) return '❄️';
    return '❄️❄️';
  };

  // 计算热度变化后的值
  const calcNewTension = (current, delta) => {
    return Math.max(0, Math.min(10, current + delta));
  };

  const loadGirlLogs = async () => {
    if (!selectedGirl) return;
    try {
      const res = await chatLogs.byGirl(selectedGirl.id);
      if (res.success) setRecentLogs(res.logs);
    } catch {
      console.error('请求错误');
    }
  };

  const toggleVisibility = async (logId, currentVisible) => {
    try {
      await chatLogs.updateVisibility(logId, !currentVisible);
      toast({ title: '已更新可见性', status: 'success' });
      loadGirlLogs();
    } catch {
      toast({ title: '更新失败', status: 'error' });
    }
  };

  return (
    <Box>
      <Heading color="white" mb={6}>军师工具</Heading>

      <Flex gap={4} h="calc(100vh - 130px)">
        {/* 左侧：客户和女生选择 */}
        <Box w="280px">
          <Card bg="gray.800" h="100%">
            <CardHeader pb={2}>
              <Text color="gray.400" fontSize="sm">选择客户</Text>
            </CardHeader>
            <CardBody pt={0}>
              <Select
                value={selectedClient?.id || ''}
                onChange={e => {
                  const c = clientList.find(c => c.id === e.target.value);
                  if (c) selectClient(c);
                }}
                bg="gray.700"
                mb={4}
              >
                {clientList.map(c => (
                  <option key={c.id} value={c.id}>{c.nickname || c.username}</option>
                ))}
              </Select>

              <Divider borderColor="gray.700" my={4} />

              <Text color="gray.400" fontSize="sm" mb={2}>女生资源 ({girlsList.length})</Text>
              <VStack spacing={2} align="stretch">
                {girlsList.map(girl => (
                  <Box
                    key={girl.id}
                    p={3}
                    bg={selectedGirl?.id === girl.id ? 'teal.600' : 'gray.700'}
                    borderRadius="md"
                    cursor="pointer"
                    onClick={() => selectGirl(girl)}
                  >
                    <Text color="white" fontSize="sm" fontWeight="bold">{girl.name}</Text>
                    <HStack spacing={2} mt={1}>
                      <Badge fontSize="xs">{girl.stage}</Badge>
                      <HStack spacing={1}>
                        <Icon as={HeartIcon} color="red.400" boxSize={3} />
                        <Text color="gray.400" fontSize="xs">{girl.intimacyLevel}</Text>
                      </HStack>
                    </HStack>
                  </Box>
                ))}
                {girlsList.length === 0 && (
                  <Text color="gray.500" fontSize="sm">暂无女生</Text>
                )}
              </VStack>
            </CardBody>
          </Card>
        </Box>

        {/* 中间：工具区域 */}
        <Box flex={1}>
          <Tabs variant="soft-rounded" colorScheme="teal">
            <TabList>
              <Tab>情况咨询</Tab>
              <Tab>实战聊天</Tab>
              <Tab>代聊记录</Tab>
            </TabList>

            <TabPanels>
              {/* 情况咨询 */}
              <TabPanel p={0} pt={4}>
                <Card bg="gray.800" h="calc(100vh - 280px)">
                  <CardBody>
                    <HStack mb={4} justify="space-between">
                      <Select
                        value={coachId}
                        onChange={e => setCoachId(e.target.value)}
                        bg="gray.700"
                        w="200px"
                      >
                        {COACHES.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Select>

                      <HStack
                        bg={deepMode ? 'purple.900' : 'gray.700'}
                        px={3}
                        py={2}
                        borderRadius="md"
                        cursor="pointer"
                        onClick={() => setDeepMode(!deepMode)}
                        border={deepMode ? '1px solid' : 'none'}
                        borderColor="purple.500"
                      >
                        <Icon as={FiZap} color={deepMode ? 'purple.300' : 'gray.400'} boxSize={4} />
                        <Box>
                          <Text color={deepMode ? 'purple.300' : 'gray.300'} fontSize="xs" fontWeight="bold">
                            {deepMode ? '深度分析' : '快速分析'}
                          </Text>
                          <Text color="gray.500" fontSize="xs">
                            {deepMode ? '含工具调用，可记录信号' : '流式输出，快'}
                          </Text>
                        </Box>
                      </HStack>
                    </HStack>

                    <Textarea
                      value={situation}
                      onChange={e => setSituation(e.target.value)}
                      placeholder={deepMode ? '描述当前情况，深度分析会调用工具记录信号、调整热度...' : '描述当前情况...'}
                      bg="gray.700"
                      border="none"
                      color="white"
                      rows={4}
                      mb={4}
                    />

                    <HStack mb={2}>
                      <Button colorScheme={deepMode ? 'purple' : 'teal'} onClick={handleSituation} isLoading={loading}>
                        {deepMode ? '深度分析' : '快速分析'}
                      </Button>
                      {loading && <Spinner size="sm" ml={2} />}
                      {deepMode && (
                        <Badge colorScheme="purple" fontSize="xs">
                          教练可调用：查档案/记信号/调热度/搜经验
                        </Badge>
                      )}
                    </HStack>

                    {(loading || response || aiAnalysis) && (
                      <Box mt={4} p={4} bg="gray.700" borderRadius="md">
                        <HStack mb={2}>
                          <Text color="teal.400" fontSize="sm">
                            {(response || {}).coach || currentCoachName || 'AI教练'}的建议
                          </Text>
                          {deepMode && <Badge colorScheme="purple" fontSize="xs">工具已启用</Badge>}
                        </HStack>
                        <Box
                          ref={analysisRef}
                          color="gray.300"
                          fontSize="sm"
                          style={{ whiteSpace: 'pre-wrap' }}
                        />
                      </Box>
                    )}
                  </CardBody>
                </Card>
              </TabPanel>

              {/* 实战聊天（统一工作流） */}
              <TabPanel p={0} pt={4}>
                <Card bg="gray.800" h="calc(100vh - 280px)">
                  <CardBody display="flex" flexDirection="column" gap={3}>
                    {!selectedGirl ? (
                      <Flex flex={1} align="center" justify="center">
                        <Text color="gray.500">先在左侧选择一个女生开始实战聊天</Text>
                      </Flex>
                    ) : (
                      <>
                        {/* 顶部：模式切换 + 输入区 */}
                        {battleMode === 'analyze' && (
                          <Box>
                            {/* 模式切换 tabs */}
                            <HStack mb={3} bg="gray.700" p={1} borderRadius="md" w="fit-content">
                              <Box
                                px={4}
                                py={2}
                                borderRadius="md"
                                cursor="pointer"
                                bg={chatMode === 'suggest' ? 'teal.600' : 'transparent'}
                                onClick={() => {
                                  setChatMode('suggest');
                                  setOptimizations([]);
                                  setGirlMessage('');
                                }}
                              >
                                <Text color="white" fontSize="sm" fontWeight="bold">
                                  回复建议
                                </Text>
                              </Box>
                              <Box
                                px={4}
                                py={2}
                                borderRadius="md"
                                cursor="pointer"
                                bg={chatMode === 'optimize' ? 'orange.600' : 'transparent'}
                                onClick={() => {
                                  setChatMode('optimize');
                                  setAiSuggestions([]);
                                  setAiAnalysis('');
                                  setMyMessage('');
                                }}
                              >
                                <Text color="white" fontSize="sm" fontWeight="bold">
                                  话术优化
                                </Text>
                              </Box>
                            </HStack>

                            {/* 回复建议模式 */}
                            {chatMode === 'suggest' && (
                              <Box>
                                <HStack mb={2}>
                                  <Icon as={FiMessageSquare} color="blue.400" />
                                  <Text color="gray.400" fontSize="sm">
                                    粘贴{selectedGirl.name}的消息，AI 分析意图并给出回复建议
                                  </Text>
                                </HStack>
                                <HStack>
                                  <Input
                                    flex={1}
                                    value={girlMessage}
                                    onChange={e => setGirlMessage(e.target.value)}
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleGirlMessage();
                                      }
                                    }}
                                    placeholder={`粘贴${selectedGirl.name}的消息...`}
                                    bg="gray.700"
                                    border="none"
                                    color="white"
                                    _placeholder={{ color: 'gray.400' }}
                                  />
                                  <Button
                                    colorScheme="blue"
                                    onClick={handleGirlMessage}
                                    isLoading={isAnalyzing}
                                    isDisabled={!girlMessage.trim()}
                                  >
                                    分析
                                  </Button>
                                </HStack>
                              </Box>
                            )}

                            {/* 话术优化模式 */}
                            {chatMode === 'optimize' && (
                              <Box>
                                <HStack mb={2}>
                                  <Icon as={FiZap} color="orange.400" />
                                  <Text color="gray.400" fontSize="sm">
                                    粘贴你想发的话，AI 帮你优化得更自然、更有温度
                                  </Text>
                                </HStack>
                                <HStack>
                                  <Input
                                    flex={1}
                                    value={myMessage}
                                    onChange={e => setMyMessage(e.target.value)}
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleOptimizeMessage();
                                      }
                                    }}
                                    placeholder="粘贴你想发给她的话..."
                                    bg="gray.700"
                                    border="none"
                                    color="white"
                                    _placeholder={{ color: 'gray.400' }}
                                  />
                                  <Button
                                    colorScheme="orange"
                                    onClick={handleOptimizeMessage}
                                    isLoading={isOptimizing}
                                    isDisabled={!myMessage.trim()}
                                  >
                                    优化
                                  </Button>
                                </HStack>
                              </Box>
                            )}
                          </Box>
                        )}

                        {/* 待审核更新通知 */}
                        {pendingUpdates.length > 0 && (
                          <Box
                            bg="purple.900"
                            borderRadius="md"
                            p={3}
                            cursor="pointer"
                            onClick={() => setShowUpdatePanel(v => !v)}
                            borderLeft="3px solid"
                            borderColor="purple.400"
                          >
                            <HStack justify="space-between">
                              <HStack spacing={2}>
                                <Icon as={FiAlertCircle} color="purple.300" boxSize={4} />
                                <Text color="purple.200" fontSize="sm" fontWeight="bold">
                                  女生状态有更新（{pendingUpdates.length}）
                                </Text>
                              </HStack>
                              <HStack spacing={2}>
                                <Badge colorScheme="purple" fontSize="xs">{pendingUpdates.length} 条待审核</Badge>
                                <Text color="gray.400" fontSize="xs">{showUpdatePanel ? '▲ 收起' : '▼ 查看'}</Text>
                              </HStack>
                            </HStack>

                            {/* Diff 面板 */}
                            {showUpdatePanel && (
                              <Box mt={3}>
                                <HStack mb={2} spacing={2}>
                                  <Button size="xs" colorScheme="green" leftIcon={<Icon as={FiCheck} boxSize={3} />} onClick={(e) => { e.stopPropagation(); handleApproveAll(); }}>
                                    全部采纳
                                  </Button>
                                  <Button size="xs" colorScheme="red" variant="outline" onClick={(e) => { e.stopPropagation(); handleRejectAll(); }}>
                                    全部忽略
                                  </Button>
                                </HStack>

                                <VStack spacing={2} align="stretch">
                                  {pendingUpdates.map(update => {
                                    const current = currentGirlState || {};
                                    const newTension = Math.max(0, Math.min(10, (current.tensionScore || 5) + (update.analysis.fieldChanges.tensionScore?.delta || 0)));
                                    const tensionDelta = update.analysis.fieldChanges.tensionScore?.delta || 0;

                                    return (
                                      <Box key={update.id} p={3} bg="gray.700" borderRadius="md">
                                        <HStack justify="space-between" mb={2}>
                                          <HStack spacing={2}>
                                            <Badge colorScheme="purple" fontSize="xs">{update.style}</Badge>
                                            <Text color="gray.400" fontSize="xs">
                                              {new Date(update.createdAt).toLocaleTimeString()}
                                            </Text>
                                          </HStack>
                                          <HStack spacing={1}>
                                            <Button
                                              size="xs"
                                              colorScheme="green"
                                              leftIcon={<Icon as={FiCheck} boxSize={3} />}
                                              onClick={(e) => { e.stopPropagation(); handleApproveUpdate(update.id); }}
                                            >
                                              采纳
                                            </Button>
                                            <Button
                                              size="xs"
                                              colorScheme="gray"
                                              variant="outline"
                                              onClick={(e) => { e.stopPropagation(); handleRejectUpdate(update.id); }}
                                            >
                                              忽略
                                            </Button>
                                          </HStack>
                                        </HStack>

                                        {/* 采纳的内容 */}
                                        <Text color="gray.300" fontSize="xs" mb={2}>
                                          采纳：「{update.replyText.slice(0, 30)}{update.replyText.length > 30 ? '...' : ''}」
                                        </Text>

                                        {/* 热度变化 diff */}
                                        {tensionDelta !== 0 && (
                                          <HStack spacing={2} mb={1}>
                                            <Text color="gray.400" fontSize="xs" w="60px">热度</Text>
                                            <Text color="gray.300" fontSize="xs">
                                              {current.tensionScore || 5} {getTensionEmoji(current.tensionScore || 5)}
                                            </Text>
                                            <Text color="gray.500" fontSize="xs">→</Text>
                                            <Text color="green.300" fontSize="xs" fontWeight="bold">
                                              {newTension} {getTensionEmoji(newTension)}
                                            </Text>
                                            <Badge colorScheme="green" fontSize="xs">
                                              {tensionDelta > 0 ? '+' : ''}{tensionDelta}
                                            </Badge>
                                          </HStack>
                                        )}

                                        {/* 信号 diff */}
                                        {update.analysis.newSignals?.map((signal, si) => (
                                          <HStack key={si} spacing={2}>
                                            <Text color="gray.400" fontSize="xs" w="60px">信号</Text>
                                            <Badge
                                              colorScheme={signal.type === 'positive' ? 'green' : signal.type === 'negative' ? 'red' : 'gray'}
                                              fontSize="xs"
                                            >
                                              +{signal.type === 'positive' ? '正向' : signal.type === 'negative' ? '负向' : '中性'}
                                            </Badge>
                                            <Text color="gray.300" fontSize="xs">{signal.event}</Text>
                                          </HStack>
                                        ))}
                                      </Box>
                                    );
                                  })}
                                </VStack>
                              </Box>
                            )}
                          </Box>
                        )}

                        {/* 聊天历史 + 分析结果 */}
                        <Box flex={1} overflowY="auto">
                          <VStack spacing={3} align="stretch">
                            {chatHistory.length === 0 && (
                              <Text color="gray.500" textAlign="center" fontSize="sm" py={4}>
                                暂无对话记录
                              </Text>
                            )}

                            {chatHistory.map((msg, index) => (
                              <Box
                                key={index}
                                alignSelf={msg.role === 'user' ? 'flex-end' : 'flex-start'}
                                maxW="80%"
                                p={3}
                                borderRadius="lg"
                                bg={msg.role === 'user'
                                  ? (msg.adopted ? 'teal.600' : 'gray.600')
                                  : 'gray.700'
                                }
                              >
                                <HStack mb={1} spacing={1}>
                                  <Icon
                                    as={msg.role === 'user' ? FiSend : FiMessageSquare}
                                    boxSize={3}
                                    color={msg.role === 'user' ? 'teal.300' : 'gray.400'}
                                  />
                                  <Text fontSize="xs" color="gray.300">
                                    {msg.role === 'user'
                                      ? (msg.adopted ? '我(AI建议)' : '我(代聊)')
                                      : selectedGirl.name}
                                  </Text>
                                </HStack>
                                <Text color="white" fontSize="sm" whiteSpace="pre-wrap">{msg.content}</Text>
                              </Box>
                            ))}

                            {aiAnalysis && (
                              <Box p={3} bg="purple.900" borderRadius="lg" borderLeft="3px solid" borderColor="purple.400">
                                <HStack mb={2}>
                                  <Icon as={FiTarget} color="purple.400" boxSize={4} />
                                  <Text color="purple.300" fontSize="sm" fontWeight="bold">AI分析</Text>
                                </HStack>
                                <Text color="gray.200" fontSize="sm" whiteSpace="pre-wrap">{aiAnalysis}</Text>
                              </Box>
                            )}

                            {aiSuggestions.length > 0 && (
                              <Box p={3} bg="blue.900" borderRadius="lg" borderLeft="3px solid" borderColor="blue.400">
                                <HStack mb={2}>
                                  <Icon as={FiMessageSquare} color="blue.400" boxSize={4} />
                                  <Text color="blue.300" fontSize="sm" fontWeight="bold">回复建议（点击采纳）</Text>
                                </HStack>
                                <VStack spacing={2} align="stretch">
                                  {aiSuggestions.map((s, i) => (
                                    <Box
                                      key={i}
                                      p={3}
                                      bg="gray.700"
                                      borderRadius="md"
                                      cursor="pointer"
                                      _hover={{ bg: 'teal.700', transform: 'translateX(4px)' }}
                                      transition="all 0.15s"
                                      onClick={() => handleSelectSuggestion(s)}
                                    >
                                      <HStack justify="space-between" mb={1}>
                                        <Badge colorScheme="blue" fontSize="xs">{s.style || '建议'}</Badge>
                                        <Text color="gray.400" fontSize="xs">{s.intention || ''}</Text>
                                      </HStack>
                                      <Text color="white" fontSize="sm">{s.text || s.reply || s}</Text>
                                    </Box>
                                  ))}
                                </VStack>
                              </Box>
                            )}

                            {/* 话术优化结果 */}
                            {optimizations.length > 0 && (
                              <Box p={3} bg="orange.900" borderRadius="lg" borderLeft="3px solid" borderColor="orange.400">
                                <HStack mb={2}>
                                  <Icon as={FiZap} color="orange.400" boxSize={4} />
                                  <Text color="orange.300" fontSize="sm" fontWeight="bold">话术优化（点击采纳）</Text>
                                </HStack>
                                <VStack spacing={2} align="stretch">
                                  {optimizations.map((opt, i) => (
                                    <Box
                                      key={i}
                                      p={3}
                                      bg="gray.700"
                                      borderRadius="md"
                                      cursor="pointer"
                                      _hover={{ bg: 'teal.700', transform: 'translateX(4px)' }}
                                      transition="all 0.15s"
                                      onClick={() => handleSelectSuggestion(opt)}
                                    >
                                      <HStack justify="space-between" mb={1}>
                                        <Badge colorScheme="orange" fontSize="xs">{opt.style || '优化版'}</Badge>
                                        <Text color="gray.400" fontSize="xs">{opt.point || ''}</Text>
                                      </HStack>
                                      <Text color="white" fontSize="sm">{opt.text || opt.reply || opt}</Text>
                                    </Box>
                                  ))}
                                </VStack>
                              </Box>
                            )}

                            {isOptimizing && (
                              <Box p={3} bg="gray.700" borderRadius="lg" alignSelf="flex-start">
                                <HStack spacing={2}>
                                  <Spinner size="sm" color="orange.400" />
                                  <Text color="gray.400" fontSize="sm">话术优化中...</Text>
                                </HStack>
                              </Box>
                            )}

                            {isAnalyzing && (
                              <Box p={3} bg="gray.700" borderRadius="lg" alignSelf="flex-start">
                                <HStack spacing={2}>
                                  <Spinner size="sm" color="teal.400" />
                                  <Text color="gray.400" fontSize="sm">AI分析中...</Text>
                                </HStack>
                              </Box>
                            )}

                            <div ref={messagesEndRef} />
                          </VStack>
                        </Box>

                        {/* 底部：回复编辑区 */}
                        <Box>
                          <Textarea
                            value={sendingContent}
                            onChange={e => setSendingContent(e.target.value)}
                            placeholder="输入回复内容，或点击上方建议采纳..."
                            bg="gray.700"
                            border="none"
                            color="white"
                            rows={2}
                            mb={2}
                            _placeholder={{ color: 'gray.400' }}
                          />

                          <HStack>
                            <Button
                              colorScheme="teal"
                              onClick={handleSend}
                              isDisabled={!sendingContent.trim()}
                              leftIcon={<Icon as={FiSend} />}
                            >
                              发送
                            </Button>
                            <HStack
                              bg="gray.700"
                              px={3}
                              py={2}
                              borderRadius="md"
                              cursor="pointer"
                              onClick={() => setVisibleToClient(!visibleToClient)}
                            >
                              <Box
                                w="16px"
                                h="16px"
                                borderRadius="sm"
                                border="2px solid"
                                borderColor={visibleToClient ? 'teal.400' : 'gray.500'}
                                bg={visibleToClient ? 'teal.400' : 'transparent'}
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                              >
                                {visibleToClient && <Text fontSize="xs">✓</Text>}
                              </Box>
                              <Text color="gray.300" fontSize="xs">推送客户</Text>
                            </HStack>
                            <Box flex={1} />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleClearChat}
                              color="gray.400"
                              isDisabled={chatHistory.length === 0 && !girlMessage.trim()}
                            >
                              清除
                            </Button>
                            {battleMode === 'manual' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setBattleMode('analyze');
                                  setAiSuggestions([]);
                                  setAiAnalysis('');
                                  setOptimizations([]);
                                  setSendingContent('');
                                  setOptimized(null);
                                  setGirlMessage('');
                                  setMyMessage('');
                                }}
                                color="teal.400"
                              >
                                继续分析
                              </Button>
                            )}
                          </HStack>

                          {optimized && (
                            <Box mt={2} p={2} bg="gray.700" borderRadius="md">
                              <Text color="teal.400" fontSize="xs">优化说明：{optimized.reason}</Text>
                            </Box>
                          )}
                        </Box>
                      </>
                    )}
                  </CardBody>
                </Card>
              </TabPanel>

              {/* 代聊记录 */}
              <TabPanel p={0} pt={4}>
                <Card bg="gray.800" h="calc(100vh - 280px)">
                  <CardBody overflowY="auto">
                    {!selectedGirl ? (
                      <Flex flex={1} align="center" justify="center" h="100%">
                        <Text color="gray.500">先选择一个女生查看代聊记录</Text>
                      </Flex>
                    ) : recentLogs.length === 0 ? (
                      <Flex flex={1} align="center" justify="center" h="100%">
                        <Text color="gray.500">暂无代聊记录</Text>
                      </Flex>
                    ) : (
                      <VStack spacing={3} align="stretch">
                        {recentLogs.map(log => (
                          <Box key={log.id} p={4} bg="gray.700" borderRadius="md">
                            <HStack justify="space-between" mb={2}>
                              <HStack spacing={2}>
                                {log.aiAdopted && (
                                  <Badge colorScheme="purple" fontSize="xs">AI建议</Badge>
                                )}
                                <Text color="gray.500" fontSize="xs">
                                  {new Date(log.createdAt).toLocaleString()}
                                </Text>
                              </HStack>
                              <Button
                                size="xs"
                                colorScheme={log.isVisibleToClient ? 'green' : 'gray'}
                                variant={log.isVisibleToClient ? 'solid' : 'outline'}
                                onClick={() => toggleVisibility(log.id, log.isVisibleToClient)}
                              >
                                {log.isVisibleToClient ? '已推送' : '未推送'}
                              </Button>
                            </HStack>
                            <Text color="white" fontSize="sm" whiteSpace="pre-wrap">{log.content}</Text>
                            {log.aiAnalysis && (
                              <Text color="gray.500" fontSize="xs" mt={1}>
                                {log.aiAnalysis}
                              </Text>
                            )}
                          </Box>
                        ))}
                      </VStack>
                    )}
                  </CardBody>
                </Card>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Box>

        {/* 右侧：选中女生详情 */}
        <Box w="300px">
          <Card bg="gray.800" h="100%">
            <CardHeader pb={2}>
              <Text color="gray.400" fontSize="sm">选中女生</Text>
            </CardHeader>
            <CardBody pt={0}>
              {selectedGirl ? (
                <VStack spacing={3} align="stretch">
                  <Box p={3} bg="gray.700" borderRadius="md">
                    <Text color="white" fontWeight="bold" fontSize="lg">{selectedGirl.name}</Text>
                    <HStack mt={2} spacing={2}>
                      <Badge>{selectedGirl.stage}</Badge>
                      <HStack spacing={1}>
                        <Icon as={HeartIcon} color="red.400" boxSize={4} />
                        <Text color="gray.400">{selectedGirl.intimacyLevel}</Text>
                      </HStack>
                    </HStack>
                  </Box>

                  <SimpleGrid columns={2} gap={2}>
                    <Box p={2} bg="gray.700" borderRadius="md">
                      <Text color="gray.400" fontSize="xs">年龄</Text>
                      <Text color="white">{selectedGirl.age || '-'}</Text>
                    </Box>
                    <Box p={2} bg="gray.700" borderRadius="md">
                      <Text color="gray.400" fontSize="xs">职业</Text>
                      <Text color="white">{selectedGirl.occupation || '-'}</Text>
                    </Box>
                  </SimpleGrid>

                  <Box p={3} bg="gray.700" borderRadius="md">
                    <Text color="gray.400" fontSize="xs">关系热度</Text>
                    <HStack mt={1}>
                      <Text color="white" fontWeight="bold">
                        {selectedGirl.tensionScore || 5}/10
                      </Text>
                      <Text color="orange.400">{getTensionEmoji(selectedGirl.tensionScore || 5)}</Text>
                    </HStack>
                  </Box>

                  <Box p={3} bg="gray.700" borderRadius="md">
                    <Text color="gray.400" fontSize="xs">代聊记录</Text>
                    <HStack mt={1}>
                      <Text color="white" fontSize="sm">{recentLogs.length} 条</Text>
                      <Text color="gray.500" fontSize="xs">
                        · {recentLogs.filter(l => l.aiAdopted).length} 条AI建议
                      </Text>
                    </HStack>
                  </Box>

                  {selectedGirl.notes && (
                    <Box p={3} bg="gray.700" borderRadius="md">
                      <Text color="gray.400" fontSize="xs">备注</Text>
                      <Text color="gray.300" fontSize="sm">{selectedGirl.notes}</Text>
                    </Box>
                  )}
                </VStack>
              ) : (
                <Text color="gray.500" fontSize="sm">选择女生查看详情</Text>
              )}
            </CardBody>
          </Card>
        </Box>
      </Flex>
    </Box>
  );
}

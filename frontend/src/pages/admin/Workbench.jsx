import { useState, useEffect, useRef } from 'react';
import { Box, Flex, Heading, Text, Card, CardBody, CardHeader, Button, Select, Textarea, SimpleGrid, Badge, VStack, HStack, Divider, Spinner, useToast, Tabs, TabList, TabPanels, Tab, TabPanel, Icon, Input } from '@chakra-ui/react';
import { clients, girls, aiCoach, chatLogs, chatPartner } from '../../utils/api';
import { FiSend, FiMessageSquare, FiTarget } from 'react-icons/fi';
import { HeartIcon, BrainIcon } from '../../components/Icons';

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
  const [suggestions, setSuggestions] = useState(null);
  const [situation, setSituation] = useState('');
  const [coachId, setCoachId] = useState('general');
  const [lastMessage, setLastMessage] = useState('');
  const [optimized, setOptimized] = useState(null);
  const [sendingContent, setSendingContent] = useState('');
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [recentLogs, setRecentLogs] = useState([]);
  const [fastMode, setFastMode] = useState(false);
  const toast = useToast();

  // 实战聊天状态
  const [chatHistory, setChatHistory] = useState([]);
  const [girlMessage, setGirlMessage] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const messagesEndRef = useRef(null);
  const analysisRef = useRef(null); // 用于直接更新DOM

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, aiSuggestions]);

  const loadClients = async () => {
    try {
      const res = await clients.list();
      if (res.success) {
        setClientList(res.clients);
        if (res.clients.length > 0) {
          selectClient(res.clients[0]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectClient = async (client) => {
    setSelectedClient(client);
    setSelectedGirl(null);
    setResponse(null);
    setSuggestions(null);
    try {
      const res = await girls.list({ clientId: client.id });
      if (res.success) {
        setGirlsList(res.girls);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectGirl = async (girl) => {
    setSelectedGirl(girl);
    setResponse(null);
    setSuggestions(null);
    setOptimized(null);
    setRecentLogs([]);
    // 加载该女生的代聊日志
    try {
      const res = await chatLogs.byGirl(girl.id);
      if (res.success) {
        setRecentLogs(res.logs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 情况咨询 - 真流式（直接DOM更新）
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
      const response = await fetch(`${apiUrl}/api/ai-coach/situation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          situation,
          coachId,
          girlId: selectedGirl?.id,
          stream: true
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let analysis = '';

      // 初始化显示区域
      if (analysisRef.current) {
        analysisRef.current.innerHTML = '';
      }

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
                // 直接更新 DOM 实现真流式
                if (analysisRef.current) {
                  analysisRef.current.innerHTML = analysis.replace(/\n/g, '<br>');
                }
              }
              if (parsed.error) {
                toast({ title: '分析失败', status: 'error' });
              }
            } catch (e) {}
          }
        }
      }

      // 流式结束后更新React状态
      setAiAnalysis(analysis);
      setResponse({ coach: coachName, analysis });
    } catch (e) {
      console.error(e);
      toast({ title: '分析失败', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 回复建议
  const handleSuggestions = async () => {
    if (!lastMessage.trim()) return;
    setLoading(true);
    try {
      const res = await aiCoach.replySuggestions({
        girlId: selectedGirl?.id,
        lastMessage
      });
      if (res.success) {
        setSuggestions(res.suggestions);
      }
    } catch (e) {
      toast({ title: '生成失败', status: 'error' });
    } finally {
      setLoading(false);
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
        // 刷新日志列表
        loadGirlLogs();
      }
    } catch (e) {
      toast({ title: '保存失败', status: 'error' });
    }
  };

  // 加载女生代聊日志
  const loadGirlLogs = async () => {
    if (!selectedGirl) return;
    try {
      const res = await chatLogs.byGirl(selectedGirl.id);
      if (res.success) {
        setRecentLogs(res.logs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 切换日志可见性
  const toggleVisibility = async (logId, currentVisible) => {
    try {
      await chatLogs.updateVisibility(logId, !currentVisible);
      toast({ title: '已更新可见性', status: 'success' });
      loadGirlLogs();
    } catch (e) {
      toast({ title: '更新失败', status: 'error' });
    }
  };

  // 选择建议
  const selectSuggestion = (content) => {
    setSendingContent(content);
    setOptimized(null);
  };

  // 优化回复
  const handleOptimize = async () => {
    if (!sendingContent.trim()) return;
    setLoading(true);
    try {
      const res = await aiCoach.optimizeReply({ originalReply: sendingContent });
      if (res.success) {
        setOptimized(res.optimized);
        setSendingContent(res.optimized.optimized);
      }
    } catch (e) {
      toast({ title: '优化失败', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 实战聊天：粘贴女生消息并获取AI分析和建议
  const handleGirlMessage = async () => {
    if (!girlMessage.trim()) return;
    if (!selectedGirl) {
      toast({ title: '请先选择女生', status: 'warning' });
      return;
    }

    setIsAnalyzing(true);

    // 添加女生消息到聊天历史
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
        setAiAnalysis(res.analysis);
        setAiSuggestions(res.suggestions || []);
      }
    } catch (e) {
      toast({ title: 'AI分析失败', status: 'error' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 实战聊天：选择建议回复
  const handleSelectSuggestion = async (suggestion) => {
    if (!selectedGirl || !selectedClient) return;

    try {
      // 添加到聊天历史
      setChatHistory(prev => [...prev, { role: 'user', content: suggestion }]);

      // 保存到代聊记录
      await chatLogs.create({
        girlId: selectedGirl.id,
        clientId: selectedClient.id,
        receiverName: selectedGirl.name,
        content: suggestion,
        aiAdopted: true
      });

      // 清空建议
      setAiSuggestions([]);
      setAiAnalysis('');

      toast({ title: '已保存到代聊记录', status: 'success' });
    } catch (e) {
      toast({ title: '保存失败', status: 'error' });
    }
  };

  // 实战聊天：清除会话
  const handleClearChat = () => {
    setChatHistory([]);
    setAiAnalysis('');
    setAiSuggestions([]);
  };

  // 实战聊天：键盘发送
  const handleGirlMessageKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGirlMessage();
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
              <Tab>回复建议</Tab>
              <Tab>代聊发送</Tab>
              <Tab>实战聊天</Tab>
            </TabList>

            <TabPanels>
              {/* 情况咨询 */}
              <TabPanel p={0} pt={4}>
                <Card bg="gray.800" h="calc(100vh - 280px)">
                  <CardBody>
                    <Select
                      value={coachId}
                      onChange={e => setCoachId(e.target.value)}
                      bg="gray.700"
                      w="200px"
                      mb={4}
                    >
                      {COACHES.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>

                    <Textarea
                      value={situation}
                      onChange={e => setSituation(e.target.value)}
                      placeholder="描述当前情况..."
                      bg="gray.700"
                      border="none"
                      color="white"
                      rows={4}
                      mb={4}
                    />

                    <Button colorScheme="teal" onClick={handleSituation} isLoading={loading}>
                      分析
                    </Button>

                    {loading && <Spinner size="sm" ml={4} />}

                    {(loading || response) && (
                      <Box mt={6} p={4} bg="gray.700" borderRadius="md">
                        <Text color="teal.400" fontSize="sm" mb={2}>{(response || {}).coach || currentCoachName || 'AI教练'}的建议</Text>
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

              {/* 回复建议 */}
              <TabPanel p={0} pt={4}>
                <Card bg="gray.800" h="calc(100vh - 280px)">
                  <CardBody>
                    <Textarea
                      value={lastMessage}
                      onChange={e => setLastMessage(e.target.value)}
                      placeholder="输入对方最后一条消息..."
                      bg="gray.700"
                      border="none"
                      color="white"
                      rows={3}
                      mb={4}
                    />

                    <Button colorScheme="teal" onClick={handleSuggestions} isLoading={loading}>
                      生成回复建议
                    </Button>

                    {suggestions && (
                      <VStack spacing={3} mt={6} align="stretch">
                        {(suggestions.options || []).map((opt, i) => (
                          <Box
                            key={i}
                            p={4}
                            bg="gray.700"
                            borderRadius="md"
                            cursor="pointer"
                            _hover={{ bg: 'teal.700' }}
                            onClick={() => selectSuggestion(opt.reply)}
                          >
                            <HStack justify="space-between" mb={1}>
                              <Badge colorScheme="teal">{opt.type}</Badge>
                            </HStack>
                            <Text color="white">{opt.reply}</Text>
                            <Text color="gray.400" fontSize="xs" mt={1}>{opt.intention}</Text>
                          </Box>
                        ))}
                        {suggestions.raw && (
                          <Box p={4} bg="gray.700" borderRadius="md">
                            <Text color="gray.400" fontSize="sm">原始输出:</Text>
                            <Text color="white" whiteSpace="pre-wrap">{suggestions.raw}</Text>
                          </Box>
                        )}
                      </VStack>
                    )}
                  </CardBody>
                </Card>
              </TabPanel>

              {/* 代聊发送 */}
              <TabPanel p={0} pt={4}>
                <Card bg="gray.800" h="calc(100vh - 280px)">
                  <CardBody>
                    <Textarea
                      value={sendingContent}
                      onChange={e => setSendingContent(e.target.value)}
                      placeholder="输入要发送的内容..."
                      bg="gray.700"
                      border="none"
                      color="white"
                      rows={4}
                      mb={4}
                    />

                    <HStack mb={4}>
                      <Button colorScheme="teal" onClick={handleSend} isDisabled={!sendingContent.trim()}>
                        保存代聊记录
                      </Button>
                      <Button variant="outline" onClick={handleOptimize} isLoading={loading} isDisabled={!sendingContent.trim()}>
                        优化
                      </Button>
                      <Box flex={1} />
                      <HStack
                        bg="gray.700"
                        px={3}
                        py={2}
                        borderRadius="md"
                        cursor="pointer"
                        onClick={() => setVisibleToClient(!visibleToClient)}
                      >
                        <Box
                          w="18px"
                          h="18px"
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
                        <Text color="gray.300" fontSize="sm">推送给客户</Text>
                      </HStack>
                    </HStack>

                    {optimized && (
                      <Box mt={4} p={4} bg="gray.700" borderRadius="md">
                        <Text color="teal.400" fontSize="sm" mb={2}>优化说明</Text>
                        <Text color="gray.300" fontSize="sm">{optimized.reason}</Text>
                      </Box>
                    )}

                    {/* 最近代聊记录 */}
                    {recentLogs.length > 0 && (
                      <Box mt={6}>
                        <Text color="gray.400" fontSize="sm" mb={2}>最近代聊记录</Text>
                        <VStack spacing={2} align="stretch" maxH="200px" overflowY="auto">
                          {recentLogs.slice(0, 5).map(log => (
                            <HStack key={log.id} p={3} bg="gray.700" borderRadius="md" justify="space-between">
                              <Box flex={1}>
                                <Text color="white" fontSize="sm" noOfLines={1}>{log.content}</Text>
                                <Text color="gray.500" fontSize="xs">{new Date(log.createdAt).toLocaleString()}</Text>
                              </Box>
                              <Button
                                size="xs"
                                colorScheme={log.isVisibleToClient ? 'green' : 'gray'}
                                variant={log.isVisibleToClient ? 'solid' : 'outline'}
                                onClick={() => toggleVisibility(log.id, log.isVisibleToClient)}
                              >
                                {log.isVisibleToClient ? '已推送' : '未推送'}
                              </Button>
                            </HStack>
                          ))}
                        </VStack>
                      </Box>
                    )}
                  </CardBody>
                </Card>
              </TabPanel>

              {/* 实战聊天 */}
              <TabPanel p={0} pt={4}>
                <Card bg="gray.800" h="calc(100vh - 280px)">
                  <CardBody display="flex" flexDirection="column">
                    {!selectedGirl ? (
                      <Flex flex={1} align="center" justify="center">
                        <Text color="gray.500">先在左侧选择一个女生开始实战聊天</Text>
                      </Flex>
                    ) : (
                      <>
                        {/* 聊天历史 + AI分析 */}
                        <Box flex={1} overflowY="auto" mb={4}>
                          <VStack spacing={3} align="stretch">
                            {chatHistory.length === 0 && (
                              <Text color="gray.500" textAlign="center" fontSize="sm">
                                粘贴女生发来的消息，AI会分析并给出建议回复
                              </Text>
                            )}

                            {chatHistory.map((msg, index) => (
                              <Box
                                key={index}
                                alignSelf={msg.role === 'user' ? 'flex-end' : 'flex-start'}
                                maxW="80%"
                                p={3}
                                borderRadius="lg"
                                bg={msg.role === 'user' ? 'teal.600' : 'gray.700'}
                              >
                                <HStack mb={1} spacing={1}>
                                  <Icon as={msg.role === 'user' ? FiSend : FiMessageSquare} boxSize={3} />
                                  <Text fontSize="xs" color="gray.300">
                                    {msg.role === 'user' ? '我(代聊)' : selectedGirl.name}
                                  </Text>
                                </HStack>
                                <Text color="white" fontSize="sm" whiteSpace="pre-wrap">{msg.content}</Text>
                              </Box>
                            ))}

                            {/* AI分析 */}
                            {aiAnalysis && (
                              <Box p={3} bg="purple.900" borderRadius="lg" borderLeft="3px solid" borderColor="purple.400">
                                <HStack mb={2}>
                                  <Icon as={FiTarget} color="purple.400" boxSize={4} />
                                  <Text color="purple.300" fontSize="sm" fontWeight="bold">AI分析</Text>
                                </HStack>
                                <Text color="gray.200" fontSize="sm" whiteSpace="pre-wrap">{aiAnalysis}</Text>
                              </Box>
                            )}

                            {/* AI建议 */}
                            {aiSuggestions.length > 0 && (
                              <Box p={3} bg="blue.900" borderRadius="lg" borderLeft="3px solid" borderColor="blue.400">
                                <Text color="blue.300" fontSize="sm" fontWeight="bold" mb={2}>建议回复（点击选择）</Text>
                                <VStack spacing={2} align="stretch">
                                  {aiSuggestions.map((s, i) => (
                                    <Box
                                      key={i}
                                      p={3}
                                      bg="gray.700"
                                      borderRadius="md"
                                      cursor="pointer"
                                      _hover={{ bg: 'teal.600' }}
                                      onClick={() => handleSelectSuggestion(s.text || s.reply || s)}
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

                            {/* 加载中 */}
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

                        {/* 输入框 */}
                        <HStack>
                          <Input
                            flex={1}
                            value={girlMessage}
                            onChange={e => setGirlMessage(e.target.value)}
                            onKeyPress={handleGirlMessageKeyPress}
                            placeholder={`粘贴${selectedGirl.name}发来的消息...`}
                            bg="gray.700"
                            border="none"
                            color="white"
                            _placeholder={{ color: 'gray.400' }}
                          />
                          <Button
                            colorScheme="teal"
                            onClick={handleGirlMessage}
                            isLoading={isAnalyzing}
                            isDisabled={!girlMessage.trim()}
                          >
                            分析
                          </Button>
                          <Button variant="ghost" onClick={handleClearChat} color="gray.400">
                            清除
                          </Button>
                        </HStack>
                      </>
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

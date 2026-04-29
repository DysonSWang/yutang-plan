import { useState, useRef, useEffect } from 'react';
import { Box, VStack, HStack, Input, Button, Text, Card, CardBody, CardHeader, Heading, Select, Textarea, Spinner, Flex, Badge, Icon, Progress, SimpleGrid, Alert, AlertIcon, AlertDescription, Wrap, WrapItem, Tooltip, useToast } from '@chakra-ui/react';
import { girls as girlsApi } from '../../utils/api';
import { FireIcon, SnowIcon } from '../../components/Icons';

const STAGE_COLORS = {
  '陌生': 'gray',
  '搭讪': 'blue',
  '聊天': 'cyan',
  '暧昧': 'orange',
  '约会': 'green',
  '长期': 'teal'
};

function getHeatLevel(score) {
  if (score >= 7) return 'hot';
  if (score >= 5) return 'warm';
  return 'cold';
}

function sortByPriority(girls, staleAlerts) {
  const alertMap = {};
  (staleAlerts || []).forEach(a => {
    const name = a.replace(/^[^\s]+\s/, '').replace(/\s已.*$/, '');
    alertMap[name] = a;
  });

  return [...girls].sort((a, b) => {
    const aAlert = alertMap[a.name];
    const bAlert = alertMap[b.name];
    const aDays = aAlert ? parseInt(aAlert.match(/(\d+)天没联系/)?.[1] || '0') : 0;
    const bDays = bAlert ? parseInt(bAlert.match(/(\d+)天没联系/)?.[1] || '0') : 0;
    const aScore = a.tensionScore || 5;
    const bScore = b.tensionScore || 5;

    const aPriority = aDays * 10 + aScore;
    const bPriority = bDays * 10 + bScore;
    return bPriority - aPriority;
  });
}

export default function AICoach() {
  const [girls, setGirls] = useState([]);
  const [selectedGirlId, setSelectedGirlId] = useState('');
  const [selectedGirl, setSelectedGirl] = useState(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [staleAlert, setStaleAlert] = useState(null);   // 女生档案新鲜度警告
  const [feedbackGiven, setFeedbackGiven] = useState(false); // 是否已反馈
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const analysisRef = useRef(null);
  const analysisText = useRef('');
  const toast = useToast();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';

  useEffect(() => {
    loadGirls();
  }, []);

  useEffect(() => {
    if (selectedGirlId) {
      const girl = girls.find(g => g.id === selectedGirlId);
      setSelectedGirl(girl || null);
    } else {
      setSelectedGirl(null);
    }
  }, [selectedGirlId, girls]);

  // 无女生时加载概览
  useEffect(() => {
    if (!selectedGirlId && girls.length > 0) {
      fetchOverview();
    } else {
      setOverview(null);
    }
  }, [selectedGirlId, girls]);

  const fetchOverview = async () => {
    const token = localStorage.getItem('zhuiai_token');
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';
    setOverviewLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/overview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        // SSE 格式，取第一帧
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.substring(6);
              if (!jsonStr.startsWith('{')) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.cached !== undefined || parsed.staleAlerts) {
                  // 过滤掉 content 类型的帧，只取 meta 帧
                  const hot = girls.filter(g => (g.tensionScore || 5) >= 7).length;
                  const warm = girls.filter(g => (g.tensionScore || 5) >= 5 && (g.tensionScore || 5) < 7).length;
                  const cold = girls.filter(g => (g.tensionScore || 5) < 5).length;
                  setOverview({
                    hot, warm, cold,
                    total: girls.length,
                    staleAlerts: parsed.staleAlerts || [],
                    cached: parsed.cached
                  });
                  return;
                }
              } catch { /* skip malformed frames */ }
            }
          }
        }
      }
    } catch (e) {
      console.error('[AICoach] overview fetch failed:', e);
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadGirls = async () => {
    try {
      const res = await girlsApi.list();
      if (res.success) {
        setGirls(res.girls);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setResponse(null);
    setStaleAlert(null);
    setFeedbackGiven(false);

    const token = localStorage.getItem('zhuiai_token');

    // 初始化显示区域
    analysisText.current = '';
    if (analysisRef.current) {
      analysisRef.current.innerHTML = '';
    }

    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/situation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ situation: question, stream: true, girlId: selectedGirlId || undefined })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
                analysisText.current += parsed.content;
                if (analysisRef.current) {
                  analysisRef.current.innerHTML = analysisText.current.replace(/\n/g, '<br>');
                }
              }
              // 捕获 meta 帧（含 staleAlert）
              if (parsed.meta?.staleAlert) {
                setStaleAlert(parsed.meta.staleAlert);
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      setResponse({ coachName: 'AI统一教练', analysis: analysisText.current });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleNewConversation = async () => {
    try {
      const token = localStorage.getItem('zhuiai_token');
      await fetch(`${apiUrl}/api/ai-coach/new-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ girlId: selectedGirlId || undefined })
      });
    } catch (e) {
      console.error('[AICoach] new-session failed:', e);
    }
    setQuestion('');
    setResponse(null);
    setFeedbackGiven(false);
    setStaleAlert(null);
    analysisText.current = '';
    if (analysisRef.current) {
      analysisRef.current.innerHTML = '';
    }
    toast({
      title: '已开启新对话',
      status: 'info',
      duration: 2000,
      isClosable: true,
    });
  };

  const handleFeedback = async (type) => {
    if (feedbackGiven) return;
    try {
      const token = localStorage.getItem('zhuiai_token');
      await fetch(`${apiUrl}/api/ai-coach/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          // memoryId 由后端从用户 token 推断，暂传空
          type,
          routedType: 'situation'
        })
      });
      setFeedbackGiven(true);
      toast({
        title: '感谢反馈',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (e) {
      console.error('[Feedback] 提交失败:', e);
      toast({
        title: '反馈提交失败',
        status: 'error',
        duration: 2000,
        isClosable: true,
      });
    }
  };

  return (
    <Box>
      <Heading color="white" mb={6}>AI教练</Heading>
      <Text color="gray.400" mb={6}>24小时在线，AI撩妹军师</Text>

      {/* 无女生时：概览面板 */}
      {!selectedGirlId && girls.length > 0 && (
        <Box mb={6}>
          {overviewLoading ? (
            <Card bg="gray.800" mb={4}>
              <CardBody textAlign="center" py={8}>
                <Spinner size="lg" color="teal.400" />
                <Text color="gray.400" mt={4}>加载缘分概况...</Text>
              </CardBody>
            </Card>
          ) : overview ? (
            <>
              {/* 今日缘分概况 */}
              <Card bg="gray.800" mb={4}>
                <CardHeader pb={2}>
                  <Heading size="sm" color="teal.400" data-testid="今日概况">📊 今日缘分概况</Heading>
                </CardHeader>
                <CardBody pt={0}>
                  <HStack spacing={6} mb={3}>
                    <Text color="white" fontSize="lg" fontWeight="bold">总鱼数：{overview.total}</Text>
                    <Badge colorScheme="green" fontSize="md" px={2} py={1}>🔥 {overview.hot} 高</Badge>
                    <Badge colorScheme="orange" fontSize="md" px={2} py={1}>🌡️ {overview.warm} 中</Badge>
                    <Badge colorScheme="blue" fontSize="md" px={2} py={1}>❄️ {overview.cold} 低</Badge>
                  </HStack>
                  {/* 热度分布 */}
                  <Text data-testid="热度分布" display="none">热度分布</Text>
                  <Progress
                    value={overview.hot}
                    max={Math.max(overview.total, 1)}
                    size="sm"
                    colorScheme="orange"
                    bg="gray.700"
                    borderRadius="full"
                    mb={1}
                  />
                  <HStack spacing={0} fontSize="xs" color="gray.500">
                    <Text flex={overview.hot} textAlign="center" color="orange.400">🔥{overview.hot}</Text>
                    <Text flex={overview.warm} textAlign="center" color="orange.300">🌡️{overview.warm}</Text>
                    <Text flex={overview.cold} textAlign="center" color="blue.400">❄️{overview.cold}</Text>
                  </HStack>
                  {overview.cached && (
                    <Text fontSize="xs" color="green.400" mt={2}>✨ 数据未变化，复用缓存</Text>
                  )}
                </CardBody>
              </Card>

              {/* 失联提醒 */}
              {(overview.staleAlerts || []).length > 0 && (
                <Card bg="gray.800" mb={4} borderLeft="4px solid" borderLeftColor="red.500">
                  <CardHeader pb={2}>
                    <Heading size="sm" color="red.400">🚨 失联提醒</Heading>
                  </CardHeader>
                  <CardBody pt={0}>
                    <VStack spacing={2} align="stretch">
                      {(overview.staleAlerts || []).map((alert, i) => {
                        const colorScheme = alert.includes('🚨') ? 'red' : alert.includes('🔴') ? 'orange' : 'yellow';
                        const bg = colorScheme === 'red' ? 'red.900' : colorScheme === 'orange' ? 'orange.900' : 'yellow.900';
                        return (
                          <Alert key={i} status={colorScheme === 'yellow' ? 'warning' : colorScheme} bg={bg} borderRadius="md" py={2}>
                            <AlertIcon />
                            <AlertDescription color="white" fontSize="sm">{alert}</AlertDescription>
                          </Alert>
                        );
                      })}
                    </VStack>
                  </CardBody>
                </Card>
              )}

              {/* 行动优先级 */}
              <Card bg="gray.800" mb={4}>
                <CardHeader pb={2}>
                  <Heading size="sm" color="purple.400">🎯 今日行动优先级</Heading>
                </CardHeader>
                <CardBody pt={0}>
                  <VStack spacing={2} align="stretch">
                    {sortByPriority(girls, overview.staleAlerts || []).slice(0, 5).map((girl, i) => {
                      const heat = getHeatLevel(girl.tensionScore || 5);
                      const heatEmoji = heat === 'hot' ? '🔥' : heat === 'warm' ? '🌡️' : '❄️';
                      const heatColor = heat === 'hot' ? 'red.400' : heat === 'warm' ? 'orange.400' : 'blue.400';
                      const girlAlert = (overview.staleAlerts || []).find(a => a.includes(girl.name));
                      const priorityBadge = girlAlert?.includes('🚨') ? 'red' : girlAlert?.includes('🔴') ? 'orange' : girlAlert?.includes('⚠️') ? 'yellow' : 'gray';
                      return (
                        <HStack key={girl.id} justify="space-between" bg="gray.700" p={2} borderRadius="md">
                          <HStack>
                            <Text color="gray.500" fontSize="sm" minW="20px">{i + 1}.</Text>
                            <Text color="white" fontWeight="bold">{girl.name}</Text>
                            <Badge colorScheme={STAGE_COLORS[girl.stage] || 'gray'} fontSize="xs">{girl.stage || '未知'}</Badge>
                            {girlAlert && <Badge colorScheme={priorityBadge} fontSize="xs">{girlAlert.match(/^[^\s]+/)?.[0]}</Badge>}
                          </HStack>
                          <HStack>
                            <Text color={heatColor} fontSize="sm">{heatEmoji} {(girl.tensionScore || 5).toFixed(1)}</Text>
                            <Icon as={girl.tensionScore >= 5 ? FireIcon : SnowIcon} color={girl.tensionScore >= 5 ? 'orange.400' : 'blue.400'} boxSize={4} />
                          </HStack>
                        </HStack>
                      );
                    })}
                  </VStack>
                </CardBody>
              </Card>

              {(overview.staleAlerts || []).length === 0 && (
                <Alert status="info" bg="blue.900" mb={4} borderRadius="md">
                  <AlertIcon />
                  <AlertDescription color="white">缘分状态良好，所有女生近期都有互动 🎉</AlertDescription>
                </Alert>
              )}
            </>
          ) : null}

          <Text color="gray.500" fontSize="sm" textAlign="center" mt={2}>
            选择上方女生，开始针对性咨询
          </Text>
        </Box>
      )}

      <Card bg="gray.800" mb={6}>
        <CardHeader>
          <Heading size="sm" color="white">咨询问题</Heading>
        </CardHeader>
        <CardBody>
          <VStack spacing={4} align="stretch">
            <HStack spacing={4}>
              <Text color="teal.400" fontSize="sm" fontWeight="bold" px={3} py={2} bg="gray.700" borderRadius="md">
                AI统一教练
              </Text>
              <Tooltip label="新建对话，清空当前上下文" placement="top">
                <Button
                  size="sm"
                  variant="ghost"
                  colorScheme="gray"
                  onClick={handleNewConversation}
                  aria-label="新建对话"
                  fontSize="xs"
                >
                  🔄 新对话
                </Button>
              </Tooltip>
              <Select
                value={selectedGirlId}
                onChange={e => setSelectedGirlId(e.target.value)}
                bg="gray.700"
                border="none"
                color="white"
                flex={1}
                placeholder="选择女生（可选）"
              >
                {girls.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} - {g.stage || '未知'}
                  </option>
                ))}
              </Select>
            </HStack>

            {/* 选中女生信息展示 */}
            {selectedGirl && (
              <Card bg="gray.700" variant="outline">
                <CardBody py={3}>
                  <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                    <HStack>
                      <Text color="white" fontWeight="bold">{selectedGirl.name}</Text>
                      <Badge colorScheme={STAGE_COLORS[selectedGirl.stage] || 'gray'}>
                        {selectedGirl.stage || '未知'}
                      </Badge>
                    </HStack>
                    <HStack>
                      <Text color="gray.400" fontSize="sm">
                        热度: {selectedGirl.tensionScore?.toFixed(1) || '5.0'}/10
                      </Text>
                      <Icon as={selectedGirl.tensionScore >= 5 ? FireIcon : SnowIcon} color={selectedGirl.tensionScore >= 5 ? 'orange.400' : 'blue.400'} />
                    </HStack>
                  </Flex>
                </CardBody>
              </Card>
            )}

            <Textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="描述你的情况，比如：我喜欢一个女生，不知道怎么开口..."
              bg="gray.700"
              border="none"
              color="white"
              rows={4}
              _placeholder={{ color: 'gray.400' }}
            />
            <Button colorScheme="teal" onClick={handleSubmit} isLoading={loading}>
              咨询
            </Button>
          </VStack>
        </CardBody>
      </Card>

      {loading && (
        <Box textAlign="center" py={10}>
          <Spinner size="xl" color="teal.400" />
          <Text color="gray.400" mt={4}>AI教练思考中...</Text>
        </Box>
      )}

      {(loading || response) && (
        <Card bg="gray.800">
          <CardHeader>
            <Flex justify="space-between" align="center">
              <Heading size="sm" color="teal.400">
                {response?.coachName || 'AI统一教练'}的建议
              </Heading>
              {!loading && response && !feedbackGiven && (
                <HStack spacing={2}>
                  <Tooltip label="有用" placement="top">
                    <Button
                      size="sm"
                      variant="ghost"
                      colorScheme="green"
                      onClick={() => handleFeedback('helpful')}
                      aria-label="有用"
                    >
                      👍
                    </Button>
                  </Tooltip>
                  <Tooltip label="不够有用" placement="top">
                    <Button
                      size="sm"
                      variant="ghost"
                      colorScheme="red"
                      onClick={() => handleFeedback('not_helpful')}
                      aria-label="不够有用"
                    >
                      👎
                    </Button>
                  </Tooltip>
                </HStack>
              )}
              {feedbackGiven && (
                <Text fontSize="xs" color="gray.500">感谢反馈</Text>
              )}
            </Flex>
          </CardHeader>
          <CardBody>
            {/* 女生档案新鲜度警告 */}
            {staleAlert && (
              <Alert status="warning" bg="yellow.900" borderRadius="md" mb={3} py={2}>
                <AlertIcon />
                <Text color="yellow.200" fontSize="sm">{staleAlert.message}</Text>
              </Alert>
            )}
            <Box
              ref={analysisRef}
              color="gray.300"
              whiteSpace="pre-wrap"
              sx={{ '& h1,h2,h3': { color: 'white', mt: 4, mb: 2 }, '& p': { mb: 2 } }}
            />
          </CardBody>
        </Card>
      )}
    </Box>
  );
}

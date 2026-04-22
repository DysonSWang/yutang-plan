import { useEffect, useState, useCallback } from 'react';
import {
  Box, Heading, SimpleGrid, Card, CardBody, Stat, StatLabel, StatNumber, StatHelpText,
  Table, Thead, Tbody, Tr, Th, Td, Text, Badge, Button, HStack, VStack, Flex, Select,
  Spinner, Progress, Divider, Icon
} from '@chakra-ui/react';
import { dashboard as dashboardApi, clients as clientsApi } from '../../utils/api';
import { RefreshIcon, SparklesIcon, ClipboardIcon, WarningIcon, CalendarIcon, FireIcon, SnowIcon, InfoIcon } from '../../components/Icons';

const STAGE_COLORS = {
  '背调': 'blue', '建池': 'cyan', '约会': 'green', '锁定': 'orange', '维护': 'teal',
  '陌生': 'gray', '搭讪': 'blue', '聊天': 'cyan', '暧昧': 'orange', '长期': 'teal'
};

const ALERT_COLORS = {
  warning: 'orange',
  danger: 'red',
  info: 'blue'
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    clientCount: 0, girlCount: 0,
    clientStageStats: {}, girlStageStats: {}, avgTension: '5.0'
  });
  const [clientList, setClientList] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [todayTasks, setTodayTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [weekTasks, setWeekTasks] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState('');
  const [briefUpdatedAt, setBriefUpdatedAt] = useState(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const statsRes = await dashboardApi.stats(selectedClientId);
      if (statsRes.success) {
        setStats({
          clientCount: statsRes.clientCount,
          girlCount: statsRes.girlCount,
          clientStageStats: statsRes.clientStageStats,
          girlStageStats: statsRes.girlStageStats,
          avgTension: statsRes.avgTension
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedClientId]);

  const loadInitialData = async () => {
    try {
      const res = await clientsApi.list();
      if (res.success) {
        setClientList(res.clients);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadInitialData();
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadStats();
  }, [selectedClientId, loadStats]);

  // 轮询异步分析结果
  const pollAnalyzeResult = async (jobId, maxAttempts = 90) => {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000)); // 2秒轮询间隔
      try {
        const res = await dashboardApi.analyzeResult(jobId);
        if (res.success && res.status === 'completed') {
          return { success: true, result: res.result };
        }
        if (res.success && res.status === 'failed') {
          return { success: false, error: res.error };
        }
        // 更新进度提示
        setAnalyzeProgress(`分析中... ${Math.min(100, Math.round((i / maxAttempts) * 100))}%`);
      } catch (e) {
        console.error('轮询失败:', e);
      }
    }
    return { success: false, error: '超时' };
  };

  const handleAnalyzeAll = async () => {
    setAnalyzing(true);
    setAnalyzeProgress('正在启动分析...');
    try {
      // 启动异步分析
      const res = await dashboardApi.analyzeAll(selectedClientId);
      if (res.success && res.jobId) {
        setAnalyzeProgress('AI分析中...');
        // 轮询获取结果
        const pollResult = await pollAnalyzeResult(res.jobId);
        if (pollResult.success && pollResult.result) {
          if (pollResult.result.todayTasks) setTodayTasks(pollResult.result.todayTasks);
          if (pollResult.result.alerts) setAlerts(pollResult.result.alerts);
          if (pollResult.result.weekTasks) setWeekTasks(pollResult.result.weekTasks);
          setBriefUpdatedAt(new Date().toISOString());
          setAnalyzeProgress('分析完成');
        } else {
          setAnalyzeProgress('分析失败: ' + (pollResult.error || '未知错误'));
        }
      }
    } catch (e) {
      console.error(e);
      setAnalyzeProgress('分析失败');
    } finally {
      setAnalyzing(false);
      // 3秒后清除进度提示
      setTimeout(() => setAnalyzeProgress(''), 3000);
    }
  };

  const getTensionIcon = (score) => {
    if (score >= 7) return <Icon as={FireIcon} color="red.400" />;
    if (score >= 5) return <Icon as={FireIcon} color="orange.400" />;
    return <Icon as={SnowIcon} color="gray.400" />;
  };

  const getTensionColor = (score) => {
    if (score >= 7) return 'red.400';
    if (score >= 5) return 'orange.400';
    return 'gray.400';
  };

  const renderStageBar = (stageStats, total, colorScheme = 'teal') => {
    if (!total || total === 0 || !stageStats) return null;
    return (
      <VStack spacing={1} align="stretch" w="100%">
        {Object.entries(stageStats).map(([stage, count]) => {
          const pct = Math.round((count / total) * 100);
          return (
            <Flex key={stage} align="center" fontSize="xs">
              <Text w="50px" color="gray.400">{stage}</Text>
              <Box flex={1} mx={2}>
                <Progress value={pct} size="sm" colorScheme={colorScheme} borderRadius="full" />
              </Box>
              <Text w="30px" textAlign="right" color="gray.400">{count}</Text>
            </Flex>
          );
        })}
      </VStack>
    );
  };

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={6} wrap="wrap" gap={4}>
        <Heading color="white">操盘手工作台</Heading>
        <HStack>
          <Button size="sm" onClick={loadStats} isLoading={loading} transition="all 0.15s ease" _hover={{ transform: 'translateY(-1px)' }} leftIcon={<Icon as={RefreshIcon} />}>刷新</Button>
          <Button
            size="sm"
            colorScheme="teal"
            onClick={handleAnalyzeAll}
            isLoading={analyzing}
            transition="all 0.15s ease"
            _hover={{ transform: 'translateY(-1px)' }}
            leftIcon={<Icon as={SparklesIcon} />}
          >
            AI分析
          </Button>
        </HStack>
      </Flex>

      {/* 分析进度提示 */}
      {analyzeProgress && (
        <Box mb={4} p={3} bg="teal.900" borderRadius="md">
          <Text color="teal.200" fontSize="sm">{analyzeProgress}</Text>
        </Box>
      )}

      {loading ? (
        <Box textAlign="center" py={20}>
          <Spinner size="xl" color="teal.400" />
          <Text color="gray.400" mt={4}>加载中...</Text>
        </Box>
      ) : (
        <VStack spacing={6} align="stretch">
          {/* 统计卡片 */}
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
            <Card bg="gray.800">
              <CardBody py={4}>
                <Stat size="sm">
                  <StatLabel color="gray.400">客户数量</StatLabel>
                  <StatNumber color="teal.400">{stats.clientCount}</StatNumber>
                  <StatHelpText color="gray.500">活跃客户</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
            <Card bg="gray.800">
              <CardBody py={4}>
                <Stat size="sm">
                  <StatLabel color="gray.400">女生资源</StatLabel>
                  <StatNumber color="teal.400">{stats.girlCount}</StatNumber>
                  <StatHelpText color="gray.500">总数</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
            <Card bg="gray.800">
              <CardBody py={4}>
                <Stat size="sm">
                  <StatLabel color="gray.400">今日待办</StatLabel>
                  <StatNumber color="orange.400">{todayTasks.length}</StatNumber>
                  <StatHelpText color="gray.500">待处理</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
            <Card bg="gray.800">
              <CardBody py={4}>
                <Stat size="sm">
                  <StatLabel color="gray.400">平均热度</StatLabel>
                  <StatNumber color={getTensionColor(parseFloat(stats.avgTension))}>
                    {stats.avgTension} {getTensionIcon(parseFloat(stats.avgTension))}
                  </StatNumber>
                  <StatHelpText color="gray.500">关系热度</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
          </SimpleGrid>

          {/* 客户筛选 + 阶段分布 */}
          <Card bg="gray.800">
            <CardBody>
              <Flex justify="space-between" align="flex-start" wrap="wrap" gap={4}>
                <Box w={{ base: '100%', md: '300px' }}>
                  <Text color="gray.400" fontSize="sm" mb={2}>按客户筛选</Text>
                  <Select
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    bg="gray.700"
                    border="none"
                    color="white"
                    placeholder="全部客户"
                  >
                    {clientList.map(c => (
                      <option key={c.id} value={c.id}>{c.nickname || c.username}</option>
                    ))}
                  </Select>
                </Box>

                <Box flex={1} minW="200px">
                  <Text color="gray.400" fontSize="sm" mb={2}>客户阶段分布</Text>
                  {renderStageBar(stats.clientStageStats, stats.clientCount, 'blue')}
                </Box>

                <Box flex={1} minW="200px">
                  <Text color="gray.400" fontSize="sm" mb={2}>女生阶段分布</Text>
                  {renderStageBar(stats.girlStageStats, stats.girlCount, 'teal')}
                </Box>
              </Flex>
            </CardBody>
          </Card>

          {/* 今日待办 + 重要提醒 */}
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
            <Card bg="gray.800">
              <CardBody>
                <Flex justify="space-between" align="center" mb={4}>
                  <HStack>
                    <Icon as={ClipboardIcon} color="teal.400" />
                    <Text color="white" fontWeight="bold">今日待办 ({todayTasks.length})</Text>
                  </HStack>
                  {briefUpdatedAt && (
                    <Text color="gray.500" fontSize="xs">
                      更新: {new Date(briefUpdatedAt).toLocaleString('zh-CN')}
                    </Text>
                  )}
                </Flex>
                {todayTasks.length === 0 ? (
                  <Text color="gray.500" textAlign="center" py={8}>暂无待办</Text>
                ) : (
                  <VStack spacing={3} align="stretch">
                    {todayTasks.slice(0, 5).map((task, idx) => (
                      <Card key={idx} bg="gray.700" variant="outline" _hover={{ borderColor: 'teal.500', transform: 'translateY(-1px)' }} transition="all 0.15s ease" cursor="pointer">
                        <CardBody py={3} px={4}>
                          <Flex justify="space-between" align="flex-start" wrap="wrap" gap={2}>
                            <Box>
                              <HStack mb={1}>
                                <Text color="white" fontWeight="bold">{task.girlName}</Text>
                                <Badge colorScheme={STAGE_COLORS[task.stage] || 'gray'}>{task.stage}</Badge>
                                <HStack>
                                  <Text fontSize="sm" color={getTensionColor(task.tensionScore)}>
                                    {task.tensionScore?.toFixed(1) || '5.0'}
                                  </Text>
                                  {getTensionIcon(task.tensionScore)}
                                </HStack>
                              </HStack>
                              <Text color="gray.300" fontSize="sm">{task.action}</Text>
                              {task.reason && (
                                <Text color="gray.500" fontSize="xs" mt={1}>{task.reason}</Text>
                              )}
                            </Box>
                            <Badge colorScheme={task.priority === 'P0' ? 'red' : 'orange'} alignSelf="flex-start">
                              {task.priority || 'P1'}
                            </Badge>
                          </Flex>
                        </CardBody>
                      </Card>
                    ))}
                  </VStack>
                )}
              </CardBody>
            </Card>

            <Card bg="gray.800">
              <CardBody>
                <Flex justify="space-between" align="center" mb={4}>
                  <HStack>
                    <Icon as={WarningIcon} color="orange.400" />
                    <Text color="white" fontWeight="bold">重要提醒 ({alerts.length})</Text>
                  </HStack>
                  {briefUpdatedAt && (
                    <Text color="gray.500" fontSize="xs">
                      更新: {new Date(briefUpdatedAt).toLocaleString('zh-CN')}
                    </Text>
                  )}
                </Flex>
                {alerts.length === 0 ? (
                  <Text color="gray.500" textAlign="center" py={8}>暂无重要提醒</Text>
                ) : (
                  <VStack spacing={3} align="stretch">
                    {alerts.map((alert, idx) => (
                      <Card key={idx} bg="gray.700" variant="outline" borderLeft="4px solid" borderLeftColor={`${ALERT_COLORS[alert.type] || 'gray'}.400`} _hover={{ transform: 'translateY(-1px)' }} transition="all 0.15s ease" cursor="pointer">
                        <CardBody py={3} px={4}>
                          <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                            <Box>
                              <Text color="white" fontWeight="bold">{alert.girlName}</Text>
                              <Text color="gray.300" fontSize="sm" mt={1}>{alert.message}</Text>
                            </Box>
                            <HStack>
                              <Icon as={alert.type === 'danger' ? WarningIcon : InfoIcon} color={`${ALERT_COLORS[alert.type] || 'gray'}.400`} />
                              <Badge colorScheme={ALERT_COLORS[alert.type] || 'gray'}>
                                {alert.type === 'warning' ? '警告' : alert.type === 'danger' ? '危险' : '提示'}
                              </Badge>
                            </HStack>
                          </Flex>
                        </CardBody>
                      </Card>
                    ))}
                  </VStack>
                )}
              </CardBody>
            </Card>
          </SimpleGrid>

          {/* 本周待办 */}
          <Card bg="gray.800">
            <CardBody>
              <HStack mb={4}>
                <Icon as={CalendarIcon} color="teal.400" />
                <Text color="white" fontWeight="bold">本周待办 ({weekTasks.length})</Text>
              </HStack>
              {weekTasks.length === 0 ? (
                <Text color="gray.500" textAlign="center" py={8}>暂无本周待办</Text>
              ) : (
                <Table variant="simple" color="gray.300" size="sm">
                  <Thead>
                    <Tr>
                      <Th color="gray.400">女生</Th>
                      <Th color="gray.400">当前阶段</Th>
                      <Th color="gray.400">目标</Th>
                      <Th color="gray.400">计划</Th>
                      <Th color="gray.400">类型</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {weekTasks.map((task, idx) => (
                      <Tr key={idx} _hover={{ bg: 'gray.700' }} transition="background 0.15s ease">
                        <Td fontWeight="bold">{task.girlName}</Td>
                        <Td><Badge colorScheme={STAGE_COLORS[task.stage] || 'gray'}>{task.stage}</Badge></Td>
                        <Td><Badge colorScheme="teal">{task.targetStage || '-'}</Badge></Td>
                        <Td>{task.action}</Td>
                        <Td><Badge colorScheme={task.type === '约会' ? 'green' : 'orange'}>{task.type}</Badge></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </VStack>
      )}
    </Box>
  );
}

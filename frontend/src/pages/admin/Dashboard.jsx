import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Heading, SimpleGrid, Card, CardBody, Stat, StatLabel, StatNumber, StatHelpText,
  Table, Thead, Tbody, Tr, Th, Td, Text, Badge, Button, HStack, VStack, Flex, Select,
  Spinner, Progress, Divider, Icon
} from '@chakra-ui/react';
import { dashboard as dashboardApi, clients as clientsApi, weeklyReview as weeklyReviewApi } from '../../utils/api';
import { captureError } from '../../utils/frontendErrorCapture';
import useKeepAliveData from '../../hooks/useKeepAliveData';
import { RefreshIcon, SparklesIcon, ClipboardIcon, WarningIcon, CalendarIcon, FireIcon, SnowIcon, InfoIcon, ChartIcon } from '../../components/Icons';

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
  const [stats, setStats] = useState({
    clientCount: 0, girlCount: 0,
    clientStageStats: {}, girlStageStats: {}, avgTension: '5.0'
  });
  const [clientList, setClientList] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const selectedClientIdRef = useRef('');
  const [todayTasks, setTodayTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [weekTasks, setWeekTasks] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState('');
  const [briefUpdatedAt, setBriefUpdatedAt] = useState(null);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  const { isInitialLoad, refresh } = useKeepAliveData(async () => {
    const cid = selectedClientIdRef.current;
    const [statsRes, clientsRes] = await Promise.all([
      dashboardApi.stats(cid),
      clientsApi.list(),
    ]);
    if (statsRes.success) {
      setStats({
        clientCount: statsRes.clientCount,
        girlCount: statsRes.girlCount,
        clientStageStats: statsRes.clientStageStats,
        girlStageStats: statsRes.girlStageStats,
        avgTension: statsRes.avgTension,
      });
    }
    if (clientsRes.success) {
      setClientList(clientsRes.clients);
    }
    return true;
  }, { key: '/admin' });

  // selectedClientId 变化时重新加载
  useEffect(() => {
    selectedClientIdRef.current = selectedClientId;
    refresh();
  }, [selectedClientId, refresh]);

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
        captureError(e, { context: '轮询失败:' });
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
      captureError(e);
      setAnalyzeProgress('分析失败');
    } finally {
      setAnalyzing(false);
      // 3秒后清除进度提示
      setTimeout(() => setAnalyzeProgress(''), 3000);
    }
  };

  const loadWeeklyReview = useCallback(async () => {
    if (!selectedClientId) {
      setWeeklyReport(null);
      return;
    }
    setWeeklyLoading(true);
    try {
      const res = await weeklyReviewApi.get(selectedClientId);
      if (res.success) setWeeklyReport(res.data);
    } catch (e) {
      captureError(e, { context: '加载周报失败:' });
    } finally {
      setWeeklyLoading(false);
    }
  }, [selectedClientId]);

  useEffect(() => {
    loadWeeklyReview();
  }, [loadWeeklyReview]);

  const getTensionIcon = (score) => {
    if (score >= 7) return <Icon as={FireIcon} color="red.400" />;
    if (score >= 5) return <Icon as={FireIcon} color="orange.400" />;
    return <Icon as={SnowIcon} color="rgba(245,240,232,0.4)" />;
  };

  const getTensionColor = (score) => {
    if (score >= 7) return 'red.400';
    if (score >= 5) return 'orange.400';
    return 'rgba(245,240,232,0.4)';
  };

  const renderStageBar = (stageStats, total, colorScheme = 'teal') => {
    if (!total || total === 0 || !stageStats) return null;
    return (
      <VStack spacing={1} align="stretch" w="100%">
        {Object.entries(stageStats).map(([stage, count]) => {
          const pct = Math.round((count / total) * 100);
          return (
            <Flex key={stage} align="center" fontSize="xs">
              <Text w="50px" color="rgba(245,240,232,0.4)">{stage}</Text>
              <Box flex={1} mx={2}>
                <Progress value={pct} size="sm" colorScheme={colorScheme} borderRadius="full" />
              </Box>
              <Text w="30px" textAlign="right" color="rgba(245,240,232,0.4)">{count}</Text>
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
            colorScheme="gold"
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
        <Box mb={4} p={3} bg="gold.900" borderRadius="md">
          <Text color="gold.200" fontSize="sm">{analyzeProgress}</Text>
        </Box>
      )}

      {isInitialLoad ? (
        <Box textAlign="center" py={20}>
          <Spinner size="xl" color="gold.400" />
          <Text color="rgba(245,240,232,0.4)" mt={4}>加载中...</Text>
        </Box>
      ) : (
        <VStack spacing={6} align="stretch">
          {/* 统计卡片 */}
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
            <Card bg="warm.800">
              <CardBody py={4}>
                <Stat size="sm">
                  <StatLabel color="rgba(245,240,232,0.4)">客户数量</StatLabel>
                  <StatNumber color="gold.400">{stats.clientCount}</StatNumber>
                  <StatHelpText color="rgba(245,240,232,0.2)">活跃客户</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
            <Card bg="warm.800">
              <CardBody py={4}>
                <Stat size="sm">
                  <StatLabel color="rgba(245,240,232,0.4)">女生资源</StatLabel>
                  <StatNumber color="gold.400">{stats.girlCount}</StatNumber>
                  <StatHelpText color="rgba(245,240,232,0.2)">总数</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
            <Card bg="warm.800">
              <CardBody py={4}>
                <Stat size="sm">
                  <StatLabel color="rgba(245,240,232,0.4)">今日待办</StatLabel>
                  <StatNumber color="orange.400">{todayTasks.length}</StatNumber>
                  <StatHelpText color="rgba(245,240,232,0.2)">待处理</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
            <Card bg="warm.800">
              <CardBody py={4}>
                <Stat size="sm">
                  <StatLabel color="rgba(245,240,232,0.4)">平均热度</StatLabel>
                  <StatNumber color={getTensionColor(parseFloat(stats.avgTension))}>
                    {stats.avgTension} {getTensionIcon(parseFloat(stats.avgTension))}
                  </StatNumber>
                  <StatHelpText color="rgba(245,240,232,0.2)">关系热度</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
          </SimpleGrid>

          {/* 客户筛选 + 阶段分布 */}
          <Card bg="warm.800">
            <CardBody>
              <Flex justify="space-between" align="flex-start" wrap="wrap" gap={4}>
                <Box w={{ base: '100%', md: '300px' }}>
                  <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>按客户筛选</Text>
                  <Select
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    bg="warm.700"
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
                  <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>客户阶段分布</Text>
                  {renderStageBar(stats.clientStageStats, stats.clientCount, 'blue')}
                </Box>

                <Box flex={1} minW="200px">
                  <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>女生阶段分布</Text>
                  {renderStageBar(stats.girlStageStats, stats.girlCount, 'teal')}
                </Box>
              </Flex>
            </CardBody>
          </Card>

          {/* 今日待办 + 重要提醒 */}
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
            <Card bg="warm.800">
              <CardBody>
                <Flex justify="space-between" align="center" mb={4}>
                  <HStack>
                    <Icon as={ClipboardIcon} color="gold.400" />
                    <Text color="white" fontWeight="bold">今日待办 ({todayTasks.length})</Text>
                  </HStack>
                  {briefUpdatedAt && (
                    <Text color="rgba(245,240,232,0.2)" fontSize="xs">
                      更新: {new Date(briefUpdatedAt).toLocaleString('zh-CN')}
                    </Text>
                  )}
                </Flex>
                {todayTasks.length === 0 ? (
                  <Text color="rgba(245,240,232,0.2)" textAlign="center" py={8}>暂无待办</Text>
                ) : (
                  <VStack spacing={3} align="stretch">
                    {todayTasks.slice(0, 5).map((task, idx) => (
                      <Card key={idx} bg="warm.700" variant="outline" _hover={{ borderColor: 'gold.500', transform: 'translateY(-1px)' }} transition="all 0.15s ease" cursor="pointer">
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
                                <Text color="rgba(245,240,232,0.2)" fontSize="xs" mt={1}>{task.reason}</Text>
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

            <Card bg="warm.800">
              <CardBody>
                <Flex justify="space-between" align="center" mb={4}>
                  <HStack>
                    <Icon as={WarningIcon} color="orange.400" />
                    <Text color="white" fontWeight="bold">重要提醒 ({alerts.length})</Text>
                  </HStack>
                  {briefUpdatedAt && (
                    <Text color="rgba(245,240,232,0.2)" fontSize="xs">
                      更新: {new Date(briefUpdatedAt).toLocaleString('zh-CN')}
                    </Text>
                  )}
                </Flex>
                {alerts.length === 0 ? (
                  <Text color="rgba(245,240,232,0.2)" textAlign="center" py={8}>暂无重要提醒</Text>
                ) : (
                  <VStack spacing={3} align="stretch">
                    {alerts.map((alert, idx) => (
                      <Card key={idx} bg="warm.700" variant="outline" borderLeft="4px solid" borderLeftColor={`${ALERT_COLORS[alert.type] || 'gray'}.400`} _hover={{ transform: 'translateY(-1px)' }} transition="all 0.15s ease" cursor="pointer">
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
          <Card bg="warm.800">
            <CardBody>
              <HStack mb={4}>
                <Icon as={CalendarIcon} color="gold.400" />
                <Text color="white" fontWeight="bold">本周待办 ({weekTasks.length})</Text>
              </HStack>
              {weekTasks.length === 0 ? (
                <Text color="rgba(245,240,232,0.2)" textAlign="center" py={8}>暂无本周待办</Text>
              ) : (
                <Table variant="simple" color="gray.300" size="sm">
                  <Thead>
                    <Tr>
                      <Th color="rgba(245,240,232,0.4)">女生</Th>
                      <Th color="rgba(245,240,232,0.4)">当前阶段</Th>
                      <Th color="rgba(245,240,232,0.4)">目标</Th>
                      <Th color="rgba(245,240,232,0.4)">计划</Th>
                      <Th color="rgba(245,240,232,0.4)">类型</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {weekTasks.map((task, idx) => (
                      <Tr key={idx} _hover={{ bg: 'warm.700' }} transition="background 0.15s ease">
                        <Td fontWeight="bold">{task.girlName}</Td>
                        <Td><Badge colorScheme={STAGE_COLORS[task.stage] || 'gray'}>{task.stage}</Badge></Td>
                        <Td><Badge colorScheme="gold">{task.targetStage || '-'}</Badge></Td>
                        <Td>{task.action}</Td>
                        <Td><Badge colorScheme={task.type === '约会' ? 'green' : 'orange'}>{task.type}</Badge></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </CardBody>
          </Card>

          {/* 本周复盘报告 */}
          <Card bg="warm.800">
            <CardBody>
              <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
                <HStack>
                  <Icon as={ChartIcon} color="gold.400" />
                  <Text color="white" fontWeight="bold">本周复盘报告</Text>
                  {weeklyReport?.generatedAt && (
                    <Text color="rgba(245,240,232,0.2)" fontSize="xs">
                      生成: {new Date(weeklyReport.generatedAt).toLocaleString('zh-CN')}
                    </Text>
                  )}
                </HStack>
                <HStack>
                  <Button
                    size="xs"
                    variant="outline"
                    colorScheme="gold"
                    isLoading={weeklyLoading}
                    onClick={loadWeeklyReview}
                    isDisabled={!selectedClientId}
                  >
                    刷新
                  </Button>
                  <Button
                    size="xs"
                    colorScheme="gold"
                    onClick={async () => {
                      if (!selectedClientId) return;
                      setWeeklyLoading(true);
                      try {
                        const res = await weeklyReviewApi.generate(selectedClientId);
                        if (res.success) setWeeklyReport(res.data);
                      } catch (e) {
                        captureError(e, { context: '生成周报失败:' });
                      } finally {
                        setWeeklyLoading(false);
                      }
                    }}
                    isLoading={weeklyLoading}
                    isDisabled={!selectedClientId}
                  >
                    重新生成
                  </Button>
                </HStack>
              </Flex>

              {!selectedClientId ? (
                <Text color="rgba(245,240,232,0.2)" textAlign="center" py={4}>请先选择客户以查看周报</Text>
              ) : weeklyLoading && !weeklyReport ? (
                <Text color="rgba(245,240,232,0.2)" textAlign="center" py={4}>加载中...</Text>
              ) : weeklyReport ? (
                <VStack spacing={4} align="stretch">
                  {/* 数据总览 */}
                  <SimpleGrid columns={{ base: 2, md: 6 }} spacing={3}>
                    {[
                      { label: '女生总数', value: weeklyReport.totalGirls, color: 'gold.400' },
                      { label: '新增', value: weeklyReport.newGirlsThisWeek, color: 'green.400', help: '本周新增' },
                      { label: '约会', value: weeklyReport.datesThisWeek, color: 'blue.400', help: `完成${weeklyReport.completedDates}次` },
                      { label: '聊天', value: weeklyReport.chatLogsThisWeek, color: 'orange.400', help: `${weeklyReport.chatTrend > 0 ? '↑' : weeklyReport.chatTrend < 0 ? '↓' : ''}${Math.abs(weeklyReport.chatTrend)}%` },
                      { label: '活跃预警', value: weeklyReport.activeAlerts, color: weeklyReport.activeAlerts > 0 ? 'red.400' : 'rgba(245,240,232,0.4)' },
                      { label: 'AI评分', value: weeklyReport.overallScore ?? '-', color: weeklyReport.overallScore ? (weeklyReport.overallScore >= 7 ? 'green.400' : weeklyReport.overallScore >= 4 ? 'orange.400' : 'red.400') : 'rgba(245,240,232,0.4)' },
                    ].map(item => (
                      <Card key={item.label} bg="warm.700" variant="outline">
                        <CardBody py={3} px={3}>
                          <Stat size="sm">
                            <StatLabel color="rgba(245,240,232,0.4)" fontSize="xs">{item.label}</StatLabel>
                            <StatNumber color={item.color} fontSize="lg">{item.value}</StatNumber>
                            {item.help && <StatHelpText color="rgba(245,240,232,0.2)" fontSize="xs">{item.help}</StatHelpText>}
                          </Stat>
                        </CardBody>
                      </Card>
                    ))}
                  </SimpleGrid>

                  {/* 阶段变更 + AI点评 */}
                  <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
                    <Box>
                      <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>阶段变更</Text>
                      <HStack spacing={4}>
                        <HStack>
                          <Text color="green.400" fontWeight="bold">{weeklyReport.stageChanges.upgrades}</Text>
                          <Text color="rgba(245,240,232,0.4)" fontSize="sm">升级</Text>
                        </HStack>
                        <HStack>
                          <Text color="red.400" fontWeight="bold">{weeklyReport.stageChanges.downgrades}</Text>
                          <Text color="rgba(245,240,232,0.4)" fontSize="sm">降级</Text>
                        </HStack>
                        <HStack>
                          <Text color="rgba(245,240,232,0.4)" fontWeight="bold">{weeklyReport.avgTension}</Text>
                          <Text color="rgba(245,240,232,0.4)" fontSize="sm">/10 平均热度</Text>
                        </HStack>
                      </HStack>
                      {weeklyReport.alertStats.total > 0 && (
                        <HStack mt={2} spacing={2} flexWrap="wrap">
                          {weeklyReport.alertStats.byType.P0 > 0 && <Badge colorScheme="red">P0 {weeklyReport.alertStats.byType.P0}</Badge>}
                          {weeklyReport.alertStats.byType.P1 > 0 && <Badge colorScheme="orange">P1 {weeklyReport.alertStats.byType.P1}</Badge>}
                          {weeklyReport.alertStats.byType.P2 > 0 && <Badge colorScheme="gray">P2 {weeklyReport.alertStats.byType.P2}</Badge>}
                          <Text color="rgba(245,240,232,0.2)" fontSize="xs">本周预警</Text>
                        </HStack>
                      )}
                    </Box>

                    <Box>
                      <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>整体评估</Text>
                      {weeklyReport.generated ? (
                        <VStack align="stretch" spacing={2}>
                          <Text color="white" fontSize="sm">{weeklyReport.overallComment || '暂无点评'}</Text>
                          {weeklyReport.strengths?.length > 0 && (
                            <Box>
                              {weeklyReport.strengths.map((s, i) => (
                                <Text key={i} color="green.300" fontSize="xs">+ {s}</Text>
                              ))}
                            </Box>
                          )}
                          {weeklyReport.concerns?.length > 0 && (
                            <Box>
                              {weeklyReport.concerns.map((c, i) => (
                                <Text key={i} color="orange.300" fontSize="xs">⚠ {c}</Text>
                              ))}
                            </Box>
                          )}
                        </VStack>
                      ) : (
                        <Text color="rgba(245,240,232,0.2)" fontSize="sm">AI 未生成评估（可点击"重新生成"）</Text>
                      )}
                    </Box>
                  </SimpleGrid>

                  {/* 下周优先级 */}
                  {weeklyReport.generated && weeklyReport.nextWeekPriorities?.length > 0 && (
                    <Box>
                      <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>下周行动优先级</Text>
                      <VStack spacing={2} align="stretch">
                        {weeklyReport.nextWeekPriorities.map((p, i) => (
                          <Card key={i} bg="warm.700" variant="outline" size="sm">
                            <CardBody py={2} px={3}>
                              <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                                <HStack>
                                  <Badge colorScheme={p.girlName === 'ALL' ? 'teal' : 'blue'}>{p.girlName}</Badge>
                                  <Text color="gray.300" fontSize="sm">{p.priority}</Text>
                                </HStack>
                                <Text color="rgba(245,240,232,0.2)" fontSize="xs">{p.reason}</Text>
                              </Flex>
                            </CardBody>
                          </Card>
                        ))}
                      </VStack>
                    </Box>
                  )}
                </VStack>
              ) : (
                <Text color="rgba(245,240,232,0.2)" textAlign="center" py={4}>暂无周报数据</Text>
              )}
            </CardBody>
          </Card>
        </VStack>
      )}
    </Box>
  );
}

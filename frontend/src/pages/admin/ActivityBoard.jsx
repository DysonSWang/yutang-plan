import { useEffect, useState, useCallback } from 'react';
import {
  Box, Heading, SimpleGrid, Card, CardBody, Stat, StatLabel, StatNumber, StatHelpText,
  Table, Thead, Tbody, Tr, Th, Td, Text, Badge, HStack, VStack, Flex,
  Spinner, Button, Tabs, TabList, TabPanels, Tab, TabPanel,
  Progress, Tooltip, Icon
} from '@chakra-ui/react';
import { FiTrendingUp } from 'react-icons/fi';
import { membership as membershipApi } from '../../utils/api';
import { captureError } from '../../utils/frontendErrorCapture';
const activityApi = membershipApi.activity;

const LEVEL_COLORS = {
  high: { bg: 'green.900', color: 'green.300', label: '高活跃' },
  medium: { bg: 'yellow.900', color: 'yellow.300', label: '中活跃' },
  low: { bg: 'orange.900', color: 'orange.300', label: '低活跃' },
  dormant: { bg: 'gray.800', color: 'gray.400', label: '沉睡' },
};

const LEVEL_ORDER = ['high', 'medium', 'low', 'dormant'];

const TREND_METRICS = {
  users: { label: '累计用户', color: 'purple.300', field: 'cumulativeUsers', unit: '人' },
  dau: { label: '日活跃 (DAU)', color: 'cyan.300', field: 'activeUsers', unit: '人' },
  mau: { label: '月活跃 (MAU)', color: 'teal.300', field: 'mau', unit: '人' },
  newUsers: { label: '每日新增', color: 'blue.300', field: 'newUsers', unit: '人' },
};

export default function ActivityBoard() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [clients, setClients] = useState([]);
  const [dormantUsers, setDormantUsers] = useState([]);
  const [trendDays, setTrendDays] = useState(90);
  const [trend, setTrend] = useState([]);
  const [growth, setGrowth] = useState([]);
  const [growthDays, setGrowthDays] = useState(90);
  const [tabIndex, setTabIndex] = useState(0);
  const [trendMetric, setTrendMetric] = useState('dau');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await activityApi.dashboard();
      if (res.success) {
        setDashboard(res);
        setTrend(res.dailyTrend || []);
      }
    } catch (e) {
      captureError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res = await activityApi.clients();
      if (res.success) {
        setClients(res.clients);
      }
    } catch (e) {
      captureError(e);
    }
  }, []);

  const loadDormantUsers = useCallback(async () => {
    try {
      const res = await activityApi.dormantUsers();
      if (res.success) {
        setDormantUsers(res.dormantUsers);
      }
    } catch (e) {
      captureError(e);
    }
  }, []);

  const loadGrowth = useCallback(async (days) => {
    try {
      const res = await activityApi.growth(days);
      if (res.success) {
        setGrowth(res.growth || []);
      }
    } catch (e) {
      captureError(e);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadClients();
    loadDormantUsers();
    loadGrowth(90);
  }, [loadDashboard, loadClients, loadDormantUsers, loadGrowth]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const getMaxValue = (data, field) => {
    if (!data.length) return 100;
    return Math.max(...data.map(t => t[field] || 0), 1);
  };

  const handleCardClick = (metric) => {
    setTrendMetric(metric);
    setTabIndex(1);
  };

  if (loading && !dashboard) {
    return (
      <Flex justify="center" align="center" minH="400px">
        <Spinner size="xl" />
      </Flex>
    );
  }

  const totalUsers = dashboard?.totalUsers || 0;
  const dau = dashboard?.dau || 0;
  const mau = dashboard?.mau || 0;
  const weeklyActive = dashboard?.weeklyActive || 0;
  const weeklyNew = dashboard?.weeklyNew || 0;
  const dormantUsersCount = dashboard?.dormantUsers || 0;
  const dauRate = totalUsers > 0 ? Math.round((dau / totalUsers) * 100) : 0;
  const mauRate = totalUsers > 0 ? Math.round((mau / totalUsers) * 100) : 0;
  const weeklyActiveRate = totalUsers > 0 ? Math.round((weeklyActive / totalUsers) * 100) : 0;
  const dormantRate = totalUsers > 0 ? Math.round((dormantUsersCount / totalUsers) * 100) : 0;
  const dist = dashboard?.levelDistribution || { high: 0, medium: 0, low: 0, dormant: 0 };
  const featureUsage = dashboard?.weeklyFeatureUsage || { aiCoachCalls: 0, datePlans: 0, chatMessages: 0, girlsAdded: 0, learningActions: 0, moChats: 0 };

  return (
    <Box p={6}>
      <Heading size="lg" mb={6}>分析看板</Heading>

      {/* 汇总指标卡 */}
      <SimpleGrid columns={{ base: 2, md: 3, lg: 6 }} spacing={4} mb={6}>
        <Card cursor="pointer" _hover={{ borderColor: 'purple.400' }} onClick={() => handleCardClick('users')}>
          <CardBody>
            <Stat>
              <Flex align="center" gap={1}>
                <StatLabel>总用户数</StatLabel>
                <Icon as={FiTrendingUp} boxSize={3} color="gray.500" />
              </Flex>
              <StatNumber>{totalUsers}</StatNumber>
              <StatHelpText>人</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card cursor="pointer" _hover={{ borderColor: 'cyan.400' }} onClick={() => handleCardClick('dau')}>
          <CardBody>
            <Stat>
              <Flex align="center" gap={1}>
                <StatLabel>日活跃 (DAU)</StatLabel>
                <Icon as={FiTrendingUp} boxSize={3} color="gray.500" />
              </Flex>
              <StatNumber color="cyan.300">{dau}</StatNumber>
              <StatHelpText>{dauRate}%</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card cursor="pointer" _hover={{ borderColor: 'teal.400' }} onClick={() => handleCardClick('mau')}>
          <CardBody>
            <Stat>
              <Flex align="center" gap={1}>
                <StatLabel>月活跃 (MAU)</StatLabel>
                <Icon as={FiTrendingUp} boxSize={3} color="gray.500" />
              </Flex>
              <StatNumber color="teal.300">{mau}</StatNumber>
              <StatHelpText>{mauRate}%</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat>
              <StatLabel>本周活跃</StatLabel>
              <StatNumber color="green.300">{weeklyActive}</StatNumber>
              <StatHelpText>{weeklyActiveRate}%</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat>
              <StatLabel>本周新增</StatLabel>
              <StatNumber color="blue.300">{weeklyNew}</StatNumber>
              <StatHelpText>人</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat>
              <StatLabel>沉睡用户</StatLabel>
              <StatNumber color="red.300">{dormantUsersCount}</StatNumber>
              <StatHelpText>{dormantRate}%</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
      </SimpleGrid>

      <Tabs variant="soft-rounded" colorScheme="teal" index={tabIndex} onChange={setTabIndex}>
        <TabList mb={4}>
          <Tab>总览</Tab>
          <Tab>活跃趋势</Tab>
          <Tab>沉睡用户</Tab>
        </TabList>

        <TabPanels>
          {/* 总览 Tab */}
          <TabPanel p={0}>
            <SimpleGrid columns={2} spacing={6}>
              {/* 活跃度分布 */}
              <Card>
                <CardBody>
                  <Heading size="md" mb={4}>活跃度分布</Heading>
                  <VStack align="stretch" spacing={3}>
                    {LEVEL_ORDER.map(level => {
                      const count = dist[level];
                      const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
                      return (
                        <Box key={level}>
                          <Flex justify="space-between" mb={1}>
                            <Badge {...LEVEL_COLORS[level]}>{LEVEL_COLORS[level].label}</Badge>
                            <Text fontSize="sm">{count}人 {pct}%</Text>
                          </Flex>
                          <Progress value={pct} size="sm" colorScheme={
                            level === 'high' ? 'green' : level === 'medium' ? 'yellow' : level === 'low' ? 'orange' : 'gray'
                          } />
                        </Box>
                      );
                    })}
                  </VStack>
                </CardBody>
              </Card>

              {/* 本周功能使用 */}
              <Card>
                <CardBody>
                  <Heading size="md" mb={4}>本周功能使用</Heading>
                  <VStack align="stretch" spacing={3}>
                    <Flex justify="space-between" align="center">
                      <Text>AI教练调用</Text>
                      <Badge colorScheme="purple">{featureUsage.aiCoachCalls} 次</Badge>
                    </Flex>
                    <Flex justify="space-between" align="center">
                      <Text>约会方案生成</Text>
                      <Badge colorScheme="teal">{featureUsage.datePlans} 次</Badge>
                    </Flex>
                    <Flex justify="space-between" align="center">
                      <Text>聊天消息</Text>
                      <Badge colorScheme="blue">{featureUsage.chatMessages} 条</Badge>
                    </Flex>
                    <Flex justify="space-between" align="center">
                      <Text>添加女生</Text>
                      <Badge colorScheme="orange">{featureUsage.girlsAdded} 次</Badge>
                    </Flex>
                    <Flex justify="space-between" align="center">
                      <Text>学习版块</Text>
                      <Badge colorScheme="green">{featureUsage.learningActions || 0} 次</Badge>
                    </Flex>
                    <Flex justify="space-between" align="center">
                      <Text>mo哥聊天</Text>
                      <Badge colorScheme="pink">{featureUsage.moChats || 0} 次</Badge>
                    </Flex>
                  </VStack>
                </CardBody>
              </Card>

              {/* 客户活跃度排行 */}
              <Card gridColumn="span 2">
                <CardBody>
                  <Heading size="md" mb={4}>客户活跃度</Heading>
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        <Th>昵称</Th>
                        <Th isNumeric>周得分</Th>
                        <Th>等级</Th>
                        <Th isNumeric>AI教练</Th>
                        <Th isNumeric>约会方案</Th>
                        <Th isNumeric>聊天</Th>
                        <Th isNumeric>加女生</Th>
                        <Th isNumeric>学习</Th>
                        <Th isNumeric>mo哥</Th>
                        <Th>最后活跃</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {clients.slice(0, 10).map(client => (
                        <Tr key={client.userId}>
                          <Td>{client.nickname}</Td>
                          <Td isNumeric fontWeight="bold">{client.weeklyScore}</Td>
                          <Td>
                            <Badge {...LEVEL_COLORS[client.level]}>{LEVEL_COLORS[client.level].label}</Badge>
                          </Td>
                          <Td isNumeric>{client.featureUsage?.aiCoachCalls || 0}</Td>
                          <Td isNumeric>{client.featureUsage?.datePlans || 0}</Td>
                          <Td isNumeric>{client.featureUsage?.chatMessages || 0}</Td>
                          <Td isNumeric>{client.featureUsage?.girlsAdded || 0}</Td>
                          <Td isNumeric>{client.featureUsage?.learningActions || 0}</Td>
                          <Td isNumeric>{client.featureUsage?.moChats || 0}</Td>
                          <Td fontSize="xs">{formatDate(client.lastActive)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </CardBody>
              </Card>
            </SimpleGrid>
          </TabPanel>

          {/* 活跃趋势 Tab */}
          <TabPanel p={0}>
            <Card>
              <CardBody>
                <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
                  <Heading size="md">活跃趋势</Heading>
                  <HStack spacing={2}>
                    <HStack spacing={1}>
                      {Object.entries(TREND_METRICS).map(([key, meta]) => (
                        <Button
                          key={key}
                          size="xs"
                          variant={trendMetric === key ? 'solid' : 'outline'}
                          onClick={() => setTrendMetric(key)}
                        >
                          {meta.label}
                        </Button>
                      ))}
                    </HStack>
                    <HStack spacing={1} ml={2}>
                      <Button size="xs" variant={trendDays === 7 ? 'solid' : 'outline'} onClick={() => setTrendDays(7)}>7天</Button>
                      <Button size="xs" variant={trendDays === 30 ? 'solid' : 'outline'} onClick={() => setTrendDays(30)}>30天</Button>
                      <Button size="xs" variant={trendDays === 90 ? 'solid' : 'outline'} onClick={() => setTrendDays(90)}>90天</Button>
                    </HStack>
                  </HStack>
                </Flex>

                {/* 所有趋势指标统一使用 growth 数据（含 cumulativeUsers / activeUsers / mau / newUsers） */}
                {growth.length > 0 ? (
                  <Box>
                    <Flex h="200px" gap="2px">
                      {growth.slice(-trendDays).map((day) => {
                        const metric = TREND_METRICS[trendMetric];
                        const val = day[metric.field] || 0;
                        const maxVal = getMaxValue(growth.slice(-trendDays), metric.field);
                        const heightPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                        return (
                          <Tooltip key={day.date} label={`${day.date}: ${val}${metric.unit}`}>
                            <Box flex={1} h="100%" bg="gray.800" borderRadius="2px 2px 0 0" position="relative" cursor="pointer"
                              _hover={{ bg: 'gray.700' }}>
                              <Box
                                position="absolute"
                                bottom={0}
                                left={0}
                                right={0}
                                bg={metric.color}
                                borderRadius="2px 2px 0 0"
                                h={`${heightPct}%`}
                                minH={val > 0 ? '4px' : '0'}
                              />
                            </Box>
                          </Tooltip>
                        );
                      })}
                    </Flex>
                    <Flex justify="space-between" mt={2} fontSize="xs" color="gray.400">
                      <Text>{growth.length > 0 ? formatDate(growth[Math.max(0, growth.length - trendDays)]?.date) : '-'}</Text>
                      <Text>
                        {TREND_METRICS[trendMetric].label}
                        {growth.length > 0 && ` · ${growth[growth.length - 1]?.[TREND_METRICS[trendMetric].field] || 0}${TREND_METRICS[trendMetric].unit}`}
                      </Text>
                    </Flex>
                  </Box>
                ) : (
                  <Flex justify="center" align="center" h="200px">
                    <Spinner />
                  </Flex>
                )}
              </CardBody>
            </Card>
          </TabPanel>

          {/* 沉睡用户 Tab */}
          <TabPanel p={0}>
            <Card>
              <CardBody>
                <Heading size="md" mb={4}>沉睡用户名单</Heading>
                <Text fontSize="sm" color="gray.400" mb={4}>
                  已连续14天无活跃操作
                </Text>
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>昵称</Th>
                      <Th>注册时间</Th>
                      <Th>最后活跃</Th>
                      <Th isNumeric>沉睡天数</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {dormantUsers.map(user => (
                      <Tr key={user.userId}>
                        <Td>{user.nickname}</Td>
                        <Td fontSize="xs">{formatDate(user.registeredAt)}</Td>
                        <Td fontSize="xs">{formatDate(user.lastActive)}</Td>
                        <Td isNumeric>
                          <Badge colorScheme="red">{user.dormantDays || 0}天</Badge>
                        </Td>
                      </Tr>
                    ))}
                    {dormantUsers.length === 0 && (
                      <Tr>
                        <Td colSpan={4} textAlign="center" color="gray.500">
                          暂无沉睡用户
                        </Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}

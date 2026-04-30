import { useEffect, useState, useCallback } from 'react';
import {
  Box, Heading, SimpleGrid, Card, CardBody, Stat, StatLabel, StatNumber, StatHelpText,
  Table, Thead, Tbody, Tr, Th, Td, Text, Badge, Button, HStack, VStack, Flex, Select,
  Spinner, Divider, Icon, useToast, Tabs, TabList, TabPanels, Tab, TabPanel,
  Progress, Tooltip
} from '@chakra-ui/react';
import { membership as membershipApi } from '../../utils/api';
const activityApi = membershipApi.activity;

const LEVEL_COLORS = {
  high: { bg: 'green.900', color: 'green.300', label: '高活跃' },
  medium: { bg: 'yellow.900', color: 'yellow.300', label: '中活跃' },
  low: { bg: 'orange.900', color: 'orange.300', label: '低活跃' },
  dormant: { bg: 'gray.800', color: 'gray.400', label: '沉睡' },
};

const LEVEL_ORDER = ['high', 'medium', 'low', 'dormant'];

export default function ActivityBoard() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [clients, setClients] = useState([]);
  const [dormantUsers, setDormantUsers] = useState([]);
  const [trendDays, setTrendDays] = useState(30);
  const [trend, setTrend] = useState([]);
  const [sendingRemind, setSendingRemind] = useState(null);
  const toast = useToast();

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await activityApi.dashboard();
      if (res.success) {
        setDashboard(res);
        setTrend(res.dailyTrend || []);
      }
    } catch (e) {
      console.error(e);
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
      console.error(e);
    }
  }, []);

  const loadDormantUsers = useCallback(async () => {
    try {
      const res = await activityApi.dormantUsers();
      if (res.success) {
        setDormantUsers(res.dormantUsers);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadClients();
    loadDormantUsers();
  }, [loadDashboard, loadClients, loadDormantUsers]);

  const handleSendRemind = async (userId) => {
    setSendingRemind(userId);
    try {
      const res = await activityApi.sendRemind(userId);
      if (res.success) {
        toast({ title: '提醒已发送', status: 'success', duration: 2000 });
      }
    } catch (e) {
      toast({ title: '发送失败', status: 'error', duration: 2000 });
    } finally {
      setSendingRemind(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const formatDaysAgo = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getTrendMaxScore = () => {
    if (!trend.length) return 100;
    return Math.max(...trend.map(t => t.totalScore), 100);
  };

  if (loading && !dashboard) {
    return (
      <Flex justify="center" align="center" minH="400px">
        <Spinner size="xl" />
      </Flex>
    );
  }

  const totalUsers = dashboard?.totalUsers || 0;
  const weeklyActive = dashboard?.weeklyActive || 0;
  const weeklyNew = dashboard?.weeklyNew || 0;
  const dormantUsersCount = dashboard?.dormantUsers || 0;
  const weeklyActiveRate = totalUsers > 0 ? Math.round((weeklyActive / totalUsers) * 100) : 0;
  const dormantRate = totalUsers > 0 ? Math.round((dormantUsersCount / totalUsers) * 100) : 0;
  const dist = dashboard?.levelDistribution || { high: 0, medium: 0, low: 0, dormant: 0 };
  const featureUsage = dashboard?.weeklyFeatureUsage || { aiCoachCalls: 0, datePlans: 0, chatMessages: 0, girlsAdded: 0 };

  return (
    <Box p={6}>
      <Heading size="lg" mb={6}>活跃看板</Heading>

      {/* 汇总指标卡 */}
      <SimpleGrid columns={4} spacing={4} mb={6}>
        <Card bg="white">
          <CardBody>
            <Stat>
              <StatLabel>总用户数</StatLabel>
              <StatNumber>{totalUsers}</StatNumber>
              <StatHelpText>人</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card bg="white">
          <CardBody>
            <Stat>
              <StatLabel>本周活跃</StatLabel>
              <StatNumber color="green.500">{weeklyActive}</StatNumber>
              <StatHelpText>{weeklyActiveRate}%</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card bg="white">
          <CardBody>
            <Stat>
              <StatLabel>本周新增</StatLabel>
              <StatNumber color="blue.500">{weeklyNew}</StatNumber>
              <StatHelpText>人</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card bg="white">
          <CardBody>
            <Stat>
              <StatLabel>沉睡用户</StatLabel>
              <StatNumber color="red.500">{dormantUsersCount}</StatNumber>
              <StatHelpText>{dormantRate}%</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
      </SimpleGrid>

      <Tabs variant="soft-rounded" colorScheme="teal">
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
              <Card bg="white">
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
              <Card bg="white">
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
                  </VStack>
                </CardBody>
              </Card>

              {/* 客户活跃度排行 */}
              <Card bg="white" gridColumn="span 2">
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
            <Card bg="white">
              <CardBody>
                <Flex justify="space-between" align="center" mb={4}>
                  <Heading size="md">每日活跃趋势</Heading>
                  <HStack>
                    <Button size="xs" variant={trendDays === 7 ? 'solid' : 'outline'} onClick={() => setTrendDays(7)}>7天</Button>
                    <Button size="xs" variant={trendDays === 30 ? 'solid' : 'outline'} onClick={() => setTrendDays(30)}>30天</Button>
                    <Button size="xs" variant={trendDays === 90 ? 'solid' : 'outline'} onClick={() => setTrendDays(90)}>90天</Button>
                  </HStack>
                </Flex>
                <Box>
                  <Flex align="flex-end" h="200px" gap="2px">
                    {trend.slice(-trendDays).map((day, idx) => {
                      const heightPct = getTrendMaxScore() > 0 ? (day.totalScore / getTrendMaxScore()) * 100 : 0;
                      const activeHeightPct = day.activeUsers > 0 ? Math.min(day.activeUsers / 20 * 100, 100) : 0;
                      return (
                        <Tooltip key={day.date} label={`${day.date}: ${day.activeUsers}人活跃, ${day.totalScore}分`}>
                          <Box flex={1} bg="teal.100" borderRadius="2px 2px 0 0" position="relative" cursor="pointer"
                            _hover={{ bg: 'teal.200' }}>
                            <Box
                              position="absolute"
                              bottom={0}
                              left={0}
                              right={0}
                              bg="teal.400"
                              borderRadius="2px 2px 0 0"
                              h={`${heightPct}%`}
                              minH={day.totalScore > 0 ? '4px' : '0'}
                            />
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Flex>
                  <Flex justify="space-between" mt={2} fontSize="xs" color="gray.500">
                    <Text>{trend.length > 0 ? formatDate(trend[0]?.date) : '-'}</Text>
                    <Text>今天</Text>
                  </Flex>
                </Box>
              </CardBody>
            </Card>
          </TabPanel>

          {/* 沉睡用户 Tab */}
          <TabPanel p={0}>
            <Card bg="white">
              <CardBody>
                <Heading size="md" mb={4}>沉睡用户名单</Heading>
                <Text fontSize="sm" color="gray.600" mb={4}>
                  已连续14天无活跃操作，需要激活
                </Text>
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>昵称</Th>
                      <Th>注册时间</Th>
                      <Th>最后活跃</Th>
                      <Th isNumeric>沉睡天数</Th>
                      <Th>操作</Th>
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
                        <Td>
                          <Button
                            size="xs"
                            colorScheme="red"
                            variant="outline"
                            isLoading={sendingRemind === user.userId}
                            onClick={() => handleSendRemind(user.userId)}
                          >
                            发提醒
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                    {dormantUsers.length === 0 && (
                      <Tr>
                        <Td colSpan={5} textAlign="center" color="gray.500">
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

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Heading, SimpleGrid, Card, CardBody, Stat, StatLabel, StatNumber, StatHelpText,
  Table, Thead, Tbody, Tr, Th, Td, Text, Badge, HStack, VStack, Flex,
  Spinner, Button, Tabs, TabList, TabPanels, Tab, TabPanel,
  Progress, Tooltip
} from '@chakra-ui/react';
import { reports as reportsApi, membership as membershipApi } from '../../utils/api';
import { captureError } from '../../utils/frontendErrorCapture';

const activityApi = membershipApi.activity;

const RANGE_LABELS = { day: '今日', week: '近7天', month: '近30天' };

export default function ActivityBoard() {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('day');
  const [data, setData] = useState(null);
  const [dormantUsers, setDormantUsers] = useState([]);
  const [tabIndex, setTabIndex] = useState(0);

  const load = useCallback(async (r) => {
    setLoading(true);
    try {
      const [res, dormant] = await Promise.all([
        reportsApi.overview(r),
        activityApi.dormantUsers().catch(() => ({ dormantUsers: [] })),
      ]);
      if (res.success) setData(res);
      if (dormant.success) setDormantUsers(dormant.dormantUsers || []);
    } catch (e) {
      captureError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [load, range]);

  const formatDate = (s) => {
    if (!s) return '-';
    const d = new Date(s);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  if (loading && !data) {
    return (
      <Flex justify="center" align="center" minH="400px">
        <Spinner size="xl" />
      </Flex>
    );
  }

  const u = data?.users || {};
  const c = data?.chat || {};
  const r = data?.revenue || {};
  const ai = data?.ai || {};
  const sv = data?.server || {};
  const trend = data?.trend || {};

  const dauRate = u.clients > 0 ? Math.round((u.active / u.clients) * 100) : 0;
  const dormantRate = u.clients > 0 ? Math.round((u.dormant / u.clients) * 100) : 0;

  // 趋势柱状图
  const BarChart = ({ items, color, label, unit }) => {
    if (!items?.length) return <Flex justify="center" align="center" h="160px" color="rgba(245,240,232,0.3)">暂无数据</Flex>;
    const max = Math.max(...items.map(i => i.count || 0), 1);
    return (
      <Box>
        <Flex h="160px" gap="2px">
          {items.map((d, idx) => {
            const h = max > 0 ? (d.count / max) * 100 : 0;
            return (
              <Tooltip key={idx} label={`${d.date}: ${d.count}${unit || ''}`}>
                <Box flex={1} h="100%" bg="warm.800" borderRadius="2px 2px 0 0" position="relative" cursor="pointer" _hover={{ bg: 'warm.700' }}>
                  <Box position="absolute" bottom={0} left={0} right={0} bg={color} borderRadius="2px 2px 0 0" h={`${h}%`} minH={d.count > 0 ? '4px' : '0'} />
                </Box>
              </Tooltip>
            );
          })}
        </Flex>
        <Flex justify="space-between" mt={1} fontSize="xs" color="rgba(245,240,232,0.3)">
          <Text>{items[0]?.date || ''}</Text>
          <Text>{label}</Text>
          <Text>{items[items.length - 1]?.date || ''}</Text>
        </Flex>
      </Box>
    );
  };

  // 服务器状态颜色
  const memColor = sv.memPercent > 80 ? 'red.300' : sv.memPercent > 60 ? 'yellow.300' : 'green.300';

  return (
    <Box p={6}>
      <Flex justify="space-between" align="center" mb={6} wrap="wrap" gap={3}>
        <Heading size="lg">数据报表</Heading>
        <HStack spacing={1}>
          {Object.entries(RANGE_LABELS).map(([k, v]) => (
            <Button key={k} size="sm" variant={range === k ? 'solid' : 'outline'} colorScheme="gold" onClick={() => setRange(k)}>
              {v}
            </Button>
          ))}
          <Button size="sm" variant="outline" ml={2} onClick={() => load(range)} isLoading={loading}>刷新</Button>
        </HStack>
      </Flex>

      {/* ─── 用户 ─── */}
      <Heading size="sm" mb={3} color="rgba(245,240,232,0.5)">用户</Heading>
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <Card><CardBody><Stat><StatLabel>总用户</StatLabel><StatNumber>{u.total}</StatNumber><StatHelpText>客户 {u.clients}</StatHelpText></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>新增</StatLabel><StatNumber color="blue.300">{u.new}</StatNumber><StatHelpText>{RANGE_LABELS[range]}</StatHelpText></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>活跃</StatLabel><StatNumber color="cyan.300">{u.active}</StatNumber><StatHelpText>{dauRate}% 活跃率</StatHelpText></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>沉睡</StatLabel><StatNumber color="red.300">{u.dormant}</StatNumber><StatHelpText>{dormantRate}%</StatHelpText></Stat></CardBody></Card>
      </SimpleGrid>

      {/* ─── 营收 ─── */}
      <Heading size="sm" mb={3} color="rgba(245,240,232,0.5)">营收</Heading>
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <Card><CardBody><Stat><StatLabel>累计收入</StatLabel><StatNumber color="gold.400">¥{Math.round(r.total || 0).toLocaleString()}</StatNumber></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>本期收入</StatLabel><StatNumber color="green.300">¥{Math.round(r.period || 0).toLocaleString()}</StatNumber><StatHelpText>{RANGE_LABELS[range]}</StatHelpText></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>ARPU</StatLabel><StatNumber>¥{r.arpu || 0}</StatNumber><StatHelpText>人均付费</StatHelpText></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>付费用户</StatLabel><StatNumber>{r.paidUsers || 0}</StatNumber><StatHelpText>人</StatHelpText></Stat></CardBody></Card>
      </SimpleGrid>
      {r.memberBreakdown && Object.keys(r.memberBreakdown).length > 0 && (
        <Card mb={6}><CardBody>
          <Heading size="sm" mb={3}>会员类型分布</Heading>
          <HStack spacing={4} wrap="wrap">
            {Object.entries(r.memberBreakdown).map(([type, count]) => (
              <Badge key={type} colorScheme="gold" fontSize="md" p={2}>{type}: {count}人</Badge>
            ))}
          </HStack>
        </CardBody></Card>
      )}

      {/* ─── 聊天 & AI ─── */}
      <Heading size="sm" mb={3} color="rgba(245,240,232,0.5)">聊天 & AI</Heading>
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <Card><CardBody><Stat><StatLabel>总消息</StatLabel><StatNumber>{c.totalMessages || 0}</StatNumber></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>本期消息</StatLabel><StatNumber color="blue.300">{c.periodMessages || 0}</StatNumber></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>AI教练调用</StatLabel><StatNumber color="purple.300">{ai.totalCoachCalls || 0}</StatNumber></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>AI采纳率</StatLabel><StatNumber color="green.300">{c.adoptRate || 0}%</StatNumber></Stat></CardBody></Card>
      </SimpleGrid>

      {/* ─── 趋势 ─── */}
      <Heading size="sm" mb={3} color="rgba(245,240,232,0.5)">趋势（近30天）</Heading>
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
        <Card><CardBody>
          <Text fontSize="sm" mb={2} fontWeight="bold">每日消息</Text>
          <BarChart items={trend.messages} color="blue.300" label="消息趋势" unit="条" />
        </CardBody></Card>
        <Card><CardBody>
          <Text fontSize="sm" mb={2} fontWeight="bold">每日活跃</Text>
          <BarChart items={trend.activeUsers} color="cyan.300" label="活跃趋势" unit="人" />
        </CardBody></Card>
        <Card><CardBody>
          <Text fontSize="sm" mb={2} fontWeight="bold">每日新增</Text>
          <BarChart items={trend.newUsers} color="green.300" label="新增趋势" unit="人" />
        </CardBody></Card>
      </SimpleGrid>

      {/* ─── 服务器 ─── */}
      <Heading size="sm" mb={3} color="rgba(245,240,232,0.5)">服务器</Heading>
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <Card><CardBody><Stat><StatLabel>CPU</StatLabel><StatNumber>{sv.cpuCores || 0}核</StatNumber><StatHelpText>负载 {sv.loadAvg1m}</StatHelpText></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>内存</StatLabel><StatNumber color={memColor}>{sv.memPercent || 0}%</StatNumber><StatHelpText>{sv.memUsedMB}MB / {sv.memTotalMB}MB</StatHelpText></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>数据库</StatLabel><StatNumber>{sv.dbSizeMB || 0}MB</StatNumber></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>运行</StatLabel><StatNumber>{sv.uptimeDays || 0}天</StatNumber></Stat></CardBody></Card>
      </SimpleGrid>

      {/* ─── 沉睡用户 ─── */}
      <Card>
        <CardBody>
          <Heading size="sm" mb={3}>沉睡用户（14天无活跃）</Heading>
          <Table size="sm">
            <Thead><Tr><Th>昵称</Th><Th>注册</Th><Th>最后活跃</Th><Th isNumeric>沉睡天数</Th></Tr></Thead>
            <Tbody>
              {dormantUsers.slice(0, 10).map(user => (
                <Tr key={user.userId}>
                  <Td>{user.nickname}</Td>
                  <Td fontSize="xs">{formatDate(user.registeredAt)}</Td>
                  <Td fontSize="xs">{formatDate(user.lastActive)}</Td>
                  <Td isNumeric><Badge colorScheme="red">{user.dormantDays || 0}天</Badge></Td>
                </Tr>
              ))}
              {dormantUsers.length === 0 && (
                <Tr><Td colSpan={4} textAlign="center" color="rgba(245,240,232,0.2)">暂无沉睡用户</Td></Tr>
              )}
            </Tbody>
          </Table>
        </CardBody>
      </Card>
    </Box>
  );
}

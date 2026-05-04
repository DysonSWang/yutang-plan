/**
 * 日志监控页面
 * 实时查看后端日志、慢请求分析、trace追踪
 */

import { useState, useEffect, useRef } from 'react';
import { captureError } from '../../utils/frontendErrorCapture';
import {
  Box, Heading, HStack, VStack, Select, Input, Button, Badge, Text, Flex, Card,
  CardBody, Stat, StatLabel, StatNumber, StatHelpText, useToast, Table, Thead,
  Tbody, Tr, Th, Td, Tabs, TabList, TabPanels, Tab, TabPanel, Progress, Tooltip,
  useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton,
} from '@chakra-ui/react';
import { useSocket } from '../../contexts/SocketContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

function beijingDateStr() {
  const bj = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return `${bj.getFullYear()}${String(bj.getMonth() + 1).padStart(2, '0')}${String(bj.getDate()).padStart(2, '0')}`;
}

// 前端错误详情
function FrontendDetail({ log }) {
  return (
    <VStack spacing={3} align="stretch" fontFamily="mono" fontSize="sm">
      <Box>
        <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>errorId</Text>
        <Text color="cyan.300">{log.errorId || '-'}</Text>
      </Box>
      <Box>
        <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>错误信息</Text>
        <Text color="red.300" fontWeight="bold">{log.message}</Text>
      </Box>
      <Box>
        <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>错误类型</Text>
        <Badge colorScheme="orange">{log.type}</Badge>
      </Box>
      <Box>
        <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>发生页面</Text>
        <Text color="yellow.300" wordBreak="break-all">{log.url}</Text>
      </Box>
      {log.metadata?.lineno != null && (
        <Box>
          <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>出错位置</Text>
          <Text>第 {log.metadata.lineno} 行，第 {log.metadata.colno} 列</Text>
        </Box>
      )}
      {log.metadata?.componentStack && (
        <Box>
          <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>React 组件栈</Text>
          <Box bg="gray.900" p={3} borderRadius="md" maxH="150px" overflowY="auto" fontSize="xs">
            <Text whiteSpace="pre-wrap" color="gray.300">{log.metadata.componentStack}</Text>
          </Box>
        </Box>
      )}
      <Box>
        <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>堆栈追踪</Text>
        <Box bg="gray.900" p={3} borderRadius="md" maxH="250px" overflowY="auto" fontSize="xs">
          <Text whiteSpace="pre-wrap" color="gray.300">{log.stack || '无堆栈信息'}</Text>
        </Box>
      </Box>
      <Box>
        <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>浏览器</Text>
        <Text color="rgba(245,240,232,0.4)" fontSize="xs" wordBreak="break-all">{log.userAgent}</Text>
      </Box>
      <Box>
        <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>发生时间</Text>
        <Text>{log.time ? new Date(log.time).toLocaleString('zh-CN') : '-'}</Text>
      </Box>
    </VStack>
  );
}

// 后端错误/警告详情
function BackendDetail({ log }) {
  return (
    <VStack spacing={3} align="stretch" fontFamily="mono" fontSize="sm">
      <Box>
        <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>日志级别</Text>
        <Badge colorScheme={log.level === 'error' ? 'red' : 'orange'}>{log.level}</Badge>
      </Box>
      <Box>
        <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>消息</Text>
        <Text color="red.300" fontWeight="bold">{log.message}</Text>
      </Box>
      {log.code && (
        <Box>
          <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>错误码</Text>
          <Text color="yellow.300">{log.code}</Text>
        </Box>
      )}
      {log.requestId && (
        <Box>
          <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>请求ID (requestId)</Text>
          <Text color="cyan.300">{log.requestId}</Text>
        </Box>
      )}
      <HStack spacing={6}>
        {log.method && (
          <Box>
            <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>请求方法</Text>
            <Text color="green.300">{log.method}</Text>
          </Box>
        )}
        {log.status && (
          <Box>
            <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>状态码</Text>
            <Text color={log.status >= 400 ? 'red.300' : 'green.300'}>{log.status}</Text>
          </Box>
        )}
        {log.duration != null && (
          <Box>
            <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>耗时</Text>
            <Text color={log.duration > 3000 ? 'orange.300' : 'gray.300'}>{log.duration}ms</Text>
          </Box>
        )}
      </HStack>
      {log.path && (
        <Box>
          <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>请求路径</Text>
          <Text color="yellow.300" wordBreak="break-all">{log.path}</Text>
        </Box>
      )}
      {log.metadata && (
        <Box>
          <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>附加信息 (metadata)</Text>
          <Box bg="gray.900" p={3} borderRadius="md" maxH="200px" overflowY="auto" fontSize="xs">
            <Text whiteSpace="pre-wrap" color="gray.300">{JSON.stringify(log.metadata, null, 2)}</Text>
          </Box>
        </Box>
      )}
      {log.stack && (
        <Box>
          <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>堆栈追踪</Text>
          <Box bg="gray.900" p={3} borderRadius="md" maxH="200px" overflowY="auto" fontSize="xs">
            <Text whiteSpace="pre-wrap" color="gray.300">{log.stack}</Text>
          </Box>
        </Box>
      )}
      <Box>
        <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>发生时间</Text>
        <Text>{log.time ? new Date(log.time).toLocaleString('zh-CN') : '-'}</Text>
      </Box>
    </VStack>
  );
}

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ errors: 0, slow: 0, total: 0, errorRate: '0', slowRate: '0', frontendErrors: 0 });
  const [files, setFiles] = useState([]);
  const [filter, setFilter] = useState({ date: '', level: '', source: '', search: '' });
  const [loading, setLoading] = useState(false);
  const [isAlerting, setIsAlerting] = useState(false);
  const [slowAnalysis, setSlowAnalysis] = useState(null);
  const [slowAnalysisLoading, setSlowAnalysisLoading] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const [traceId, setTraceId] = useState('');
  const [traceResult, setTraceResult] = useState(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [logDetail, setLogDetail] = useState(null);
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();

  const openLogDetail = (log) => {
    setLogDetail(log);
    onDetailOpen();
  };
  const logContainerRef = useRef(null);
  const toast = useToast();
  const { socket } = useSocket();

  // 加载日志文件列表
  useEffect(() => {
    fetch(`${API_BASE}/api/logs/files`)
      .then(r => r.json())
      .then(d => {
        setFiles(d.files || []);
        if (d.files?.length > 0) {
          setFilter(f => ({ ...f, date: d.files[0].date }));
        }
      })
      .catch(() => {});
  }, []);

  // 加载统计数据
  useEffect(() => {
    const dateParam = filter.date ? `?date=${filter.date}` : '';
    fetch(`/api/logs/stats${dateParam}`)
      .then(r => r.json())
      .then(d => {
        if (d.today) {
          setStats(d.today);
          if (d.today.errors >= 5) {
            setIsAlerting(true);
          }
        }
      })
      .catch(() => {});
  }, [filter.date]);

  // 加载日志
  const loadLogs = () => {
    setLoading(true);
    const date = filter.date || beijingDateStr();
    const params = new URLSearchParams();
    if (filter.level) params.set('level', filter.level);
    if (filter.source) params.set('source', filter.source);
    if (filter.search) params.set('search', filter.search);

    fetch(`/api/logs/file/${date}?${params}`)
      .then(r => r.json())
      .then(d => {
        setLogs(d.logs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (filter.date) {
      loadLogs();
    }
  }, [filter.date, filter.level, filter.source, filter.search]);

  // 加载慢请求分析
  const loadSlowAnalysis = () => {
    setSlowAnalysisLoading(true);
    fetch(`${API_BASE}/api/logs/slow-analysis?days=7&limit=15`)
      .then(r => r.json())
      .then(d => {
        setSlowAnalysis(d);
        setSlowAnalysisLoading(false);
      })
      .catch(() => setSlowAnalysisLoading(false));
  };

  // 点击日志中的 trace ID → 直接跳到 Trace 追踪 tab 并自动查询
  const handleTraceClick = (id) => {
    setTraceId(id);
    setTraceResult(null);
    setTraceLoading(true);
    setTabIndex(2);
    fetch(`/api/logs/trace/${id}`)
      .then(r => r.json())
      .then(d => {
        setTraceResult(d);
        setTraceLoading(false);
      })
      .catch(() => setTraceLoading(false));
  };

  // 查询trace
  const searchTrace = () => {
    if (!traceId.trim()) return;
    setTraceLoading(true);
    fetch(`/api/logs/trace/${traceId.trim()}`)
      .then(r => r.json())
      .then(d => {
        setTraceResult(d);
        setTraceLoading(false);
      })
      .catch(() => setTraceLoading(false));
  };

  // 切换到慢请求分析 tab 时自动加载
  const handleTabChange = (index) => {
    setTabIndex(index);
    if (index === 1 && !slowAnalysis) {
      loadSlowAnalysis();
    }
  };

  // WebSocket 实时更新
  useEffect(() => {
    if (!socket) return;

    const handleNewLogs = ({ logs: newLogs }) => {
      setLogs(prev => {
        const combined = [...newLogs.reverse(), ...prev];
        return combined.slice(0, 200);
      });
    };

    const handleAlert = ({ type, message }) => {
      toast({
        title: `告警: ${type}`,
        description: message,
        status: 'warning',
        duration: 10000,
        isClosable: true,
        position: 'top-right',
      });
      setIsAlerting(true);
    };

    socket.on('log:new', handleNewLogs);
    socket.on('admin:alert', handleAlert);

    return () => {
      socket.off('log:new', handleNewLogs);
      socket.off('admin:alert', handleAlert);
    };
  }, [socket, toast]);

  const levelColor = { error: 'red', slow: 'purple', warn: 'orange', info: 'blue', debug: 'gray' };
  const levelBg = { error: 'red.900', slow: 'purple.900', warn: 'orange.900', info: 'warm.800', debug: 'warm.800' };

  const handleClearFilter = () => {
    setFilter({ date: filter.date, level: '', source: '', search: '' });
  };

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // 慢请求分析Tab内容
  const SlowAnalysisTab = () => (
    <Box>
      <HStack mb={4} justify="space-between">
        <Text color="rgba(245,240,232,0.4)">分析近7天慢请求数据，帮助优化性能瓶颈</Text>
        <Button onClick={loadSlowAnalysis} isLoading={slowAnalysisLoading} colorScheme="purple" size="sm">
          刷新分析
        </Button>
      </HStack>

      {slowAnalysis && (
        <>
          {/* Top慢请求路径 */}
          <Card mb={4}>
            <CardBody>
              <Text fontWeight="bold" mb={3}>🐌 Top慢请求路径</Text>
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th>路径</Th>
                    <Th isNumeric>次数</Th>
                    <Th isNumeric>平均耗时</Th>
                    <Th isNumeric>最大耗时</Th>
                    <Th>操作</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {slowAnalysis.topPaths?.map((p, i) => (
                    <Tr key={i}>
                      <Td>
                        <Text fontFamily="mono" fontSize="xs" maxW="300px" isTruncated>
                          {p.path}
                        </Text>
                      </Td>
                      <Td isNumeric>
                        <Badge colorScheme="purple">{p.count}</Badge>
                      </Td>
                      <Td isNumeric>
                        <Text color={p.avgDuration > 5000 ? 'red.400' : p.avgDuration > 3000 ? 'orange.400' : 'gray.300'}>
                          {formatDuration(p.avgDuration)}
                        </Text>
                      </Td>
                      <Td isNumeric>
                        <Text color="orange.400">{formatDuration(p.maxDuration)}</Text>
                      </Td>
                      <Td>
                        <Button size="xs" variant="ghost" onClick={() => {
                          setFilter(f => ({ ...f, search: p.path, level: 'slow' }));
                          // 切换到日志Tab
                          document.querySelector('[role="tab"]:nth-child(1)')?.click();
                        }}>
                          查看日志
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </CardBody>
          </Card>

          {/* 耗时分布 */}
          <Card mb={4}>
            <CardBody>
              <Text fontWeight="bold" mb={3}>📊 慢请求趋势</Text>
              <HStack spacing={4} align="end" h="100px">
                {slowAnalysis.hourlyDistribution?.map(h => (
                  <Tooltip key={h.hour} label={`${h.hour}:00 - ${h.count}次`}>
                    <Box flex={1} bg="purple.500" borderRadius="sm" textAlign="center"
                      h={`${Math.max(10, (h.count / Math.max(...slowAnalysis.hourlyDistribution.map(x => x.count), 1)) * 100)}%`}
                      minH="10px"
                    />
                  </Tooltip>
                ))}
              </HStack>
              <HStack justify="space-between" mt={1} fontSize="xs" color="rgba(245,240,232,0.6)">
                <Text>0时</Text>
                <Text>6时</Text>
                <Text>12时</Text>
                <Text>18时</Text>
                <Text>23时</Text>
              </HStack>
            </CardBody>
          </Card>

          {/* 按天分布 */}
          <Card>
            <CardBody>
              <Text fontWeight="bold" mb={3}>📅 近7天慢请求分布</Text>
              <HStack spacing={2} align="end" h="80px">
                {slowAnalysis.dailyDistribution?.map(d => (
                  <Tooltip key={d.date} label={`${d.date} - ${d.count}次`}>
                    <Box flex={1} bg="gold.500" borderRadius="sm" textAlign="center"
                      h={`${Math.max(10, (d.count / Math.max(...slowAnalysis.dailyDistribution.map(x => x.count), 1)) * 100)}%`}
                      minH="10px"
                    />
                  </Tooltip>
                ))}
              </HStack>
              <Text fontSize="xs" color="rgba(245,240,232,0.6)" mt={1} textAlign="center">
                共 {slowAnalysis.total} 次慢请求
              </Text>
            </CardBody>
          </Card>
        </>
      )}

      {slowAnalysisLoading && !slowAnalysis && (
        <Text color="rgba(245,240,232,0.6)" textAlign="center" py={8}>
          正在加载慢请求分析...
        </Text>
      )}
    </Box>
  );

  // Trace追踪Tab内容
  const TraceTab = () => (
    <Box>
      <Card mb={4}>
        <CardBody>
          <Text fontWeight="bold" mb={3}>🔍 Trace追踪</Text>
          <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={3}>
            输入 trace-id 或 request-id 查询完整调用链
          </Text>
          <HStack>
            <Input
              placeholder="输入 trace-id..."
              value={traceId}
              onChange={e => setTraceId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchTrace()}
            />
            <Button onClick={searchTrace} isLoading={traceLoading} colorScheme="cyan">
              查询
            </Button>
          </HStack>
        </CardBody>
      </Card>

      {traceResult && (
        <Card>
          <CardBody>
            <Text fontWeight="bold" mb={3}>调用链详情 ({traceResult.total} 条记录)</Text>
            <Box maxH="500px" overflowY="auto">
              {traceResult.logs?.map((log, i) => (
                <Box
                  key={i}
                  mb={2}
                  p={3}
                  bg={levelBg[log.level] || 'warm.800'}
                  borderRadius="md"
                  borderLeft="3px solid"
                  borderLeftColor={`${levelColor[log.level] || 'gray'}.400`}
                >
                  <HStack spacing={2} mb={1}>
                    <Text fontSize="xs" color="rgba(245,240,232,0.4)">{log.timestamp?.slice(11, 23)}</Text>
                    <Badge colorScheme={levelColor[log.level]} fontSize="0.6rem">{log.level}</Badge>
                    <Text fontWeight="bold">{log.message}</Text>
                  </HStack>
                  <HStack spacing={4} fontSize="xs" color="rgba(245,240,232,0.4)">
                    {log.path && <Text>path: <Text as="span" color="yellow.300">{log.path}</Text></Text>}
                    {log.method && <Text>method: <Text as="span" color="green.300">{log.method}</Text></Text>}
                    {log.duration && <Text>duration: <Text as="span" color="orange.300">{log.duration}ms</Text></Text>}
                    {log.status && <Text>status: <Text as="span" color={log.status >= 400 ? 'red.300' : 'green.300'}>{log.status}</Text></Text>}
                  </HStack>
                </Box>
              ))}
            </Box>
          </CardBody>
        </Card>
      )}

      {!traceResult && !traceLoading && (
        <Text color="rgba(245,240,232,0.6)" textAlign="center" py={8}>
          输入 trace-id 查询完整调用链
        </Text>
      )}
    </Box>
  );

  return (
    <Box p={4}>
      <Flex justify="space-between" align="center" mb={4}>
        <Heading size="lg">日志监控</Heading>
        <Badge colorScheme="red" p={2} fontSize="md" animate={isAlerting ? 'pulse' : 'none'}>
          {isAlerting ? '🔥 告警中' : '✓ 正常'}
        </Badge>
      </Flex>

      {/* 统计卡片 */}
      <HStack spacing={4} mb={4}>
        <Card flex={1}>
          <CardBody>
            <Stat>
              <StatLabel>今日错误</StatLabel>
              <StatNumber color="red.500">{stats.errors}</StatNumber>
              <StatHelpText>{stats.errorRate}% 错误率</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card flex={1}>
          <CardBody>
            <Stat>
              <StatLabel>今日慢请求</StatLabel>
              <StatNumber color="purple.500">{stats.slow}</StatNumber>
              <StatHelpText>{stats.slowRate}% 慢请求率</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card flex={1}>
          <CardBody>
            <Stat>
              <StatLabel>今日总请求</StatLabel>
              <StatNumber>{stats.total}</StatNumber>
              <StatHelpText>日志条目数</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card flex={1}>
          <CardBody>
            <Stat>
              <StatLabel>前端错误</StatLabel>
              <StatNumber color="orange.500">{stats.frontendErrors}</StatNumber>
              <StatHelpText>浏览器端上报</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
      </HStack>

      {/* Tab切换 */}
      <Tabs variant="soft-rounded" colorScheme="gold" mb={4} index={tabIndex} onChange={handleTabChange}>
        <TabList>
          <Tab>📋 日志列表</Tab>
          <Tab>🐌 慢请求分析</Tab>
          <Tab>🔍 Trace追踪</Tab>
        </TabList>

        <TabPanels>
          {/* 日志列表Tab */}
          <TabPanel px={0}>
            {/* 过滤器 */}
            <HStack mb={4} spacing={3}>
              <Select
                placeholder="选择日期"
                value={filter.date}
                onChange={e => setFilter(f => ({ ...f, date: e.target.value }))}
                maxW="150px"
              >
                {files.map(f => (
                  <option key={f.name} value={f.date}>{f.date} ({f.sizeFormatted})</option>
                ))}
              </Select>
              <Select
                value={filter.source}
                onChange={e => setFilter(f => ({ ...f, source: e.target.value }))}
                maxW="110px"
              >
                <option value="">全部来源</option>
                <option value="backend">后端</option>
                <option value="frontend">前端</option>
              </Select>
              <Select
                value={filter.level}
                onChange={e => setFilter(f => ({ ...f, level: e.target.value }))}
                maxW="110px"
              >
                <option value="">全部级别</option>
                <option value="error">错误</option>
                <option value="warn">警告</option>
                <option value="slow">慢请求</option>
                <option value="info">信息</option>
                <option value="debug">调试</option>
              </Select>
              <Input
                placeholder="搜索 trace-id / 关键词"
                value={filter.search}
                onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
                maxW="220px"
              />
              <Button onClick={loadLogs} isLoading={loading} colorScheme="blue" size="sm">刷新</Button>
              {(filter.level || filter.source || filter.search) && (
                <Button onClick={handleClearFilter} variant="ghost" size="sm">清除筛选</Button>
              )}
            </HStack>

            {/* 快捷过滤 */}
            <HStack mb={4} spacing={2}>
              <Button size="sm" colorScheme="red" variant="outline" onClick={() => setFilter({ ...filter, level: 'error', source: '' })}>只看错误</Button>
              <Button size="sm" colorScheme="purple" variant="outline" onClick={() => setFilter({ ...filter, level: 'slow', source: '' })}>只看慢请求</Button>
              <Button size="sm" colorScheme="orange" variant="outline" onClick={() => setFilter({ ...filter, source: 'frontend', level: '' })}>只看前端</Button>
              <Button size="sm" variant="outline" onClick={handleClearFilter}>清除筛选</Button>
            </HStack>

            {/* 日志流 */}
            <Box
              ref={logContainerRef}
              bg="gray.900"
              color="gray.100"
              p={4}
              borderRadius="md"
              maxH="500px"
              overflowY="auto"
              fontFamily="mono"
              fontSize="xs"
              sx={{ '&::-webkit-scrollbar': { width: '8px' }, '&::-webkit-scrollbar-track': { bg: 'warm.800' }, '&::-webkit-scrollbar-thumb': { bg: 'warm.600', borderRadius: '4px' } }}
            >
              {logs.length === 0 ? (
                <Text color="rgba(245,240,232,0.6)" textAlign="center" py={8}>暂无日志数据</Text>
              ) : (
                logs.map((log, i) => (
                  <Box key={`${log.time}-${i}`} mb={2} p={2} bg={levelBg[log.level] || 'warm.800'} borderRadius="sm" borderLeft="3px solid" borderLeftColor={`${levelColor[log.level] || 'gray'}.400`}>
                    <HStack spacing={2} mb={1}>
                      <Text color="rgba(245,240,232,0.4)" fontSize="xs">{log.time?.slice(11, 23)}</Text>
                      <Badge colorScheme={levelColor[log.level]} fontSize="0.6rem" textTransform="uppercase">{log.level}</Badge>
                      {log.source === 'frontend' && <Badge colorScheme="orange" fontSize="0.6rem" variant="outline">前端</Badge>}
                      {(log.level === 'error' || log.level === 'warn') ? (
                        <Text fontWeight="bold" cursor="pointer" _hover={{ textDecoration: 'underline' }} onClick={() => openLogDetail(log)}>{log.message}</Text>
                      ) : (
                        <Text fontWeight="bold">{log.message}</Text>
                      )}
                    </HStack>
                    <HStack spacing={4} fontSize="0.75rem" color="rgba(245,240,232,0.4)" flexWrap="wrap">
                      {log.source === 'frontend' ? (
                        <>
                          {log.errorId && <Text>errorId: <Text as="span" color="cyan.300" cursor="pointer" textDecoration="underline" _hover={{ color: 'cyan.100' }} onClick={() => openLogDetail(log)}>{log.errorId}</Text></Text>}
                          {log.type && <Text>type: <Text as="span" color="orange.300">{log.type}</Text></Text>}
                          {log.url && <Text>url: <Text as="span" color="yellow.300" maxW="300px" isTruncated display="inline-block" verticalAlign="bottom">{log.url}</Text></Text>}
                          {log.metadata?.lineno != null && <Text>位置: <Text as="span" color="gray.300">{log.metadata.lineno}:{log.metadata.colno}</Text></Text>}
                          {log.stack && <Text>stack: <Text as="span" color="rgba(245,240,232,0.4)" maxW="300px" isTruncated display="inline-block" verticalAlign="bottom">{log.stack.slice(0, 100)}</Text></Text>}
                        </>
                      ) : (
                        <>
                          {log.requestId && <Text>trace: <Text as="span" color="cyan.300" cursor="pointer" textDecoration="underline" _hover={{ color: 'cyan.100' }} onClick={() => handleTraceClick(log.requestId)}>{log.requestId}</Text></Text>}
                          {log.method && <Text>method: <Text as="span" color="green.300">{log.method}</Text></Text>}
                          {log.path && <Text>path: <Text as="span" color="yellow.300">{log.path}</Text></Text>}
                          {log.status && <Text>status: <Text as="span" color={log.status >= 400 ? 'red.300' : 'green.300'}>{log.status}</Text></Text>}
                          {log.duration && <Text>duration: <Text as="span" color={log.duration > 3000 ? 'orange.300' : 'gray.300'}>{log.duration}ms</Text></Text>}
                        </>
                      )}
                    </HStack>
                  </Box>
                ))
              )}
            </Box>
            <Text fontSize="xs" color="rgba(245,240,232,0.6)" mt={2}>实时更新中... 显示最近 200 条日志</Text>
          </TabPanel>

          {/* 慢请求分析Tab */}
          <TabPanel px={0}>
            <SlowAnalysisTab />
          </TabPanel>

          {/* Trace追踪Tab */}
          <TabPanel px={0}>
            <TraceTab />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* 日志详情弹窗（前后端通用） */}
      <Modal isOpen={isDetailOpen} onClose={onDetailClose} size="xl">
        <ModalOverlay />
        <ModalContent bg="warm.800" color="gray.100">
          <ModalHeader>
            {logDetail?.source === 'frontend' ? '前端错误详情' : '后端日志详情'}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {logDetail && (
              logDetail.source === 'frontend' ? <FrontendDetail log={logDetail} /> : <BackendDetail log={logDetail} />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

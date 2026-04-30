/**
 * 日志监控页面
 * 实时查看后端日志、慢请求、错误聚合
 */

import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Heading,
  HStack,
  VStack,
  Select,
  Input,
  Button,
  Badge,
  Text,
  Flex,
  Card,
  CardBody,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  useToast,
} from '@chakra-ui/react';
import { useSocket } from '../../contexts/SocketContext';

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ errors: 0, slow: 0, total: 0, errorRate: '0', slowRate: '0' });
  const [files, setFiles] = useState([]);
  const [filter, setFilter] = useState({
    date: '',
    level: '',
    search: '',
  });
  const [loading, setLoading] = useState(false);
  const [isAlerting, setIsAlerting] = useState(false);
  const logContainerRef = useRef(null);
  const toast = useToast();
  const { socket } = useSocket();

  // 加载日志文件列表
  useEffect(() => {
    fetch('/api/logs/files')
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
    fetch('/api/logs/stats')
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
  }, [logs]);

  // 加载日志
  const loadLogs = () => {
    setLoading(true);
    const date = filter.date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const params = new URLSearchParams();
    if (filter.level) params.set('level', filter.level);
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
  }, [filter.date, filter.level, filter.search]);

  // WebSocket 实时更新
  useEffect(() => {
    if (!socket) return;

    const handleNewLogs = ({ logs: newLogs }) => {
      setLogs(prev => {
        const combined = [...newLogs.reverse(), ...prev];
        return combined.slice(0, 200);
      });
    };

    const handleAlert = ({ type, message, time }) => {
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

  const levelColor = {
    error: 'red',
    slow: 'purple',
    warn: 'orange',
    info: 'blue',
    debug: 'gray',
  };

  const levelBg = {
    error: 'red.900',
    slow: 'purple.900',
    warn: 'orange.900',
    info: 'gray.800',
    debug: 'gray.800',
  };

  const handleClearFilter = () => {
    setFilter({ date: filter.date, level: '', search: '' });
  };

  return (
    <Box p={4}>
      <Flex justify="space-between" align="center" mb={4}>
        <Heading size="lg">日志监控</Heading>
        <Badge
          colorScheme="red"
          p={2}
          fontSize="md"
          animate={isAlerting ? 'pulse' : 'none'}
        >
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
      </HStack>

      {/* 过滤器 */}
      <HStack mb={4} spacing={3}>
        <Select
          placeholder="选择日期"
          value={filter.date}
          onChange={e => setFilter(f => ({ ...f, date: e.target.value }))}
          maxW="150px"
        >
          {files.map(f => (
            <option key={f.name} value={f.date}>
              {f.date} ({f.sizeFormatted})
            </option>
          ))}
        </Select>
        <Select
          placeholder="日志级别"
          value={filter.level}
          onChange={e => setFilter(f => ({ ...f, level: e.target.value }))}
          maxW="120px"
        >
          <option value="">全部</option>
          <option value="error">错误</option>
          <option value="slow">慢请求</option>
          <option value="warn">警告</option>
          <option value="info">信息</option>
        </Select>
        <Input
          placeholder="搜索 trace-id / 关键词"
          value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          maxW="250px"
        />
        <Button onClick={loadLogs} isLoading={loading} colorScheme="blue">
          刷新
        </Button>
        {(filter.level || filter.search) && (
          <Button onClick={handleClearFilter} variant="ghost">
            清除筛选
          </Button>
        )}
      </HStack>

      {/* 快捷过滤按钮 */}
      <HStack mb={4} spacing={2}>
        <Button size="sm" colorScheme="red" variant="outline" onClick={() => setFilter(f => ({ ...f, level: 'error' }))}>
          只看错误
        </Button>
        <Button size="sm" colorScheme="purple" variant="outline" onClick={() => setFilter(f => ({ ...f, level: 'slow' }))}>
          只看慢请求
        </Button>
        <Button size="sm" variant="outline" onClick={() => setFilter(f => ({ ...f, level: '' }))}>
          显示全部
        </Button>
      </HStack>

      {/* 实时日志流 */}
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
        sx={{
          '&::-webkit-scrollbar': { width: '8px' },
          '&::-webkit-scrollbar-track': { bg: 'gray.800' },
          '&::-webkit-scrollbar-thumb': { bg: 'gray.600', borderRadius: '4px' },
        }}
      >
        {logs.length === 0 ? (
          <Text color="gray.500" textAlign="center" py={8}>
            暂无日志数据
          </Text>
        ) : (
          logs.map((log, i) => (
            <Box
              key={`${log.time}-${i}`}
              mb={2}
              p={2}
              bg={levelBg[log.level] || 'gray.800'}
              borderRadius="sm"
              borderLeft="3px solid"
              borderLeftColor={`${levelColor[log.level] || 'gray'}.400`}
            >
              <HStack spacing={2} mb={1}>
                <Text color="gray.400" fontSize="xs">
                  {log.time?.slice(11, 23)}
                </Text>
                <Badge
                  colorScheme={levelColor[log.level]}
                  fontSize="0.6rem"
                  textTransform="uppercase"
                >
                  {log.level}
                </Badge>
                <Text fontWeight="bold">{log.message}</Text>
              </HStack>
              <HStack spacing={4} fontSize="0.75rem" color="gray.400" flexWrap="wrap">
                {log.requestId && (
                  <Text>
                    trace: <Text as="span" color="cyan.300">{log.requestId}</Text>
                  </Text>
                )}
                {log.method && (
                  <Text>
                    method: <Text as="span" color="green.300">{log.method}</Text>
                  </Text>
                )}
                {log.path && (
                  <Text>
                    path: <Text as="span" color="yellow.300">{log.path}</Text>
                  </Text>
                )}
                {log.status && (
                  <Text>
                    status: <Text as="span" color={log.status >= 400 ? 'red.300' : 'green.300'}>{log.status}</Text>
                  </Text>
                )}
                {log.duration && (
                  <Text>
                    duration: <Text as="span" color={log.duration > 3000 ? 'orange.300' : 'gray.300'}>{log.duration}ms</Text>
                  </Text>
                )}
              </HStack>
            </Box>
          ))
        )}
      </Box>

      <Text fontSize="xs" color="gray.500" mt={2}>
        实时更新中... 显示最近 200 条日志
      </Text>
    </Box>
  );
}

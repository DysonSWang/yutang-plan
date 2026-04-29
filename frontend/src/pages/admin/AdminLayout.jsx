import { useState, useEffect, useCallback } from 'react';
import {
  Box, Flex, VStack, Text, Badge, Icon, HStack, Popover, PopoverTrigger, PopoverContent,
  PopoverBody, PopoverHeader, Button, Divider, useToast, Spinner
} from '@chakra-ui/react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { alerts as alertsApi } from '../../utils/api';
import { DashboardIcon, UsersIcon, FemaleIcon, ChatIcon, BrainIcon, ChartIcon, FishIcon, CalendarIcon, MembershipIcon } from '../../components/Icons';
import { FiBell, FiAlertTriangle, FiInfo, FiCheck, FiX, FiRefreshCw } from 'react-icons/fi';

const navItems = [
  { path: '/admin', label: '工作台', icon: DashboardIcon },
  { path: '/admin/clients', label: '客户', icon: UsersIcon },
  { path: '/admin/girls', label: '女生', icon: FemaleIcon },
  { path: '/admin/dates', label: '约会', icon: CalendarIcon },
  { path: '/admin/chat', label: '聊天', icon: ChatIcon },
  { path: '/admin/workbench', label: '军师', icon: BrainIcon },
  { path: '/admin/progress', label: '进度', icon: ChartIcon },
  { path: '/admin/membership', label: '会员管理', icon: MembershipIcon },
];

const SEVERITY_COLOR = { P0: 'red', P1: 'orange', P2: 'gray' };
const SEVERITY_LABEL = { P0: '紧急', P1: '重要', P2: '通知' };

// 预警面板组件
function AlertPanel({ alerts, stats, loading, onRefresh, onAcknowledge, onDismiss }) {
  const toast = useToast();

  const handleAcknowledge = async (id) => {
    try {
      await onAcknowledge(id);
    } catch (e) {
      toast({ title: '操作失败', status: 'error', duration: 2000 });
    }
  };

  const handleDismiss = async (id) => {
    try {
      await onDismiss(id);
    } catch (e) {
      toast({ title: '操作失败', status: 'error', duration: 2000 });
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000 / 60);
    if (diff < 60) return `${diff}分钟前`;
    if (diff < 1440) return `${Math.floor(diff / 60)}小时前`;
    return `${Math.floor(diff / 1440)}天前`;
  };

  return (
    <Box>
      {/* 统计栏 */}
      <HStack spacing={2} px={4} py={2} bg="gray.700" borderRadius="md" mb={3}>
        <HStack spacing={1}>
          <Badge colorScheme="red">{stats?.p0 || 0}</Badge>
          <Text fontSize="xs" color="gray.400">紧急</Text>
        </HStack>
        <HStack spacing={1}>
          <Badge colorScheme="orange">{stats?.p1 || 0}</Badge>
          <Text fontSize="xs" color="gray.400">重要</Text>
        </HStack>
        <HStack spacing={1}>
          <Badge colorScheme="gray">{stats?.p2 || 0}</Badge>
          <Text fontSize="xs" color="gray.400">通知</Text>
        </HStack>
        <Button size="xs" variant="ghost" colorScheme="teal" ml="auto" leftIcon={<Icon as={FiRefreshCw} />}
          onClick={onRefresh} isLoading={loading}>
          刷新
        </Button>
      </HStack>

      {/* 预警列表 */}
      {loading && alerts.length === 0 ? (
        <Flex justify="center" py={6}><Spinner size="sm" /></Flex>
      ) : alerts.length === 0 ? (
        <Text color="gray.500" textAlign="center" py={6} fontSize="sm">暂无预警</Text>
      ) : (
        <VStack spacing={2} align="stretch" maxH="400px" overflowY="auto" pr={1}>
          {alerts.map(alert => (
            <Box key={alert.id} p={3} bg="gray.700" borderRadius="md" borderLeft="3px solid"
              borderLeftColor={SEVERITY_COLOR[alert.severity] + '.400'}>
              <Flex justify="space-between" align="start" mb={1}>
                <HStack spacing={2}>
                  <Badge colorScheme={SEVERITY_COLOR[alert.severity]} size="sm">
                    {SEVERITY_LABEL[alert.severity]}
                  </Badge>
                  {alert.girl && (
                    <Text fontSize="xs" color="teal.300" fontWeight="medium">{alert.girl.name}</Text>
                  )}
                </HStack>
                <Text fontSize="xs" color="gray.500">{formatTime(alert.createdAt)}</Text>
              </Flex>
              <Text fontSize="sm" color="gray.200" mb={1} fontWeight="medium">{alert.title}</Text>
              <Text fontSize="xs" color="gray.400" mb={2} lineClamp={2}>{alert.message}</Text>
              <HStack spacing={2} justify="flex-end">
                {alert.status === 'active' && (
                  <Button size="xs" variant="ghost" colorScheme="teal"
                    leftIcon={<Icon as={FiCheck} />}
                    onClick={() => handleAcknowledge(alert.id)}>
                    收到
                  </Button>
                )}
                <Button size="xs" variant="ghost" color="gray.500"
                  leftIcon={<Icon as={FiX} />}
                  onClick={() => handleDismiss(alert.id)}>
                  忽略
                </Button>
              </HStack>
            </Box>
          ))}
        </VStack>
      )}
    </Box>
  );
}

// 桌面端侧边导航
function DesktopSidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const [alertStats, setAlertStats] = useState({ p0: 0, p1: 0, p2: 0 });
  const [alerts, setAlerts] = useState([]);
  const [alertLoading, setAlertLoading] = useState(false);
  const toast = useToast();

  const fetchAlerts = useCallback(async () => {
    setAlertLoading(true);
    try {
      const [statsRes, listRes] = await Promise.all([
        alertsApi.stats(),
        alertsApi.list({}),
      ]);
      if (statsRes.success) setAlertStats(statsRes.stats);
      if (listRes.success) setAlerts(listRes.alerts);
    } catch (e) {
      // 非关键功能，静默失败
    } finally {
      setAlertLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const totalUnread = (alertStats.p0 || 0) + (alertStats.p1 || 0) + (alertStats.p2 || 0);

  const handleAcknowledge = async (id) => {
    await alertsApi.acknowledge(id);
    fetchAlerts();
  };

  const handleDismiss = async (id) => {
    await alertsApi.dismiss(id);
    toast({ title: '预警已忽略', status: 'info', duration: 2000 });
    fetchAlerts();
  };

  return (
    <Box
      w="220px"
      bg="gray.800"
      p={4}
      position="fixed"
      h="100vh"
      left={0}
      top={0}
      display={{ base: 'none', lg: 'block' }}
    >
      <VStack spacing={2} align="stretch">
        <Flex align="center" gap={3} mb={6} py={2}>
          <Box
            bg="linear-gradient(135deg, #319795 0%, #00B5D8 50%, #38B2AC 100%)"
            p={2}
            borderRadius="xl"
            boxShadow="0 4px 20px rgba(49, 151, 149, 0.4)"
          >
            <Icon as={FishIcon} color="white" boxSize={6} />
          </Box>
          <Box>
            <Text
              fontSize="2xl"
              fontWeight="bold"
              bgGradient="linear(to-r, teal.300, cyan.400, teal.300)"
              bgClip="text"
              letterSpacing="wider"
            >
              追爱
            </Text>
            <Text fontSize="10px" color="gray.500" letterSpacing="2px">
              Z H U I A I
            </Text>
          </Box>
        </Flex>

        {/* 预警入口 */}
        <Popover placement="right-start">
          <PopoverTrigger>
            <Flex
              p={3}
              borderRadius="md"
              bg="transparent"
              color="gray.300"
              _hover={{ bg: totalUnread > 0 ? 'orange.900' : 'gray.700' }}
              align="center"
              gap={3}
              transition="all 0.15s ease"
              cursor="pointer"
              position="relative"
            >
              <Box position="relative">
                <Icon as={FiBell} boxSize={5} />
                {totalUnread > 0 && (
                  <Badge
                    colorScheme={alertStats.p0 > 0 ? 'red' : 'orange'}
                    fontSize="10px"
                    position="absolute"
                    top="-6px"
                    right="-8px"
                    borderRadius="full"
                    minW="18px"
                    h="18px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </Badge>
                )}
              </Box>
              <Text>预警</Text>
              {alertStats.p0 > 0 && (
                <Badge colorScheme="red" ml="auto" fontSize="10px">{alertStats.p0}P0</Badge>
              )}
            </Flex>
          </PopoverTrigger>
          <PopoverContent bg="gray.800" borderColor="gray.600" w="320px" zIndex={9999}>
            <PopoverHeader borderColor="gray.600" fontWeight="bold" color="white">
              <Flex justify="space-between" align="center">
                <Text>主动预警</Text>
                {alertStats.p0 > 0 && (
                  <Badge colorScheme="red">{alertStats.p0} 紧急待处理</Badge>
                )}
              </Flex>
            </PopoverHeader>
            <PopoverBody p={3}>
              <AlertPanel
                alerts={alerts}
                stats={alertStats}
                loading={alertLoading}
                onRefresh={fetchAlerts}
                onAcknowledge={handleAcknowledge}
                onDismiss={handleDismiss}
              />
            </PopoverBody>
          </PopoverContent>
        </Popover>

        <Divider borderColor="gray.700" />

        {navItems.map(item => (
          <NavLink key={item.path} to={item.path}>
            <Flex
              p={3}
              borderRadius="md"
              bg={location.pathname === item.path ? 'teal.600' : 'transparent'}
              color={location.pathname === item.path ? 'white' : 'gray.300'}
              _hover={{ bg: location.pathname === item.path ? 'teal.600' : 'gray.700' }}
              align="center"
              gap={3}
              transition="all 0.15s ease"
              cursor="pointer"
            >
              <Icon as={item.icon} />
              <Text>{item.label}</Text>
            </Flex>
          </NavLink>
        ))}
      </VStack>
      <Box mt="auto" pt={4} borderTop="1px" borderColor="gray.700">
        <Text color="gray.400" fontSize="sm" mb={1}>操盘手</Text>
        <Text color="white">{user?.nickname}</Text>
        <Badge colorScheme="purple" mt={1}>管理员</Badge>
      </Box>
    </Box>
  );
}

// 移动端底部 Tab 导航
function MobileBottomNav() {
  const location = useLocation();

  return (
    <Box
      display={{ base: 'block', lg: 'none' }}
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      bg="gray.800"
      borderTop="1px"
      borderColor="gray.700"
      zIndex={50}
      pb="env(safe-area-inset-bottom)"
    >
      <HStack spacing={0} justify="space-around" py={2}>
        {navItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink key={item.path} to={item.path}>
              <Flex
                direction="column"
                align="center"
                py={2}
                px={3}
                cursor="pointer"
                color={isActive ? 'teal.400' : 'gray.400'}
                transition="all 0.15s ease"
                _hover={{ color: 'teal.300' }}
                minW="60px"
              >
                <Icon as={item.icon} boxSize={5} mb={1} />
                <Text fontSize="xs">{item.label}</Text>
              </Flex>
            </NavLink>
          );
        })}
      </HStack>
    </Box>
  );
}

export default function AdminLayout() {
  return (
    <Box minH="100vh" bg="gray.900">
      {/* 桌面端侧边导航 */}
      <DesktopSidebar />

      {/* 右侧内容 - 桌面端留出侧边栏宽度，移动端全宽 */}
      <Box
        ml={{ base: 0, lg: '220px' }}
        p={{ base: 4, md: 6 }}
        pb={{ base: '80px', lg: 6 }} // 移动端为底部导航留空间
        minH="100vh"
      >
        <Outlet />
      </Box>

      {/* 移动端底部导航 */}
      <MobileBottomNav />
    </Box>
  );
}

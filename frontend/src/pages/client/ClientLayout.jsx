import { Box, Flex, VStack, Icon, Text, Badge, Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverHeader, Button, HStack, useBreakpointValue } from '@chakra-ui/react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { notifications as notifApi } from '../../utils/api';
import { FishIcon, ChatIcon, SparklesIcon, BellIcon, HomeIcon, UserIcon, CalendarIcon } from '../../components/Icons';

const navItems = [
  { path: '/', label: '首页', icon: HomeIcon },
  { path: '/profile', label: '档案', icon: UserIcon },
  { path: '/dates', label: '约会', icon: CalendarIcon },
  { path: '/chat', label: '顾问', icon: ChatIcon },
  { path: '/ai-coach', label: 'AI', icon: SparklesIcon },
  { path: '/my-pond', label: '鱼塘', icon: FishIcon },
];

// 桌面端侧边导航
function DesktopSidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    loadUnreadCount();
  }, []);

  const loadUnreadCount = async () => {
    try {
      const res = await notifApi.list();
      if (res.success) {
        setUnreadCount(res.unreadCount);
        setNotifications(res.notifications);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notifApi.readAll();
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Box
      w="200px"
      bg="gray.800"
      p={4}
      position="fixed"
      h="100vh"
      left={0}
      top={0}
      display={{ base: 'none', lg: 'block' }}
    >
      <VStack spacing={2} align="stretch">
        <Flex justify="space-between" align="center" mb={4}>
          <Flex align="center" gap={2}>
            <Icon as={FishIcon} color="teal.400" />
            <Text fontSize="lg" fontWeight="bold" color="teal.400">鱼塘计划</Text>
          </Flex>
          <Popover isOpen={showNotifications} onClose={() => setShowNotifications(false)}>
            <PopoverTrigger>
              <Box
                position="relative"
                cursor="pointer"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Icon as={BellIcon} color="gray.400" />
                {unreadCount > 0 && (
                  <Badge
                    position="absolute"
                    top="-5px"
                    right="-5px"
                    colorScheme="red"
                    borderRadius="full"
                    fontSize="xs"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Badge>
                )}
              </Box>
            </PopoverTrigger>
            <PopoverContent bg="gray.800" borderColor="gray.700" w="300px">
              <PopoverHeader borderColor="gray.700" display="flex" justifyContent="space-between" alignItems="center">
                <Text color="white" fontWeight="bold">通知</Text>
                {unreadCount > 0 && (
                  <Button size="xs" variant="ghost" colorScheme="teal" onClick={markAllAsRead}>
                    全部已读
                  </Button>
                )}
              </PopoverHeader>
              <PopoverBody maxH="300px" overflowY="auto">
                {notifications.length === 0 ? (
                  <Text color="gray.500" textAlign="center">暂无通知</Text>
                ) : (
                  <VStack spacing={2} align="stretch">
                    {notifications.slice(0, 10).map(n => (
                      <Box key={n.id} p={2} bg="gray.700" borderRadius="md">
                        <Text color="white" fontSize="sm" fontWeight="bold">{n.title}</Text>
                        <Text color="gray.400" fontSize="xs">{n.content}</Text>
                        <Text color="gray.500" fontSize="xs" mt={1}>
                          {new Date(n.createdAt).toLocaleString()}
                        </Text>
                      </Box>
                    ))}
                  </VStack>
                )}
              </PopoverBody>
            </PopoverContent>
          </Popover>
        </Flex>
        {navItems.map(item => (
          <NavLink key={item.path} to={item.path}>
            <Flex
              p={3}
              borderRadius="md"
              bg={location.pathname === item.path ? 'teal.600' : 'transparent'}
              color={location.pathname === item.path ? 'white' : 'gray.300'}
              _hover={{ bg: 'teal.700' }}
              align="center"
              gap={3}
              cursor="pointer"
              transition="all 0.15s ease"
            >
              <Icon as={item.icon} />
              <Text>{item.label}</Text>
            </Flex>
          </NavLink>
        ))}
      </VStack>
      <Box mt="auto" pt={4} borderTop="1px" borderColor="gray.700">
        <Text fontSize="sm" color="gray.400" mb={2}>{user?.nickname}</Text>
        <Text fontSize="xs" color="gray.500">{user?.role === 'client' ? '客户' : '其他'}</Text>
      </Box>
    </Box>
  );
}

// 移动端底部 Tab 导航
function MobileBottomNav() {
  const location = useLocation();
  const { on } = useSocket();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const loadUnread = async () => {
      try {
        const res = await notifApi.list();
        if (res.success) {
          setUnreadCount(res.unreadCount);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadUnread();

    on('notification:new', () => {
      setUnreadCount(prev => prev + 1);
    });
  }, []);

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
                position="relative"
              >
                <Icon as={item.icon} boxSize={5} mb={1} />
                <Text fontSize="xs">{item.label}</Text>
                {item.path === '/chat' && unreadCount > 0 && (
                  <Badge
                    position="absolute"
                    top="5px"
                    right="15px"
                    colorScheme="red"
                    borderRadius="full"
                    fontSize="xs"
                    minW="18px"
                    h="18px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </Flex>
            </NavLink>
          );
        })}
      </HStack>
    </Box>
  );
}

export default function ClientLayout() {
  return (
    <Box minH="100vh" bg="gray.900">
      {/* 桌面端侧边导航 */}
      <DesktopSidebar />

      {/* 右侧内容 */}
      <Box
        ml={{ base: 0, lg: '200px' }}
        p={{ base: 4, md: 6 }}
        pb={{ base: '80px', lg: 6 }}
        minH="100vh"
      >
        <Outlet />
      </Box>

      {/* 移动端底部导航 */}
      <MobileBottomNav />
    </Box>
  );
}

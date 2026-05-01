import { Box, Flex, VStack, Icon, Text, Badge, Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverHeader, Button, HStack, useToast } from '@chakra-ui/react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { notifications as notifApi } from '../../utils/api';
import { FishIcon, ChatIcon, SparklesIcon, BellIcon, UserIcon, CalendarIcon, BookIcon, GiftIcon } from '../../components/Icons';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

const navItems = [
  { path: '/chat', label: 'Mo哥', icon: ChatIcon },
  { path: '/ai-coach', label: 'AI', icon: SparklesIcon },
  { path: '/my-pond', label: '缘分', icon: FishIcon },
  { path: '/dates', label: '约会', icon: CalendarIcon },
  { path: '/learning', label: '学习', icon: BookIcon },
  { path: '/profile', label: '我的', icon: UserIcon },
];

// 桌面端侧边导航
function DesktopSidebar({ chatUnread, unreadCount, notifications, showNotifications, setShowNotifications, markAllAsRead }) {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <Box
      w="220px"
      bg="rgba(255,255,255,0.025)"
      backdropFilter="blur(20px)"
      borderRight="1px solid"
      borderColor="rgba(255,255,255,0.07)"
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
            <Icon as={FishIcon} color="brand.500" />
            <Text fontSize="lg" fontWeight="bold" color="brand.500" fontFamily="heading">追爱</Text>
          </Flex>
          <Popover isOpen={showNotifications} onClose={() => setShowNotifications(false)}>
            <PopoverTrigger>
              <Box
                position="relative"
                cursor="pointer"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Icon as={BellIcon} color="abyss.400" />
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
            <PopoverContent bg="abyss.900" border="1px solid rgba(255,255,255,0.08)" w="300px">
              <PopoverHeader borderColor="rgba(255,255,255,0.06)" display="flex" justifyContent="space-between" alignItems="center">
                <Text color="white" fontWeight="bold">通知</Text>
                {unreadCount > 0 && (
                  <Button size="xs" variant="ghost" color="brand.500" onClick={markAllAsRead}>
                    全部已读
                  </Button>
                )}
              </PopoverHeader>
              <PopoverBody maxH="300px" overflowY="auto">
                {notifications.length === 0 ? (
                  <Text color="abyss.500" textAlign="center">暂无通知</Text>
                ) : (
                  <VStack spacing={2} align="stretch">
                    {notifications.slice(0, 10).map(n => (
                      <Box key={n.id} p={3} bg="rgba(255,255,255,0.04)" borderRadius="md" border="1px solid rgba(255,255,255,0.06)">
                        <Text color="white" fontSize="sm" fontWeight="bold">{n.title}</Text>
                        <Text color="abyss.300" fontSize="xs" mt={1}>{n.content}</Text>
                        <Text color="abyss.500" fontSize="xs" mt={1}>
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
              bg={location.pathname === item.path ? 'rgba(0, 212, 170, 0.15)' : 'transparent'}
              color={location.pathname === item.path ? 'brand.400' : 'abyss.300'}
              _hover={{ bg: 'rgba(255,255,255,0.06)', color: 'white' }}
              align="center"
              gap={3}
              cursor="pointer"
              transition="all 0.15s ease"
              position="relative"
            >
              <Icon as={item.icon} />
              <HStack spacing={2}>
                <Text>{item.label}</Text>
                {item.path === '/chat' && chatUnread > 0 && (
                  <Badge colorScheme="red" borderRadius="full" fontSize="xs" minW="18px" h="18px" display="flex" alignItems="center" justifyContent="center">
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </Badge>
                )}
              </HStack>
            </Flex>
          </NavLink>
        ))}
      </VStack>
      <Box mt="auto" pt={4} borderTop="1px solid rgba(255,255,255,0.06)">
        <Text fontSize="sm" color="abyss.300" mb={1}>{user?.nickname}</Text>
        <Text fontSize="xs" color="abyss.500">{user?.role === 'client' ? '客户' : '其他'}</Text>
      </Box>
    </Box>
  );
}

// 移动端底部 Tab 导航
function MobileBottomNav({ chatUnread, unreadCount }) {
  const location = useLocation();

  return (
    <Box
      display={{ base: 'block', lg: 'none' }}
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      bg="rgba(10,15,26,0.95)"
      backdropFilter="blur(20px)"
      borderTop="1px solid rgba(255,255,255,0.07)"
      zIndex={50}
      pb="env(safe-area-inset-bottom)"
    >
      <HStack spacing={0} justify="space-around" py={2}>
        {navItems.map(item => {
          const isActive = location.pathname === item.path;
          const isChat = item.path === '/chat';
          return (
            <NavLink key={item.path} to={item.path}>
              <Flex
                direction="column"
                align="center"
                py={2}
                px={3}
                cursor="pointer"
                color={isActive ? 'brand.500' : 'abyss.400'}
                transition="all 0.15s ease"
                _hover={{ color: 'brand.400' }}
                minW="60px"
                position="relative"
              >
                <Icon as={item.icon} boxSize={5} mb={1} />
                <Text fontSize="xs">{item.label}</Text>
                {isChat && chatUnread > 0 && (
                  <Badge
                    position="absolute"
                    top="2px"
                    right="8px"
                    colorScheme="red"
                    borderRadius="full"
                    fontSize="xs"
                    minW="18px"
                    h="18px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </Badge>
                )}
                {!isChat && unreadCount > 0 && (
                  <Badge
                    position="absolute"
                    top="2px"
                    right="8px"
                    colorScheme="red"
                    borderRadius="full"
                    fontSize="xs"
                    minW="18px"
                    h="18px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
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
  const { on } = useSocket();
  const location = useLocation();
  const toast = useToast();
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // 初始加载通知未读数和聊天未读数
  const loadInitialData = useCallback(async () => {
    try {
      const [notifRes, chatRes] = await Promise.all([
        notifApi.list(),
        fetch(`${API_BASE}/api/chat/my-sessions`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('zhuiai_token')}` }
        }).then(r => r.json()).catch(() => ({ success: false }))
      ]);
      if (notifRes.success) {
        setUnreadCount(notifRes.unreadCount);
        setNotifications(notifRes.notifications);
      }
      if (chatRes.success && chatRes.sessions?.length > 0) {
        const totalUnread = chatRes.sessions.reduce((sum, s) => sum + (s.unreadCount || 0), 0);
        setChatUnread(totalUnread);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // socket 事件（仅在 ClientLayout 注册一次，避免 Desktop/Mobile 竞争）
  useEffect(() => {
    on('chat-log:new', (log) => {
      toast({
        title: '操盘手发来代聊记录',
        description: log.content?.slice(0, 30) + (log.content?.length > 30 ? '...' : ''),
        status: 'info',
        duration: 5000,
        isClosable: true,
        position: 'top',
      });
    });

    on('notification:new', () => {
      setUnreadCount(prev => prev + 1);
    });

    on('message:new', (message) => {
      if (message.senderRole === 'client') return;
      if (location.pathname !== '/chat') {
        setChatUnread(prev => prev + 1);
      }
    });

    const handleChatEnter = () => setChatUnread(0);
    window.addEventListener('chat-enter', handleChatEnter);
    return () => {
      window.removeEventListener('chat-enter', handleChatEnter);
    };
  }, [on, toast, location.pathname]);

  const markAllAsRead = async () => {
    try {
      await notifApi.readAll();
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Box minH="100vh" bg="abyss.950">
      <DesktopSidebar
        chatUnread={chatUnread}
        unreadCount={unreadCount}
        notifications={notifications}
        showNotifications={showNotifications}
        setShowNotifications={setShowNotifications}
        markAllAsRead={markAllAsRead}
      />
      <Box
        ml={{ base: 0, lg: '200px' }}
        p={{ base: 4, md: 6 }}
        pb={{ base: '80px', lg: 6 }}
        minH="100vh"
      >
        <Outlet />
      </Box>
      <MobileBottomNav chatUnread={chatUnread} unreadCount={unreadCount} />
    </Box>
  );
}

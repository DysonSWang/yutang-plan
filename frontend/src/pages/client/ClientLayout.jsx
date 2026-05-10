import { Box, Flex, VStack, Icon, Text, Badge, HStack, useToast } from '@chakra-ui/react';
import { NavLink, useLocation } from 'react-router-dom';
import KeepAliveOutlet from '../../components/KeepAliveOutlet';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { FishIcon, ChatIcon, SparklesIcon, UserIcon, BookIcon } from '../../components/Icons';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

const navItems = [
  { path: '/chat', label: 'Mo哥', icon: ChatIcon },
  { path: '/ai-coach', label: 'AI', icon: SparklesIcon },
  { path: '/my-pond', label: '缘分', icon: FishIcon },
  { path: '/learning', label: '学习', icon: BookIcon },
  { path: '/profile', label: '我的', icon: UserIcon },
];

// 桌面端侧边导航
function DesktopSidebar({ chatUnread }) {
  const location = useLocation();

  return (
    <Box
      w="220px"
      bg="rgba(255,255,255,0.02)"
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
        <Flex align="center" gap={2} mb={4}>
          <Icon as={FishIcon} color="gold.500" />
          <Text fontSize="lg" fontWeight="bold" color="gold.500" fontFamily="heading">追AI</Text>
        </Flex>
        {navItems.map(item => (
          <NavLink key={item.path} to={item.path}>
            <Flex
              p={3}
              borderRadius="md"
              bg={location.pathname === item.path ? 'rgba(226,176,68,0.12)' : 'transparent'}
              color={location.pathname === item.path ? 'gold.400' : 'rgba(245,240,232,0.6)'}
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
      <Box mt="auto" pt={4} borderTop="1px solid rgba(255,255,255,0.06)" />
    </Box>
  );
}

// 移动端底部 Tab 导航
function MobileBottomNav({ chatUnread }) {
  const location = useLocation();

  return (
    <Box
      display={{ base: 'block', lg: 'none' }}
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      bg="rgba(17,17,16,0.95)"
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
                color={isActive ? 'gold.500' : 'rgba(245,240,232,0.4)'}
                transition="all 0.15s ease"
                _hover={{ color: 'gold.400' }}
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
  const [chatUnread, setChatUnread] = useState(0);

  // 初始加载聊天未读数
  const loadInitialData = useCallback(async () => {
    try {
      const chatRes = await fetch(`${API_BASE}/api/chat/my-sessions`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('zhuiai_token')}` }
      }).then(r => r.json()).catch(() => ({ success: false }));
      if (chatRes.success && chatRes.sessions?.length > 0) {
        const totalUnread = chatRes.sessions.reduce((sum, s) => sum + (s.unreadCount || 0), 0);
        setChatUnread(totalUnread);
      }
    } catch (e) {
      console.error('加载数据失败', e);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // socket 事件
  useEffect(() => {
    const unsub1 = on('chat-log:new', (log) => {
      toast({
        title: '操盘手发来代聊记录',
        description: log.content?.slice(0, 30) + (log.content?.length > 30 ? '...' : ''),
        status: 'info',
        duration: 3000,
        isClosable: true,
        position: 'top',
      });
    });

    const unsub2 = on('message:new', (message) => {
      if (message.senderRole === 'client') return;
      if (location.pathname !== '/chat') {
        setChatUnread(prev => prev + 1);
      }
    });

    const handleChatEnter = () => setChatUnread(0);
    window.addEventListener('chat-enter', handleChatEnter);
    return () => {
      window.removeEventListener('chat-enter', handleChatEnter);
      unsub1(); unsub2();
    };
  }, [on, toast, location.pathname]);

  return (
    <Box minH="100vh" bg="warm.950">
      <DesktopSidebar chatUnread={chatUnread} />
      <Box
        ml={{ base: 0, lg: '200px' }}
        p={{ base: 4, md: 6 }}
        pb={{ base: '80px', lg: 6 }}
        minH="100vh"
      >
        <KeepAliveOutlet />
      </Box>
      <MobileBottomNav chatUnread={chatUnread} />
    </Box>
  );
}
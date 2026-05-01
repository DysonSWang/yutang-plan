import {
  Box, Flex, VStack, Text, Badge, Icon, HStack,
  Button, Divider,
} from '@chakra-ui/react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { DashboardIcon, UsersIcon, FemaleIcon, ChatIcon, BrainIcon, ChartIcon, FishIcon, CalendarIcon, MembershipIcon, BookIcon } from '../../components/Icons';
import { FiActivity, FiLogOut } from 'react-icons/fi';

const navItems = [
  { path: '/admin', label: '工作台', icon: DashboardIcon },
  { path: '/admin/clients', label: '客户', icon: UsersIcon },
  { path: '/admin/girls', label: '女生', icon: FemaleIcon },
  { path: '/admin/dates', label: '约会', icon: CalendarIcon },
  { path: '/admin/chat', label: '聊天', icon: ChatIcon },
  { path: '/admin/workbench', label: '军师', icon: BrainIcon },
  { path: '/admin/progress', label: '进度', icon: ChartIcon },
  { path: '/admin/chapters', label: '学习版块', icon: BookIcon },
  { path: '/admin/activity', label: '分析看板', icon: FiActivity },
  { path: '/admin/membership', label: '会员管理', icon: MembershipIcon },
  { path: '/admin/logs', label: '日志监控', icon: FiActivity },
];

// 桌面端侧边导航
function DesktopSidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { chatUnreadCount } = useSocket();

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
      overflowY="auto"
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
              position="relative"
            >
              <Box position="relative">
                <Icon as={item.icon} />
                {item.path === '/admin/chat' && chatUnreadCount > 0 && (
                  <Badge
                    colorScheme="red"
                    fontSize="10px"
                    position="absolute"
                    top="-6px"
                    right="-10px"
                    borderRadius="full"
                    minW="18px"
                    h="18px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                  </Badge>
                )}
              </Box>
              <Text>{item.label}</Text>
            </Flex>
          </NavLink>
        ))}
      </VStack>
      <Box mt="auto" pt={4} borderTop="1px" borderColor="gray.700">
        <Text color="gray.400" fontSize="sm" mb={1}>操盘手</Text>
        <Text color="white">{user?.nickname}</Text>
        <Badge colorScheme="purple" mt={1}>管理员</Badge>
        <Button
          size="sm"
          variant="ghost"
          colorScheme="red"
          leftIcon={<FiLogOut />}
          mt={2}
          onClick={logout}
          w="full"
        >
          退出登录
        </Button>
      </Box>
    </Box>
  );
}

// 移动端底部 Tab 导航
function MobileBottomNav() {
  const location = useLocation();
  const { chatUnreadCount } = useSocket();

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
      <HStack spacing={0} justify="space-around" py={2} overflowX="auto">
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
                <Box position="relative" mb={1}>
                  <Icon as={item.icon} boxSize={5} />
                  {item.path === '/admin/chat' && chatUnreadCount > 0 && (
                    <Badge
                      colorScheme="red"
                      fontSize="10px"
                      position="absolute"
                      top="-6px"
                      right="-12px"
                      borderRadius="full"
                      minW="16px"
                      h="16px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      px={0}
                    >
                      {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                    </Badge>
                  )}
                </Box>
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
      <DesktopSidebar />

      <Box
        ml={{ base: 0, lg: '220px' }}
        p={{ base: 4, md: 6 }}
        pb={{ base: '80px', lg: 6 }}
        minH="100vh"
      >
        <Outlet />
      </Box>

      <MobileBottomNav />
    </Box>
  );
}

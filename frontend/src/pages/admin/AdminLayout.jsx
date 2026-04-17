import { Box, Flex, VStack, Text, Badge, Icon, useBreakpointValue, HStack, Spacer } from '@chakra-ui/react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardIcon, UsersIcon, FemaleIcon, ChatIcon, BrainIcon, ChartIcon, FishIcon } from '../../components/Icons';

const navItems = [
  { path: '/admin', label: '工作台', icon: DashboardIcon },
  { path: '/admin/clients', label: '客户', icon: UsersIcon },
  { path: '/admin/girls', label: '女生', icon: FemaleIcon },
  { path: '/admin/chat', label: '聊天', icon: ChatIcon },
  { path: '/admin/workbench', label: '军师', icon: BrainIcon },
  { path: '/admin/progress', label: '进度', icon: ChartIcon },
];

// 桌面端侧边导航
function DesktopSidebar() {
  const location = useLocation();
  const { user } = useAuth();

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
        <Flex align="center" gap={2} mb={4}>
          <Icon as={FishIcon} color="teal.400" boxSize={6} />
          <Text fontSize="xl" fontWeight="bold" color="teal.400">鱼塘系统</Text>
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
  const isMobile = useBreakpointValue({ base: true, lg: false });

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

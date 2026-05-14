import { useNavigate } from 'react-router-dom';
import { Box, Heading, Text, SimpleGrid, Card, CardBody, Icon, HStack, Badge, Button, VStack, Divider, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, Skeleton, SkeletonCircle, Center } from '@chakra-ui/react';
import { ChatIcon, SparklesIcon, FishIcon, BookIcon, GiftIcon, CrownIcon, CheckIcon, CalendarIcon } from '../../components/Icons';
import useKeepAliveData from '../../hooks/useKeepAliveData';
import { clients, girls } from '../../utils/api';
import ServiceProgressBoard from '../../components/client/ServiceProgressBoard';
import AnimatedNumber from '../../components/AnimatedNumber';
import EmptyState from '../../components/EmptyState';



const STAGE_MAP = {
  '背调': 1, '建池': 2, '约会': 3, '锁定': 4, '维护': 5, '未开始': 0
};

/** 图标容器 — 快捷入口卡片的底座 */
function IconBox({ icon, bg = 'gold.500', size = '48px' }) {
  return (
    <Box
      w={size} h={size}
      borderRadius="14px"
      bgGradient={`linear(135deg, ${bg}, ${bg === 'gold.500' ? 'gold.400' : bg})`}
      display="flex" alignItems="center" justifyContent="center"
      boxShadow={`0 4px 16px ${bg === 'gold.500' ? 'rgba(226,176,68,0.25)' : 'rgba(0,0,0,0.2)'}`}
      position="relative"
      overflow="hidden"
      _before={{
        content: '""',
        position: 'absolute',
        top: 0, left: 0, right: 0,
        h: '50%',
        bg: 'rgba(255,255,255,0.15)',
        borderRadius: '14px 14px 0 0',
      }}
    >
      <Icon as={icon} w={5} h={5} color="warm.950" position="relative" zIndex={1} />
    </Box>
  );
}

/** 数据概览卡片（Bento 非对称布局） */
function StatCard({ label, value, icon, accent = 'gold', subtitle, colSpan = 1 }) {
  return (
    <Card
      className="hover-lift"
      bg="rgba(255,255,255,0.03)"
      border="1px solid rgba(255,255,255,0.08)"
      borderRadius="xl"
      gridColumn={`span ${colSpan}`}
      _hover={{
        bg: 'rgba(226,176,68,0.04)',
        borderColor: 'rgba(226,176,68,0.15)',
        transform: 'translateY(-4px) scale(1.01)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.4), 0 0 24px rgba(226,176,68,0.12)'
      }}
      transition="all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
    >
      <CardBody>
        <HStack justify="space-between">
          <VStack align="start" spacing={1}>
            <Text color="rgba(245,240,232,0.55)" fontSize="xs" letterSpacing="0.05em">{label}</Text>
            <Text color="white" fontSize="2xl" fontWeight="700" fontFamily="heading">
              <AnimatedNumber value={value} />
            </Text>
            {subtitle && <Text color="rgba(245,240,232,0.55)" fontSize="xs">{subtitle}</Text>}
          </VStack>
          <Box opacity={0.6}>
            <Icon as={icon} boxSize={6} color={`${accent}.400`} />
          </Box>
        </HStack>
      </CardBody>
    </Card>
  );
}

const QUICK_ENTRIES = [
  { path: '/chat', label: '和Mo哥一起追ai', desc: '一起追ai', icon: ChatIcon, gradient: 'linear(135deg, gold.500, gold.400)' },
  { path: '/ai-coach', label: 'AI教练咨询', desc: '24小时在线', icon: SparklesIcon, gradient: 'linear(135deg, gold.500, gold.400)' },
  { path: '/my-pond', label: '查看我的缘分', desc: '管理我的缘分', icon: FishIcon, gradient: 'linear(135deg, rose.500, rose.400)' },
  { path: '/learning', label: '学习中心', desc: 'Mo哥宝典章节学习', icon: BookIcon, gradient: 'linear(135deg, gold.500, gold.400)' },
  { path: '/dates', label: '约会与方案', desc: '约会确认和AI方案', icon: GiftIcon, gradient: 'linear(135deg, gold.500, gold.400)' },
  { path: '/my-pond#calendar', label: '我的日历', desc: '查看约会与活动', icon: CalendarIcon, gradient: 'linear(135deg, gold.500, gold.400)' },
];

export default function ClientHome() {
  const navigate = useNavigate();
  const { isOpen: isPricingOpen, onClose: onPricingClose } = useDisclosure();

  const { data, isInitialLoad, refresh } = useKeepAliveData(async () => {
    const [clientRes, girlsRes] = await Promise.all([clients.me(), girls.list()]);
    let stats = {
      girlCount: 0, dateCount: 0, serviceStage: '', currentStage: 0,
      intimacyCount: 0, longTermCount: 0
    };
    if (clientRes.success) {
      const client = clientRes.client;
      stats.girlCount = client.girls?.length ?? client.girlCount ?? 0;
      stats.dateCount = client.dateCount || 0;
      stats.serviceStage = client.serviceStage || '未开始';
      stats.currentStage = STAGE_MAP[stats.serviceStage] || 0;
      try {
        if (girlsRes.success) {
          stats.intimacyCount = girlsRes.girls.filter(g => g.stage === '暧昧').length;
          stats.longTermCount = girlsRes.girls.filter(g => g.stage === '长期').length;
        }
      } catch { /* ignore */ }
    }
    
    return { stats };
  }, { key: '/home' });

  const stats = data?.stats ?? {
    girlCount: 0, dateCount: 0, serviceStage: '', currentStage: 0,
    intimacyCount: 0, longTermCount: 0
  };

  if (isInitialLoad) {
    return (
      <Box>
        <Skeleton height="80px" mb={8} borderRadius="xl" />
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={8}>
          {[1,2,3,4].map(i => <Skeleton key={i} height="90px" borderRadius="xl" />)}
        </SimpleGrid>
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4} mb={8}>
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} height="120px" borderRadius="xl" />)}
        </SimpleGrid>
      </Box>
    );
  }

  const hasAnyData = stats.girlCount > 0 || stats.dateCount > 0;

  return (
    <Box>
      {/* ---- Hero 问候 ---- */}
      <Box className="stagger-1" mb={8}>
        <Heading
          color="white" mb={2}
          fontFamily="heading" fontWeight="700" fontSize={{ base: '2xl', md: '3xl' }}
        >
          欢迎回来
        </Heading>
        <Text color="rgba(245,240,232,0.6)" fontSize="sm">
          {stats.serviceStage !== '未开始'
            ? `服务阶段 · ${stats.serviceStage}`
            : hasAnyData
              ? `已添加 ${stats.girlCount} 位女生`
              : '开启你的缘分之旅'}
        </Text>
      </Box>

      {/* ---- 数据概览（Bento 2×2 非对称） ---- */}
      {hasAnyData ? (
        <Box className="stagger-2" mb={10}>
          <Text color="rgba(245,240,232,0.55)" fontSize="xs" mb={3} letterSpacing="0.1em" textTransform="uppercase">
            数据概览
          </Text>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            <StatCard label="缘分" value={stats.girlCount} icon={FishIcon} accent="rose" subtitle="已添加" colSpan={2} />
            <StatCard label="约会" value={stats.dateCount} icon={CalendarIcon} accent="gold" subtitle="已完成" colSpan={2} />
            <StatCard label="暧昧" value={stats.intimacyCount} icon={SparklesIcon} accent="yellow" subtitle="进行中" />
            <StatCard label="长期" value={stats.longTermCount} icon={CrownIcon} accent="green" subtitle="已锁定" />
          </SimpleGrid>
        </Box>
      ) : (
        <Box className="stagger-2" mb={10}>
          <EmptyState
            type="pond"
            onAction={() => navigate('/my-pond')}
            actionLabel="开始添加"
          />
        </Box>
      )}

      {/* ---- 高端用户进度看板 ---- */}
      {false && (
        <Box className="stagger-3" mb={10}>
          <ServiceProgressBoard
            currentStage={stats.currentStage}
            stats={{ girlCount: stats.girlCount, intimacyCount: stats.intimacyCount, longTermCount: stats.longTermCount, dateCount: stats.dateCount }}
          />
        </Box>
      )}

      {/* ---- 快捷入口（Bento 3×2 非对称） ---- */}
      <Box className="stagger-4">
        <Text color="rgba(245,240,232,0.55)" fontSize="xs" mb={4} letterSpacing="0.1em" textTransform="uppercase">
          快捷入口
        </Text>
        <SimpleGrid columns={{ base: 2, sm: 3 }} spacing={4}>
          {QUICK_ENTRIES.map((entry, i) => (
            <Card
              key={entry.label}
              className={`hover-lift ${i < 2 ? 'bento-featured' : ''}`}
              bg="rgba(255,255,255,0.02)"
              border="1px solid rgba(255,255,255,0.06)"
              backdropFilter="blur(12px)"
              cursor="pointer"
              onClick={() => entry.path ? navigate(entry.path) : null}
            >
              <CardBody>
                <HStack spacing={4} align="start" justify="space-between">
                  <HStack spacing={4} align="start">
                    <IconBox icon={entry.icon} />
                    <Box>
                      <Text color="white" fontWeight="500" fontSize="sm" mb={0.5}>{entry.label}</Text>
                      <Text color="rgba(245,240,232,0.55)" fontSize="xs">{entry.desc}</Text>
                    </Box>
                  </HStack>
                  <Text color="rgba(245,240,232,0.25)" fontSize="sm">›</Text>
                </HStack>
              </CardBody>
            </Card>
          ))}
        </SimpleGrid>
      </Box>

    </Box>
  );
}

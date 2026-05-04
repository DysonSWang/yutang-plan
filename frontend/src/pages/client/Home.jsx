import { useNavigate } from 'react-router-dom';
import { Box, Heading, Text, SimpleGrid, Card, CardBody, Icon, HStack, Badge, Button, VStack, Divider, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, Skeleton, SkeletonCircle, Center, Image } from '@chakra-ui/react';
import { ChatIcon, SparklesIcon, FishIcon, BookIcon, GiftIcon, CrownIcon, CheckIcon, CalendarIcon } from '../../components/Icons';
import { clients, girls, membership as membershipApi } from '../../utils/api';
import useKeepAliveData from '../../hooks/useKeepAliveData';
import ServiceProgressBoard from '../../components/client/ServiceProgressBoard';
import AnimatedNumber from '../../components/AnimatedNumber';
import EmptyState from '../../components/EmptyState';

const TYPE_LABEL = { monthly: '普惠月付', yearly: '普惠年付', premium: '高端会员' };
const TYPE_BADGE_COLOR = { monthly: 'green', yearly: 'blue', premium: 'purple' };
const TYPE_POINTS = { monthly: 500, yearly: 4444, premium: 25000 };

const PRICING_DATA = [
  { type: 'monthly', label: '普惠月付', price: 999, period: '月', perMonth: 999, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理'] },
  { type: 'yearly', label: '普惠年付', price: 8888, period: '年', perMonth: 741, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理', '年付专属优惠'] },
  { type: 'premium', label: '高端会员', price: 50000, period: '年', perMonth: 4167, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理', '优先人工顾问', '专属定制服务'] }
];

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

/** 数据概览卡片（hero 区域用） */
function StatCard({ label, value, icon, accent = 'gold', subtitle }) {
  return (
    <Card
      bg="rgba(255,255,255,0.03)"
      border="1px solid rgba(255,255,255,0.08)"
      borderRadius="xl"
      _hover={{ bg: 'rgba(226,176,68,0.04)', borderColor: 'rgba(226,176,68,0.15)' }}
    >
      <CardBody>
        <HStack justify="space-between">
          <VStack align="start" spacing={1}>
            <Text color="rgba(245,240,232,0.35)" fontSize="xs" letterSpacing="0.05em">{label}</Text>
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
  { path: null, label: '联系专属顾问', desc: '人工沟通，更私密', icon: ChatIcon, gradient: 'linear(135deg, gold.500, gold.400)' },
  { path: '/ai-coach', label: 'AI教练咨询', desc: '24小时在线', icon: SparklesIcon, gradient: 'linear(135deg, gold.500, gold.400)' },
  { path: '/my-pond', label: '查看我的缘分', desc: '管理我的缘分', icon: FishIcon, gradient: 'linear(135deg, rose.500, rose.400)' },
  { path: '/learning', label: '学习中心', desc: 'Mo哥宝典章节学习', icon: BookIcon, gradient: 'linear(135deg, gold.500, gold.400)' },
  { path: '/dates', label: '约会与方案', desc: '约会确认和AI方案', icon: GiftIcon, gradient: 'linear(135deg, gold.500, gold.400)' },
  { path: '/dates#calendar', label: '我的日历', desc: '查看约会与活动', icon: CalendarIcon, gradient: 'linear(135deg, gold.500, gold.400)' },
];

export default function ClientHome() {
  const navigate = useNavigate();
  const { isOpen: isPricingOpen, onOpen: onPricingOpen, onClose: onPricingClose } = useDisclosure();

  const { data, isInitialLoad, refresh } = useKeepAliveData(async () => {
    const [clientRes, memberRes] = await Promise.all([
      clients.me(),
      membershipApi.status().catch(() => ({ success: false }))
    ]);
    let stats = {
      girlCount: 0, dateCount: 0, serviceStage: '', currentStage: 0,
      intimacyCount: 0, longTermCount: 0
    };
    if (clientRes.success) {
      const client = clientRes.client;
      stats.girlCount = client.girlCount || 0;
      stats.dateCount = client.dateCount || 0;
      stats.serviceStage = client.serviceStage || '未开始';
      stats.currentStage = STAGE_MAP[stats.serviceStage] || 0;
      try {
        const girlsRes = await girls.list();
        if (girlsRes.success) {
          stats.intimacyCount = girlsRes.girls.filter(g => g.stage === '暧昧').length;
          stats.longTermCount = girlsRes.girls.filter(g => g.stage === '长期').length;
        }
      } catch { /* ignore */ }
    }
    const memberStatus = memberRes.success ? memberRes : null;
    return { stats, memberStatus };
  }, { key: '/home' });

  const stats = data?.stats ?? {
    girlCount: 0, dateCount: 0, serviceStage: '', currentStage: 0,
    intimacyCount: 0, longTermCount: 0
  };
  const memberStatus = data?.memberStatus;

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
      <Box className="stagger-1">
        <Heading
          color="white" mb={2}
          fontFamily="heading" fontWeight="700" fontSize={{ base: '2xl', md: '3xl' }}
        >
          欢迎回来
        </Heading>
        <Text color="rgba(245,240,232,0.3)" fontSize="sm" mb={8}>
          {stats.serviceStage !== '未开始'
            ? `服务阶段 · ${stats.serviceStage}`
            : '开启你的缘分之旅'}
        </Text>
      </Box>

      {/* ---- 数据概览（有数据时展示） ---- */}
      {hasAnyData ? (
        <Box className="stagger-2" mb={10}>
          <Text color="rgba(245,240,232,0.55)" fontSize="xs" mb={3} letterSpacing="0.1em" textTransform="uppercase">
            数据概览
          </Text>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            <StatCard label="缘分" value={stats.girlCount} icon={FishIcon} accent="rose" subtitle="已添加" />
            <StatCard label="约会" value={stats.dateCount} icon={CalendarIcon} accent="gold" subtitle="已完成" />
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
      {memberStatus?.membership?.type === 'premium' && (
        <Box className="stagger-3" mb={10}>
          <ServiceProgressBoard
            currentStage={stats.currentStage}
            stats={{ girlCount: stats.girlCount, intimacyCount: stats.intimacyCount, longTermCount: stats.longTermCount, dateCount: stats.dateCount }}
          />
        </Box>
      )}

      {/* ---- 快捷入口 ---- */}
      <Box className="stagger-4">
        <Text color="rgba(245,240,232,0.55)" fontSize="xs" mb={4} letterSpacing="0.1em" textTransform="uppercase">
          快捷入口
        </Text>
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
          {QUICK_ENTRIES.map((entry, i) => (
            <Card
              key={entry.label}
              bg="rgba(255,255,255,0.02)"
              border="1px solid rgba(255,255,255,0.06)"
              backdropFilter="blur(12px)"
              cursor="pointer"
              onClick={() => entry.path ? navigate(entry.path) : null}
              _hover={{
                bg: 'rgba(226,176,68,0.04)',
                borderColor: 'rgba(226,176,68,0.15)',
                transform: 'translateY(-2px)',
              }}
              transition="all 0.25s ease"
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

      {/* ---- 定价方案弹窗 ---- */}
      <Modal isOpen={isPricingOpen} onClose={onPricingClose} size="2xl">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent bg="warm.900" color="white" borderRadius="xl">
          <ModalHeader textAlign="center" pb={2}>
            <Icon as={CrownIcon} w={6} h={6} color="gold.400" mb={2} />
            <Text color="white">选择专属方案</Text>
            <Text color="rgba(245,240,232,0.4)" fontSize="sm" fontWeight="normal" mt={1}>联系客服，获取您的专属定制方案</Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              {PRICING_DATA.map(plan => (
                <Card
                  key={plan.type}
                  bg="warm.800"
                  border="1px solid"
                  borderColor={plan.type === 'premium' || plan.type === 'yearly' ? 'gold.500' : 'rgba(245,240,232,0.08)'}
                  borderRadius="xl" position="relative" overflow="hidden"
                >
                  {plan.type === 'premium' && (
                    <Box position="absolute" top={0} left={0} right={0} bg="gold.600" textAlign="center" py={1} fontSize="xs" fontWeight="bold">最高端</Box>
                  )}
                  {plan.type === 'yearly' && (
                    <Box position="absolute" top={0} left={0} right={0} bg="gold.500" textAlign="center" py={1} fontSize="xs" fontWeight="bold">推荐</Box>
                  )}
                  <CardBody pt={plan.type !== 'monthly' ? 8 : 4}>
                    <VStack spacing={2} align="start">
                      <Text color="rgba(245,240,232,0.6)" fontWeight="600">{plan.label}</Text>
                      <HStack align="baseline" spacing={1}>
                        <Text color="white" fontSize="3xl" fontWeight="700">{plan.price.toLocaleString()}</Text>
                        <Text color="rgba(245,240,232,0.4)" fontSize="sm">元/{plan.period}</Text>
                      </HStack>
                      <Text color="rgba(245,240,232,0.55)" fontSize="xs">约{Math.round(plan.perMonth).toLocaleString()}元/月</Text>
                      <Divider borderColor="rgba(245,240,232,0.08)" my={2} />
                      {plan.features.map((f, i) => (
                        <HStack key={i} spacing={2}>
                          <Icon as={CheckIcon} color="gold.400" w={4} h={4} />
                          <Text color="rgba(245,240,232,0.6)" fontSize="sm">{f}</Text>
                        </HStack>
                      ))}
                    </VStack>
                    <Button mt={4} w="full" colorScheme="gold" variant="outline" size="sm" onClick={onPricingClose}>联系客服获取方案</Button>
                  </CardBody>
                </Card>
              ))}
            </SimpleGrid>
            <Box mt={5} p={4} bg="warm.800" borderRadius="lg">
              <Text color="rgba(245,240,232,0.6)" fontWeight="600" mb={2}>邀请机制</Text>
              <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>每成功邀请一位新用户付费，双方均可获得优惠：</Text>
              <SimpleGrid columns={3} spacing={3}>
                {Object.entries(TYPE_POINTS).map(([type, pts]) => (
                  <Box key={type} textAlign="center" p={2} bg="warm.700" borderRadius="md">
                    <Text color="gold.400" fontSize="sm" fontWeight="600">{TYPE_LABEL[type]}</Text>
                    <Text color="rgba(245,240,232,0.6)" fontSize="xs">邀请人得 {pts} 积分</Text>
                  </Box>
                ))}
              </SimpleGrid>
              <Text color="rgba(245,240,232,0.55)" fontSize="xs" mt={2}>积分只能用于续费抵扣，无有效期限制。被邀请人首单可享8折优惠</Text>
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

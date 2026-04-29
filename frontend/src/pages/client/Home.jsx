import { useNavigate } from 'react-router-dom';
import { Box, Heading, Text, SimpleGrid, Card, CardBody, Icon, HStack, Badge, Button, VStack, Divider, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton } from '@chakra-ui/react';
import { ChatIcon, SparklesIcon, FishIcon, BookIcon, GiftIcon, CrownIcon, CheckIcon, CalendarIcon } from '../../components/Icons';
import { useEffect, useState } from 'react';
import { clients, girls, membership as membershipApi } from '../../utils/api';
import ServiceProgressBoard from '../../components/client/ServiceProgressBoard';

const TYPE_LABEL = { monthly: '普惠月付', yearly: '普惠年付', premium: '高端会员' };
const TYPE_BADGE_COLOR = { monthly: 'green', yearly: 'blue', premium: 'purple' };
const TYPE_POINTS = { monthly: 500, yearly: 4444, premium: 25000 };

const PRICING_DATA = [
  { type: 'monthly', label: '普惠月付', price: 999, period: '月', perMonth: 999, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理'] },
  { type: 'yearly', label: '普惠年付', price: 8888, period: '年', perMonth: 741, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理', '年付专属优惠'] },
  { type: 'premium', label: '高端会员', price: 50000, period: '年', perMonth: 4167, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理', '优先人工顾问', '专属定制服务'] }
];

const STAGE_MAP = {
  '背调': 1,
  '建池': 2,
  '约会': 3,
  '锁定': 4,
  '维护': 5,
  '未开始': 0
};

export default function ClientHome() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    girlCount: 0,
    dateCount: 0,
    serviceStage: '',
    currentStage: 0,
    intimacyCount: 0,
    longTermCount: 0
  });
  const [memberStatus, setMemberStatus] = useState(null);
  const { isOpen: isPricingOpen, onOpen: onPricingOpen, onClose: onPricingClose } = useDisclosure();

  const loadStats = async () => {
    try {
      const [clientRes, memberRes] = await Promise.all([
        clients.me(),
        membershipApi.status().catch(() => ({ success: false }))
      ]);
      if (clientRes.success) {
        const client = clientRes.client;
        const girlCount = client.girlCount || 0;
        const dateCount = client.dateCount || 0;
        const serviceStage = client.serviceStage || '未开始';
        const currentStage = STAGE_MAP[serviceStage] || 0;

        let intimacyCount = 0;
        let longTermCount = 0;
        try {
          const girlsRes = await girls.list();
          if (girlsRes.success) {
            intimacyCount = girlsRes.girls.filter(g => g.stage === '暧昧').length;
            longTermCount = girlsRes.girls.filter(g => g.stage === '长期').length;
          }
        } catch (e) { /* ignore */ }

        setStats({ girlCount, dateCount, serviceStage, currentStage, intimacyCount, longTermCount });
      }
      if (memberRes.success) {
        setMemberStatus(memberRes);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats();
  }, []);

  return (
    <Box>
      <Heading color="white" mb={8} fontFamily="heading" fontWeight="700" fontSize="2xl" className="stagger-1">
        欢迎回来
      </Heading>

      {/* 会员 & 积分状态栏 */}
      <Box className="stagger-1" mb={6} p={4} bg="rgba(0,212,170,0.06)" border="1px solid rgba(0,212,170,0.15)" borderRadius="xl">
        <HStack spacing={4} wrap="wrap">
          {memberStatus?.membership && (
            <Badge colorScheme={TYPE_BADGE_COLOR[memberStatus.membership.type] || 'brand'} px={3} py={1} borderRadius="md" fontSize="sm">
              {TYPE_LABEL[memberStatus.membership.type] || '会员'}
            </Badge>
          )}
          {(!memberStatus?.membership) && (
            <Button size="sm" colorScheme="brand" variant="outline" leftIcon={<Icon as={CrownIcon} />} onClick={onPricingOpen}>
              开通会员
            </Button>
          )}
          <Badge colorScheme="orange" px={3} py={1} borderRadius="md" fontSize="sm">
            积分：{memberStatus?.points || 0}
          </Badge>
          <Button size="xs" variant="link" color="abyss.400" onClick={onPricingOpen}>
            查看定价方案
          </Button>
        </HStack>
      </Box>

      {/* 进度看板 - 仅高端用户可见 */}
      {memberStatus?.membership?.type === 'premium' && (
        <Box className="stagger-2">
          <ServiceProgressBoard
            currentStage={stats.currentStage}
            stats={{
              girlCount: stats.girlCount,
              intimacyCount: stats.intimacyCount,
              longTermCount: stats.longTermCount,
              dateCount: stats.dateCount
            }}
          />
        </Box>
      )}

      {/* 快捷入口 */}
      <Box mt={10}>
        <Heading size="md" color="white" mb={5} fontFamily="heading" fontWeight="600" fontSize="lg" className="stagger-3">
          快捷入口
        </Heading>
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
          <Card
            className="stagger-4 hover-lift"
            bg="rgba(255,255,255,0.03)"
            border="1px solid rgba(255,255,255,0.08)"
            backdropFilter="blur(12px)"
            cursor="pointer"
            _hover={{ bg: 'rgba(0, 212, 170, 0.06)', borderColor: 'rgba(0, 212, 170, 0.2)', transform: 'translateY(-3px)' }}
            transition="all 0.25s ease"
          >
            <CardBody>
              <Icon as={ChatIcon} w={8} h={8} color="brand.500" mb={3} />
              <Text color="white" mt={2} fontWeight="500">联系专属顾问</Text>
              <Text color="abyss.500" fontSize="sm">人工沟通，更私密</Text>
            </CardBody>
          </Card>
          <Card
            className="stagger-5 hover-lift"
            bg="rgba(255,255,255,0.03)"
            border="1px solid rgba(255,255,255,0.08)"
            backdropFilter="blur(12px)"
            cursor="pointer"
            _hover={{ bg: 'rgba(0, 212, 170, 0.06)', borderColor: 'rgba(0, 212, 170, 0.2)', transform: 'translateY(-3px)' }}
            transition="all 0.25s ease"
          >
            <CardBody>
              <Icon as={SparklesIcon} w={8} h={8} color="brand.500" mb={3} />
              <Text color="white" mt={2} fontWeight="500">AI教练咨询</Text>
              <Text color="abyss.500" fontSize="sm">24小时在线</Text>
            </CardBody>
          </Card>
          <Card
            className="stagger-6 hover-lift"
            bg="rgba(255,255,255,0.03)"
            border="1px solid rgba(255,255,255,0.08)"
            backdropFilter="blur(12px)"
            cursor="pointer"
            _hover={{ bg: 'rgba(0, 212, 170, 0.06)', borderColor: 'rgba(0, 212, 170, 0.2)', transform: 'translateY(-3px)' }}
            transition="all 0.25s ease"
          >
            <CardBody>
              <Icon as={FishIcon} w={8} h={8} color="brand.500" mb={3} />
              <Text color="white" mt={2} fontWeight="500">查看我的缘分</Text>
              <Text color="abyss.500" fontSize="sm">管理女生资源</Text>
            </CardBody>
          </Card>
          <Card
            className="stagger-7 hover-lift"
            bg="rgba(255,255,255,0.03)"
            border="1px solid rgba(255,255,255,0.08)"
            backdropFilter="blur(12px)"
            cursor="pointer"
            _hover={{ bg: 'rgba(0, 212, 170, 0.06)', borderColor: 'rgba(0, 212, 170, 0.2)', transform: 'translateY(-3px)' }}
            transition="all 0.25s ease"
          >
            <CardBody>
              <Icon as={BookIcon} w={8} h={8} color="brand.500" mb={3} />
              <Text color="white" mt={2} fontWeight="500">学习中心</Text>
              <Text color="abyss.500" fontSize="sm">Mo哥宝典章节学习</Text>
            </CardBody>
          </Card>
          <Card
            className="stagger-8 hover-lift"
            bg="rgba(255,255,255,0.03)"
            border="1px solid rgba(255,255,255,0.08)"
            backdropFilter="blur(12px)"
            cursor="pointer"
            onClick={() => navigate('/dates')}
            _hover={{ bg: 'rgba(0, 212, 170, 0.06)', borderColor: 'rgba(0, 212, 170, 0.2)', transform: 'translateY(-3px)' }}
            transition="all 0.25s ease"
          >
            <CardBody>
              <Icon as={GiftIcon} w={8} h={8} color="brand.500" mb={3} />
              <Text color="white" mt={2} fontWeight="500">约会与方案</Text>
              <Text color="abyss.500" fontSize="sm">约会确认和AI方案</Text>
            </CardBody>
          </Card>
          <Card
            className="stagger-9 hover-lift"
            bg="rgba(255,255,255,0.03)"
            border="1px solid rgba(255,255,255,0.08)"
            backdropFilter="blur(12px)"
            cursor="pointer"
            onClick={() => navigate('/dates')}
            _hover={{ bg: 'rgba(0, 212, 170, 0.06)', borderColor: 'rgba(0, 212, 170, 0.2)', transform: 'translateY(-3px)' }}
            transition="all 0.25s ease"
          >
            <CardBody>
              <Icon as={CalendarIcon} w={8} h={8} color="brand.500" mb={3} />
              <Text color="white" mt={2} fontWeight="500">我的日历</Text>
              <Text color="abyss.500" fontSize="sm">查看约会与活动</Text>
            </CardBody>
          </Card>
        </SimpleGrid>
      </Box>

      {/* 定价方案弹窗 */}
      <Modal isOpen={isPricingOpen} onClose={onPricingClose} size="2xl">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent bg="gray.800" color="white" borderRadius="xl">
          <ModalHeader textAlign="center" pb={2}>
            <Icon as={CrownIcon} w={6} h={6} color="brand.400" mb={2} />
            <Text color="white">选择专属方案</Text>
            <Text color="gray.400" fontSize="sm" fontWeight="normal" mt={1}>联系客服，获取您的专属定制方案</Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              {PRICING_DATA.map(plan => (
                <Card
                  key={plan.type}
                  bg="gray.700"
                  border="1px solid"
                  borderColor={plan.type === 'premium' ? 'purple.500' : plan.type === 'yearly' ? 'blue.500' : 'gray.600'}
                  borderRadius="xl"
                  position="relative"
                  overflow="hidden"
                >
                  {plan.type === 'premium' && (
                    <Box position="absolute" top={0} left={0} right={0} bg="purple.600" textAlign="center" py={1} fontSize="xs" fontWeight="bold">
                      最高端
                    </Box>
                  )}
                  {plan.type === 'yearly' && (
                    <Box position="absolute" top={0} left={0} right={0} bg="blue.600" textAlign="center" py={1} fontSize="xs" fontWeight="bold">
                      推荐
                    </Box>
                  )}
                  <CardBody pt={plan.type !== 'monthly' ? 8 : 4}>
                    <VStack spacing={2} align="start">
                      <Text color="gray.300" fontWeight="600">{plan.label}</Text>
                      <HStack align="baseline" spacing={1}>
                        <Text color="white" fontSize="3xl" fontWeight="700">
                          {plan.price.toLocaleString()}
                        </Text>
                        <Text color="gray.400" fontSize="sm">元/{plan.period}</Text>
                      </HStack>
                      <Text color="gray.500" fontSize="xs">约{Math.round(plan.perMonth).toLocaleString()}元/月</Text>
                      <Divider borderColor="gray.600" my={2} />
                      {plan.features.map((f, i) => (
                        <HStack key={i} spacing={2}>
                          <Icon as={CheckIcon} color="brand.400" w={4} h={4} />
                          <Text color="gray.300" fontSize="sm">{f}</Text>
                        </HStack>
                      ))}
                    </VStack>
                    <Button
                      mt={4}
                      w="full"
                      colorScheme={plan.type === 'premium' ? 'purple' : plan.type === 'yearly' ? 'blue' : 'teal'}
                      variant="outline"
                      size="sm"
                      onClick={onPricingClose}
                    >
                      联系客服获取方案
                    </Button>
                  </CardBody>
                </Card>
              ))}
            </SimpleGrid>

            <Box mt={5} p={4} bg="gray.700" borderRadius="lg">
              <Text color="gray.300" fontWeight="600" mb={2}>邀请机制</Text>
              <Text color="gray.400" fontSize="sm" mb={2}>每成功邀请一位新用户付费，双方均可获得优惠：</Text>
              <SimpleGrid columns={3} spacing={3}>
                {Object.entries(TYPE_POINTS).map(([type, pts]) => (
                  <Box key={type} textAlign="center" p={2} bg="gray.600" borderRadius="md">
                    <Text color="brand.400" fontSize="sm" fontWeight="600">{TYPE_LABEL[type]}</Text>
                    <Text color="gray.300" fontSize="xs">邀请人得 {pts} 积分</Text>
                  </Box>
                ))}
              </SimpleGrid>
              <Text color="gray.500" fontSize="xs" mt={2}>
                积分只能用于续费抵扣，无有效期限制。被邀请人首单可享8折优惠
              </Text>
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

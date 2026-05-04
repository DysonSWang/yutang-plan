/**
 * ServiceProgressBoard - 客户端进度看板组件
 * 显示5阶段服务进度 + 成果卡片（深海主题）
 */

import { Box, Card, CardBody, Heading, Text, SimpleGrid, Stat, StatLabel, StatNumber, HStack, VStack, Flex, Badge, Progress, Icon } from '@chakra-ui/react';
import { SearchIcon, FishIcon, HeartIcon, LockIcon, SparklesIcon } from '../../components/Icons';

const SERVICE_STAGES = [
  { stage: 1, name: '背调', icon: SearchIcon, description: '需求分析+方案制定', color: 'warm' },
  { stage: 2, name: '建池', icon: FishIcon, description: '100+女生资源建设', color: 'rose' },
  { stage: 3, name: '约会', icon: HeartIcon, description: '成功约出女生', color: 'orange' },
  { stage: 4, name: '锁定', icon: LockIcon, description: '确定心动关系', color: 'purple' },
  { stage: 5, name: '维护', icon: SparklesIcon, description: '长期关系维护', color: 'green' },
];

// 阶段颜色配置：默认灰、激活时发光
const STAGE_COLORS = {
  default: { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', text: 'rgba(245,240,232,0.6)' },
  active: { bg: 'rgba(0, 212, 170, 0.15)', border: 'rgba(0, 212, 170, 0.4)', text: 'gold.400' },
  done: { bg: 'gold.500', border: 'gold.400', text: 'white' },
};

function StageNode({ stage, isCurrent, isPast }) {
  const isDone = isPast;
  const isActive = isCurrent;

  const colors = isDone ? STAGE_COLORS.done : isActive ? STAGE_COLORS.active : STAGE_COLORS.default;

  return (
    <VStack spacing={2} flex={1}>
      <Box
        w="44px"
        h="44px"
        borderRadius="full"
        bg={colors.bg}
        border="2px solid"
        borderColor={colors.border}
        display="flex"
        alignItems="center"
        justifyContent="center"
        boxShadow={isActive ? '0 0 20px rgba(0, 212, 170, 0.35)' : isDone ? '0 0 15px rgba(0, 212, 170, 0.2)' : 'none'}
        transition="all 0.3s ease"
        className={isActive ? 'glow-pulse' : ''}
      >
        <Icon as={stage.icon} color={colors.text} boxSize={5} />
      </Box>
      <Text
        fontSize="xs"
        color={isDone || isActive ? 'gold.400' : 'rgba(245,240,232,0.6)'}
        fontWeight={isActive ? 'bold' : 'normal'}
        transition="color 0.3s ease"
      >
        {stage.name}
      </Text>
    </VStack>
  );
}

export default function ServiceProgressBoard({ currentStage = 1, stats = {} }) {
  const {
    girlCount = 0,
    intimacyCount = 0,
    longTermCount = 0,
    dateCount = 0
  } = stats;

  const progressPercent = (currentStage / 5) * 100;

  const currentStageData = SERVICE_STAGES[currentStage - 1];

  return (
    <Box>
      {/* 进度看板卡片 */}
      <Card
        bg="rgba(255,255,255,0.03)"
        border="1px solid rgba(255,255,255,0.08)"
        backdropFilter="blur(12px)"
        boxShadow="0 8px 32px rgba(0,0,0,0.3)"
        mb={6}
        className="hover-lift"
        transition="all 0.25s ease"
      >
        <CardBody>
          <Flex justify="space-between" align="center" mb={6}>
            <Heading size="sm" color="white" fontFamily="heading" fontWeight="600">服务进度</Heading>
            {currentStageData && (
              <Badge
                bg="rgba(0, 212, 170, 0.15)"
                color="gold.500"
                border="1px solid rgba(0, 212, 170, 0.3)"
                fontSize="sm"
                px={3}
                py={1}
                borderRadius="full"
              >
                <Icon as={currentStageData.icon} mr={1} />
                {currentStageData.name}
              </Badge>
            )}
          </Flex>

          {/* 5阶段横向步骤条 */}
          <Box position="relative" mb={6}>
            {/* 连接线 */}
            <Box
              position="absolute"
              top="22px"
              left="44px"
              right="44px"
              h="2px"
              bg="rgba(255,255,255,0.06)"
              zIndex={0}
            />
            {/* 进度线 */}
            <Box
              position="absolute"
              top="22px"
              left="44px"
              w={`calc(${progressPercent}% - 88px + ${(progressPercent / 100) * 88}px)`}
              maxW="calc(100% - 88px)"
              h="2px"
              bg="linear-gradient(90deg, rgba(0,212,170,0.6), rgba(0,212,170,0.9))"
              zIndex={1}
              borderRadius="full"
              transition="width 0.6s ease"
              boxShadow="0 0 8px rgba(0, 212, 170, 0.5)"
            />

            {/* 阶段节点 */}
            <HStack justify="space-between" position="relative" zIndex={2}>
              {SERVICE_STAGES.map((s) => (
                <StageNode
                  key={s.stage}
                  stage={s}
                  isCurrent={currentStage === s.stage}
                  isPast={currentStage > s.stage}
                />
              ))}
            </HStack>
          </Box>

          {/* 当前阶段详情 */}
          <Box
            p={4}
            bg="rgba(0, 212, 170, 0.06)"
            border="1px solid rgba(0, 212, 170, 0.15)"
            borderRadius="lg"
            mt={2}
          >
            <Text color="gold.500" fontWeight="bold" fontSize="sm">
              当前：{currentStageData?.name}
            </Text>
            <Text color="rgba(245,240,232,0.4)" fontSize="xs" mt={1}>
              {currentStageData?.description}
            </Text>
          </Box>
        </CardBody>
      </Card>

      {/* 成果展示卡片 */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
        <StatCard label="缘分资源" value={girlCount} unit="个女生" icon={FishIcon} color="gold" />
        <StatCard label="暧昧中" value={intimacyCount} unit="正在推进" icon={HeartIcon} color="orange" />
        <StatCard label="约会次数" value={dateCount} unit="已完成" icon={SparklesIcon} color="purple" />
        <StatCard label="长期关系" value={longTermCount} unit="确定心动" icon={LockIcon} color="red" />
      </SimpleGrid>
    </Box>
  );
}

function StatCard({ label, value, unit, icon, color }) {
  const colorMap = {
    gold: 'gold.500',
    orange: 'orange.400',
    purple: 'purple.400',
    red: 'red.400',
  };
  const glowColor = {
    gold: 'rgba(0, 212, 170, 0.2)',
    orange: 'rgba(251, 146, 60, 0.2)',
    purple: 'rgba(168, 85, 247, 0.2)',
    red: 'rgba(248, 113, 113, 0.2)',
  };

  return (
    <Card
      bg="rgba(255,255,255,0.03)"
      border="1px solid rgba(255,255,255,0.08)"
      backdropFilter="blur(12px)"
      boxShadow="0 8px 32px rgba(0,0,0,0.3)"
      className="hover-lift"
      transition="all 0.25s ease"
      _hover={{
        bg: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.12)',
      }}
    >
      <CardBody>
        <Stat>
          <Flex align="center" justify="space-between" mb={2}>
            <StatLabel color="rgba(245,240,232,0.4)" fontSize="sm">{label}</StatLabel>
            <Box
              p={2}
              borderRadius="md"
              bg={glowColor[color]}
            >
              <Icon as={icon} color={colorMap[color]} boxSize={4} />
            </Box>
          </Flex>
          <StatNumber color={colorMap[color]} fontSize="2xl" fontWeight="700">{value}</StatNumber>
          <Text color="rgba(245,240,232,0.6)" fontSize="xs" mt={1}>{unit}</Text>
        </Stat>
      </CardBody>
    </Card>
  );
}

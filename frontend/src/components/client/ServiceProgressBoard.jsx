/**
 * ServiceProgressBoard - 客户端进度看板组件
 * 显示5阶段服务进度 + 成果卡片
 */

import { Box, Card, CardBody, Heading, Text, SimpleGrid, Stat, StatLabel, StatNumber, HStack, VStack, Flex, Badge, Progress, Icon } from '@chakra-ui/react';
import { SearchIcon, FishIcon, HeartIcon, LockIcon, SparklesIcon, ChartIcon } from '../../components/Icons';

const SERVICE_STAGES = [
  { stage: 1, name: '背调', icon: SearchIcon, description: '需求分析+方案制定', color: 'gray' },
  { stage: 2, name: '建池', icon: FishIcon, description: '100+女生资源建设', color: 'blue' },
  { stage: 3, name: '约会', icon: HeartIcon, description: '成功约出女生', color: 'orange' },
  { stage: 4, name: '锁定', icon: LockIcon, description: '确定心动关系', color: 'purple' },
  { stage: 5, name: '维护', icon: SparklesIcon, description: '长期关系维护', color: 'green' },
];

export default function ServiceProgressBoard({ currentStage = 1, stats = {} }) {
  const {
    girlCount = 0,
    intimacyCount = 0,
    longTermCount = 0,
    dateCount = 0
  } = stats;

  // 计算进度百分比
  const progressPercent = (currentStage / 5) * 100;

  return (
    <Box>
      {/* 进度看板卡片 */}
      <Card bg="gray.800" mb={6}>
        <CardBody>
          <Flex justify="space-between" align="center" mb={4}>
            <Heading size="sm" color="white">服务进度</Heading>
            <Badge colorScheme="teal" fontSize="sm">
              <Icon as={SERVICE_STAGES[currentStage - 1]?.icon} mr={1} />
              {SERVICE_STAGES[currentStage - 1]?.name}
            </Badge>
          </Flex>

          {/* 5阶段横向步骤条 */}
          <Box position="relative" mb={4}>
            {/* 进度条背景 */}
            <Progress
              value={progressPercent}
              size="sm"
              colorScheme="teal"
              borderRadius="full"
              bg="gray.700"
            />

            {/* 阶段标签 */}
            <HStack justify="space-between" mt={3}>
              {SERVICE_STAGES.map((s) => (
                <VStack key={s.stage} spacing={1} flex={1}>
                  <Box
                    w="32px"
                    h="32px"
                    borderRadius="full"
                    bg={currentStage >= s.stage ? `${s.color}.500` : 'gray.600'}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    fontSize="sm"
                    border="2px solid"
                    borderColor={currentStage >= s.stage ? `${s.color}.400` : 'gray.500'}
                  >
                    {currentStage > s.stage ? (
                      <Icon as={SparklesIcon} color="white" />
                    ) : (
                      <Icon as={s.icon} color="white" />
                    )}
                  </Box>
                  <Text
                    fontSize="xs"
                    color={currentStage >= s.stage ? `${s.color}.300` : 'gray.500'}
                    fontWeight={currentStage === s.stage ? 'bold' : 'normal'}
                  >
                    {s.name}
                  </Text>
                </VStack>
              ))}
            </HStack>
          </Box>

          {/* 当前阶段详情 */}
          <Box p={3} bg="gray.700" borderRadius="md" mt={4}>
            <Text color="teal.400" fontWeight="bold" fontSize="sm">
              当前：{SERVICE_STAGES[currentStage - 1]?.name}
            </Text>
            <Text color="gray.400" fontSize="xs" mt={1}>
              {SERVICE_STAGES[currentStage - 1]?.description}
            </Text>
          </Box>
        </CardBody>
      </Card>

      {/* 成果展示卡片 */}
      <SimpleGrid columns={4} spacing={4}>
        <Card bg="gray.800">
          <CardBody>
            <Stat>
              <StatLabel color="gray.400">鱼塘资源</StatLabel>
              <StatNumber color="teal.400">{girlCount}</StatNumber>
              <Text color="gray.500" fontSize="xs">个女生</Text>
            </Stat>
          </CardBody>
        </Card>

        <Card bg="gray.800">
          <CardBody>
            <Stat>
              <StatLabel color="gray.400">暧昧中</StatLabel>
              <StatNumber color="orange.400">{intimacyCount}</StatNumber>
              <Text color="gray.500" fontSize="xs">正在推进</Text>
            </Stat>
          </CardBody>
        </Card>

        <Card bg="gray.800">
          <CardBody>
            <Stat>
              <StatLabel color="gray.400">约会次数</StatLabel>
              <StatNumber color="purple.400">{dateCount}</StatNumber>
              <Text color="gray.500" fontSize="xs">已完成</Text>
            </Stat>
          </CardBody>
        </Card>

        <Card bg="gray.800">
          <CardBody>
            <Stat>
              <StatLabel color="gray.400">长期关系</StatLabel>
              <StatNumber color="red.400">{longTermCount}</StatNumber>
              <Text color="gray.500" fontSize="xs">确定心动</Text>
            </Stat>
          </CardBody>
        </Card>
      </SimpleGrid>
    </Box>
  );
}

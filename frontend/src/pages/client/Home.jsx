import { Box, Heading, Text, SimpleGrid, Card, CardBody, Icon } from '@chakra-ui/react';
import { ChatIcon, SparklesIcon, FishIcon } from '../../components/Icons';
import { useEffect, useState } from 'react';
import { clients, girls } from '../../utils/api';
import ServiceProgressBoard from '../../components/client/ServiceProgressBoard';

const STAGE_MAP = {
  '背调': 1,
  '建池': 2,
  '约会': 3,
  '锁定': 4,
  '维护': 5,
  '未开始': 0
};

export default function ClientHome() {
  const [stats, setStats] = useState({
    girlCount: 0,
    dateCount: 0,
    serviceStage: '',
    currentStage: 0,
    intimacyCount: 0,
    longTermCount: 0
  });

  const loadStats = async () => {
    try {
      const res = await clients.me();
      if (res.success) {
        const client = res.client;
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
        } catch (e) {
          console.error(e);
        }

        setStats({ girlCount, dateCount, serviceStage, currentStage, intimacyCount, longTermCount });
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
      <Heading color="white" mb={6}>欢迎回来</Heading>

      {/* 进度看板 */}
      <ServiceProgressBoard
        currentStage={stats.currentStage}
        stats={{
          girlCount: stats.girlCount,
          intimacyCount: stats.intimacyCount,
          longTermCount: stats.longTermCount,
          dateCount: stats.dateCount
        }}
      />

      {/* 快捷入口 */}
      <Box mt={8}>
        <Heading size="md" color="white" mb={4}>快捷入口</Heading>
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
          <Card bg="gray.800" cursor="pointer" _hover={{ bg: 'gray.700', transform: 'translateY(-2px)' }} transition="all 0.2s">
            <CardBody>
              <Icon as={ChatIcon} w={8} h={8} color="teal.400" />
              <Text color="white" mt={2}>联系专属顾问</Text>
              <Text color="gray.500" fontSize="sm">人工沟通，更私密</Text>
            </CardBody>
          </Card>
          <Card bg="gray.800" cursor="pointer" _hover={{ bg: 'gray.700', transform: 'translateY(-2px)' }} transition="all 0.2s">
            <CardBody>
              <Icon as={SparklesIcon} w={8} h={8} color="teal.400" />
              <Text color="white" mt={2}>AI教练咨询</Text>
              <Text color="gray.500" fontSize="sm">24小时在线</Text>
            </CardBody>
          </Card>
          <Card bg="gray.800" cursor="pointer" _hover={{ bg: 'gray.700', transform: 'translateY(-2px)' }} transition="all 0.2s">
            <CardBody>
              <Icon as={FishIcon} w={8} h={8} color="teal.400" />
              <Text color="white" mt={2}>查看我的鱼塘</Text>
              <Text color="gray.500" fontSize="sm">管理女生资源</Text>
            </CardBody>
          </Card>
        </SimpleGrid>
      </Box>
    </Box>
  );
}

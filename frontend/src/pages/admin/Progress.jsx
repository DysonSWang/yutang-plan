/**
 * Progress.jsx - 管理端进度管理页面
 * 操盘手更新客户服务进度
 */

import { useState, useEffect } from 'react';
import {
  Box, Heading, Text, Card, CardBody, Table, Thead, Tbody, Tr, Th, Td,
  Button, Badge, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, ModalCloseButton, useDisclosure, Select, FormControl, FormLabel,
  Input, NumberInput, NumberInputField, Textarea, SimpleGrid, VStack, HStack,
  Progress, Icon
} from '@chakra-ui/react';
import { clients, progress } from '../../utils/api';
import { captureError } from '../../utils/frontendErrorCapture';
import { SearchIcon, FishIcon, HeartIcon, LockIcon, SparklesIcon, ChartIcon } from '../../components/Icons';

const SERVICE_STAGES = [
  { stage: 1, name: '背调', icon: SearchIcon, description: '需求分析+方案制定', color: 'gray' },
  { stage: 2, name: '建池', icon: FishIcon, description: '100+女生资源建设', color: 'blue' },
  { stage: 3, name: '约会', icon: HeartIcon, description: '成功约出女生', color: 'orange' },
  { stage: 4, name: '锁定', icon: LockIcon, description: '确定心动关系', color: 'purple' },
  { stage: 5, name: '维护', icon: SparklesIcon, description: '长期关系维护', color: 'green' },
];

const STAGE_COLORS = {
  'in_progress': 'orange',
  'completed': 'green',
  'pending': 'gray'
};

export default function AdminProgress() {
  const [clientList, setClientList] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientProgress, setClientProgress] = useState([]);
  const [newStage, setNewStage] = useState(1);
  const [amountPaid, setAmountPaid] = useState('');
  const [loading, setLoading] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const res = await clients.list();
      if (res.success) {
        setClientList(res.clients);
      }
    } catch (e) {
      captureError(e);
    }
  };

  const openProgressModal = async (client) => {
    setSelectedClient(client);
    setNewStage(1);
    setAmountPaid('');

    // 获取该客户的进度
    try {
      const res = await progress.list({ clientId: client.id });
      if (res.success && res.progress.length > 0) {
        setClientProgress(res.progress);
        // 默认选中下一阶段
        const maxStage = Math.max(...res.progress.map(p => p.stage));
        setNewStage(Math.min(maxStage + 1, 5));
      } else {
        setClientProgress([]);
        setNewStage(1);
      }
    } catch (e) {
      captureError(e);
      setClientProgress([]);
    }

    onOpen();
  };

  const updateProgress = async () => {
    if (!selectedClient) return;

    setLoading(true);
    try {
      const stageInfo = SERVICE_STAGES.find(s => s.stage === newStage);
      const res = await progress.update({
        clientId: selectedClient.id,
        stage: newStage,
        stageName: stageInfo.name,
        amountPaid: amountPaid ? parseFloat(amountPaid) : undefined
      });

      if (res.success) {
        // 刷新客户列表
        loadClients();
        onClose();
      }
    } catch (e) {
      captureError(e);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentStage = (client) => {
    if (!client) return 0;
    const stageMap = {
      '背调': 1, '建池': 2, '约会': 3, '锁定': 4, '维护': 5
    };
    return stageMap[client.serviceStage] || 0;
  };

  const getStageInfo = (stageNum) => {
    return SERVICE_STAGES.find(s => s.stage === stageNum) || SERVICE_STAGES[0];
  };

  return (
    <Box>
      <Heading color="white" mb={6}>进度管理</Heading>

      <Card bg="gray.800">
        <CardBody>
          <Table variant="simple" color="gray.300">
            <Thead>
              <Tr>
                <Th color="gray.400">客户</Th>
                <Th color="gray.400">当前阶段</Th>
                <Th color="gray.400">阶段详情</Th>
                <Th color="gray.400">缘分资源</Th>
                <Th color="gray.400">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {clientList.map(client => {
                const currentStage = getCurrentStage(client);
                const stageInfo = getStageInfo(currentStage);
                return (
                  <Tr key={client.id}>
                    <Td fontWeight="bold">{client.nickname || client.username}</Td>
                    <Td>
                      <Badge colorScheme={stageInfo.color} fontSize="sm">
                        <Icon as={stageInfo.icon} mr={1} /> {client.serviceStage || '未开始'}
                      </Badge>
                    </Td>
                    <Td>
                      <Progress
                        value={(currentStage / 5) * 100}
                        size="sm"
                        colorScheme="teal"
                        w="150px"
                        borderRadius="full"
                      />
                      <Text fontSize="xs" color="gray.500" mt={1}>
                        {currentStage}/5 阶段
                      </Text>
                    </Td>
                    <Td>
                      <Badge>{client.girlCount || 0} 个女生</Badge>
                    </Td>
                    <Td>
                      <Button
                        size="sm"
                        colorScheme="teal"
                        onClick={() => openProgressModal(client)}
                      >
                        更新进度
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
              {clientList.length === 0 && (
                <Tr>
                  <Td colSpan={5} textAlign="center" color="gray.500">暂无客户</Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </CardBody>
      </Card>

      {/* 更新进度弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent bg="gray.800">
          <ModalHeader color="white">
            更新进度 - {selectedClient?.nickname}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* 当前阶段 */}
              <Box p={4} bg="gray.700" borderRadius="md">
                <Text color="gray.400" fontSize="sm" mb={2}>当前阶段</Text>
                <Badge
                  colorScheme={getStageInfo(getCurrentStage(selectedClient)).color}
                  fontSize="md"
                >
                  <Icon as={getStageInfo(getCurrentStage(selectedClient)).icon} mr={1} />
                  {selectedClient?.serviceStage || '未开始'}
                </Badge>
              </Box>

              {/* 选择新阶段 */}
              <FormControl>
                <FormLabel color="gray.300">更新阶段</FormLabel>
                <Select
                  value={newStage}
                  onChange={(e) => setNewStage(parseInt(e.target.value))}
                  bg="gray.700"
                  color="white"
                >
                  {SERVICE_STAGES.map(s => (
                    <option key={s.stage} value={s.stage}>
                      {s.name} - {s.description}
                    </option>
                  ))}
                </Select>
              </FormControl>

              {/* 阶段预览 */}
              <Box p={4} bg="teal.900" borderRadius="md" borderLeft="4px solid" borderColor="teal.400">
                <HStack>
                  <Icon as={getStageInfo(newStage).icon} color="teal.300" />
                  <Text color="teal.300" fontWeight="bold">
                    {getStageInfo(newStage).name}
                  </Text>
                </HStack>
                <Text color="gray.300" fontSize="sm" mt={1}>
                  {getStageInfo(newStage).description}
                </Text>
              </Box>

              {/* 付款金额 */}
              <FormControl>
                <FormLabel color="gray.300">本阶段付款金额</FormLabel>
                <NumberInput value={amountPaid} onChange={(_, v) => setAmountPaid(v)}>
                  <NumberInputField bg="gray.700" placeholder="选填" />
                </NumberInput>
              </FormControl>

              {/* 历史进度 */}
              {clientProgress.length > 0 && (
                <Box>
                  <Text color="gray.400" fontSize="sm" mb={2}>历史进度</Text>
                  <VStack spacing={2} align="stretch">
                    {clientProgress.map(p => (
                      <HStack key={p.id} p={2} bg="gray.700" borderRadius="md">
                        <Badge colorScheme={STAGE_COLORS[p.status] || 'gray'}>
                          {p.stage}
                        </Badge>
                        <Text color="gray.300" fontSize="sm">{p.stageName}</Text>
                        {p.amountPaid && (
                          <Text color="green.400" fontSize="sm">¥{p.amountPaid}</Text>
                        )}
                        {p.completedAt && (
                          <Text color="gray.500" fontSize="xs">
                            {new Date(p.completedAt).toLocaleDateString()}
                          </Text>
                        )}
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>取消</Button>
            <Button colorScheme="teal" onClick={updateProgress} isLoading={loading}>
              确认更新
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

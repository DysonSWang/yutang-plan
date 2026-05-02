import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Heading, Text, SimpleGrid, Card, CardBody, Badge, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, useDisclosure, HStack, VStack, Icon, Flex, Input, Button, useToast, NumberInput, NumberInputField, NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper, Select, FormControl, FormLabel } from '@chakra-ui/react';
import { HeartIcon } from '../../components/Icons';
import { girls } from '../../utils/api';
import { captureError } from '../../utils/frontendErrorCapture';

const STAGE_COLORS = {
  '陌生': 'gray',
  '搭讪': 'blue',
  '聊天': 'cyan',
  '暧昧': 'yellow',
  '约会': 'orange',
  '长期': 'green',
};

export default function MyPond() {
  const navigate = useNavigate();
  const [girlsList, setGirls] = useState([]);
  const { isOpen: isAddOpen, onOpen: onAddOpen, onClose: onAddClose } = useDisclosure();
  const [addForm, setAddForm] = useState({ name: '', age: '', occupation: '' });
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  useEffect(() => { loadGirls(); }, []);

  const loadGirls = async () => {
    try {
      const res = await girls.list();
      if (res.success) setGirls(res.girls);
    } catch (e) { captureError(e); }
  };

  const handleAddGirl = async () => {
    if (!addForm.name.trim()) {
      toast({ title: '请输入昵称', status: 'warning', duration: 2000 });
      return;
    }
    setAdding(true);
    try {
      const res = await girls.clientAdd({ name: addForm.name.trim(), age: addForm.age || undefined, occupation: addForm.occupation || undefined });
      if (res.success) {
        toast({ title: res.quotaLeft !== undefined ? `添加成功，剩余 ${res.quotaLeft} 个名额` : '添加成功', status: 'success', duration: 2000 });
        setAddForm({ name: '', age: '', occupation: '' });
        onAddClose();
        loadGirls();
      } else if (res.code === 'QUOTA_EXCEEDED') {
        toast({ title: `额度已用完（${res.currentCount}/${res.quota}人），请联系操盘手升级`, status: 'warning', duration: 4000 });
      } else {
        toast({ title: res.error || '添加失败', status: 'error', duration: 2000 });
      }
    } catch (e) {
      const msg = e?.response?.data?.error || '';
      if (msg.includes('额度') || e?.response?.data?.code === 'QUOTA_EXCEEDED') {
        toast({ title: '额度已用完，请联系操盘手升级', status: 'warning', duration: 4000 });
      } else {
        toast({ title: '添加失败', status: 'error', duration: 2000 });
      }
    } finally { setAdding(false); }
  };

  return (
    <Box>
      <Heading color="white" mb={6}>我的缘分</Heading>

      <HStack mb={4} justify="flex-end">
        <Button colorScheme="teal" size="sm" onClick={onAddOpen}>+ 添加女生</Button>
      </HStack>

      {/* 女生卡片网格 */}
      <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
        {girlsList.map(girl => (
          <Card key={girl.id} bg="gray.800" cursor="pointer"
            onClick={() => navigate(`/my-pond/${girl.id}`)}
            _hover={{ bg: 'gray.700', transform: 'translateY(-2px)' }}
            transition="all 0.2s">
            <CardBody>
              <HStack justify="space-between" mb={2}>
                <Text color="white" fontWeight="bold">{girl.name}</Text>
                <Badge colorScheme={STAGE_COLORS[girl.stage] || 'gray'}>{girl.stage || '未知'}</Badge>
              </HStack>
              <Text color="gray.400" fontSize="sm">
                {[girl.age ? `${girl.age}岁` : '', girl.occupation || ''].filter(Boolean).join(' · ') || '待完善'}
              </Text>
              <HStack mt={2} spacing={1}>
                <Icon as={HeartIcon} color="red.400" w={3} h={3} />
                <Text color="gray.500" fontSize="xs">亲密度 x{girl.intimacyLevel || 1}</Text>
              </HStack>
            </CardBody>
          </Card>
        ))}
        {girlsList.length === 0 && (
          <Text color="gray.500" gridColumn="1 / -1" textAlign="center" py={10}>暂无女生资源，点击右上角添加</Text>
        )}
      </SimpleGrid>

      {/* 添加女生弹窗 */}
      <Modal isOpen={isAddOpen} onClose={onAddClose} size="md">
        <ModalOverlay />
        <ModalContent bg="gray.800">
          <ModalHeader color="white">添加女生</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel color="gray.400" fontSize="sm">昵称</FormLabel>
                <Input value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})}
                  placeholder="输入女生昵称" bg="gray.700" color="white" _placeholder={{ color: 'gray.400' }}
                  onKeyPress={e => { if (e.key === 'Enter') handleAddGirl(); }} />
              </FormControl>
              <HStack spacing={4}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">年龄</FormLabel>
                  <NumberInput value={addForm.age} onChange={(_, v) => setAddForm({...addForm, age: v})} bg="gray.700" min={18} max={60}>
                    <NumberInputField color="white" />
                    <NumberInputStepper>
                      <NumberIncrementStepper color="gray.400" />
                      <NumberDecrementStepper color="gray.400" />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">职业</FormLabel>
                  <Select value={addForm.occupation} onChange={e => setAddForm({...addForm, occupation: e.target.value})}
                    bg="gray.700" color="white" placeholder="选择">
                    {['学生', '上班族', '自由职业', '企业主', '公务员', '医生', '律师', '教师', '销售', '设计师', '程序员', '其他'].map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                </FormControl>
              </HStack>
              <Button colorScheme="teal" onClick={handleAddGirl} isLoading={adding} w="100%">添加</Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Heading, Text, SimpleGrid, Card, CardBody, Badge, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, useDisclosure, HStack, VStack, Icon, Flex, Input, Button, useToast, NumberInput, NumberInputField, NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper, Select, FormControl, FormLabel, Skeleton } from '@chakra-ui/react';
import { HeartIcon, FishIcon } from '../../components/Icons';
import { girls } from '../../utils/api';
import useKeepAliveData from '../../hooks/useKeepAliveData';
import EmptyState from '../../components/EmptyState';
import AnimatedNumber from '../../components/AnimatedNumber';

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
  const { isOpen: isAddOpen, onOpen: onAddOpen, onClose: onAddClose } = useDisclosure();
  const [addForm, setAddForm] = useState({ name: '', age: '', occupation: '' });
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const { data: girlsList = [], isInitialLoad, refresh } = useKeepAliveData(
    async () => {
      const res = await girls.list();
      return res.success ? res.girls : [];
    },
    { key: '/my-pond' }
  );

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
        refresh();
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
      {/* ---- Header ---- */}
      <Flex justify="space-between" align="start" mb={8} className="stagger-1">
        <Box>
          <Heading color="white" fontFamily="heading" fontWeight="700" fontSize={{ base: '2xl', md: '3xl' }}>
            我的缘分
          </Heading>
          <Text color="rgba(245,240,232,0.25)" fontSize="sm" mt={1}>
            已添加 <Text as="span" color="gold.400"><AnimatedNumber value={(girlsList ?? []).length} duration={800} /></Text> 位缘分
          </Text>
        </Box>
        <Button colorScheme="gold" size="sm" onClick={onAddOpen} leftIcon={<Icon as={HeartIcon} w={3} h={3} />}>
          添加女生
        </Button>
      </Flex>

      {isInitialLoad ? (
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
          {[1,2,3].map(i => <Skeleton key={i} height="120px" borderRadius="lg" />)}
        </SimpleGrid>
      ) : (girlsList ?? []).length === 0 ? (
        <EmptyState
          type="pond"
          onAction={onAddOpen}
          actionLabel="添加第一个"
        />
      ) : (
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
          {girlsList.map(girl => (
            <Card
              key={girl.id}
              bg="warm.800"
              cursor="pointer"
              onClick={() => navigate(`/my-pond/${girl.id}`)}
              _hover={{ bg: 'warm.700', transform: 'translateY(-2px)' }}
              transition="all 0.2s"
            >
              <CardBody>
                <HStack justify="space-between" mb={2}>
                  <Text color="white" fontWeight="bold" fontFamily="heading" fontSize="lg">{girl.name}</Text>
                  <Badge colorScheme={STAGE_COLORS[girl.stage] || 'gray'} fontSize="xs">{girl.stage || '未知'}</Badge>
                </HStack>
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">
                  {[girl.age ? `${girl.age}岁` : '', girl.occupation || ''].filter(Boolean).join(' · ') || '待完善'}
                </Text>
                <HStack mt={3} spacing={2}>
                  <Icon as={HeartIcon} color="rose.400" w={3} h={3} />
                  <Text color="rgba(245,240,232,0.25)" fontSize="xs">亲密度 <Text as="span" color="gold.400" fontWeight="600">x{girl.intimacyLevel || 1}</Text></Text>
                </HStack>
              </CardBody>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {/* 添加女生弹窗 */}
      <Modal isOpen={isAddOpen} onClose={onAddClose} size="md">
        <ModalOverlay />
        <ModalContent bg="warm.800">
          <ModalHeader color="white">添加女生</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">昵称</FormLabel>
                <Input value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})}
                  placeholder="输入女生昵称" bg="warm.700" color="white" _placeholder={{ color: 'rgba(245,240,232,0.15)' }}
                  onKeyPress={e => { if (e.key === 'Enter') handleAddGirl(); }} />
              </FormControl>
              <HStack spacing={4}>
                <FormControl>
                  <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">年龄</FormLabel>
                  <NumberInput value={addForm.age} onChange={(_, v) => setAddForm({...addForm, age: v})} bg="warm.700" min={18} max={60}>
                    <NumberInputField color="white" />
                    <NumberInputStepper>
                      <NumberIncrementStepper color="rgba(245,240,232,0.4)" />
                      <NumberDecrementStepper color="rgba(245,240,232,0.4)" />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">职业</FormLabel>
                  <Select value={addForm.occupation} onChange={e => setAddForm({...addForm, occupation: e.target.value})}
                    bg="warm.700" color="white" placeholder="选择">
                    {['学生', '上班族', '自由职业', '企业主', '公务员', '医生', '律师', '教师', '销售', '设计师', '程序员', '其他'].map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                </FormControl>
              </HStack>
              <Button colorScheme="gold" onClick={handleAddGirl} isLoading={adding} w="100%">添加</Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

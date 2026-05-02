import { useEffect, useState } from 'react';
import {
  Box, Heading, Text, VStack, HStack, Button, Badge, Tabs, TabList, TabPanels, Tab, TabPanel,
  Table, Thead, Tbody, Tr, Th, Td, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, ModalCloseButton, useDisclosure, FormControl, FormLabel, Input, Select,
  NumberInput, NumberInputField, Textarea, useToast, Spinner, Center, SimpleGrid, Card, CardBody,
  Flex, Divider, Avatar, Icon, Switch
} from '@chakra-ui/react';
import { membership as membershipApi } from '../../utils/api';
import { MembershipIcon, PointsIcon, GiftIcon, BookIcon, CameraIcon } from '../../components/Icons';

const TYPE_LABEL = { TRIAL: '试用', MONTHLY: '普惠月付', YEARLY: '普惠年付', PREMIUM: '高端会员', monthly: '普惠月付', yearly: '普惠年付', premium: '高端会员' };
const TYPE_BADGE_COLOR = { TRIAL: 'orange', MONTHLY: 'green', YEARLY: 'blue', PREMIUM: 'purple', monthly: 'green', yearly: 'blue', premium: 'purple' };

function ClientMembershipCard({ client, onManage }) {
  const hasMembership = client.membership && client.membership.status === 'active';
  const endDate = client.membership?.endDate ? new Date(client.membership.endDate) : null;
  const daysLeft = endDate ? Math.max(0, Math.ceil((endDate - new Date()) / 86400000)) : 0;

  return (
    <Card bg="gray.800" border="1px solid" borderColor="gray.700">
      <CardBody>
        <HStack justify="space-between" mb={3}>
          <HStack gap={3}>
            <Avatar name={client.nickname} size="sm" bg="teal.600" />
            <Box>
              <Text color="white" fontWeight="bold">{client.nickname || client.username}</Text>
              <Text color="gray.400" fontSize="xs">{client.username}</Text>
            </Box>
          </HStack>
          <VStack align="end" spacing={1}>
            {hasMembership ? (
              <>
                <Badge colorScheme={TYPE_BADGE_COLOR[client.membership.type] || 'green'}>
                  {TYPE_LABEL[client.membership.type] || '会员'}
                </Badge>
                <Text color={daysLeft < 7 ? 'orange.400' : 'gray.400'} fontSize="xs">
                  {daysLeft > 0 ? `剩余${daysLeft}天` : '已到期'}
                </Text>
              </>
            ) : (
              <Badge colorScheme="gray">无会员</Badge>
            )}
          </VStack>
        </HStack>

        <HStack justify="space-between" mt={3} pt={3} borderTop="1px solid" borderColor="gray.700">
          <VStack align="start" spacing={0}>
            <Text color="gray.400" fontSize="xs">积分余额</Text>
            <Text color="gold.400" fontWeight="bold" fontSize="lg">{client.points || 0}</Text>
          </VStack>
          <Button size="sm" colorScheme="teal" variant="outline" onClick={() => onManage(client)}>
            管理
          </Button>
        </HStack>
      </CardBody>
    </Card>
  );
}

function ManageModal({ client, onClose }) {
  const toast = useToast();
  const [tab, setTab] = useState(0);
  const [pointsHistory, setPointsHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pointsForm, setPointsForm] = useState({ amount: '', note: '' });
  const [membershipForm, setMembershipForm] = useState({ type: 'monthly', startDate: '', endDate: '', price: '' });

  useEffect(() => {
    loadPointsHistory();
  }, []);

  async function loadPointsHistory() {
    setLoading(true);
    try {
      const res = await membershipApi.points();
      if (res.success) setPointsHistory(res.history);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleRecharge() {
    if (!pointsForm.amount || parseInt(pointsForm.amount) <= 0) {
      toast({ title: '请输入有效金额', status: 'warning' });
      return;
    }
    try {
      await membershipApi.pointsRecharge(client.id, parseInt(pointsForm.amount), pointsForm.note);
      toast({ title: '充值成功', status: 'success', duration: 2000 });
      setPointsForm({ amount: '', note: '' });
      loadPointsHistory();
    } catch (err) {
      toast({ title: '充值失败', description: err.message, status: 'error' });
    }
  }

  async function handleDeduct() {
    if (!pointsForm.amount || parseInt(pointsForm.amount) <= 0) {
      toast({ title: '请输入有效金额', status: 'warning' });
      return;
    }
    try {
      await membershipApi.pointsDeduct(client.id, parseInt(pointsForm.amount), pointsForm.note);
      toast({ title: '扣减成功', status: 'success', duration: 2000 });
      setPointsForm({ amount: '', note: '' });
      loadPointsHistory();
    } catch (err) {
      toast({ title: '扣减失败', description: err.message, status: 'error' });
    }
  }

  async function handleSetMembership() {
    try {
      await membershipApi.adminSet(client.id, 'set', {
        type: membershipForm.type,
        price: parseFloat(membershipForm.price) || 0,
        startDate: membershipForm.startDate || undefined,
        endDate: membershipForm.endDate || undefined
      });
      toast({ title: '会员设置成功', status: 'success' });
      onClose();
    } catch (err) {
      toast({ title: '设置失败', description: err.message, status: 'error' });
    }
  }

  async function handleCancelMembership() {
    try {
      await membershipApi.adminSet(client.id, 'cancel', {});
      toast({ title: '会员已取消', status: 'info' });
      onClose();
    } catch (err) {
      toast({ title: '取消失败', description: err.message, status: 'error' });
    }
  }

  return (
    <>
      <HStack mb={4} p={3} bg="gray.700" borderRadius="md">
        <Avatar name={client.nickname} size="sm" bg="teal.600" />
        <Box>
          <Text color="white" fontWeight="bold">{client.nickname || client.username}</Text>
          <Text color="gray.400" fontSize="xs">积分：{client.points || 0}</Text>
        </Box>
      </HStack>

      <Tabs index={tab} onChange={setTab} colorScheme="teal">
        <TabList mb={4}>
          <Tab><Icon as={PointsIcon} mr={1} /> 积分管理</Tab>
          <Tab><Icon as={MembershipIcon} mr={1} /> 会员管理</Tab>
          <Tab>试用配置</Tab>
        </TabList>

        <TabPanels>
          {/* 积分管理 */}
          <TabPanel p={0}>
            <HStack mb={4}>
              <NumberInput
                min={1}
                value={pointsForm.amount}
                onChange={v => setPointsForm({ ...pointsForm, amount: v })}
                flex={1}
              >
                <NumberInputField placeholder="积分数量" bg="gray.700" borderColor="gray.600" />
              </NumberInput>
              <Button colorScheme="green" onClick={handleRecharge}>充值</Button>
              <Button colorScheme="red" variant="outline" onClick={handleDeduct}>扣减</Button>
            </HStack>
            <Input
              placeholder="备注（选填）"
              value={pointsForm.note}
              onChange={e => setPointsForm({ ...pointsForm, note: e.target.value })}
              bg="gray.700"
              borderColor="gray.600"
              mb={4}
            />

            {loading ? <Spinner /> : (
              <Box maxH="300px" overflowY="auto">
                <Table size="sm">
                  <Thead><Tr><Th color="gray.400">类型</Th><Th color="gray.400" isNumeric>变动</Th><Th color="gray.400" isNumeric>余额</Th><Th color="gray.400">时间</Th></Tr></Thead>
                  <Tbody>
                    {pointsHistory.length === 0 ? (
                      <Tr><Td colSpan={4} color="gray.500" textAlign="center">暂无记录</Td></Tr>
                    ) : pointsHistory.map(r => (
                      <Tr key={r.id}>
                        <Td>
                          <Badge colorScheme={r.amount > 0 ? 'green' : 'red'}>
                            {r.type === 'recharge' ? '充值' : r.type === 'consume' ? '消费' : r.type === 'invite_reward' ? '邀请奖励' : r.type === 'membership_discount' ? '会员抵扣' : '管理员调整'}
                          </Badge>
                        </Td>
                        <Td isNumeric color={r.amount > 0 ? 'green.400' : 'red.400'}>
                          {r.amount > 0 ? '+' : ''}{r.amount}
                        </Td>
                        <Td isNumeric color="gray.300">{r.balanceAfter}</Td>
                        <Td color="gray.500" fontSize="xs">{new Date(r.createdAt).toLocaleString()}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </TabPanel>

          {/* 会员管理 */}
          <TabPanel p={0}>
            <VStack spacing={3} align="stretch">
              <Select
                value={membershipForm.type}
                onChange={e => setMembershipForm({ ...membershipForm, type: e.target.value })}
                bg="gray.700"
                borderColor="gray.600"
              >
                <option value="monthly">普惠月付（999元）</option>
                <option value="yearly">普惠年付（8888元）</option>
                <option value="premium">高端会员（50000元）</option>
              </Select>
              <Input
                placeholder="实际支付价格"
                value={membershipForm.price}
                onChange={e => setMembershipForm({ ...membershipForm, price: e.target.value })}
                bg="gray.700"
                borderColor="gray.600"
              />
              <HStack>
                <Input
                  type="date"
                  placeholder="开始日期"
                  value={membershipForm.startDate}
                  onChange={e => setMembershipForm({ ...membershipForm, startDate: e.target.value })}
                  bg="gray.700"
                  borderColor="gray.600"
                />
                <Input
                  type="date"
                  placeholder="结束日期"
                  value={membershipForm.endDate}
                  onChange={e => setMembershipForm({ ...membershipForm, endDate: e.target.value })}
                  bg="gray.700"
                  borderColor="gray.600"
                />
              </HStack>
              <HStack>
                <Button colorScheme="teal" flex={1} onClick={handleSetMembership}>设置会员</Button>
                <Button colorScheme="red" variant="outline" onClick={handleCancelMembership}>取消会员</Button>
              </HStack>
            </VStack>
          </TabPanel>
          <TabPanel p={0}>
            <TrialConfigTab />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </>
  );
}

function ScreenshotProfilesTab() {
  const toast = useToast();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedClient, setSelectedClient] = useState('');
  const [clients, setClients] = useState([]);

  useEffect(() => { loadProfiles(); loadClients(); }, []);

  async function loadClients() {
    try {
      const res = await membershipApi.adminList();
      if (res.success) setClients(res.clients);
    } catch (e) { /* ignore */ }
  }

  async function loadProfiles(status = '') {
    setLoading(true);
    try {
      const res = await membershipApi.screenshotProfiles(status);
      if (res.success) setProfiles(res.profiles);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!selectedClient) {
      toast({ title: '请先选择客户', status: 'warning' });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('clientId', selectedClient);
      const res = await membershipApi.uploadScreenshot(formData);
      if (res.success) {
        setProfiles([res.profile, ...profiles]);
        toast({ title: '截图上传成功，AI正在提取信息...', status: 'success' });
      }
    } catch (err) {
      toast({ title: '上传失败', description: err.message, status: 'error' });
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm(profileId, action, linkedUserId = null) {
    try {
      const res = await membershipApi.confirmScreenshotProfile(profileId, action, linkedUserId);
      if (res.success) {
        toast({ title: action === 'create_user' ? '用户创建成功' : action === 'link_existing' ? '关联成功' : '已拒绝', status: 'success' });
        loadProfiles();
      }
    } catch (err) {
      toast({ title: '操作失败', description: err.message, status: 'error' });
    }
  }

  const statusColor = { pending: 'yellow', confirmed: 'green', rejected: 'red' };

  return (
    <Box>
      <HStack mb={4}>
        <Select
          placeholder="选择客户（选填）"
          value={selectedClient}
          onChange={e => setSelectedClient(e.target.value)}
          bg="gray.700"
          borderColor="gray.600"
          w="200px"
        >
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.nickname}</option>
          ))}
        </Select>
        <Button as="label" colorScheme="teal" leftIcon={<CameraIcon />} isLoading={uploading} cursor="pointer">
          上传截图
          <input type="file" accept="image/*" hidden onChange={handleUpload} />
        </Button>
      </HStack>

      {loading ? <Center py={10}><Spinner /></Center> : profiles.length === 0 ? (
        <Center py={10}>
          <VStack>
            <CameraIcon boxSize={10} color="gray.600" />
            <Text color="gray.500">暂无截图档案</Text>
          </VStack>
        </Center>
      ) : (
        <VStack spacing={3} align="stretch">
          {profiles.map(p => (
            <Box key={p.id} p={4} bg="gray.800" border="1px solid" borderColor="gray.700" borderRadius="lg">
              <HStack justify="space-between" mb={3}>
                <Badge colorScheme={statusColor[p.status]}>{p.status === 'pending' ? '待确认' : p.status === 'confirmed' ? '已确认' : '已拒绝'}</Badge>
                <Text color="gray.500" fontSize="xs">{new Date(p.createdAt).toLocaleString()}</Text>
              </HStack>
              {p.imagePath && (
                <Box mb={3}>
                  <img src={p.imagePath} alt="screenshot" style={{ maxWidth: '200px', borderRadius: '8px', opacity: 0.8 }} />
                </Box>
              )}
              <SimpleGrid columns={2} spacing={2} mb={3}>
                {p.extractedName && <Text color="gray.300" fontSize="sm">姓名：<Text as="span" color="white">{p.extractedName}</Text></Text>}
                {p.extractedPhone && <Text color="gray.300" fontSize="sm">电话：<Text as="span" color="white">{p.extractedPhone}</Text></Text>}
                {p.extractedAge && <Text color="gray.300" fontSize="sm">年龄：<Text as="span" color="white">{p.extractedAge}</Text></Text>}
                {p.extractedGender && <Text color="gray.300" fontSize="sm">性别：<Text as="span" color="white">{p.extractedGender === 'male' ? '男' : '女'}</Text></Text>}
              </SimpleGrid>
              {p.status === 'pending' && (
                <HStack>
                  <Button size="sm" colorScheme="green" onClick={() => handleConfirm(p.id, 'create_user')}>创建新用户</Button>
                  <Button size="sm" colorScheme="teal" variant="outline" onClick={() => handleConfirm(p.id, 'link_existing')}>关联已有</Button>
                  <Button size="sm" colorScheme="gray" variant="ghost" onClick={() => handleConfirm(p.id, 'reject')}>拒绝</Button>
                </HStack>
              )}
            </Box>
          ))}
        </VStack>
      )}
    </Box>
  );
}

function TrialConfigTab() {
  const toast = useToast();
  const [config, setConfig] = useState({ validDays: 3, maxChapters: 2, maxGirls: 1, maxTrialUses: 2 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await membershipApi.trialConfig();
      if (res.success) setConfig(res.config);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await membershipApi.updateTrialConfig(config);
      toast({ title: '配置已保存', status: 'success' });
    } catch (err) {
      toast({ title: '保存失败', description: err.message, status: 'error' });
    } finally { setSaving(false); }
  }

  if (loading) return <Center py={10}><Spinner /></Center>;

  return (
    <Box>
      <VStack spacing={4} align="stretch">
        <Box p={4} bg="gray.800" borderRadius="md" border="1px solid" borderColor="gray.700">
          <Text color="white" fontWeight="bold" mb={4}>试用会员配置</Text>
          <VStack spacing={4} align="stretch">
            <HStack justify="space-between">
              <Text color="gray.300">试用有效期（天）</Text>
              <NumberInput
                min={1}
                max={30}
                value={config.validDays}
                onChange={v => setConfig({ ...config, validDays: parseInt(v) || 3 })}
                w="120px"
              >
                <NumberInputField bg="gray.700" borderColor="gray.600" />
              </NumberInput>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.300">可查看章节数</Text>
              <NumberInput
                min={1}
                max={20}
                value={config.maxChapters}
                onChange={v => setConfig({ ...config, maxChapters: parseInt(v) || 2 })}
                w="120px"
              >
                <NumberInputField bg="gray.700" borderColor="gray.600" />
              </NumberInput>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.300">可添加女生数</Text>
              <NumberInput
                min={1}
                max={10}
                value={config.maxGirls}
                onChange={v => setConfig({ ...config, maxGirls: parseInt(v) || 1 })}
                w="120px"
              >
                <NumberInputField bg="gray.700" borderColor="gray.600" />
              </NumberInput>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.300">各功能试用次数</Text>
              <NumberInput
                min={1}
                max={10}
                value={config.maxTrialUses}
                onChange={v => setConfig({ ...config, maxTrialUses: parseInt(v) || 2 })}
                w="120px"
              >
                <NumberInputField bg="gray.700" borderColor="gray.600" />
              </NumberInput>
            </HStack>
            <Text color="gray.500" fontSize="sm">
              说明：试用次数是各功能共用的（约会方案、AI教练、回复建议、话术优化、女生聊天）
            </Text>
          </VStack>
        </Box>
        <Button colorScheme="teal" onClick={handleSave} isLoading={saving}>保存配置</Button>
      </VStack>
    </Box>
  );
}

export default function MembershipManagement() {
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedClient, setSelectedClient] = useState(null);

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    setLoading(true);
    try {
      const res = await membershipApi.adminList();
      if (res.success) setClients(res.clients);
    } catch (err) {
      toast({ title: '加载失败', description: err.message, status: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function handleManage(client) {
    setSelectedClient(client);
    onOpen();
  }

  return (
    <Box>
      <Heading size="lg" color="white" mb={6} display="flex" alignItems="center" gap={2}>
        会员与积分管理
      </Heading>

      {loading ? (
        <Center py={20}><Spinner size="xl" /></Center>
      ) : (
        <>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={6}>
            {clients.map(client => (
              <ClientMembershipCard key={client.id} client={client} onManage={handleManage} />
            ))}
          </SimpleGrid>

          {clients.length === 0 && (
            <Center py={20}>
              <Text color="gray.500">暂无客户数据</Text>
            </Center>
          )}
        </>
      )}

      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent bg="gray.800" color="white">
          <ModalHeader>管理：{selectedClient?.nickname}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {selectedClient && <ManageModal client={selectedClient} onClose={onClose} />}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { Box, Heading, Card, CardBody, SimpleGrid, Badge, Text, VStack, HStack, Flex, Avatar, Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, useDisclosure, FormControl, FormLabel, Input, Select, Textarea, useToast, Spinner, Icon, Divider, InputGroup, InputRightElement, IconButton } from '@chakra-ui/react';
import { CrownIcon, CheckIcon } from '../../components/Icons';
import { FiEdit2 } from 'react-icons/fi';
import { clients, membership as membershipApi, auth } from '../../utils/api';
import RegionSelector from '../../components/RegionSelector';
import { checkVersion, VERSION } from '../../utils/version';
import VersionUpdateModal from '../../components/VersionUpdateModal';

const TYPE_LABEL = { monthly: '普惠月付', yearly: '普惠年付', premium: '高端会员' };
const TYPE_BADGE_COLOR = { monthly: 'green', yearly: 'blue', premium: 'purple' };

const PRICING_DATA = [
  { type: 'monthly', label: '普惠月付', price: 999, period: '月', perMonth: 999, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理'] },
  { type: 'yearly', label: '普惠年付', price: 8888, period: '年', perMonth: 741, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理', '年付专属优惠'] },
  { type: 'premium', label: '高端会员', price: 50000, period: '年', perMonth: 4167, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理', '优先人工顾问', '专属定制服务'] }
];

const STAGE_COLORS = {
  '背调': 'gray',
  '建池': 'blue',
  '约会': 'orange',
  '锁定': 'green',
  '维护': 'teal',
};

// 客户可见的字段（可编辑）
const CLIENT_EDITABLE_FIELDS = [
  { key: 'nickname', label: '昵称', type: 'input' },
  { key: 'phone', label: '电话', type: 'input' },
  { key: 'age', label: '年龄', type: 'input' },
  { key: 'occupation', label: '职业', type: 'input' },
  { key: 'education', label: '学历', type: 'select', options: ['小学', '初中', '中专', '高中', '大专', '本科', '硕士', '博士'] },
  { key: 'income', label: '收入水平', type: 'select', options: ['10万以下', '10-30万', '30-50万', '50-100万', '100万以上'] },
  { key: 'height', label: '身高(cm)', type: 'input' },
  { key: 'residence', label: '所在地', type: 'region' },
  { key: 'hometown', label: '籍贯', type: 'region' },
  { key: 'appearance', label: '外貌描述', type: 'input' },
  { key: 'dressingStyle', label: '穿着风格', type: 'select', options: ['商务正装', '商务休闲', '休闲', '运动', '时尚', '简约'] },
  { key: 'familyBackground', label: '家庭背景', type: 'select', options: ['农村', '城市', '经商', '公务员', '其他'] },
  { key: 'familyStructure', label: '家庭结构', type: 'select', options: ['双亲', '单亲', '离异', '其他'] },
  { key: 'familyAtmosphere', label: '家庭氛围', type: 'select', options: ['和睦', '一般', '冷淡', '争吵', '离异'] },
  { key: 'personality', label: '性格/MBTI', type: 'input' },
  { key: 'communicationStyle', label: '沟通风格', type: 'select', options: ['直接', '含蓄', '话多', '话少', '幽默'] },
  { key: 'socialStyle', label: '社交风格', type: 'select', options: ['主动', '被动', '社交达人'] },
  { key: 'relationshipAttitude', label: '婚恋态度', type: 'select', options: ['认真', '随便', '急切'] },
  { key: 'marriageHistory', label: '婚史', type: 'select', options: ['未婚', '离异无子', '离异有子', '丧偶'] },
  { key: 'emotionalGoal', label: '感情诉求', type: 'select', options: ['认真找对象', '随便玩玩', '家里催婚', '空虚寂寞'] },
  { key: 'relationshipGoal', label: '关系目标', type: 'select', options: ['短期', '长期', '不确定'] },
  { key: 'profileBio', label: '个人签名', type: 'textarea' },
  { key: 'avatar', label: '头像URL', type: 'input' },
];

// 不显示给客户的字段（操盘手内部使用）
const HIDDEN_FIELDS = [
  'trustLevel', 'interactionHeat', 'girlCount', 'dateCount',
  'coachCooperation', 'learningAbility', 'feedbackQuality',
  'assetsLevel', 'budgetRange', 'timeInvestment',
  'balance', 'notes', 'source',
  'strengths', 'weaknesses', 'clientType',
  'selfValuePerception', 'cognitiveAccuracy',
  'signals', 'pendingActions', 'observations', 'conversationSummary',
  'matchPreferences', 'dealbreakers',
  'profilePhotos', 'preferredPlatforms',
  'openingTemplates', 'petPhrases', 'chatTaboos', 'humorStyle',
  'currentStage', 'stageProgress', 'lastMilestone',
  'selfEsteemLevel', 'antiFrustrationLevel', 'pacePreference',
  'investmentWillingness', 'comfortZone',
  'emotionalStable', 'eqLevel', 'familyMembers', 'familyBurden',
  'pastRelationshipSummary', 'emotionalWounds', 'exPartnerTaboos',
  'commitmentWillingness', 'emotionalMaturity',
  'serviceStage', 'role', 'username', 'createdAt', 'updatedAt',
  'voiceSamples', 'chatPartnerId', 'empathy', 'selfAwareness',
  'communication', 'relationship', 'conflictRes', 'isKinkOriented',
  'kinkIdentity', 'kinkBoundaries', 'kinkInterests', 'kinkExperience', 'kinkNotes'
];

// 单个字段组件（避免整体重渲染）
function ProfileField({ field, value, onChange }) {
  if (field.type === 'input') {
    return (
      <FormControl key={field.key}>
        <FormLabel color="gray.400" fontSize="sm">{field.label}</FormLabel>
        <Input
          value={value || ''}
          onChange={e => onChange(field.key, e.target.value)}
          bg="gray.700" color="white" border="1px solid" borderColor="gray.600"
          _hover={{ borderColor: 'gray.500' }}
          _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
        />
      </FormControl>
    );
  }
  if (field.type === 'select') {
    return (
      <FormControl key={field.key}>
        <FormLabel color="gray.400" fontSize="sm">{field.label}</FormLabel>
        <Select
          value={value || ''}
          onChange={e => onChange(field.key, e.target.value)}
          bg="gray.700" color="white" border="1px solid" borderColor="gray.600"
          _hover={{ borderColor: 'gray.500' }}
          _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
        >
          <option value="">请选择</option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </Select>
      </FormControl>
    );
  }
  if (field.type === 'textarea') {
    return (
      <FormControl key={field.key}>
        <FormLabel color="gray.400" fontSize="sm">{field.label}</FormLabel>
        <Textarea
          value={value || ''}
          onChange={e => onChange(field.key, e.target.value)}
          bg="gray.700" color="white" border="1px solid" borderColor="gray.600"
          _hover={{ borderColor: 'gray.500' }}
          _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
          rows={3}
        />
      </FormControl>
    );
  }
  if (field.type === 'region') {
    return (
      <FormControl key={field.key}>
        <FormLabel color="gray.400" fontSize="sm">{field.label}</FormLabel>
        <RegionSelector
          value={value || ''}
          onChange={val => onChange(field.key, val)}
        />
      </FormControl>
    );
  }
  return null;
}

export default function ClientProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({});
  const [memberStatus, setMemberStatus] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isPricingOpen, onOpen: onPricingOpen, onClose: onPricingClose } = useDisclosure();
  const { isOpen: isVersionOpen, onOpen: onVersionOpen, onClose: onVersionClose } = useDisclosure();
  const { isOpen: isPwdOpen, onOpen: onPwdOpen, onClose: onPwdClose } = useDisclosure();
  const [updateInfo, setUpdateInfo] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savingAvatar, setSavingAvatar] = useState(false);
  const toast = useToast();

  useEffect(() => {
    loadProfile();
    loadMembership();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await clients.me();
      if (res.success) {
        setProfile(res.client);
        const data = {};
        CLIENT_EDITABLE_FIELDS.forEach(f => {
          data[f.key] = res.client[f.key] || '';
        });
        setEditData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMembership = async () => {
    try {
      const res = await membershipApi.status().catch(() => ({ success: false }));
      if (res.success) setMemberStatus(res);
    } catch (e) { console.error(e); }
  };

  const handleFieldChange = useCallback((key, val) => {
    setEditData(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await clients.update(profile.id, editData);
      if (res.success) {
        toast({ title: '保存成功', status: 'success' });
        setProfile(res.client);
        onClose();
      } else {
        toast({ title: '保存失败', status: 'error' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '保存失败', status: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = () => {
    const data = {};
    CLIENT_EDITABLE_FIELDS.forEach(f => {
      data[f.key] = profile[f.key] || '';
    });
    setEditData(data);
    onOpen();
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await checkVersion();
      if (info?.hasUpdate) {
        setUpdateInfo(info);
        onVersionOpen();
      } else {
        toast({ title: '已是最新版本', description: `V${VERSION}`, status: 'success', duration: 3000 });
      }
    } catch (e) {
      toast({ title: '检查更新失败', status: 'error', duration: 3000 });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      toast({ title: '请填写旧密码和新密码', status: 'warning' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: '新密码至少8位', status: 'warning' });
      return;
    }
    setChangingPwd(true);
    try {
      const res = await auth.changePassword(oldPassword, newPassword);
      if (res.success) {
        toast({ title: '密码修改成功', status: 'success' });
        setOldPassword('');
        setNewPassword('');
        onPwdClose();
      } else {
        toast({ title: res.error || '修改失败', status: 'error' });
      }
    } catch (e) {
      toast({ title: e.message || '修改失败', status: 'error' });
    } finally {
      setChangingPwd(false);
    }
  };

  const handleSaveAvatar = async () => {
    setSavingAvatar(true);
    try {
      const res = await clients.update(profile.id, { avatar: avatarUrl.trim() });
      if (res.success) {
        setProfile(prev => ({ ...prev, avatar: avatarUrl.trim() }));
        toast({ title: '头像已更新', status: 'success', duration: 2000 });
        setEditingAvatar(false);
      }
    } catch (e) {
      toast({ title: '更新失败', status: 'error', duration: 2000 });
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleCancelAvatar = () => {
    setAvatarUrl(profile?.avatar || '');
    setEditingAvatar(false);
  };

  const openAvatarEdit = () => {
    setAvatarUrl(profile?.avatar || '');
    setEditingAvatar(true);
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="xl" color="teal.400" />
      </Flex>
    );
  }

  if (!profile) {
    return <Box color="white">无法加载档案</Box>;
  }

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading color="white">我的档案</Heading>
        <HStack spacing={2}>
          <Button colorScheme="teal" onClick={openEdit}>编辑档案</Button>
        </HStack>
      </Flex>

      {/* 基本信息卡片 */}
      <Card bg="gray.800" mb={4}>
        <CardBody>
          <HStack spacing={4} mb={4}>
            <Box position="relative">
              <Avatar size="lg" name={profile.nickname || profile.username} src={profile.avatar} bg="teal.500" />
              <IconButton
                aria-label="编辑头像"
                icon={<Icon as={FiEdit2} />}
                size="xs"
                colorScheme="teal"
                position="absolute"
                bottom={0}
                right={0}
                borderRadius="full"
                onClick={openAvatarEdit}
              />
            </Box>
            <Box>
              <HStack>
                <Text color="white" fontSize="xl" fontWeight="bold">{profile.nickname || profile.username}</Text>
                <Badge colorScheme={STAGE_COLORS[profile.serviceStage] || 'gray'}>{profile.serviceStage || '未开始'}</Badge>
              </HStack>
              <Text color="gray.400">{profile.occupation || profile.education || '未填写'}</Text>
            </Box>
          </HStack>

          {/* 头像编辑 */}
          {editingAvatar && (
            <Box mt={2} p={3} bg="gray.700" borderRadius="md">
              <VStack align="stretch" spacing={2}>
                <Text color="gray.300" fontSize="sm">输入头像图片URL</Text>
                <InputGroup size="sm">
                  <Input
                    placeholder="https://example.com/avatar.jpg"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    bg="gray.600"
                    borderColor="gray.500"
                  />
                </InputGroup>
                <HStack spacing={2}>
                  <Button size="sm" colorScheme="teal" onClick={handleSaveAvatar} isLoading={savingAvatar}>保存</Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelAvatar}>取消</Button>
                </HStack>
              </VStack>
            </Box>
          )}
        </CardBody>
      </Card>

      {/* 会员 & 积分状态栏 */}
      <Card bg="gray.800" mb={4}>
        <CardBody>
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
            <Button size="xs" variant="link" color="teal.400" onClick={onPricingOpen}>
              查看定价方案
            </Button>
          </HStack>
        </CardBody>
      </Card>

      <SimpleGrid columns={2} spacing={4}>
        {/* 基础信息 */}
        <Card bg="gray.800">
          <CardBody>
            <Text color="teal.400" fontWeight="bold" mb={3}>基础信息</Text>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">年龄</Text>
                <Text color="white">{profile.age ? `${profile.age}岁` : '-'}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">职业</Text>
                <Text color="white">{profile.occupation || '-'}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">学历</Text>
                <Text color="white">{profile.education || '-'}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">所在地</Text>
                <Text color="white">{profile.residence || '-'}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">籍贯</Text>
                <Text color="white">{profile.hometown || '-'}</Text>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* 外貌资源 */}
        <Card bg="gray.800">
          <CardBody>
            <Text color="orange.400" fontWeight="bold" mb={3}>外貌特征</Text>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">身高</Text>
                <Text color="white">{profile.height ? `${profile.height}cm` : '-'}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">穿着风格</Text>
                <Text color="white">{profile.dressingStyle || '-'}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">外貌描述</Text>
                <Text color="white" fontSize="sm" maxW="150px" noOfLines={2}>{profile.appearance || '-'}</Text>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* 家庭背景 */}
        <Card bg="gray.800">
          <CardBody>
            <Text color="purple.400" fontWeight="bold" mb={3}>家庭背景</Text>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">家庭背景</Text>
                <Text color="white">{profile.familyBackground || '-'}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">家庭结构</Text>
                <Text color="white">{profile.familyStructure || '-'}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">家庭氛围</Text>
                <Text color="white">{profile.familyAtmosphere || '-'}</Text>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* 性格画像 */}
        <Card bg="gray.800">
          <CardBody>
            <Text color="cyan.400" fontWeight="bold" mb={3}>性格画像</Text>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">性格/MBTI</Text>
                <Badge colorScheme="cyan">{profile.personality || '-'}</Badge>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">沟通风格</Text>
                <Text color="white">{profile.communicationStyle || '-'}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">社交风格</Text>
                <Text color="white">{profile.socialStyle || '-'}</Text>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* 情感状态 */}
        <Card bg="gray.800">
          <CardBody>
            <Text color="red.400" fontWeight="bold" mb={3}>情感状态</Text>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">婚恋态度</Text>
                <Text color="white">{profile.relationshipAttitude || '-'}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">关系目标</Text>
                <Badge colorScheme="green">{profile.relationshipGoal || '-'}</Badge>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">感情诉求</Text>
                <Text color="white">{profile.emotionalGoal || '-'}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">婚史</Text>
                <Text color="white">{profile.marriageHistory || '-'}</Text>
              </HStack>
            </VStack>
          </CardBody>
        </Card>
      </SimpleGrid>

      {/* 个人签名 */}
      {profile.profileBio && (
        <Card bg="gray.800" mt={4}>
          <CardBody>
            <Text color="gray.400" fontSize="sm" mb={2}>个人签名</Text>
            <Text color="gray.300">{profile.profileBio}</Text>
          </CardBody>
        </Card>
      )}

      {/* 关于我们 */}
      <Card bg="gray.800" mt={4}>
        <CardBody>
          <Text color="gray.400" fontSize="sm" mb={3}>关于追爱AI</Text>
          <VStack spacing={2} align="stretch">
            <HStack justify="space-between">
              <Text color="gray.500" fontSize="sm">当前版本</Text>
              <Text color="white" fontSize="sm">V{VERSION}</Text>
            </HStack>
            <HStack spacing={2}>
              <Button size="sm" variant="outline" colorScheme="teal" onClick={handleCheckUpdate} isLoading={checkingUpdate}>
                检查更新
              </Button>
              <Button size="sm" variant="outline" colorScheme="orange" onClick={onPwdOpen}>
                修改密码
              </Button>
            </HStack>
          </VStack>
        </CardBody>
      </Card>

      {/* 编辑档案弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" overflow="auto">
          <ModalHeader color="white">编辑我的档案</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <SimpleGrid columns={2} spacing={4}>
              {CLIENT_EDITABLE_FIELDS.map(field => (
                <ProfileField
                  key={field.key}
                  field={field}
                  value={editData[field.key]}
                  onChange={handleFieldChange}
                />
              ))}
            </SimpleGrid>
            <HStack justify="flex-end" mt={6} spacing={3}>
              <Button variant="ghost" color="gray.400" onClick={onClose}>取消</Button>
              <Button colorScheme="teal" onClick={handleSave} isLoading={saving}>保存</Button>
            </HStack>
          </ModalBody>
        </ModalContent>
      </Modal>

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
                      最受欢迎
                    </Box>
                  )}
                  <CardBody pt={plan.type !== 'monthly' ? 8 : 4}>
                    <VStack spacing={2} mb={4}>
                      <Text color="white" fontWeight="bold" fontSize="lg">{plan.label}</Text>
                      <HStack spacing={1} align="baseline">
                        <Text color="brand.400" fontSize="3xl" fontWeight="bold">¥{plan.price}</Text>
                        <Text color="gray.400" fontSize="sm">/{plan.period}</Text>
                      </HStack>
                      <Text color="gray.500" fontSize="xs">约¥{plan.perMonth}/月</Text>
                    </VStack>
                    <VStack spacing={2} align="stretch">
                      {plan.features.map((f, i) => (
                        <HStack key={i} spacing={2}>
                          <Icon as={CheckIcon} color="teal.400" boxSize={4} />
                          <Text color="gray.300" fontSize="sm">{f}</Text>
                        </HStack>
                      ))}
                    </VStack>
                  </CardBody>
                </Card>
              ))}
            </SimpleGrid>
            <Box mt={4} p={3} bg="gray.750" borderRadius="md">
              <Text color="gray.400" fontSize="sm" mb={2}>邀请有礼</Text>
              <SimpleGrid columns={3} spacing={2}>
                <Box textAlign="center" p={2} bg="gray.600" borderRadius="md">
                  <Text color="brand.400" fontWeight="600">500</Text>
                  <Text color="gray.400" fontSize="xs">普惠月付邀请积分</Text>
                </Box>
                <Box textAlign="center" p={2} bg="gray.600" borderRadius="md">
                  <Text color="blue.400" fontWeight="600">4444</Text>
                  <Text color="gray.400" fontSize="xs">普惠年付邀请积分</Text>
                </Box>
                <Box textAlign="center" p={2} bg="gray.600" borderRadius="md">
                  <Text color="purple.400" fontWeight="600">25000</Text>
                  <Text color="gray.400" fontSize="xs">高端会员邀请积分</Text>
                </Box>
              </SimpleGrid>
              <Text color="gray.500" fontSize="xs" mt={2}>
                积分只能用于续费抵扣，无有效期限制。被邀请人首单可享8折优惠
              </Text>
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 版本更新弹窗 */}
      {updateInfo && (
        <VersionUpdateModal
          isOpen={isVersionOpen}
          onClose={onVersionClose}
          upgradeType={updateInfo.upgradeType}
          latestVersion={updateInfo.latestVersion}
          updateDescription={updateInfo.updateDescription}
          downloadUrl={updateInfo.downloadUrl}
        />
      )}

      {/* 修改密码弹窗 */}
      <Modal isOpen={isPwdOpen} onClose={onPwdClose} size="sm">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800">
          <ModalHeader color="white">修改密码</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            <VStack spacing={4}>
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">旧密码</FormLabel>
                <InputGroup>
                  <Input
                    type={showOld ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    bg="gray.700" color="white" border="1px solid" borderColor="gray.600"
                    placeholder="请输入旧密码"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showOld ? '隐藏密码' : '显示密码'}
                      icon={<Text fontSize="sm">{showOld ? '🙈' : '👁'}</Text>}
                      variant="ghost" size="sm" onClick={() => setShowOld(!showOld)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">新密码</FormLabel>
                <InputGroup>
                  <Input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    bg="gray.700" color="white" border="1px solid" borderColor="gray.600"
                    placeholder="请输入新密码（至少8位）"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showNew ? '隐藏密码' : '显示密码'}
                      icon={<Text fontSize="sm">{showNew ? '🙈' : '👁'}</Text>}
                      variant="ghost" size="sm" onClick={() => setShowNew(!showNew)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" color="gray.400" mr={3} onClick={onPwdClose}>取消</Button>
            <Button colorScheme="orange" onClick={handleChangePassword} isLoading={changingPwd}>确认修改</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

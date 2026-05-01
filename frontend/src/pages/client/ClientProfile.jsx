import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Heading, Card, CardBody, SimpleGrid, Badge, Text, VStack, HStack, Flex, Avatar, Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, useDisclosure, FormControl, FormLabel, Input, Select, Textarea, useToast, Spinner, Icon, InputGroup, InputRightElement, IconButton } from '@chakra-ui/react';
import { CrownIcon, CheckIcon } from '../../components/Icons';
import { FiEdit2 } from 'react-icons/fi';
import { clients, membership as membershipApi, auth, upload } from '../../utils/api';
import RegionSelector from '../../components/RegionSelector';
import { checkVersion, VERSION } from '../../utils/version';
import VersionUpdateModal from '../../components/VersionUpdateModal';

const TYPE_LABEL = { monthly: '普惠月付', yearly: '普惠年付', premium: '高端会员', TRIAL: '试用会员' };
const TYPE_BADGE_COLOR = { monthly: 'green', yearly: 'blue', premium: 'purple', TRIAL: 'orange' };

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  const { isOpen: isRenewalOpen, onOpen: onRenewalOpen, onClose: onRenewalClose } = useDisclosure();
  const [renewalType, setRenewalType] = useState('monthly');
  const [renewalPoints, setRenewalPoints] = useState(0);
  const [renewing, setRenewing] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [savingAvatar, setSavingAvatar] = useState(false);
  const fileInputRef = useRef(null);
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
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast({ title: '请填写所有密码字段', status: 'warning' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: '两次输入的新密码不一致', status: 'warning' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: '新密码至少8位', status: 'warning' });
      return;
    }
    setChangingPwd(true);
    try {
      const res = await auth.changePassword(oldPassword, newPassword, confirmPassword);
      if (res.success) {
        toast({ title: '密码修改成功', status: 'success' });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
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

  const handleRenewalSubmit = async () => {
    setRenewing(true);
    try {
      const res = await membershipApi.purchase(renewalType, renewalPoints);
      if (res.success) {
        toast({ title: '续费成功', description: '会员有效期已延长', status: 'success', duration: 3000 });
        onRenewalClose();
        await loadMembership();
        setRenewalPoints(0);
        setRenewalType('monthly');
      } else {
        toast({ title: res.error?.message || '续费失败', status: 'error' });
      }
    } catch (e) {
      toast({ title: e.message || '续费失败', status: 'error' });
    } finally {
      setRenewing(false);
    }
  };

  const handleAvatarFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: '请选择图片文件', status: 'warning' });
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSaveAvatar = async () => {
    if (!avatarFile) {
      toast({ title: '请先选择图片', status: 'warning' });
      return;
    }
    setSavingAvatar(true);
    try {
      const uploadRes = await upload.image(avatarFile);
      if (!uploadRes.url) {
        toast({ title: '上传失败', status: 'error', duration: 2000 });
        return;
      }
      const res = await clients.update(profile.id, { avatar: uploadRes.url });
      if (res.success) {
        setProfile(prev => ({ ...prev, avatar: uploadRes.url }));
        toast({ title: '头像已更新', status: 'success', duration: 2000 });
        setEditingAvatar(false);
        setAvatarFile(null);
        setAvatarPreview('');
      }
    } catch (e) {
      toast({ title: '更新失败', status: 'error', duration: 2000 });
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleCancelAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview('');
    setEditingAvatar(false);
  };

  const openAvatarEdit = () => {
    setAvatarFile(null);
    setAvatarPreview('');
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
                <Text color="gray.300" fontSize="sm">上传头像图片</Text>
                <Input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleAvatarFileChange}
                  bg="gray.600"
                  borderColor="gray.500"
                  color="white"
                  p={1}
                  sx={{
                    '::file-selector-button': {
                      bg: 'teal.600',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'md',
                      px: 3,
                      py: 1,
                      mr: 3,
                      cursor: 'pointer',
                      _hover: { bg: 'teal.500' }
                    }
                  }}
                />
                {avatarPreview && (
                  <Avatar size="md" src={avatarPreview} />
                )}
                <HStack spacing={2}>
                  <Button size="sm" colorScheme="teal" onClick={handleSaveAvatar} isLoading={savingAvatar} isDisabled={!avatarFile}>保存</Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelAvatar}>取消</Button>
                </HStack>
              </VStack>
            </Box>
          )}

        </CardBody>
      </Card>

      {/* 会员信息 */}
      <Card bg="gray.800" mb={4}>
        <CardBody>
          {memberStatus?.membership ? (
            <VStack spacing={3} align="stretch">
              <HStack justify="space-between" align="center">
                <Text color="gray.400" fontSize="sm">会员类型</Text>
                <Badge colorScheme={TYPE_BADGE_COLOR[memberStatus.membership.type] || 'brand'} px={3} py={1} borderRadius="md" fontSize="sm">
                  {TYPE_LABEL[memberStatus.membership.type] || '会员'}
                </Badge>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">有效期</Text>
                <Text color="white" fontSize="sm">
                  {formatDate(memberStatus.membership.startDate)} ~ {formatDate(memberStatus.membership.endDate)}
                </Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">积分</Text>
                <Badge colorScheme="orange" px={3} py={1} borderRadius="md" fontSize="sm">
                  {memberStatus?.points || 0}
                </Badge>
              </HStack>
              <HStack spacing={2}>
                <Button size="sm" colorScheme="teal" onClick={onRenewalOpen}>续费会员</Button>
                <Button size="xs" variant="link" color="teal.400" onClick={onPricingOpen}>
                  查看定价方案
                </Button>
              </HStack>
            </VStack>
          ) : (
            <VStack spacing={3} align="stretch">
              <HStack justify="space-between" align="center">
                <Text color="gray.400" fontSize="sm">会员状态</Text>
                <Badge colorScheme="gray" px={3} py={1} borderRadius="md" fontSize="sm">未开通</Badge>
              </HStack>
              <HStack justify="space-between">
                <Text color="gray.400" fontSize="sm">积分</Text>
                <Badge colorScheme="orange" px={3} py={1} borderRadius="md" fontSize="sm">
                  {memberStatus?.points || 0}
                </Badge>
              </HStack>
              <HStack spacing={2}>
                <Button size="sm" colorScheme="brand" variant="outline" leftIcon={<Icon as={CrownIcon} />} onClick={onRenewalOpen}>
                  开通会员
                </Button>
                <Button size="xs" variant="link" color="teal.400" onClick={onPricingOpen}>
                  查看定价方案
                </Button>
              </HStack>
            </VStack>
          )}
        </CardBody>
      </Card>

      {/* 编辑档案入口，在数据展示区上方 */}
      <Flex justify="flex-end" mb={4}>
        <Button size="sm" colorScheme="teal" leftIcon={<Icon as={FiEdit2} />} onClick={openEdit}>编辑档案</Button>
      </Flex>

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
        <ModalContent bg="gray.800" color="white" borderRadius="xl" maxH="90vh" overflowY="auto">
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

      {/* 续费弹窗 */}
      <Modal isOpen={isRenewalOpen} onClose={onRenewalClose} size="md">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" color="white">
          <ModalHeader>{memberStatus?.membership ? '积分续费' : '开通会员'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {memberStatus?.membership && (
              <Box mb={4} p={3} bg="gray.700" borderRadius="md">
                <Text color="gray.300" fontSize="sm">
                  当前有效期至: {formatDate(memberStatus.membership.endDate)}
                </Text>
              </Box>
            )}

            <Text color="gray.400" fontSize="sm" mb={2}>选择套餐</Text>
            <SimpleGrid columns={3} spacing={2} mb={4}>
              {PRICING_DATA.map(plan => (
                <Box
                  key={plan.type}
                  p={3}
                  bg={renewalType === plan.type ? 'teal.700' : 'gray.700'}
                  borderRadius="md"
                  cursor="pointer"
                  border="2px solid"
                  borderColor={renewalType === plan.type ? 'teal.500' : 'transparent'}
                  onClick={() => { setRenewalType(plan.type); setRenewalPoints(0); }}
                  _hover={{ borderColor: 'teal.400' }}
                  textAlign="center"
                  transition="all 0.15s"
                >
                  <Text fontSize="sm" fontWeight="bold">{plan.label}</Text>
                  <Text color="brand.300" fontSize="lg" fontWeight="bold">¥{plan.price}</Text>
                  <Text color="gray.400" fontSize="xs">/{plan.period}</Text>
                </Box>
              ))}
            </SimpleGrid>

            <Box p={3} bg="gray.700" borderRadius="md">
              <HStack justify="space-between" mb={2}>
                <Text color="gray.300" fontSize="sm">可用积分</Text>
                <Badge colorScheme="orange">{memberStatus?.points || 0}</Badge>
              </HStack>
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">使用积分抵扣 (1积分=1元)</FormLabel>
                <Input
                  type="number"
                  min={0}
                  max={(() => {
                    const price = memberStatus?.prices?.[renewalType] || PRICING_DATA.find(p => p.type === renewalType)?.price || 0;
                    return Math.min(memberStatus?.points || 0, price);
                  })()}
                  value={renewalPoints}
                  onChange={e => {
                    const v = parseInt(e.target.value) || 0;
                    const price = memberStatus?.prices?.[renewalType] || PRICING_DATA.find(p => p.type === renewalType)?.price || 0;
                    setRenewalPoints(Math.max(0, Math.min(v, Math.min(memberStatus?.points || 0, price))));
                  }}
                  bg="gray.600"
                  color="white"
                  border="1px solid"
                  borderColor="gray.500"
                  _hover={{ borderColor: 'gray.400' }}
                  _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
                />
              </FormControl>

              {memberStatus?.membership && (() => {
                const d = new Date(memberStatus.membership.endDate);
                if (renewalType === 'monthly') d.setMonth(d.getMonth() + 1);
                else d.setFullYear(d.getFullYear() + 1);
                return (
                  <Text color="gray.400" fontSize="xs" mt={2}>
                    续费后有效期至: {formatDate(d.toISOString())}
                  </Text>
                );
              })()}

              <Box mt={3} p={2} bg="gray.600" borderRadius="md">
                <HStack justify="space-between">
                  <Text color="gray.300" fontSize="sm">
                    {memberStatus?.membership ? '续费金额' : '开通金额'}
                  </Text>
                  <Text color="teal.300" fontWeight="bold">
                    ¥{Math.max(0, (memberStatus?.prices?.[renewalType] || PRICING_DATA.find(p => p.type === renewalType)?.price || 0) - renewalPoints)}
                  </Text>
                </HStack>
              </Box>
            </Box>

            <Text color="gray.500" fontSize="xs" mt={3}>
              {memberStatus?.membership
                ? '续费后有效期将在现有基础上累加，积分可抵扣部分金额'
                : '开通后即可享受全部会员功能，积分可在后续续费中使用'}
            </Text>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" color="gray.400" mr={3} onClick={onRenewalClose}>取消</Button>
            <Button colorScheme="teal" onClick={handleRenewalSubmit} isLoading={renewing} loadingText="处理中">
              {memberStatus?.membership ? '确认续费' : '确认开通'}
            </Button>
          </ModalFooter>
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
              <FormControl>
                <FormLabel color="gray.400" fontSize="sm">确认新密码</FormLabel>
                <InputGroup>
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    bg="gray.700" color="white" border="1px solid" borderColor="gray.600"
                    placeholder="请再次输入新密码"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showConfirm ? '隐藏密码' : '显示密码'}
                      icon={<Text fontSize="sm">{showConfirm ? '🙈' : '👁'}</Text>}
                      variant="ghost" size="sm" onClick={() => setShowConfirm(!showConfirm)}
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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Heading, Card, CardBody, SimpleGrid, Badge, Text, VStack, HStack, Flex, Avatar, Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, useDisclosure, FormControl, FormLabel, Input, Select, Textarea, useToast, Spinner } from '@chakra-ui/react';
import { clients } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import RegionSelector from '../../components/RegionSelector';

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
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({});
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  useEffect(() => {
    loadProfile();
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
        <Button colorScheme="teal" onClick={openEdit}>编辑档案</Button>
      </Flex>

      {/* 基本信息卡片 */}
      <Card bg="gray.800" mb={4}>
        <CardBody>
          <HStack spacing={4} mb={4}>
            <Avatar size="lg" name={profile.nickname || profile.username} bg="teal.500" />
            <Box>
              <HStack>
                <Text color="white" fontSize="xl" fontWeight="bold">{profile.nickname || profile.username}</Text>
                <Badge colorScheme={STAGE_COLORS[profile.serviceStage] || 'gray'}>{profile.serviceStage || '未开始'}</Badge>
              </HStack>
              <Text color="gray.400">{profile.occupation || profile.education || '未填写'}</Text>
            </Box>
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
    </Box>
  );
}
